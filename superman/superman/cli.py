"""Superman command-line interface.

    superman run "Add input validation to the signup form"
    superman review            # show the latest run's final report
    superman history           # list past runs
    superman memory            # show persistent memory
    superman memory --clear
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from .config import Config
from .memory import Memory
from .orchestrator import run_task


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="superman",
        description="Orchestrate AI agents that plan, implement, review and test — "
                    "then review the final output yourself.",
    )
    parser.add_argument(
        "-w", "--workspace", default=".",
        help="workspace directory the agents operate on (default: current directory)",
    )
    sub = parser.add_subparsers(dest="command", required=True)

    run = sub.add_parser("run", help="run a task through the agent pipeline")
    run.add_argument("task", help="what you want built, in plain language")
    run.add_argument("--model", default=None, help="model ID (default: claude-opus-5)")
    run.add_argument("--effort", default=None,
                     choices=["low", "medium", "high", "xhigh", "max"],
                     help="thinking effort (default: API default)")
    run.add_argument("--max-cycles", type=int, default=3,
                     help="max review/test fix cycles (default: 3)")
    run.add_argument("--allow-any-command", action="store_true",
                     help="let agents run shell commands outside the allowlist")

    sub.add_parser("review", help="print the latest run's report for human review")
    sub.add_parser("history", help="list all recorded runs")

    memory = sub.add_parser("memory", help="show or clear persistent memory")
    memory.add_argument("--clear", action="store_true", help="erase persistent memory")
    return parser


def main(argv=None) -> int:
    args = build_parser().parse_args(argv)
    workspace = Path(args.workspace).resolve()
    if not workspace.is_dir():
        print(f"error: workspace does not exist: {workspace}", file=sys.stderr)
        return 2

    config = Config(workspace=workspace)

    if args.command == "run":
        if args.model:
            config.model = args.model
        if args.effort:
            config.effort = args.effort
        config.max_review_cycles = args.max_cycles
        config.max_test_cycles = args.max_cycles
        config.allow_any_command = args.allow_any_command
        result = run_task(args.task, config)
        print()
        print(result.report)
        return 0 if result.success else 1

    memory = Memory(config.state_dir)

    if args.command == "review":
        run_dir = memory.latest_run_dir()
        if run_dir is None:
            print("no runs yet — start one with: superman run \"<task>\"")
            return 1
        report = run_dir / "report.md"
        if report.exists():
            print(report.read_text(encoding="utf-8"))
        else:
            print(f"run {run_dir.name} has no report (interrupted?); "
                  f"artifacts are in {run_dir}")
        return 0

    if args.command == "history":
        runs = memory.runs()
        if not runs:
            print("no runs recorded")
        for name in runs:
            print(name)
        return 0

    if args.command == "memory":
        if args.clear:
            memory.clear()
            print("persistent memory cleared")
        else:
            content = memory.read()
            print(content if content.strip() else "(memory is empty)")
        return 0

    return 2


if __name__ == "__main__":
    sys.exit(main())
