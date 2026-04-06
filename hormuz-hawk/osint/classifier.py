"""Trade recommendation engine — maps signal states to actionable recommendations."""

from dataclasses import dataclass, field
from enum import Enum

from osint.scanner import SignalState, CycleResult
import config


class Action(str, Enum):
    BUY = "BUY"
    SELL = "SELL"
    HOLD = "HOLD"
    TIGHTEN_STOPS = "TIGHTEN_STOPS"
    CLOSE = "CLOSE"
    REDUCE = "REDUCE"
    MAXIMIZE = "MAXIMIZE"
    HALT = "HALT"


@dataclass
class TradeRecommendation:
    instrument_name: str
    search_term: str
    tier: str
    action: Action
    direction: str
    reasoning: str
    suggested_leverage: int = 1
    stop_loss_pct: float = 0.12


@dataclass
class CycleRecommendation:
    signal: SignalState
    state_changed: bool
    recommendations: list[TradeRecommendation] = field(default_factory=list)
    alert_owner: bool = False
    alert_message: str = ""
    halt_trading: bool = False


def generate_recommendations(
    current: CycleResult,
    previous_signal: SignalState | None,
) -> CycleRecommendation:
    """Generate trade recommendations. These require manual approval before execution."""

    state_changed = previous_signal is not None and current.signal != previous_signal
    rec = CycleRecommendation(
        signal=current.signal,
        state_changed=state_changed,
    )

    if current.signal == SignalState.ESCALATION:
        _on_escalation(rec, current)
    elif current.signal == SignalState.STEADY_BURN:
        _on_steady_burn(rec)
    elif current.signal == SignalState.FAKE_DE_ESCALATION:
        _on_fake_deescalation(rec)
    elif current.signal == SignalState.REAL_DE_ESCALATION:
        _on_real_deescalation(rec)
    elif current.signal == SignalState.BLACK_SWAN:
        _on_black_swan(rec, current)

    return rec


def _on_escalation(rec: CycleRecommendation, cycle: CycleResult):
    vix = cycle.market_snapshot.vix or 0

    for inst in config.INSTRUMENTS["tier1"]:
        rec.recommendations.append(TradeRecommendation(
            instrument_name=inst["name"],
            search_term=inst["search"],
            tier="tier1",
            action=Action.BUY,
            direction="BUY",
            reasoning="ESCALATION signal — add to Tier 1 longs",
            suggested_leverage=2,
            stop_loss_pct=inst["stop_pct"],
        ))

    if vix > 25:
        gold = config.INSTRUMENTS["tier2"][0]
        rec.recommendations.append(TradeRecommendation(
            instrument_name=gold["name"],
            search_term=gold["search"],
            tier="tier2",
            action=Action.BUY,
            direction="BUY",
            reasoning=f"ESCALATION + VIX>{vix:.0f} — add Gold",
            suggested_leverage=1,
            stop_loss_pct=gold["stop_pct"],
        ))


def _on_steady_burn(rec: CycleRecommendation):
    rec.recommendations.append(TradeRecommendation(
        instrument_name="ALL",
        search_term="",
        tier="all",
        action=Action.HOLD,
        direction="",
        reasoning="STEADY BURN — no new trades. Verify stops are current.",
    ))


def _on_fake_deescalation(rec: CycleRecommendation):
    rec.recommendations.append(TradeRecommendation(
        instrument_name="ALL",
        search_term="",
        tier="all",
        action=Action.TIGHTEN_STOPS,
        direction="",
        reasoning="FAKE DE-ESCALATION — do NOT sell. Tighten stops by 2%.",
    ))
    rec.alert_message = "Fake de-escalation detected (likely Trump verbal pattern). Holding positions."


def _on_real_deescalation(rec: CycleRecommendation):
    rec.alert_owner = True
    rec.alert_message = "REAL DE-ESCALATION confirmed — tanker traffic resuming. Begin unwind."

    for inst in config.INSTRUMENTS["tier3"]:
        rec.recommendations.append(TradeRecommendation(
            instrument_name=inst["name"],
            search_term=inst["search"],
            tier="tier3",
            action=Action.CLOSE,
            direction="",
            reasoning="REAL DE-ESCALATION — close Tier 3 immediately",
        ))
    for inst in config.INSTRUMENTS["tier2"]:
        rec.recommendations.append(TradeRecommendation(
            instrument_name=inst["name"],
            search_term=inst["search"],
            tier="tier2",
            action=Action.REDUCE,
            direction="",
            reasoning="REAL DE-ESCALATION — close 50% of Tier 2",
        ))
    for inst in config.INSTRUMENTS["tier1"]:
        rec.recommendations.append(TradeRecommendation(
            instrument_name=inst["name"],
            search_term=inst["search"],
            tier="tier1",
            action=Action.TIGHTEN_STOPS,
            direction="",
            reasoning="REAL DE-ESCALATION — tighten Tier 1 stops to -5%",
            stop_loss_pct=0.05,
        ))


def _on_black_swan(rec: CycleRecommendation, cycle: CycleResult):
    rec.alert_owner = True
    rec.halt_trading = False
    rec.alert_message = (
        f"BLACK SWAN detected: {'; '.join(cycle.escalation_indicators[:3])}. "
        "Maximize all positions."
    )

    for inst in config.INSTRUMENTS["tier1"]:
        rec.recommendations.append(TradeRecommendation(
            instrument_name=inst["name"],
            search_term=inst["search"],
            tier="tier1",
            action=Action.MAXIMIZE,
            direction="BUY",
            reasoning="BLACK SWAN — maximize Tier 1 to limit",
            suggested_leverage=2,
            stop_loss_pct=0.20,
        ))
    for inst in config.INSTRUMENTS["tier2"][:2]:  # Gold + ITA
        rec.recommendations.append(TradeRecommendation(
            instrument_name=inst["name"],
            search_term=inst["search"],
            tier="tier2",
            action=Action.MAXIMIZE,
            direction="BUY",
            reasoning="BLACK SWAN — maximize Gold & Defense",
            suggested_leverage=1,
            stop_loss_pct=0.20,
        ))
