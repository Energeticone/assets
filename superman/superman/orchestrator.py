"""The orchestrator.

    YOU
     └─ Engineering Lead — picks specialists and skills for the task
         ├─ Explore agent — researches the codebase (knowledge-graph slice)
         ├─ Planner — breaks the task down
         ├─ Implementer — writes the code through sandboxed tools
         ├─ Reviewers — core + selected specialists, in parallel
         ├─ Tester — runs and interprets the test command
         └─ Documentation Writer — updates docs once green

The system remembers everything under `.superman/`; you review one report.
"""

from __future__ import annotations

import time
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass

from . import kgraph, skills as skills_mod
from .agents import SPECIALISTS, AgentRunner, TaskContext
from .config import Config
from .llm import make_client
from .memory import Memory


@dataclass
class RunResult:
    run_id: str
    success: bool
    report: str
    report_path: str


def run_task(task: str, config: Config, llm=None, log=print) -> RunResult:
    llm = llm or make_client(config)
    memory = Memory(config.state_dir)
    record = memory.new_run(task)
    agents = AgentRunner(config=config, llm=llm, record=record)
    started = time.time()
    log(f"[superman] run {record.run_id} started ({config.backend}/{config.model})")

    # -- knowledge graph: index the repo, keep only the relevant slice -----
    graph = kgraph.build(config.workspace)
    kgraph.save(graph, config.state_dir)
    ctx = TaskContext(
        task=task,
        memory_text=memory.read(),
        graph_slice=kgraph.relevant_slice(graph, task),
    )
    log(f"[superman] knowledge graph: {len(graph['nodes'])} files indexed")

    # -- explore agent researches before anyone plans ----------------------
    log("[superman] explore agent: researching the codebase")
    ctx.research = agents.explore(ctx)

    # -- engineering lead assembles the team -------------------------------
    installed_skills = skills_mod.discover(config.state_dir)
    decision = agents.route(ctx, installed_skills)
    specialists = decision["specialists"]
    ctx.skills = [s for s in installed_skills if s.name in decision["skills"]]
    log(f"[superman] lead: specialists={specialists or ['(none)']} "
        f"skills={[s.name for s in ctx.skills] or ['(none)']}")

    # -- plan --------------------------------------------------------------
    log("[superman] planner: drafting the plan")
    plan = agents.plan(ctx)
    log(f"[superman] plan: {plan['summary']}")
    for step in plan["steps"]:
        log(f"[superman]   - {step['description']}")

    # -- implement / review / test cycles ----------------------------------
    review_specialists = [s for s in specialists if s != "docs"]
    feedback = ""
    approved = False
    tests_passed = False
    all_files: set[str] = set()
    reviews: list[dict] = []
    test_verdict = {"passed": False, "summary": "tests never ran", "failures": []}
    cycles = max(config.max_review_cycles, config.max_test_cycles)

    for cycle in range(1, cycles + 1):
        log(f"[superman] cycle {cycle}: implementer working")
        executor = agents.implement(ctx, plan, feedback, cycle)
        all_files |= executor.files_written
        changed = sorted(executor.files_written)
        log(f"[superman] cycle {cycle}: {len(changed)} file(s) touched")

        blockers = []
        if not approved and cycle <= config.max_review_cycles:
            names = ["core"] + review_specialists
            log(f"[superman] cycle {cycle}: {len(names)} reviewer(s) working"
                + (" in parallel" if config.parallel_reviews and len(names) > 1 else ""))
            jobs = [None] + review_specialists  # None = core reviewer
            if config.parallel_reviews and len(jobs) > 1:
                with ThreadPoolExecutor(max_workers=len(jobs)) as pool:
                    reviews = list(pool.map(
                        lambda s: agents.review(ctx, plan, changed, cycle, specialist=s),
                        jobs,
                    ))
            else:
                reviews = [agents.review(ctx, plan, changed, cycle, specialist=s)
                           for s in jobs]
            approved = all(r["approved"] for r in reviews)
            blockers = [
                {**i, "reviewer": r["reviewer"]}
                for r in reviews for i in r["issues"] if i["severity"] == "blocker"
            ]
            for r in reviews:
                log(f"[superman] cycle {cycle}: {r['reviewer']} review "
                    f"{'approved' if r['approved'] else 'rejected'}: {r['summary']}")

        if approved and cycle <= config.max_test_cycles:
            log(f"[superman] cycle {cycle}: tester running {plan['test_command']!r}")
            test_verdict = agents.test(plan, cycle)
            tests_passed = test_verdict["passed"]
            log(f"[superman] cycle {cycle}: tests "
                f"{'passed' if tests_passed else 'failed'}")

        if approved and tests_passed:
            break

        feedback_parts = [
            f"[{b['reviewer']} review] {b['file']}: {b['problem']}" for b in blockers
        ]
        if approved and not tests_passed:
            feedback_parts += [f"[test] {f}" for f in test_verdict["failures"]]
            feedback_parts.append(f"[test] {test_verdict['summary']}")
        feedback = "\n".join(feedback_parts)
        if approved and not feedback_parts:
            break  # approved but tests never got a chance to run

    # -- documentation writer, once green ----------------------------------
    if "docs" in specialists and approved and tests_passed:
        log("[superman] documentation writer: updating docs")
        docs_executor = agents.write_docs(ctx, plan, sorted(all_files))
        all_files |= docs_executor.files_written

    success = approved and tests_passed
    report = _build_report(task, plan, decision, sorted(all_files), reviews,
                           test_verdict, success, time.time() - started)
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


def _build_report(task, plan, decision, files, reviews, test_verdict,
                  success, elapsed) -> str:
    status = "✅ approved by all reviewers, tests passing" if success \
        else "⚠️ needs human attention"
    team = [SPECIALISTS[s][0] for s in decision["specialists"]]
    lines = [
        "# Superman run report",
        "",
        f"**Status:** {status}",
        f"**Elapsed:** {elapsed:.0f}s",
        "",
        "## Task",
        task,
        "",
        "## Team",
        f"- Specialists: {', '.join(team) or '(core team only)'}",
        f"- Skills: {', '.join(decision['skills']) or '(none)'}",
        "",
        "## Plan",
        plan["summary"],
        *[f"- {s['description']}" for s in plan["steps"]],
        "",
        "## Files changed",
        *([f"- {f}" for f in files] or ["- (none)"]),
        "",
        "## Reviews",
    ]
    for review in reviews or [{"reviewer": "core", "summary": "review never ran",
                               "issues": [], "approved": False}]:
        mark = "✅" if review["approved"] else "❌"
        lines.append(f"### {mark} {review['reviewer']}")
        lines.append(review["summary"])
        lines += [f"- [{i['severity']}] {i['file']}: {i['problem']}"
                  for i in review["issues"]]
    lines += [
        "",
        "## Tests",
        test_verdict["summary"],
        *[f"- {f}" for f in test_verdict["failures"]],
    ]
    return "\n".join(lines) + "\n"
