"""
CapitalLedger — accounting for the two forms of capital, and how they compound.

Every firm in an AI economy builds two kinds of capital:

  * Human capital — the knowledge, judgment, relationships, ingenuity, and pattern
    recognition of its people. In Kerry this shows up as the knowledge base and the
    human-set tasks: the things people seed and direct.

  * Token capital — the AI capability the firm builds and owns. In Kerry this is the
    Veteran's accumulated lessons: the policy distilled from real traces.

The thesis the ledger is built to demonstrate: human capital does not become less
valuable as token capital grows — it becomes more valuable, because human agency
(better knowledge, sharper goals) is what makes the loop climb. The two compound.
"""

from __future__ import annotations

from kerry_types import CapitalSnapshot
from knowledge import KnowledgeBase
from veteran import Veteran


class CapitalLedger:
    def __init__(self) -> None:
        self._history: list[CapitalSnapshot] = []

    def human_capital(self, kb: KnowledgeBase, num_tasks: int) -> float:
        """People-seeded value: the breadth of owned knowledge and directed goals.

        Weighted by how business-critical each fact is, because judgment about what
        matters is itself human capital.
        """
        knowledge_value = sum(k.weight for k in kb.all())
        direction_value = float(num_tasks)
        return round(knowledge_value + direction_value, 4)

    def token_capital(self, veteran: Veteran) -> float:
        """Owned AI capability: the confidence-weighted reach of learned lessons."""
        return round(
            sum(len(l.knowledge_ids) * l.confidence for l in veteran.lessons()), 4
        )

    def record(
        self,
        cycle: int,
        kb: KnowledgeBase,
        veteran: Veteran,
        num_tasks: int,
        mean_eval_score: float,
        mean_tokens: float,
        model_id: str,
    ) -> CapitalSnapshot:
        snapshot = CapitalSnapshot(
            cycle=cycle,
            human_capital=self.human_capital(kb, num_tasks),
            token_capital=self.token_capital(veteran),
            mean_eval_score=round(mean_eval_score, 4),
            mean_tokens=round(mean_tokens, 2),
            model_id=model_id,
        )
        self._history.append(snapshot)
        return snapshot

    def history(self) -> list[CapitalSnapshot]:
        return list(self._history)
