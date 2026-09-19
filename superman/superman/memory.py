"""Persistent memory: the system remembers everything.

Two layers live under `<workspace>/.superman/`:

- `memory.md` — durable learnings carried into every future run
  (conventions discovered, decisions made, pitfalls hit).
- `runs/<run_id>/` — the complete record of each run: the task, the plan,
  every agent transcript, tool log, verdicts, and the final report.
"""

from __future__ import annotations

import json
import time
from dataclasses import dataclass
from pathlib import Path

MEMORY_FILE = "memory.md"
RUNS_DIR = "runs"
MAX_MEMORY_CHARS = 24_000  # keep the newest entries if memory outgrows this


@dataclass
class Memory:
    state_dir: Path

    def __post_init__(self):
        self.state_dir.mkdir(parents=True, exist_ok=True)
        (self.state_dir / RUNS_DIR).mkdir(exist_ok=True)

    # -- durable learnings -------------------------------------------------

    @property
    def memory_path(self) -> Path:
        return self.state_dir / MEMORY_FILE

    def read(self) -> str:
        if self.memory_path.exists():
            return self.memory_path.read_text(encoding="utf-8")
        return ""

    def append(self, entry: str) -> None:
        entry = entry.strip()
        if not entry:
            return
        stamp = time.strftime("%Y-%m-%d %H:%M UTC", time.gmtime())
        updated = f"{self.read().strip()}\n\n## {stamp}\n{entry}".strip() + "\n"
        if len(updated) > MAX_MEMORY_CHARS:
            # Drop the oldest "## ..." sections until the newest ones fit.
            sections = [s for s in updated.split("\n## ") if s.strip()]
            while len(sections) > 1 and sum(len(s) + 4 for s in sections) > MAX_MEMORY_CHARS:
                sections.pop(0)
            updated = "## " + "\n## ".join(s.removeprefix("## ") for s in sections)
        self.memory_path.write_text(updated, encoding="utf-8")

    def clear(self) -> None:
        if self.memory_path.exists():
            self.memory_path.unlink()

    # -- run records -------------------------------------------------------

    def new_run(self, task: str) -> "RunRecord":
        run_id = time.strftime("%Y%m%d-%H%M%S", time.gmtime())
        run_dir = self.state_dir / RUNS_DIR / run_id
        suffix = 1
        while run_dir.exists():
            suffix += 1
            run_dir = self.state_dir / RUNS_DIR / f"{run_id}-{suffix}"
        run_dir.mkdir(parents=True)
        record = RunRecord(run_id=run_dir.name, run_dir=run_dir)
        record.save("task.md", task)
        return record

    def runs(self) -> list[str]:
        return sorted(p.name for p in (self.state_dir / RUNS_DIR).iterdir() if p.is_dir())

    def latest_run_dir(self) -> Path | None:
        names = self.runs()
        if not names:
            return None
        return self.state_dir / RUNS_DIR / names[-1]


@dataclass
class RunRecord:
    run_id: str
    run_dir: Path

    def save(self, name: str, content: str) -> None:
        (self.run_dir / name).write_text(content, encoding="utf-8")

    def save_json(self, name: str, data) -> None:
        self.save(name, json.dumps(data, indent=2, default=str))

    def save_transcript(self, agent: str, cycle: int, messages: list) -> None:
        def serialize(msg):
            content = msg.get("content")
            if isinstance(content, str):
                return {"role": msg["role"], "content": content}
            blocks = []
            for block in content:
                if isinstance(block, dict):
                    blocks.append(block)
                else:  # SDK content block object
                    blocks.append(block.to_dict() if hasattr(block, "to_dict") else str(block))
            return {"role": msg["role"], "content": blocks}

        self.save_json(
            f"transcript-{agent}-cycle{cycle}.json", [serialize(m) for m in messages]
        )
