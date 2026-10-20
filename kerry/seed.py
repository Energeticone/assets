"""
Seed data — a worked example of a firm's human capital.

This stands in for the knowledge, judgment, and direction that people bring. It is
intentionally a small, fictional "firm": a boutique that advises clients on cold-
chain logistics. The knowledge base is its institutional memory; the tasks are the
goals its people set. None of this is something a generalist model knows — it is
the firm's own capital, and it is what Kerry learns to deploy.

Swap this module out for your own knowledge and tasks and the loop is yours.
"""

from __future__ import annotations

from kerry_types import Knowledge, Task


def seed_knowledge() -> list[Knowledge]:
    return [
        Knowledge(
            "kb::reefer-setpoint",
            "Our reefer containers hold pharma loads at 2-8C; excursions above 8C for "
            ">30min trigger a mandatory stability review before release.",
            tags=["pharma", "cold-chain", "compliance"],
            weight=3.0,
        ),
        Knowledge(
            "kb::hormuz-detour",
            "When Strait of Hormuz war-risk premiums spike, we reroute Gulf pharma via "
            "Jebel Ali air-bridge; adds 36h but keeps the cold chain unbroken.",
            tags=["pharma", "cold-chain", "routing", "geopolitics"],
            weight=2.5,
        ),
        Knowledge(
            "kb::customs-pre-clear",
            "EU pharma imports clear fastest when we file the GDP attestation 72h ahead "
            "via our licensed broker in Rotterdam.",
            tags=["pharma", "customs", "compliance"],
            weight=2.0,
        ),
        Knowledge(
            "kb::produce-ethylene",
            "Ethylene-sensitive produce (bananas, avocados) must never share a reefer "
            "with apples or pears; we hard-block these co-loads at booking.",
            tags=["produce", "cold-chain"],
            weight=2.0,
        ),
        Knowledge(
            "kb::produce-precool",
            "Leafy greens get a forced-air pre-cool to 1C within 4h of harvest or we "
            "decline the load; shelf-life math doesn't work otherwise.",
            tags=["produce", "cold-chain", "quality"],
            weight=1.5,
        ),
        Knowledge(
            "kb::client-sla-credits",
            "Tier-1 clients get an automatic 5% service credit on any temperature "
            "excursion we cause; relationship value far exceeds the credit.",
            tags=["client", "relationships", "compliance"],
            weight=2.0,
        ),
    ]


def seed_tasks() -> list[Task]:
    return [
        Task(
            "task::pharma-gulf",
            "A client wants to move temperature-sensitive vaccines out of the Gulf "
            "during a security flare-up. What should we advise?",
            tags=["pharma", "cold-chain", "routing", "geopolitics"],
        ),
        Task(
            "task::pharma-eu-import",
            "How do we get a client's insulin shipment through EU customs with minimal "
            "delay and full compliance?",
            tags=["pharma", "customs", "compliance"],
        ),
        Task(
            "task::produce-mixed",
            "A client asks us to co-load avocados and apples to save on a reefer. "
            "How do we respond?",
            tags=["produce", "cold-chain"],
        ),
        Task(
            "task::client-excursion",
            "We caused a brief temperature excursion on a Tier-1 client's pharma load. "
            "What's our play?",
            tags=["pharma", "client", "relationships", "compliance"],
        ),
    ]
