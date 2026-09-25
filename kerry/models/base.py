"""
The generalist-model boundary — the seam that makes the firm sovereign.

A Generalist is any model that can turn a task plus some retrieved context into
prose. That is *all* Kerry asks of it. Everything that makes the firm valuable —
which outcomes matter, which institutional knowledge to deploy, what "better"
means — lives above this seam, in Kerry. So the generalist is a commodity you can
swap at will: a new frontier model, a cheaper open one, a different vendor. The
company veteran stays put.

This is the key test of control in the era ahead: can you switch out the
generalist without losing the expertise built into your learning system? With
this interface, yes.
"""

from __future__ import annotations

from typing import Protocol

from kerry_types import Draft, Knowledge, Task


class Generalist(Protocol):
    """A swappable foundation model. Prose in, prose out — nothing firm-specific."""

    model_id: str

    def generate(self, task: Task, context: list[Knowledge]) -> Draft:
        ...


class ModelRegistry:
    """A tiny registry so the loop can hot-swap the generalist by name.

    Swapping the model is a one-line operation precisely because the registry only
    deals in the commodity layer. None of the firm's accumulated capital is touched.
    """

    def __init__(self) -> None:
        self._factories: dict[str, callable] = {}

    def register(self, name: str, factory) -> None:
        self._factories[name] = factory

    def available(self) -> list[str]:
        return sorted(self._factories)

    def create(self, name: str) -> Generalist:
        if name not in self._factories:
            raise KeyError(
                f"Unknown generalist '{name}'. Available: {', '.join(self.available()) or '(none)'}"
            )
        return self._factories[name]()
