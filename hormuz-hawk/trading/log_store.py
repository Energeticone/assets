"""Cycle log storage — JSON file-based for simplicity."""

import json
import os
from dataclasses import asdict
from datetime import datetime, timezone
from pathlib import Path

from osint.scanner import CycleResult, MarketSnapshot

LOG_DIR = Path(__file__).parent.parent / "logs"
LOG_DIR.mkdir(exist_ok=True)


def _serialize(obj):
    if hasattr(obj, "value"):
        return obj.value
    if isinstance(obj, datetime):
        return obj.isoformat()
    return str(obj)


def save_cycle(cycle: CycleResult, recommendations: dict | None = None, risk: dict | None = None):
    """Persist a cycle result to disk."""
    entry = {
        "cycle_number": cycle.cycle_number,
        "timestamp": cycle.timestamp,
        "signal": cycle.signal.value,
        "confidence_score": cycle.confidence_score,
        "corroborating_sources": cycle.corroborating_sources,
        "market_snapshot": asdict(cycle.market_snapshot),
        "escalation_indicators": cycle.escalation_indicators,
        "deescalation_indicators": cycle.deescalation_indicators,
        "summary": cycle.raw_summary,
        "intel_count": len(cycle.intel_reports),
    }
    if recommendations:
        entry["recommendations"] = recommendations
    if risk:
        entry["risk"] = risk

    # Append to daily log file
    day = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    log_file = LOG_DIR / f"cycles_{day}.jsonl"
    with open(log_file, "a") as f:
        f.write(json.dumps(entry, default=_serialize) + "\n")

    # Also maintain latest.json for the dashboard
    latest_file = LOG_DIR / "latest.json"
    with open(latest_file, "w") as f:
        json.dump(entry, f, indent=2, default=_serialize)

    return entry


def load_latest() -> dict | None:
    latest_file = LOG_DIR / "latest.json"
    if latest_file.exists():
        with open(latest_file) as f:
            return json.load(f)
    return None


def load_day_cycles(date_str: str | None = None) -> list[dict]:
    if date_str is None:
        date_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    log_file = LOG_DIR / f"cycles_{date_str}.jsonl"
    if not log_file.exists():
        return []
    cycles = []
    with open(log_file) as f:
        for line in f:
            line = line.strip()
            if line:
                cycles.append(json.loads(line))
    return cycles
