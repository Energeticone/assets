#!/usr/bin/env python3
"""
Hormuz Hawk — OSINT-driven geopolitical trading bot.

All trades require manual approval via the dashboard.
This bot scans, classifies, recommends — it does NOT auto-trade.
"""

import json
import logging
import sys
import time
from dataclasses import asdict
from datetime import datetime, timezone

from osint.scanner import SignalState, run_cycle
from osint.classifier import generate_recommendations
from trading.etoro_client import EToroClient
from trading.risk import init_risk, check_risk
from trading.log_store import save_cycle
import config

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)
logger = logging.getLogger("hormuz-hawk")

# State
_cycle_number = 0
_previous_signal: SignalState | None = None
_halted = False


def run_one_cycle():
    global _cycle_number, _previous_signal, _halted

    if _halted:
        logger.warning("Trading HALTED by circuit breaker. Scanning only.")

    _cycle_number += 1
    skip_second = (_cycle_number % 4 != 0)

    # 1. OSINT scan
    cycle = run_cycle(_cycle_number, skip_second_order=skip_second)

    # 2. Classify & recommend
    rec = generate_recommendations(cycle, _previous_signal)
    state_label = "STATE CHANGE" if rec.state_changed else "no change"
    logger.info("Signal: %s (%s) | Confidence: %.0f%% | Corroborating: %d",
                cycle.signal.value, state_label, cycle.confidence_score,
                cycle.corroborating_sources)

    # 3. Portfolio & risk (only if API is configured)
    risk_data = {}
    client = EToroClient()
    if config.ETORO_API_KEY:
        try:
            portfolio = client.get_portfolio()
            init_risk(portfolio)
            risk_result = check_risk(portfolio)
            risk_data = {
                "ok": risk_result.ok,
                "violations": risk_result.violations,
                "circuit_breaker": risk_result.circuit_breaker_triggered,
                "session_drawdown": risk_result.session_drawdown_triggered,
                "equity": portfolio.equity,
                "cash": portfolio.cash,
                "positions": len(portfolio.positions),
            }
            if risk_result.circuit_breaker_triggered:
                _halted = True
                logger.critical("CIRCUIT BREAKER TRIGGERED — all trading halted")
        except Exception as e:
            logger.error("Portfolio check failed: %s", e)

    # 4. Log recommendations
    rec_data = []
    for r in rec.recommendations:
        entry = {
            "instrument": r.instrument_name,
            "action": r.action.value,
            "tier": r.tier,
            "reasoning": r.reasoning,
            "leverage": r.suggested_leverage,
            "stop_pct": r.stop_loss_pct,
        }
        rec_data.append(entry)
        logger.info("  → [%s] %s %s: %s", r.tier, r.action.value, r.instrument_name, r.reasoning)

    if rec.alert_owner:
        logger.critical("OWNER ALERT: %s", rec.alert_message)

    # 5. Persist
    saved = save_cycle(cycle, recommendations=rec_data, risk=risk_data)

    _previous_signal = cycle.signal
    return saved


def main():
    """Run continuous scan loop."""
    interval = config.SCAN_INTERVAL_MINUTES * 60
    logger.info("Hormuz Hawk starting — scan interval: %d min", config.SCAN_INTERVAL_MINUTES)
    logger.info("Dashboard: http://%s:%d", config.DASHBOARD_HOST, config.DASHBOARD_PORT)
    logger.info("All trades require manual approval via the dashboard.")
    logger.info("-" * 60)

    while True:
        try:
            run_one_cycle()
        except KeyboardInterrupt:
            logger.info("Shutting down.")
            break
        except Exception as e:
            logger.error("Cycle failed: %s", e, exc_info=True)

        logger.info("Sleeping %d minutes until next cycle...", config.SCAN_INTERVAL_MINUTES)
        try:
            time.sleep(interval)
        except KeyboardInterrupt:
            logger.info("Shutting down.")
            break


if __name__ == "__main__":
    main()
