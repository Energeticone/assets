"""Agent roles: Planner, Implementer, Reviewer, Tester.

Each agent is one focused Claude session. The Planner, Reviewer and Tester
return structured JSON verdicts; the Implementer works the workspace through
tools until it reports done.
"""

from __future__ import annotations

from dataclasses import dataclass

from .config import Config
from .llm import LLMClient, parse_structured, text_of
from .memory import RunRecord
from .tools import TOOL_DEFINITIONS, ToolExecutor
from .workspace import snapshot

PLAN_SCHEMA = {
    "type": "object",
    "properties": {
        "summary": {"type": "string"},
        "steps": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "description": {"type": "string"},
                    "files": {"type": "array", "items": {"type": "string"}},
                },
                "required": ["description", "files"],
                "additionalProperties": False,
            },
        },
        "test_strategy": {"type": "string"},
        "test_command": {"type": "string"},
    },
    "required": ["summary", "steps", "test_strategy", "test_command"],
    "additionalProperties": False,
}

REVIEW_SCHEMA = {
    "type": "object",
    "properties": {
        "approved": {"type": "boolean"},
        "issues": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "file": {"type": "string"},
                    "problem": {"type": "string"},
                    "severity": {"type": "string", "enum": ["blocker", "minor"]},
                },
                "required": ["file", "problem", "severity"],
                "additionalProperties": False,
            },
        },
        "summary": {"type": "string"},
    },
    "required": ["approved", "issues", "summary"],
    "additionalProperties": False,
}

TEST_SCHEMA = {
    "type": "object",
    "properties": {
        "passed": {"type": "boolean"},
        "summary": {"type": "string"},
        "failures": {"type": "array", "items": {"type": "string"}},
    },
    "required": ["passed", "summary", "failures"],
    "additionalProperties": False,
}

MEMORY_SCHEMA = {
    "type": "object",
    "properties": {"learnings": {"type": "string"}},
    "required": ["learnings"],
    "additionalProperties": False,
}


def _context(config: Config, memory_text: str) -> str:
    parts = [f"Workspace file listing:\n{snapshot(config.workspace)}"]
    if memory_text.strip():
        parts.append(
            "Persistent memory from previous runs (conventions, decisions, pitfalls):\n"
            + memory_text
        )
    return "\n\n".join(parts)


