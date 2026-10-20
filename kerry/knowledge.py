"""
KnowledgeBase — institutional memory, made queryable.

This is where the firm's accumulated judgment lives. It makes institutional
memory queryable and makes the use of tokens more efficient: instead of dumping
everything into a model's context, Kerry retrieves only the facts that matter for
the task at hand. The knowledge base is human capital in storage form, and it is
owned by the firm regardless of which generalist model is plugged in.
"""

from __future__ import annotations

from kerry_types import Knowledge


class KnowledgeBase:
    def __init__(self, entries: list[Knowledge] | None = None) -> None:
        self._by_id: dict[str, Knowledge] = {}
        for entry in entries or []:
            self.add(entry)

    def add(self, entry: Knowledge) -> None:
        self._by_id[entry.id] = entry

    def get(self, knowledge_id: str) -> Knowledge | None:
        return self._by_id.get(knowledge_id)

    def all(self) -> list[Knowledge]:
        return list(self._by_id.values())

    def __len__(self) -> int:
        return len(self._by_id)

    def query(self, tags: list[str]) -> list[Knowledge]:
        """Return institutional facts whose tags intersect the query tags.

        This is the targeted-retrieval primitive that keeps token use efficient —
        we surface what is relevant, not the whole corpus.
        """
        wanted = set(tags)
        hits = [k for k in self._by_id.values() if wanted.intersection(k.tags)]
        # Most business-critical first; this ordering is itself part of the firm's IP.
        hits.sort(key=lambda k: k.weight, reverse=True)
        return hits

    def to_dict(self) -> dict[str, dict]:
        return {kid: k.to_dict() for kid, k in self._by_id.items()}

    @classmethod
    def from_dict(cls, data: dict[str, dict]) -> "KnowledgeBase":
        return cls([Knowledge(**v) for v in data.values()])
