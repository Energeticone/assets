"""The orchestrator: plan -> implement -> review -> test -> report.

You hand over a task; agents do the work and check each other; the system
records everything under `.superman/`; you review the final output.
"""

from __future__ import annotations

import time
from dataclasses import dataclass

from .agents import AgentRunner
from .config import Config
from .llm import LLMClient
from .memory import Memory


@dataclass
class RunResult:
    run_id: str
    success: bool
    report: str
    report_path: str


def run_task(task: str, config: Config, llm: LLMClient | None = None,
             log=print) -> RunResult:
    llm = llm or LLMClient(config)
    memory = Memory(config.state_dir)
    record = memory.new_run(task)
    agents = AgentRunner(config=config, llm=llm, record=record)
    memory_text = memory.read()
    started = time.time()

    log(f"[superman] run {record.run_id} started")
    log("[superman] planner: drafting the plan")
    plan = agents.plan(task, memory_text)
    log(f"[superman] plan: {plan['summary']}")
    for step in plan["steps"]:
        log(f"[superman]   - {step['description']}")

    feedback = ""
    approved = False
    tests_passed = False
    all_files: set[str] = set()
    review = {"approved": False, "issues": [], "summary": "review never ran"}
    test_verdict = {"passed": False, "summary": "tests never ran", "failures": []}
    cycles = max(config.max_review_cycles, config.max_test_cycles)

    for cycle in range(1, cycles + 1):
        log(f"[superman] cycle {cycle}: implementer working")
        executor = agents.implement(task, plan, feedback, memory_text, cycle)
        all_files |= executor.files_written
        log(f"[superman] cycle {cycle}: {len(executor.files_written)} file(s) touched")

        issues = []
        if not approved and cycle <= config.max_review_cycles:
            log(f"[superman] cycle {cycle}: reviewer reviewing")
            review = agents.review(task, plan, executor, cycle)
            approved = review["approved"]
            issues = [i for i in review["issues"] if i["severity"] == "blocker"]
            log(f"[superman] cycle {cycle}: review "
                f"{'approved' if approved else f'found {len(issues)} blocker(s)'}")

        if approved and cycle <= config.max_test_cycles:
            log(f"[superman] cycle {cycle}: tester running {plan['test_command']!r}")
            test_verdict = agents.test(plan, cycle)
            tests_passed = test_verdict["passed"]
            log(f"[superman] cycle {cycle}: tests "
                f"{'passed' if tests_passed else 'failed'}")

        if approved and tests_passed:
            break

        feedback_parts = []
        if issues:
            feedback_parts += [f"[review] {i['file']}: {i['problem']}" for i in issues]
        if approved and not tests_passed:
            feedback_parts += [f"[test] {f}" for f in test_verdict["failures"]]
            feedback_parts.append(f"[test] {test_verdict['summary']}")
        feedback = "\n".join(feedback_parts)
        if approved and not feedback_parts:
            # Reviewer approved but tests never got a chance to pass.
            break

    success = approved and tests_passed
    report = _build_report(
        task, plan, sorted(all_files), review, test_verdict, success,
        time.time() - started,
    )
    record.save("report.md", report)

    log("[superman] distilling learnings into persistent memory")
    try:
        learnings = agents.distill_memory(task, report)
        memory.append(f"Task: {task}\n{learnings}")
    except Exception as exc:  # memory is best-effort; the run itself is done
        log(f"[superman] memory distillation failed: {exc}")

    log(f"[superman] run {record.run_id} finished: "
        f"{'SUCCESS' if success else 'NEEDS ATTENTION'}")
    log(f"[superman] review the output: superman review  ({record.run_dir / 'report.md'})")
    return RunResult(
        run_id=record.run_id,
        success=success,
        report=report,
        report_path=str(record.run_dir / "report.md"),
    )


def _build_report(task, plan, files, review, test_verdict, success, elapsed) -> str:
    status = "✅ approved by review, tests passing" if success else "⚠️ needs human attention"
    lines = [
        "# Superman run report",
        "",
        f"**Status:** {status}",
        f"**Elapsed:** {elapsed:.0f}s",
        "",
        "## Task",
        task,
        "",
        "## Plan",
        plan["summary"],
        *[f"- {s['description']}" for s in plan["steps"]],
        "",
        "## Files changed",
        *([f"- {f}" for f in files] or ["- (none)"]),
        "",
        "## Review",
        review["summary"],
        *[f"- [{i['severity']}] {i['file']}: {i['problem']}" for i in review["issues"]],
        "",
        "## Tests",
        test_verdict["summary"],
        *[f"- {f}" for f in test_verdict["failures"]],
    ]
    return "\n".join(lines) + "\n"
