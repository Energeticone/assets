#!/usr/bin/env python3
"""
Kerry — run the learning loop and watch human + token capital compound.

Usage:
    python run.py                 # climb the hill, then run the sovereignty test
    python run.py climb           # just climb: run the loop for KERRY_CYCLES cycles
    python run.py sovereignty     # climb, then swap the generalist and re-measure
    python run.py models          # list the swappable generalists available
    python run.py reset           # wipe persisted state (knowledge, veteran, traces)

Everything runs offline by default (no API key). Set KERRY_GENERALIST=anthropic to
run the same loop on Claude Opus 4.8 — nothing else changes, which is the point.
"""

from __future__ import annotations

import sys

import config
from kerry_types import CapitalSnapshot
from knowledge import KnowledgeBase
from loop import Kerry
from models import default_registry
from persistence import Store
from seed import seed_knowledge, seed_tasks


def _print_header(title: str) -> None:
    print()
    print("=" * 72)
    print(title)
    print("=" * 72)


def _print_snapshot(s: CapitalSnapshot) -> None:
    print(
        f"  cycle {s.cycle}  "
        f"eval={s.mean_eval_score:5.2f}  "
        f"human_capital={s.human_capital:7.2f}  "
        f"token_capital={s.token_capital:7.2f}  "
        f"mean_tokens={s.mean_tokens:6.1f}  "
        f"[{s.model_id}]"
    )


def _build(generalist_name: str) -> tuple[Kerry, list]:
    registry = default_registry()
    store = Store()

    # Human capital: load owned knowledge if it exists, else seed it. Either way the
    # firm owns it on disk.
    kb = store.load_knowledge() or KnowledgeBase(seed_knowledge())
    # Token capital: load the veteran's accumulated lessons if any. This is what makes
    # the loop compound across runs — learning is durable.
    veteran = store.load_veteran()

    generalist = registry.create(generalist_name)
    kerry = Kerry(generalist=generalist, knowledge=kb, veteran=veteran, store=store)
    return kerry, seed_tasks()


def cmd_models() -> None:
    _print_header("Swappable generalists (the commodity layer)")
    for name in default_registry().available():
        print(f"  - {name}")
    print("\nThe firm's capital lives above this layer, in Kerry — so any of these")
    print("can be swapped in without losing the company veteran.")


def cmd_reset() -> None:
    Store().reset()
    print("Persisted state wiped. The firm starts from seed knowledge, no lessons.")


def cmd_climb() -> list[CapitalSnapshot]:
    kerry, tasks = _build(config.DEFAULT_GENERALIST)
    _print_header(f"Climbing the hill on '{kerry.generalist.model_id}'")
    print("Every cycle: retrieve -> draft -> evaluate -> reward -> distill -> absorb.\n")
    snapshots = kerry.climb(tasks, config.CYCLES)
    for s in snapshots:
        _print_snapshot(s)
    print(f"\n  lessons the firm now owns: {len(kerry.veteran)} (token capital, on disk)")
    return snapshots


def cmd_sovereignty() -> None:
    # Phase 1: climb on the default generalist until the loop has learned the firm.
    kerry, tasks = _build(config.DEFAULT_GENERALIST)
    _print_header(f"Phase 1 — climb on '{kerry.generalist.model_id}'")
    for s in kerry.climb(tasks, config.CYCLES):
        _print_snapshot(s)
    learned_score = kerry.ledger.history()[-1].mean_eval_score
    print(f"\n  The loop has learned the firm. Lessons owned: {len(kerry.veteran)}")

    # Phase 2: rip out the generalist, drop in a different one. Touch nothing else.
    registry = default_registry()
    new_generalist = registry.create(config.SWAP_GENERALIST)
    kerry.swap_generalist(new_generalist)
    _print_header(f"Phase 2 — SWAP the generalist to '{new_generalist.model_id}'")
    print("Knowledge base, veteran, evals, RL env, ledger: all untouched.\n")
    snapshot, _ = kerry.run_cycle(tasks)
    _print_snapshot(snapshot)

    _print_header("The sovereignty test")
    held = snapshot.mean_eval_score >= learned_score - 1e-9
    print(f"  eval before swap: {learned_score:.2f}")
    print(f"  eval after swap : {snapshot.mean_eval_score:.2f}  (new model: {new_generalist.model_id})")
    if held:
        print("\n  PASS — the company veteran survived the model swap. The value was")
        print("  never in the generalist; it was in the loop the firm owns.")
    else:
        print("\n  The score moved — inspect which lessons or knowledge were model-bound.")


def main() -> None:
    cmd = sys.argv[1] if len(sys.argv) > 1 else "all"
    if cmd == "models":
        cmd_models()
    elif cmd == "reset":
        cmd_reset()
    elif cmd == "climb":
        cmd_climb()
    elif cmd == "sovereignty":
        cmd_sovereignty()
    elif cmd == "all":
        cmd_sovereignty()
    else:
        print(__doc__)
        sys.exit(1)


if __name__ == "__main__":
    main()
