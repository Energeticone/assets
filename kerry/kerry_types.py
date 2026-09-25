"""
Core data structures for Kerry.

These types are the vocabulary of the firm's learning loop. They are deliberately
small and serialisable (JSON) because the whole point of Kerry is that the loop —
and everything it learns — is *owned* by the firm and *persists* across model
swaps and process restarts. You can offload a task; you can never offload your
learning. So the learning has to be a durable, inspectable asset.
"""

from __future__ import annotations

import time
from dataclasses import dataclass, field, asdict
from typing import Any


def _now() -> float:
    return time.time()


@dataclass
class Knowledge:
    """A single piece of institutional memory — the firm's human capital, encoded.

    Knowledge is seeded by people (judgment, domain expertise, relationships,
    pattern recognition) and is the substrate the loop learns to deploy. It is the
    firm's IP, not the model's.
    """

    id: str
    fact: str
    tags: list[str]
    weight: float = 1.0  # how business-critical this fact is

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass
class Task:
    """A unit of work the firm cares about.

    Tasks are set by human agency — the ambitious goals, the dots connected across
    domains. Without human direction you have compute running in circles, so the
    task (and its tags) is where human capital enters the loop.
    """

    id: str
    prompt: str
    tags: list[str]

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass
class Lesson:
    """A learned policy: "when a task looks like THIS, surface THAT knowledge."

    Lessons are token capital. They are distilled from real traces inside the
    organisation (not external benchmarks) and they accumulate. Every improved
    workflow generates a better lesson, which is the compounding the whole thesis
    rests on.
    """

    id: str
    trigger_tags: list[str]
    knowledge_ids: list[str]
    confidence: float
    origin_cycle: int
    created_at: float = field(default_factory=_now)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass
class Draft:
    """Raw output from the swappable generalist model.

    This is the *only* thing the generalist contributes. It is prose. The
    institutional judgment about which outcomes matter lives in Kerry, not here —
    which is exactly why the generalist can be swapped without losing the company
    veteran.
    """

    text: str
    model_id: str
    tokens: int


@dataclass
class Response:
    """What Kerry actually returns: generalist prose + the firm's owned knowledge."""

    text: str
    surfaced_knowledge_ids: list[str]
    model_id: str
    tokens: int


@dataclass
class EvalResult:
    """A private eval result — graded against business outcomes, not benchmarks."""

    task_id: str
    score: float  # 0.0 .. 1.0
    expected_knowledge_ids: list[str]
    surfaced_knowledge_ids: list[str]
    missed_knowledge_ids: list[str]

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass
class Trace:
    """The full record of one task being run through the loop.

    Traces are the raw material of the private RL environment. They are the real,
    in-the-business signal that lets the system grow stronger — the thing a generic
    model can never absorb because it never sees inside your organisation.
    """

    cycle: int
    task: Task
    response: Response
    eval_result: EvalResult
    reward: float
    model_id: str
    created_at: float = field(default_factory=_now)

    def to_dict(self) -> dict[str, Any]:
        return {
            "cycle": self.cycle,
            "task": self.task.to_dict(),
            "response": {
                "text": self.response.text,
                "surfaced_knowledge_ids": self.response.surfaced_knowledge_ids,
                "model_id": self.response.model_id,
                "tokens": self.response.tokens,
            },
            "eval_result": self.eval_result.to_dict(),
            "reward": self.reward,
            "model_id": self.model_id,
            "created_at": self.created_at,
        }


@dataclass
class CapitalSnapshot:
    """A point-in-time reading of the two forms of capital and how they compound."""

    cycle: int
    human_capital: float
    token_capital: float
    mean_eval_score: float
    mean_tokens: float
    model_id: str
    created_at: float = field(default_factory=_now)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)