@dataclass
class AgentRunner:
    config: Config
    llm: LLMClient
    record: RunRecord

    # -- planner -----------------------------------------------------------

    def plan(self, task: str, memory_text: str) -> dict:
        system = (
            "You are the PLANNER agent in an orchestrated software team. "
            "Produce a concrete, minimal implementation plan for the task: "
            "which files to create or change, in what order, and how the result "
            "will be verified. The test_command must be a single shell command "
            "runnable from the workspace root (e.g. 'python -m pytest -q'). "
            "Plan only what the task needs — no speculative extras."
        )
        prompt = f"{_context(self.config, memory_text)}\n\nTask:\n{task}"
        message = self.llm.complete(
            system=system,
            messages=[{"role": "user", "content": prompt}],
            output_schema=PLAN_SCHEMA,
        )
        plan = parse_structured(message)
        self.record.save_json("plan.json", plan)
        return plan

    # -- implementer -------------------------------------------------------

    def implement(self, task: str, plan: dict, feedback: str, memory_text: str,
                  cycle: int) -> ToolExecutor:
        system = (
            "You are the IMPLEMENTER agent in an orchestrated software team. "
            "Carry out the plan by reading and writing files with your tools. "
            "Work strictly inside the workspace. Follow the existing style of the "
            "codebase. Verify your work compiles/passes quick checks with "
            "run_command when useful. When the plan is fully implemented, reply "
            "with a short summary of what you changed and stop calling tools."
        )
        executor = ToolExecutor(self.config)
        user = (
            f"{_context(self.config, memory_text)}\n\nTask:\n{task}\n\n"
            f"Plan:\n{plan['summary']}\n"
            + "\n".join(f"- {s['description']} (files: {', '.join(s['files'])})"
                        for s in plan["steps"])
        )
        if feedback:
            user += f"\n\nFeedback from the previous review/test cycle — fix these:\n{feedback}"
        messages = [{"role": "user", "content": user}]

        for _ in range(self.config.max_agent_turns):
            response = self.llm.complete(
                system=system, messages=messages, tools=TOOL_DEFINITIONS
            )
            messages.append({"role": "assistant", "content": response.content})
            tool_uses = [b for b in response.content if b.type == "tool_use"]
            if response.stop_reason != "tool_use" or not tool_uses:
                break
            results = []
            for block in tool_uses:
                output, is_error = executor.execute(block.name, dict(block.input))
                result = {
                    "type": "tool_result",
                    "tool_use_id": block.id,
                    "content": output,
                }
                if is_error:
                    result["is_error"] = True
                results.append(result)
            messages.append({"role": "user", "content": results})

        self.record.save_transcript("implementer", cycle, messages)
        self.record.save_json(f"tool-log-cycle{cycle}.json", executor.log)
        return executor

    # -- reviewer ----------------------------------------------------------

    def review(self, task: str, plan: dict, executor: ToolExecutor, cycle: int) -> dict:
        system = (
            "You are the REVIEWER agent in an orchestrated software team. "
            "Review the implementation against the task and the plan: correctness "
            "first, then clarity and fit with the existing codebase. Report only "
            "real problems — a 'blocker' is something that would break or "
            "mislead; style nits are 'minor'. Approve when there are no blockers."
        )
        changed = sorted(executor.files_written) or ["(no files written)"]
        file_dumps = []
        reader = ToolExecutor(self.config)
        for path in changed[:40]:
            content, is_error = reader.execute("read_file", {"path": path})
            if not is_error:
                file_dumps.append(f"--- {path} ---\n{content}")
        prompt = (
            f"Task:\n{task}\n\nPlan summary:\n{plan['summary']}\n\n"
            f"Files changed this cycle: {', '.join(changed)}\n\n"
            + "\n\n".join(file_dumps)
        )
        message = self.llm.complete(
            system=system,
            messages=[{"role": "user", "content": prompt}],
            output_schema=REVIEW_SCHEMA,
        )
        verdict = parse_structured(message)
        self.record.save_json(f"review-cycle{cycle}.json", verdict)
        return verdict

    # -- tester ------------------------------------------------------------

    def test(self, plan: dict, cycle: int) -> dict:
        executor = ToolExecutor(self.config)
        output, is_error = executor.execute("run_command", {"command": plan["test_command"]})
        if is_error:
            verdict = {
                "passed": False,
                "summary": f"Could not run test command: {output}",
                "failures": [output],
            }
            self.record.save_json(f"test-cycle{cycle}.json", verdict)
            return verdict
        system = (
            "You are the TESTER agent in an orchestrated software team. "
            "Interpret the test command output. The run passed only if the exit "
            "code is 0 and the output shows the tests actually ran. Summarize "
            "each distinct failure precisely enough for the implementer to fix it."
        )
        prompt = (
            f"Test strategy: {plan['test_strategy']}\n"
            f"Command: {plan['test_command']}\nResult:\n{output}"
        )
        message = self.llm.complete(
            system=system,
            messages=[{"role": "user", "content": prompt}],
            output_schema=TEST_SCHEMA,
        )
        verdict = parse_structured(message)
        self.record.save_json(f"test-cycle{cycle}.json", verdict)
        return verdict

    # -- memory distillation ----------------------------------------------

    def distill_memory(self, task: str, report: str) -> str:
        system = (
            "You distill durable learnings from a completed run for the team's "
            "persistent memory. Record only what will help future runs in this "
            "workspace: conventions discovered, decisions made and why, pitfalls "
            "hit. 3-6 short bullet points. No play-by-play."
        )
        message = self.llm.complete(
            system=system,
            messages=[{"role": "user", "content": f"Task:\n{task}\n\nRun report:\n{report}"}],
            output_schema=MEMORY_SCHEMA,
        )
        return parse_structured(message)["learnings"]


def summarize_response(message) -> str:
    return text_of(message)
