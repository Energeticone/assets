#!/usr/bin/env python3
"""iOS-on-Huawei server.

Plain Flask + Server-Sent Events for realtime (no external JS client, no
websocket/eventlet dependency). Auto-provisions a self-signed TLS cert and
VAPID push keys on first run so the PWA installs and notifies out of the box.

Run:  python server.py   ->   https://<your-ip>:8770
"""
import json
import logging
import os
import queue
import sys
import threading

from flask import Flask, request, jsonify, send_from_directory, abort, Response
from flask_cors import CORS

import config
import store
import security
from bridge import get_bridge

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)
log = logging.getLogger("ios-huawei")

WEBAPP_DIR = os.path.join(os.path.dirname(__file__), "webapp")

app = Flask(__name__, static_folder=None)
app.config["SECRET_KEY"] = config.SECRET_KEY
app.config["MAX_CONTENT_LENGTH"] = config.MAX_UPLOAD_MB * 1024 * 1024
CORS(app)

# Web push (keys provisioned in main()).
try:
    from pywebpush import webpush, WebPushException
    _PUSH = True
except ImportError:
    webpush = None
    _PUSH = False
_VAPID_PUBLIC = ""
_VAPID_PRIVATE = ""


# --------------------------------------------------------------------------
# Realtime broker: per-handle fan-out over Server-Sent Events.
# --------------------------------------------------------------------------
_subs_lock = threading.Lock()
_subs = {}  # handle -> set[queue.Queue]


def _subscribe(handle):
    q = queue.Queue()
    with _subs_lock:
        _subs.setdefault(handle, set()).add(q)
    return q


def _unsubscribe(handle, q):
    with _subs_lock:
        s = _subs.get(handle)
        if s:
            s.discard(q)
            if not s:
                _subs.pop(handle, None)


def _publish(handle, event, data):
    with _subs_lock:
        targets = list(_subs.get(handle, ()))
    for q in targets:
        q.put((event, data))


# --------------------------------------------------------------------------
# Inbound callback used by bridges to inject messages into the system.
# --------------------------------------------------------------------------
def _emit_incoming(msg):
    """Persist (unless already stored) + realtime fan-out + push."""
    participants = msg.get("participants") or []
    sender = msg["sender"]
    if not msg.get("_already_stored"):
        all_parts = sorted(set(participants + [sender]))
        tid = store.get_or_create_thread(all_parts)
        stored = store.add_message(
            tid, sender, body=msg.get("body"),
            media_id=(msg.get("media") or {}).get("id"),
            service=msg.get("service", "app"),
        )
        store.upsert_user(sender)
        for p in all_parts:
            _publish(p, "message", stored)
        recipients = [p for p in all_parts if p != sender]
    else:
        tid = msg["thread_id"]
        recipients = [msg["recipient"]]

    for handle in recipients:
        _notify(handle, sender, msg.get("body") or "📷 Attachment", tid)


bridge = get_bridge(_emit_incoming)


def _notify(handle, sender, preview, thread_id):
    """Best-effort background notification via Web Push."""
    if not (_PUSH and _VAPID_PRIVATE):
        return
    payload = json.dumps({"title": sender, "body": preview, "thread_id": thread_id})
    for sub in store.get_push_subs(handle):
        try:
            webpush(
                subscription_info=sub,
                data=payload,
                vapid_private_key=_VAPID_PRIVATE,
                vapid_claims={"sub": config.VAPID_CONTACT},
            )
        except WebPushException as e:
            log.warning("push failed for %s: %s", handle, e)


# --------------------------------------------------------------------------
# Static PWA
# --------------------------------------------------------------------------
@app.route("/")
def index():
    return send_from_directory(WEBAPP_DIR, "index.html")


@app.route("/<path:path>")
def static_files(path):
    if path.startswith("api/") or not os.path.isfile(os.path.join(WEBAPP_DIR, path)):
        abort(404)
    return send_from_directory(WEBAPP_DIR, path)


# --------------------------------------------------------------------------
# REST API
# --------------------------------------------------------------------------
@app.route("/api/config")
def api_config():
    return jsonify({"vapidPublicKey": _VAPID_PUBLIC, "bridge": config.BRIDGE})


@app.route("/api/register", methods=["POST"])
def api_register():
    data = request.get_json(force=True)
    handle = (data.get("handle") or "").strip()
    if not handle:
        return jsonify({"error": "handle required"}), 400
    store.upsert_user(handle, data.get("display"))
    return jsonify({"ok": True, "handle": handle})


@app.route("/api/threads")
def api_threads():
    return jsonify(store.list_threads(request.args.get("handle", "")))


