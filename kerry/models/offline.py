"""
Offline generalists — deterministic stand-ins for a frontier model.

These let the whole loop run with no API key and no network, so the architecture
is inspectable and the sovereignty test is reproducible on a laptop. They are
deliberately "dumb": they write generic prose and weave in whatever context Kerry
hands them. They know nothing about the firm — which is the point. All the
institutional value is supplied by Kerry, above the model seam.

`EchoGeneralist` and `ParaphraseGeneralist` produce different prose from the same
inputs, so swapping between them is a faithful stand-in for swapping frontier
models: the words change, the firm's surfaced knowledge does not.
"""

from __future__ import annotations

from kerry_types import Draft, Knowledge, Task


def _weave(task: Task, context: list[Knowledge], opener: str) -> tuple[str, int]:
    lines = [f"{opener} {task.prompt}"]
    for k in context:
        lines.append(f"- {k.fact}")
    text = "\n".join(lines)
    # A crude but stable token proxy: words. Real adapters report real usage.
    tokens = len(text.split())
    return text, tokens


class EchoGeneralist:
    model_id = "offline:echo-v1"

    def generate(self, task: Task, context: list[Knowledge]) -> Draft:
        text, tokens = _weave(task, context, "Here is what we know about")
        return Draft(text=text, model_id=self.model_id, tokens=tokens)


class ParaphraseGeneralist:
    model_id = "offline:paraphrase-v1"

    def generate(self, task: Task, context: list[Knowledge]) -> Draft:
        text, tokens = _weave(
            task, context, "On the question of"
        )
        text = text.replace("- ", "• ")
        return Draft(text=text, model_id=self.model_id, tokens=tokens)
