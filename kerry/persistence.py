"""
Persistence — the learning loop is a durable asset, not a runtime artifact.

You can offload a task, or even a job, but you can never offload your learning.
For that to be true in software, the learning has to outlive the process. Kerry
writes its knowledge base and — crucially — the Veteran's lessons to disk, so the
firm's token capital compounds across runs and is owned as a file you can version,
audit, and carry to a different model. Traces are appended as JSONL so the private
RL environment always has the real in-house signal to draw on.
"""

from __future__ import annotations

import json
from pathlib import Path

from kerry_types import Trace
from knowledge import KnowledgeBase
from veteran import Veteran

STATE_DIR = Path(__file__).parent / "state"


class Store:
    def __init__(self, state_dir: Path | None = None) -> None:
        self.dir = state_dir or STATE_DIR
        self.dir.mkdir(parents=True, exist_ok=True)
        self.knowledge_path = self.dir / "knowledge.json"
        self.veteran_path = self.dir / "veteran.json"
        self.traces_path = self.dir / "traces.jsonl"

    # ----------------------------------------------------------- knowledge base
    def save_knowledge(self, kb: KnowledgeBase) -> None:
        self.knowledge_path.write_text(json.dumps(kb.to_dict(), indent=2))

    def load_knowledge(self) -> KnowledgeBase | None:
        if not self.knowledge_path.exists():
            return None
        return KnowledgeBase.from_dict(json.loads(self.knowledge_path.read_text()))

    # ---------------------------------------------------------------- veteran
    def save_veteran(self, veteran: Veteran) -> None:
        self.veteran_path.write_text(json.dumps(veteran.to_dict(), indent=2))

    def load_veteran(self) -> Veteran | None:
        if not self.veteran_path.exists():
            return None
        return Veteran.from_dict(json.loads(self.veteran_path.read_text()))

    # ----------------------------------------------------------------- traces
    def append_trace(self, trace: Trace) -> None:
        with self.traces_path.open("a") as f:
            f.write(json.dumps(trace.to_dict()) + "\n")

    def reset(self) -> None:
        for path in (self.knowledge_path, self.veteran_path, self.traces_path):
            if path.exists():
                path.unlink()
