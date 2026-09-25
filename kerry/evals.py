"""
PrivateEvals — measuring against outcomes that matter to the business.

External benchmarks tell you how a model does on someone else's test. They tell
you nothing about whether it is getting better at *your* work. Private evals close
that gap: they grade a response against the institutional outcomes the firm
actually cares about — here, "did we bring the right institutional knowledge to
bear on this task?" — and that rubric is derived from the firm's own knowledge
base, so it is impossible for an outside model to optimise against it directly.
"""

from __future__ import annotations

from kerry_types import EvalResult, Response, Task
from knowledge import KnowledgeBase


class PrivateEvals:
    def __init__(self, kb: KnowledgeBase) -> None:
        self._kb = kb

    def expected_knowledge_ids(self, task: Task) -> list[str]:
        """The business-critical facts a good answer to this task should deploy.

        This is the firm's definition of "good" — owned, private, and tied to real
        outcomes rather than a public leaderboard.
        """
        return [k.id for k in self._kb.query(task.tags)]

    def grade(self, task: Task, response: Response) -> EvalResult:
        expected = self.expected_knowledge_ids(task)
        surfaced = set(response.surfaced_knowledge_ids)
        if not expected:
            # Nothing institutional was at stake; a coherent generalist answer is fine.
            return EvalResult(task.id, 1.0, [], list(surfaced), [])

        hit = [kid for kid in expected if kid in surfaced]
        missed = [kid for kid in expected if kid not in surfaced]

        # Precision penalty: surfacing irrelevant knowledge wastes tokens and erodes
        # trust, so a good firm rewards focus, not volume.
        irrelevant = [kid for kid in surfaced if kid not in expected]
        precision_penalty = 0.1 * len(irrelevant)

        recall = len(hit) / len(expected)
        score = max(0.0, recall - precision_penalty)
        return EvalResult(task.id, round(score, 4), expected, list(surfaced), missed)
