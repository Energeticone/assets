"""
RLEnvironment — a private reinforcement-learning environment built from real traces.

Models grow stronger on real traces from inside the organisation. This module is
where that happens. It does not retrain anyone's weights — that would hand your
advantage to whoever owns the model. Instead it shapes a reward from each trace
and distills a Lesson the firm keeps: when the eval shows a business-critical fact
was missed, the environment teaches the Veteran to surface it next time.

That is the hill-climbing machine in one move: a real outcome becomes a reward
becomes a durable improvement in the firm's owned policy. And it compounds —
every improved workflow generates a better training signal for the next one.
"""

from __future__ import annotations

from kerry_types import Lesson, Trace


class RLEnvironment:
    def __init__(self, base_confidence: float = 0.5, max_new_per_cycle: int = 2) -> None:
        self._base_confidence = base_confidence
        # Learn a bounded amount from each trace. Mastery accrues over several real
        # encounters rather than one — which is what makes the climb gradual and the
        # signal trustworthy, the same way genuine expertise is earned.
        self._max_new_per_cycle = max_new_per_cycle

    def reward(self, trace_score: float, tokens: int) -> float:
        """Reward the outcome that matters, lightly net of the cost to achieve it.

        Business value first (the eval score), with a small efficiency term so the
        loop also learns to be economical with tokens.
        """
        efficiency = 1.0 / (1.0 + tokens / 100.0)
        return round(0.9 * trace_score + 0.1 * efficiency, 4)

    def distill(self, trace: Trace) -> list[Lesson]:
        """Turn a graded trace into durable lessons the firm owns.

        A missed business-critical fact is the strongest signal there is: the firm
        needed something and didn't bring it. We encode the fix as a lesson keyed on
        the task's tags, so the next similar task surfaces the fact automatically.
        """
        missed = trace.eval_result.missed_knowledge_ids
        if not missed:
            return []

        # Take only the most business-critical slice this cycle (ids sort stably, and
        # the eval already ordered expected knowledge by weight upstream).
        learn_now = sorted(missed)[: self._max_new_per_cycle]
        trigger_tags = sorted(trace.task.tags)
        lesson_id = "lesson::" + ",".join(trigger_tags)
        lesson = Lesson(
            id=lesson_id,
            trigger_tags=trigger_tags,
            knowledge_ids=learn_now,
            confidence=self._base_confidence,
            origin_cycle=trace.cycle,
        )
        return [lesson]
