"""
Kerry — the hill-climbing machine.

Kerry is not a model. Kerry is the learning loop that sits on top of a swappable
generalist model and compounds the firm's human and token capital. One pass of the
loop, for a single task:

    1. RETRIEVE   The Veteran decides which institutional knowledge to surface
                  (firm judgment, model-independent).
    2. DRAFT      The swappable generalist turns task + surfaced knowledge into prose
                  (the commodity layer).
    3. RESPOND    Kerry assembles the response and records what was surfaced.
    4. EVALUATE   Private evals grade the response against business outcomes.
    5. REWARD     The RL environment shapes a reward from the real trace...
    6. DISTILL    ...and distills durable lessons the firm owns.
    7. ABSORB     The Veteran takes on the lessons; capital is re-measured.

Run the loop over a set of tasks for several cycles and the eval score climbs while
token use sharpens — the loop, not the model, is doing the learning. Swap the model
and the climb holds, because the company veteran never left. That is the asset that
is hard to replicate: not the model, the loop.
"""

from __future__ import annotations

from kerry_types import Response, Task, Trace
from capital import CapitalLedger
from evals import PrivateEvals
from knowledge import KnowledgeBase
from models.base import Generalist
from persistence import Store
from rl import RLEnvironment
from veteran import Veteran


class Kerry:
    def __init__(
        self,
        generalist: Generalist,
        knowledge: KnowledgeBase,
        veteran: Veteran | None = None,
        store: Store | None = None,
    ) -> None:
        self.generalist = generalist
        self.kb = knowledge
        self.veteran = veteran or Veteran()
        self.evals = PrivateEvals(self.kb)
        self.rl = RLEnvironment()
        self.ledger = CapitalLedger()
        self.store = store
        self._cycle = 0

    # ------------------------------------------------------------ model swap
    def swap_generalist(self, generalist: Generalist) -> None:
        """Rip out the commodity model, keep everything the firm owns.

        Note what is *not* touched: the knowledge base, the Veteran's lessons, the
        evals, the RL environment, the capital ledger. That is sovereignty.
        """
        self.generalist = generalist

    # --------------------------------------------------------------- one task
    def run_task(self, task: Task) -> Trace:
        # 1 + 2: firm judgment decides the knowledge; the commodity model drafts.
        surfaced = self.veteran.decide(task, self.kb)
        draft = self.generalist.generate(task, surfaced)

        # 3: assemble the owned response.
        response = Response(
            text=draft.text,
            surfaced_knowledge_ids=[k.id for k in surfaced],
            model_id=draft.model_id,
            tokens=draft.tokens,
        )

        # 4: grade against business outcomes.
        eval_result = self.evals.grade(task, response)

        # 5: reward from the real trace.
        reward = self.rl.reward(eval_result.score, response.tokens)
        trace = Trace(
            cycle=self._cycle,
            task=task,
            response=response,
            eval_result=eval_result,
            reward=reward,
            model_id=draft.model_id,
        )

        # 6 + 7: distill durable lessons and absorb them.
        for lesson in self.rl.distill(trace):
            self.veteran.absorb(lesson)

        if self.store is not None:
            self.store.append_trace(trace)
        return trace

    # ----------------------------------------------------------- many cycles
    def run_cycle(self, tasks: list[Task]):
        """Run every task once and snapshot the firm's capital."""
        traces = [self.run_task(task) for task in tasks]
        mean_score = sum(t.eval_result.score for t in traces) / len(traces)
        mean_tokens = sum(t.response.tokens for t in traces) / len(traces)
        snapshot = self.ledger.record(
            cycle=self._cycle,
            kb=self.kb,
            veteran=self.veteran,
            num_tasks=len(tasks),
            mean_eval_score=mean_score,
            mean_tokens=mean_tokens,
            model_id=self.generalist.model_id,
        )
        self._cycle += 1
        if self.store is not None:
            self.store.save_veteran(self.veteran)
            self.store.save_knowledge(self.kb)
        return snapshot, traces

    def climb(self, tasks: list[Task], cycles: int):
        """Climb the hill: repeat the loop and watch capital compound."""
        snapshots = []
        for _ in range(cycles):
            snapshot, _ = self.run_cycle(tasks)
            snapshots.append(snapshot)
        return snapshots
