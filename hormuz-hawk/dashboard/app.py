#!/usr/bin/env python3
"""Flask dashboard for Hormuz Hawk — monitor OSINT signals & approve trades."""

import base64
import json
import re
import uuid
from datetime import datetime, timezone
from pathlib import Path

from flask import Flask, render_template, jsonify, request, redirect, url_for
from werkzeug.utils import secure_filename

import config
from trading.log_store import load_latest, load_day_cycles, LOG_DIR
from trading.etoro_client import EToroClient

app = Flask(__name__, template_folder="templates", static_folder="static")
app.secret_key = config.DASHBOARD_SECRET_KEY

# Pending trade queue (in-memory; persists via JSON file)
PENDING_FILE = LOG_DIR / "pending_trades.json"
EXECUTED_FILE = LOG_DIR / "executed_trades.json"

# Pasted-file uploads
UPLOAD_DIR = LOG_DIR / "uploads"
MAX_PASTE_BYTES = 25 * 1024 * 1024  # 25 MB after decode
IMAGE_MIME_EXT = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/gif": "gif",
    "image/webp": "webp",
    "image/svg+xml": "svg",
}


def _safe_paste_filename(raw: str | None, fallback_ext: str) -> str:
    """Return a filesystem-safe filename, falling back to a timestamped default."""
    ts = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    if not raw:
        return f"paste_{ts}.{fallback_ext}"
    # secure_filename strips path components and unsafe chars
    cleaned = secure_filename(raw)
    if not cleaned:
        return f"paste_{ts}.{fallback_ext}"
    # If no extension supplied, add the fallback one
    if "." not in cleaned:
        cleaned = f"{cleaned}.{fallback_ext}"
    return cleaned


def _next_available(path: Path) -> Path:
    """If path exists, append -2, -3, ... before the extension."""
    if not path.exists():
        return path
    stem, suffix = path.stem, path.suffix
    n = 2
    while True:
        candidate = path.with_name(f"{stem}-{n}{suffix}")
        if not candidate.exists():
            return candidate
        n += 1


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


@app.route("/api/paste-file", methods=["POST"])
def paste_file():
    """Save pasted content (text or image) to logs/uploads/ and return the path."""
    data = request.get_json(silent=True) or {}
    kind = data.get("kind")
    content = data.get("content", "")
    filename_hint = data.get("filename", "")
    mime = (data.get("mime") or "").lower()

    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

    if kind == "text":
        if not isinstance(content, str):
            return jsonify({"error": "Text content must be a string"}), 400
        payload = content.encode("utf-8")
        if len(payload) > MAX_PASTE_BYTES:
            return jsonify({"error": f"Pasted text exceeds {MAX_PASTE_BYTES} bytes"}), 413
        # Pick extension from hint or mime, default to txt
        ext = "txt"
        if mime == "text/csv":
            ext = "csv"
        elif mime in {"application/json", "text/json"}:
            ext = "json"
        elif mime == "text/markdown":
            ext = "md"
        target = _next_available(UPLOAD_DIR / _safe_paste_filename(filename_hint, ext))
        target.write_bytes(payload)

    elif kind == "image":
        if not isinstance(content, str):
            return jsonify({"error": "Image content must be a base64 string"}), 400
        # Accept either a raw base64 payload or a data URL
        b64 = content
        m = re.match(r"^data:([^;]+);base64,(.*)$", content, re.DOTALL)
        if m:
            mime = mime or m.group(1).lower()
            b64 = m.group(2)
        try:
            payload = base64.b64decode(b64, validate=False)
        except (ValueError, base64.binascii.Error):
            return jsonify({"error": "Invalid base64 image content"}), 400
        if len(payload) > MAX_PASTE_BYTES:
            return jsonify({"error": f"Pasted image exceeds {MAX_PASTE_BYTES} bytes"}), 413
        ext = IMAGE_MIME_EXT.get(mime, "png")
        target = _next_available(UPLOAD_DIR / _safe_paste_filename(filename_hint, ext))
        target.write_bytes(payload)

    else:
        return jsonify({"error": "kind must be 'text' or 'image'"}), 400

    return jsonify({
        "ok": True,
        "filename": target.name,
        "path": str(target.relative_to(LOG_DIR.parent)),
        "size": target.stat().st_size,
        "kind": kind,
        "saved_at": datetime.now(timezone.utc).isoformat(),
    })


@app.route("/api/uploads")
def list_uploads():
    """List previously pasted files (most recent first)."""
    if not UPLOAD_DIR.exists():
        return jsonify([])
    entries = []
    for p in UPLOAD_DIR.iterdir():
        if p.is_file():
            stat = p.stat()
            entries.append({
                "filename": p.name,
                "size": stat.st_size,
                "modified": datetime.fromtimestamp(stat.st_mtime, timezone.utc).isoformat(),
            })
    entries.sort(key=lambda e: e["modified"], reverse=True)
    return jsonify(entries)


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
