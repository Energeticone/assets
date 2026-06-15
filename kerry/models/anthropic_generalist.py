"""
AnthropicGeneralist — a real frontier model behind the same commodity seam.

This is the production generalist: Claude, plugged in exactly where the offline
stand-ins go. It proves the seam is real — the loop, the veteran, the evals, and
the RL environment do not change at all when you move from a deterministic stub to
a frontier model. The firm's capital is untouched by the swap.

Defaults to Claude Opus 4.8 with adaptive thinking. Requires ANTHROPIC_API_KEY;
if the SDK or key is missing, construction raises and the loop simply falls back
to an offline generalist.
"""

from __future__ import annotations

from kerry_types import Draft, Knowledge, Task

# Kerry hands the model only what it needs to write good prose. The decision about
# *which* institutional facts to include was already made by the Veteran — the
# model's job is to render them well, not to choose them.
_SYSTEM = (
    "You are the drafting surface of a firm's internal learning system. You will be "
    "given a task and a set of institutional facts the firm has already decided are "
    "relevant. Write a clear, concise answer that uses those facts faithfully. Do not "
    "invent firm-specific facts beyond the ones provided. Lead with the outcome."
)


class AnthropicGeneralist:
    def __init__(self, model: str = "claude-opus-4-8", max_tokens: int = 1024) -> None:
        try:
            from anthropic import Anthropic
        except ImportError as exc:  # pragma: no cover - depends on environment
            raise RuntimeError(
                "The 'anthropic' package is not installed. Run "
                "`pip install -r requirements.pip` or use an offline generalist."
            ) from exc

        self._client = Anthropic()  # reads ANTHROPIC_API_KEY from the environment
        self._model = model
        self._max_tokens = max_tokens
        self.model_id = f"anthropic:{model}"

    def generate(self, task: Task, context: list[Knowledge]) -> Draft:
        facts = "\n".join(f"- {k.fact}" for k in context) or "(no institutional facts surfaced)"
        user = (
            f"Task: {task.prompt}\n\n"
            f"Institutional facts the firm has surfaced for this task:\n{facts}"
        )

        message = self._client.messages.create(
            model=self._model,
            max_tokens=self._max_tokens,
            thinking={"type": "adaptive"},
            system=_SYSTEM,
            messages=[{"role": "user", "content": user}],
        )

        text = "".join(
            block.text for block in message.content if getattr(block, "type", None) == "text"
        )
        tokens = message.usage.input_tokens + message.usage.output_tokens
        return Draft(text=text, model_id=self.model_id, tokens=tokens)
