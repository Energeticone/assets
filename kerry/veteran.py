"""
Veteran — the company veteran that survives every model swap.

This is the heart of the sovereignty test. A "generalist" model is the new hire
who is brilliant but knows nothing about *your* firm. The Veteran is the
twenty-year employee who knows which institutional facts matter for which kinds of
work. Kerry keeps that expertise in the loop — owned by the firm — so you can rip
out the generalist and drop in a new one without losing the company veteran.

Concretely, the Veteran holds a growing set of Lessons (token capital). Given a
task, it decides which institutional knowledge to surface. It starts knowing
nothing and gets sharper every cycle from real traces — a person who learns on
the job, not a model retrained in a lab you don't control.
"""

from __future__ import annotations

from kerry_types import Knowledge, Lesson, Task
from knowledge import KnowledgeBase


class Veteran:
    def __init__(self, lessons: list[Lesson] | None = None) -> None:
        self._lessons: dict[str, Lesson] = {}
        for lesson in lessons or []:
            self._lessons[lesson.id] = lesson

    # ------------------------------------------------------------------ state
    def lessons(self) -> list[Lesson]:
        return list(self._lessons.values())

    def __len__(self) -> int:
        return len(self._lessons)

    def absorb(self, lesson: Lesson) -> None:
        """Take on a new lesson, or reinforce an existing one.

        Reinforcement is how confidence compounds: the same lesson learned again
        from a fresh trace becomes more trusted, exactly like a veteran whose
        instinct is confirmed by repeated experience.
        """
        existing = self._lessons.get(lesson.id)
        if existing is None:
            self._lessons[lesson.id] = lesson
            return
        merged_ids = list(dict.fromkeys(existing.knowledge_ids + lesson.knowledge_ids))
        existing.knowledge_ids = merged_ids
        existing.confidence = min(1.0, existing.confidence + 0.25 * (1.0 - existing.confidence))

    # ---------------------------------------------------------------- decision
    def decide(self, task: Task, kb: KnowledgeBase) -> list[Knowledge]:
        """Decide which institutional knowledge to surface for this task.

        This is the firm's judgment, applied — and it is model-independent. The
        generalist never makes this call; Kerry does. That is what keeps the value
        inside the firm.
        """
        wanted_ids: list[str] = []
        task_tags = set(task.tags)
        for lesson in self._lessons.values():
            # Fire only when the lesson's learned task-profile fits this task. A
            # precise trigger (subset, not any-overlap) keeps a lesson learned for one
            # situation from leaking knowledge into a merely tag-adjacent one — the
            # difference between a veteran's judgment and a keyword match.
            if set(lesson.trigger_tags).issubset(task_tags) and lesson.confidence >= 0.2:
                wanted_ids.extend(lesson.knowledge_ids)

        # De-duplicate while preserving the order experience taught us.
        seen: set[str] = set()
        surfaced: list[Knowledge] = []
        for kid in wanted_ids:
            if kid in seen:
                continue
            seen.add(kid)
            entry = kb.get(kid)
            if entry is not None:
                surfaced.append(entry)
        return surfaced

    # ------------------------------------------------------------- persistence
    def to_dict(self) -> dict[str, dict]:
        return {lid: lesson.to_dict() for lid, lesson in self._lessons.items()}

    @classmethod
    def from_dict(cls, data: dict[str, dict]) -> "Veteran":
        return cls([Lesson(**v) for v in data.values()])
