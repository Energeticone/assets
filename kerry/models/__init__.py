"""Swappable generalist models and the registry that hot-swaps them."""

from __future__ import annotations

from models.base import Generalist, ModelRegistry
from models.offline import EchoGeneralist, ParaphraseGeneralist


def default_registry() -> ModelRegistry:
    """Register the commodity generalists Kerry can run on.

    The offline stand-ins are always available. The Anthropic adapter is registered
    lazily so the loop runs with zero dependencies, and only reaches for the SDK +
    API key when you actually select it.
    """
    registry = ModelRegistry()
    registry.register("echo", EchoGeneralist)
    registry.register("paraphrase", ParaphraseGeneralist)

    def _anthropic():
        from models.anthropic_generalist import AnthropicGeneralist

        return AnthropicGeneralist()

    registry.register("anthropic", _anthropic)
    return registry


__all__ = [
    "Generalist",
    "ModelRegistry",
    "EchoGeneralist",
    "ParaphraseGeneralist",
    "default_registry",
]
