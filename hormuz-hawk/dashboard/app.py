#!/usr/bin/env python3
"""Flask dashboard for Hormuz Hawk — monitor OSINT signals & approve trades."""

import json
import uuid
from datetime import datetime, timezone
from pathlib import Path

from flask import Flask, render_template, jsonify, request, redirect, url_for

import config
from trading.log_store import load_latest, load_day_cycles, LOG_DIR
from trading.etoro_client import EToroClient

app = Flask(__name__, template_folder="templates", static_folder="static")
app.secret_key = config.DASHBOARD_SECRET_KEY

# Pending trade queue (in-memory; persists via JSON file)
PENDING_FILE = LOG_DIR / "pending_trades.json"
EXECUTED_FILE = LOG_DIR / "executed_trades.json"


def _load_json(path: Path) -> list:
    if path.exists():
        with open(path) as f:
            return json.load(f)
    return []


def _save_json(path: Path, data: list):
    path.parent.mkdir(exist_ok=True)
    with open(path, "w") as f:
        json.dump(data, f, indent=2)


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.route("/")
def index():
    latest = load_latest()
    cycles = load_day_cycles()
    pending = _load_json(PENDING_FILE)
    executed = _load_json(EXECUTED_FILE)[-20:]  # last 20
    return render_template(
        "index.html",
        latest=latest,
        cycles=cycles[-50:],
        pending=pending,
        executed=executed,
        now=datetime.now(timezone.utc).isoformat(),
    )


@app.route("/api/latest")
def api_latest():
    return jsonify(load_latest() or {})


@app.route("/api/cycles")
def api_cycles():
    date = request.args.get("date")
    return jsonify(load_day_cycles(date))


@app.route("/api/pending")
def api_pending():
    return jsonify(_load_json(PENDING_FILE))


@app.route("/api/submit-trade", methods=["POST"])
def submit_trade():
    """Add a trade to the pending approval queue."""
    data = request.json
    pending = _load_json(PENDING_FILE)
    trade = {
        "id": str(uuid.uuid4())[:8],
        "submitted_at": datetime.now(timezone.utc).isoformat(),
        "instrument": data.get("instrument", ""),
        "search_term": data.get("search_term", ""),
        "action": data.get("action", "BUY"),
        "amount": data.get("amount", 0),
        "leverage": data.get("leverage", 1),
        "stop_loss_pct": data.get("stop_loss_pct", 0.12),
        "reasoning": data.get("reasoning", ""),
        "status": "pending",
    }
    pending.append(trade)
    _save_json(PENDING_FILE, pending)
    return jsonify({"ok": True, "trade": trade})


@app.route("/api/approve/<trade_id>", methods=["POST"])
def approve_trade(trade_id):
    """Approve and execute a pending trade."""
    pending = _load_json(PENDING_FILE)
    trade = next((t for t in pending if t["id"] == trade_id), None)
    if not trade:
        return jsonify({"error": "Trade not found"}), 404

    # Execute via eToro API
    client = EToroClient()
    result = {"status": "skipped", "reason": "No API key configured"}

    if config.ETORO_API_KEY:
        instruments = client.search_instrument(trade["search_term"])
        if instruments:
            inst = instruments[0]
            inst_id = inst.get("InstrumentID", inst.get("instrumentId"))
            current_price = inst.get("Rate", inst.get("rate", 0))
            sl_rate = None
            if current_price and trade["stop_loss_pct"]:
                sl_rate = current_price * (1 - trade["stop_loss_pct"])

            api_result = client.open_position(
                instrument_id=inst_id,
                is_buy=(trade["action"] == "BUY"),
                amount=trade["amount"],
                leverage=trade["leverage"],
                stop_loss_rate=sl_rate,
            )
            result = {"status": "executed", "api_response": str(api_result)}
        else:
            result = {"status": "failed", "reason": f"Instrument not found: {trade['search_term']}"}

    # Move to executed
    trade["status"] = result["status"]
    trade["executed_at"] = datetime.now(timezone.utc).isoformat()
    trade["result"] = result

    executed = _load_json(EXECUTED_FILE)
    executed.append(trade)
    _save_json(EXECUTED_FILE, executed)

    # Remove from pending
    pending = [t for t in pending if t["id"] != trade_id]
    _save_json(PENDING_FILE, pending)

    return jsonify({"ok": True, "trade": trade})


@app.route("/api/reject/<trade_id>", methods=["POST"])
def reject_trade(trade_id):
    """Reject a pending trade."""
    pending = _load_json(PENDING_FILE)
    trade = next((t for t in pending if t["id"] == trade_id), None)
    if not trade:
        return jsonify({"error": "Trade not found"}), 404

    trade["status"] = "rejected"
    trade["rejected_at"] = datetime.now(timezone.utc).isoformat()

    executed = _load_json(EXECUTED_FILE)
    executed.append(trade)
    _save_json(EXECUTED_FILE, executed)

    pending = [t for t in pending if t["id"] != trade_id]
    _save_json(PENDING_FILE, pending)

    return jsonify({"ok": True})


@app.route("/api/portfolio")
def api_portfolio():
    """Fetch live portfolio from eToro."""
    if not config.ETORO_API_KEY:
        return jsonify({"error": "No API key configured"})
    client = EToroClient()
    portfolio = client.get_portfolio()
    return jsonify({
        "equity": portfolio.equity,
        "cash": portfolio.cash,
        "invested": portfolio.invested,
        "positions": [
            {
                "id": p.position_id,
                "instrument": p.instrument_name,
                "is_buy": p.is_buy,
                "amount": p.amount,
                "leverage": p.leverage,
                "open_rate": p.open_rate,
                "current_rate": p.current_rate,
                "stop_loss": p.stop_loss_rate,
                "take_profit": p.take_profit_rate,
                "pnl": p.net_profit,
            }
            for p in portfolio.positions
        ],
    })


def main():
    app.run(
        host=config.DASHBOARD_HOST,
        port=config.DASHBOARD_PORT,
        debug=True,
    )


if __name__ == "__main__":
    main()
