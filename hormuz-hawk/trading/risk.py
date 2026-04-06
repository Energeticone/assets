"""Risk management — circuit breakers and position limit checks."""

import logging
from dataclasses import dataclass

from trading.etoro_client import PortfolioState
import config

logger = logging.getLogger(__name__)


@dataclass
class RiskCheck:
    ok: bool
    violations: list[str]
    circuit_breaker_triggered: bool = False
    session_drawdown_triggered: bool = False


_high_water_mark: float = 0
_session_start_equity: float = 0


def init_risk(portfolio: PortfolioState):
    """Initialize HWM and session equity on startup."""
    global _high_water_mark, _session_start_equity
    _high_water_mark = max(_high_water_mark, portfolio.equity)
    if _session_start_equity == 0:
        _session_start_equity = portfolio.equity


def check_risk(portfolio: PortfolioState) -> RiskCheck:
    """Run all risk checks against current portfolio."""
    global _high_water_mark
    _high_water_mark = max(_high_water_mark, portfolio.equity)

    violations = []
    circuit_breaker = False
    session_drawdown = False

    # 1. Circuit breaker: 20% drawdown from HWM
    if _high_water_mark > 0:
        dd = (portfolio.equity - _high_water_mark) / _high_water_mark
        if dd < -0.20:
            violations.append(
                f"CIRCUIT BREAKER: equity ${portfolio.equity:.0f} is "
                f"{dd:.1%} below HWM ${_high_water_mark:.0f}"
            )
            circuit_breaker = True

    # 2. Session drawdown: 10% in single session
    if _session_start_equity > 0:
        sdd = (portfolio.equity - _session_start_equity) / _session_start_equity
        if sdd < -0.10:
            violations.append(
                f"SESSION DRAWDOWN: equity down {sdd:.1%} from session start "
                f"${_session_start_equity:.0f}"
            )
            session_drawdown = True

    # 3. Cash reserve
    if portfolio.equity > 0:
        cash_pct = portfolio.cash / portfolio.equity
        if cash_pct < config.MIN_CASH_RESERVE_PCT:
            violations.append(
                f"LOW CASH: {cash_pct:.1%} (minimum {config.MIN_CASH_RESERVE_PCT:.0%})"
            )

    # 4. Position concentration
    for pos in portfolio.positions:
        if portfolio.equity > 0:
            pct = pos.amount / portfolio.equity
            if pct > config.MAX_SINGLE_INSTRUMENT_PCT:
                violations.append(
                    f"CONCENTRATION: {pos.instrument_name} is {pct:.1%} of equity "
                    f"(max {config.MAX_SINGLE_INSTRUMENT_PCT:.0%})"
                )

    # 5. Position count
    if len(portfolio.positions) > config.MAX_POSITIONS:
        violations.append(
            f"TOO MANY POSITIONS: {len(portfolio.positions)} (max {config.MAX_POSITIONS})"
        )

    # 6. Aggregate leverage
    if portfolio.equity > 0:
        total_leveraged = sum(p.amount * p.leverage for p in portfolio.positions)
        agg_lev = total_leveraged / portfolio.equity
        if agg_lev > config.MAX_LEVERAGE:
            violations.append(
                f"LEVERAGE: {agg_lev:.1f}x aggregate (max {config.MAX_LEVERAGE}x)"
            )

    ok = len(violations) == 0
    return RiskCheck(
        ok=ok,
        violations=violations,
        circuit_breaker_triggered=circuit_breaker,
        session_drawdown_triggered=session_drawdown,
    )