@app.route("/api/thread", methods=["POST"])
def api_create_thread():
    data = request.get_json(force=True)
    parts = data.get("participants") or []
    if not parts:
        return jsonify({"error": "participants required"}), 400
    return jsonify({"id": store.get_or_create_thread(parts, data.get("title"))})


@app.route("/api/messages")
def api_messages():
    return jsonify(store.list_messages(request.args.get("thread_id", "")))


@app.route("/api/send", methods=["POST"])
def api_send():
    data = request.get_json(force=True)
    sender = data.get("sender")
    participants = sorted(set((data.get("participants") or []) + ([sender] if sender else [])))
    body = data.get("body")
    media_id = data.get("media_id")
    if not sender or (not body and not media_id):
        return jsonify({"error": "sender and body/media required"}), 400

    tid = store.get_or_create_thread(participants)
    stored = store.add_message(tid, sender, body=body, media_id=media_id, service=bridge.service)
    for p in participants:
        _publish(p, "message", stored)

    media = store.get_media(media_id) if media_id else None
    try:
        bridge.send(tid, sender, participants, body=body, media=media)
    except Exception as e:
        log.error("bridge send failed: %s", e)
        return jsonify({"error": f"delivery failed: {e}", "message": stored}), 502
    return jsonify(stored)


@app.route("/api/typing", methods=["POST"])
def api_typing():
    data = request.get_json(force=True)
    sender = data.get("sender")
    for p in data.get("participants", []):
        if p != sender:
            _publish(p, "typing", {"thread_id": data.get("thread_id"), "sender": sender})
    return jsonify({"ok": True})


@app.route("/api/stream")
def api_stream():
    handle = request.args.get("handle", "")
    if not handle:
        abort(400)
    q = _subscribe(handle)

    def gen():
        try:
            yield "retry: 3000\n\n"
            while True:
                try:
                    event, data = q.get(timeout=15)
                    yield f"event: {event}\ndata: {json.dumps(data)}\n\n"
                except queue.Empty:
                    yield ": keepalive\n\n"
        except GeneratorExit:
            pass
        finally:
            _unsubscribe(handle, q)

    return Response(gen(), mimetype="text/event-stream",
                    headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no",
                             "Connection": "keep-alive"})


@app.route("/api/upload", methods=["POST"])
def api_upload():
    if "file" not in request.files:
        return jsonify({"error": "no file"}), 400
    f = request.files["file"]
    os.makedirs(config.MEDIA_DIR, exist_ok=True)
    safe = os.path.basename(f.filename or "file")
    mid = store.add_media(safe, f.mimetype, "")
    path = os.path.join(config.MEDIA_DIR, f"{mid}_{safe}")
    f.save(path)
    with store._conn() as con:
        con.execute("UPDATE media SET path=? WHERE id=?", (path, mid))
    return jsonify({"media_id": mid, "filename": safe, "mime": f.mimetype})


@app.route("/api/media/<media_id>")
def api_media(media_id):
    m = store.get_media(media_id)
    if not m or not m["path"] or not os.path.isfile(m["path"]):
        abort(404)
    d, fn = os.path.split(m["path"])
    return send_from_directory(d, fn, mimetype=m["mime"])


@app.route("/api/push/subscribe", methods=["POST"])
def api_push_subscribe():
    data = request.get_json(force=True)
    handle = data.get("handle")
    sub = data.get("subscription")
    if not handle or not sub:
        return jsonify({"error": "handle and subscription required"}), 400
    store.save_push_sub(handle, sub)
    return jsonify({"ok": True, "push_enabled": bool(_PUSH and _VAPID_PRIVATE)})


def main():
    global _VAPID_PUBLIC, _VAPID_PRIVATE
    store.init()
    os.makedirs(config.MEDIA_DIR, exist_ok=True)

    _VAPID_PUBLIC, _VAPID_PRIVATE = security.ensure_vapid()

    ssl_context = None
    scheme = "http"
    if config.USE_TLS:
        try:
            cert, key = security.ensure_cert()
            ssl_context = (cert, key)
            scheme = "https"
        except Exception as e:
            log.warning("TLS setup failed (%s); falling back to HTTP", e)

    if bridge.__class__.__name__ != "LocalBridge":
        bridge.start()

    log.info("iOS-on-Huawei on %s://%s:%s  (bridge=%s, push=%s, tls=%s)",
             scheme, config.HOST, config.PORT, config.BRIDGE,
             bool(_VAPID_PRIVATE), ssl_context is not None)
    app.run(host=config.HOST, port=config.PORT, threaded=True,
            ssl_context=ssl_context, debug=False)


if __name__ == "__main__":
    main()
