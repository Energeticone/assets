"""Agent roles.

Core pipeline agents:
    Explore    - researches the codebase before anyone plans
    Planner    - understands the task, breaks it down
    Implementer- writes the implementation through workspace tools
    Reviewer   - core correctness review
    Tester     - runs and interprets the test command

Specialist agents the Engineering Lead can bring in per task:
    Frontend Specialist, Security Reviewer, Database Expert,
    Testing Engineer, Documentation Writer.

Planner/Lead/Reviewers/Tester return structured JSON verdicts; Explore,
Implementer and the Documentation Writer work the workspace through tools.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from .config import Config
from .llm import parse_structured
from .memory import RunRecord
from .skills import Skill
from .tools import TOOL_DEFINITIONS, ToolExecutor
from .workspace import snapshot

READ_ONLY_TOOLS = [t for t in TOOL_DEFINITIONS if t["name"] in
                   ("list_files", "read_file", "run_command")]

SPECIALISTS = {
    "frontend": (
        "Frontend Specialist",
        "You review UI code: component structure, state handling, accessibility, "
        "and that markup/styles/scripts actually fit together.",
    ),
    "security": (
        "Security Reviewer",
        "You review code for security issues: injection, path traversal, secrets "
        "in code, unsafe deserialization, authz/authn gaps, and risky defaults.",
    ),
    "database": (
        "Database Expert",
        "You review data access: schema and migration correctness, query "
        "efficiency, transactions, and injection-safe parameterization.",
    ),
    "testing": (
        "Testing Engineer",
        "You review the tests themselves: do they cover the changed behavior, "
        "would they fail if the code were wrong, are edge cases exercised.",
    ),
    "docs": (
        "Documentation Writer",
        "You keep documentation in step with the code: READMEs, usage examples "
        "and docstrings for anything a user or teammate would need.",
    ),
}

LEAD_SCHEMA = {
    "type": "object",
    "properties": {
        "specialists": {
            "type": "array",
            "items": {"type": "string", "enum": sorted(SPECIALISTS)},
        },
        "skills": {"type": "array", "items": {"type": "string"}},
        "reasoning": {"type": "string"},
    },
    "required": ["specialists", "skills", "reasoning"],
    "additionalProperties": False,
}

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


@dataclass
class TaskContext:
    """Everything an agent needs to know about the run."""

    task: str
    memory_text: str = ""
    graph_slice: str = ""
    research: str = ""
    skills: list[Skill] = field(default_factory=list)

    def render(self, config: Config, include_research: bool = True,
               include_skills: bool = True) -> str:
        parts = []
        if self.graph_slice:
            parts.append(self.graph_slice)
        else:
            parts.append(f"Workspace file listing:\n{snapshot(config.workspace)}")
        if self.memory_text.strip():
            parts.append("Persistent memory from previous runs "
                         "(conventions, decisions, pitfalls):\n" + self.memory_text)
        if include_research and self.research.strip():
            parts.append("Codebase research from the Explore agent:\n" + self.research)
        if include_skills and self.skills:
            parts.append("Active skills — follow their instructions:\n\n"
                         + "\n\n".join(s.render() for s in self.skills))
        parts.append(f"Task:\n{self.task}")
        return "\n\n".join(parts)


@dataclass
class AgentRunner:
    config: Config
    llm: object
    record: RunRecord

    # -- shared tool loop --------------------------------------------------

    def _tool_loop(self, *, system: str, prompt: str, tools: list,
                   transcript_name: str, cycle: int) -> tuple[ToolExecutor, str]:
        executor = ToolExecutor(self.config)
        messages = [{"role": "user", "content": prompt}]
        final_text = ""
        for _ in range(self.config.max_agent_turns):
            response = self.llm.complete(system=system, messages=messages, tools=tools)
            messages.append(self.llm.assistant_message(response))
            final_text = response.text or final_text
            if response.stop_reason != "tool_use" or not response.tool_calls:
                break
            results = []
            for call in response.tool_calls:
                output, is_error = executor.execute(call.name, call.input)
                results.append((call.id, output, is_error))
            messages.extend(self.llm.tool_result_messages(results))
        self.record.save_transcript(transcript_name, cycle, messages)
        self.record.save_json(f"tool-log-{transcript_name}-cycle{cycle}.json", executor.log)
        return executor, final_text

    # -- explore agent -----------------------------------------------------

    def explore(self, ctx: TaskContext) -> str:
        system = (
            "You are the EXPLORE agent in an orchestrated software team. "
            "Research the codebase and its docs so the planner and implementer "
            "start informed: read the files the task will touch, note the "
            "conventions, entry points, and anything surprising. You cannot "
            "change files. Finish with concise research notes (facts, not plans)."
        )
        _, notes = self._tool_loop(
            system=system,
            prompt=ctx.render(self.config, include_research=False, include_skills=False),
            tools=READ_ONLY_TOOLS,
            transcript_name="explore",
            cycle=0,
        )
        self.record.save("research.md", notes or "(no notes)")
        return notes

    # -- engineering lead --------------------------------------------------

    def route(self, ctx: TaskContext, available_skills: list[Skill]) -> dict:
        system = (
            "You are the ENGINEERING LEAD of an orchestrated software team. "
            "Decide which specialists this task needs and which installed skills "
            "apply. Specialists cost time — bring in only the ones this task "
            "genuinely needs (an API-only change does not need 'frontend'; "
            "pull in 'security' for anything touching auth, input handling or "
            "secrets; 'docs' when user-facing behavior changes)."
        )
        skill_lines = "\n".join(f"- {s.name}: {s.description}" for s in available_skills)
        prompt = (
            ctx.render(self.config, include_skills=False)
            + "\n\nAvailable specialists:\n"
            + "\n".join(f"- {key}: {title}" for key, (title, _) in sorted(SPECIALISTS.items()))
            + "\n\nInstalled skills:\n" + (skill_lines or "(none)")
        )
        response = self.llm.complete(
            system=system,
            messages=[{"role": "user", "content": prompt}],
            output_schema=LEAD_SCHEMA,
        )
        decision = parse_structured(response)
        decision["specialists"] = [s for s in decision["specialists"] if s in SPECIALISTS]
        known = {s.name for s in available_skills}
        decision["skills"] = [s for s in decision["skills"] if s in known]
        self.record.save_json("lead-decision.json", decision)
        return decision

    # -- planner -----------------------------------------------------------

    def plan(self, ctx: TaskContext) -> dict:
        system = (
            "You are the PLANNER agent in an orchestrated software team. "
            "Understand the task and break it down into a concrete, minimal "
            "implementation plan: which files to create or change, in what "
            "order, and how the result will be verified. The test_command must "
            "be a single shell command runnable from the workspace root "
            "(e.g. 'python -m pytest -q'). Plan only what the task needs."
        )
        response = self.llm.complete(
            system=system,
            messages=[{"role": "user", "content": ctx.render(self.config)}],
            output_schema=PLAN_SCHEMA,
        )
        plan = parse_structured(response)
        self.record.save_json("plan.json", plan)
        return plan

    # -- implementer -------------------------------------------------------

    def implement(self, ctx: TaskContext, plan: dict, feedback: str,
                  cycle: int) -> ToolExecutor:
        system = (
            "You are the IMPLEMENTER agent in an orchestrated software team. "
            "Carry out the plan by reading and writing files with your tools. "
            "Work strictly inside the workspace. Follow the existing style of "
            "the codebase and any active skills. Verify your work with "
            "run_command when useful. When the plan is fully implemented, reply "
            "with a short summary of what you changed and stop calling tools."
        )
        prompt = (
            ctx.render(self.config)
            + f"\n\nPlan:\n{plan['summary']}\n"
            + "\n".join(f"- {s['description']} (files: {', '.join(s['files'])})"
                        for s in plan["steps"])
        )
        if feedback:
            prompt += f"\n\nFeedback from the previous review/test cycle — fix these:\n{feedback}"
        executor, _ = self._tool_loop(
            system=system, prompt=prompt, tools=TOOL_DEFINITIONS,
            transcript_name="implementer", cycle=cycle,
        )
        return executor

    # -- reviewers (core + specialists) ------------------------------------

    def review(self, ctx: TaskContext, plan: dict, changed_files: list[str],
               cycle: int, specialist: str | None = None) -> dict:
        if specialist:
            title, brief = SPECIALISTS[specialist]
            system = (
                f"You are the {title.upper()} in an orchestrated software team. {brief} "
                "Report only real problems in your specialty — a 'blocker' would "
                "break, mislead or expose something; style nits are 'minor'. "
                "Approve when your specialty has no blockers."
            )
            label = f"review-{specialist}"
        else:
            system = (
                "You are the REVIEWER agent in an orchestrated software team. "
                "Review the implementation against the task and the plan: "
                "correctness first, then clarity and fit with the existing "
                "codebase. A 'blocker' is something that would break or mislead; "
                "style nits are 'minor'. Approve when there are no blockers."
            )
            label = "review"
        changed = changed_files or ["(no files written)"]
        reader = ToolExecutor(self.config)
        dumps = []
        for path in changed[:40]:
            content, is_error = reader.execute("read_file", {"path": path})
            if not is_error:
                dumps.append(f"--- {path} ---\n{content}")
        prompt = (
            f"Task:\n{ctx.task}\n\nPlan summary:\n{plan['summary']}\n\n"
            f"Files changed this cycle: {', '.join(changed)}\n\n" + "\n\n".join(dumps)
        )
        if specialist and ctx.skills:
            prompt = ("Active skills — apply their rules:\n\n"
                      + "\n\n".join(s.render() for s in ctx.skills) + "\n\n" + prompt)
        response = self.llm.complete(
            system=system,
            messages=[{"role": "user", "content": prompt}],
            output_schema=REVIEW_SCHEMA,
        )
        verdict = parse_structured(response)
        verdict["reviewer"] = specialist or "core"
        self.record.save_json(f"{label}-cycle{cycle}.json", verdict)
        return verdict

    # -- tester ------------------------------------------------------------

    def test(self, plan: dict, cycle: int) -> dict:
        executor = ToolExecutor(self.config)
        output, is_error = executor.execute("run_command", {"command": plan["test_command"]})
        if is_error:
            verdict = {"passed": False, "failures": [output],
                       "summary": f"Could not run test command: {output}"}
            self.record.save_json(f"test-cycle{cycle}.json", verdict)
            return verdict
        system = (
            "You are the TESTER agent in an orchestrated software team. "
            "Interpret the test command output. The run passed only if the exit "
            "code is 0 and the output shows the tests actually ran. Summarize "
            "each distinct failure precisely enough for the implementer to fix it."
        )
        prompt = (f"Test strategy: {plan['test_strategy']}\n"
                  f"Command: {plan['test_command']}\nResult:\n{output}")
        response = self.llm.complete(
            system=system,
            messages=[{"role": "user", "content": prompt}],
            output_schema=TEST_SCHEMA,
        )
        verdict = parse_structured(response)
        self.record.save_json(f"test-cycle{cycle}.json", verdict)
        return verdict

    # -- documentation writer ----------------------------------------------

    def write_docs(self, ctx: TaskContext, plan: dict, changed_files: list[str]) -> ToolExecutor:
        title, brief = SPECIALISTS["docs"]
        system = (
            f"You are the {title.upper()} in an orchestrated software team. {brief} "
            "The implementation is approved and tests pass. Update or create the "
            "documentation this change needs — no more. Then reply with a short "
            "summary and stop calling tools."
        )
        prompt = (
            ctx.render(self.config, include_research=False)
            + f"\n\nPlan summary:\n{plan['summary']}\n"
            + f"Files changed: {', '.join(changed_files) or '(none)'}"
        )
        executor, _ = self._tool_loop(
            system=system, prompt=prompt, tools=TOOL_DEFINITIONS,
            transcript_name="docs", cycle=0,
        )
        return executor

    # -- memory distillation ----------------------------------------------

    def distill_memory(self, task: str, report: str) -> str:
        system = (
            "You distill durable learnings from a completed run for the team's "
            "persistent memory. Record only what will help future runs in this "
            "workspace: conventions discovered, decisions made and why, pitfalls "
            "hit. 3-6 short bullet points. No play-by-play."
        )
        response = self.llm.complete(
            system=system,
            messages=[{"role": "user", "content": f"Task:\n{task}\n\nRun report:\n{report}"}],
            output_schema=MEMORY_SCHEMA,
        )
        return parse_structured(response)["learnings"]
