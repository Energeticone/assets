#!/usr/bin/env python3
"""iOS-on-Huawei server: Flask + Socket.IO, REST API, static PWA hosting.

Run:  python server.py
Serves the PWA at / and the API under /api, realtime over Socket.IO.
"""
import json
import logging
import os
import sys

from flask import Flask, request, jsonify, send_from_directory, abort
from flask_cors import CORS
from flask_socketio import SocketIO, join_room, emit

import config
import store
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
socketio = SocketIO(app, cors_allowed_origins="*", async_mode="threading")

# Optional web push
try:
    from pywebpush import webpush, WebPushException
    _PUSH_OK = bool(config.VAPID_PRIVATE_KEY)
except ImportError:
    webpush = None
    _PUSH_OK = False


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
        socketio.emit("message", stored, room=tid)
        recipients = [p for p in all_parts if p != sender]
    else:
        tid = msg["thread_id"]
        recipients = [msg["recipient"]]

    for handle in recipients:
        _notify(handle, sender, msg.get("body") or "📷 Attachment", tid)


bridge = get_bridge(_emit_incoming)


def _notify(handle, sender, preview, thread_id):
    """Best-effort background notification via Web Push."""
    if not (_PUSH_OK and webpush):
        return
    payload = json.dumps({"title": sender, "body": preview, "thread_id": thread_id})
    for sub in store.get_push_subs(handle):
        try:
            webpush(
                subscription_info=sub,
                data=payload,
                vapid_private_key=config.VAPID_PRIVATE_KEY,
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
    full = os.path.join(WEBAPP_DIR, path)
    if not os.path.isfile(full):
        abort(404)
    return send_from_directory(WEBAPP_DIR, path)


# --------------------------------------------------------------------------
# REST API
# --------------------------------------------------------------------------
@app.route("/api/config")
def api_config():
    return jsonify({"vapidPublicKey": config.VAPID_PUBLIC_KEY, "bridge": config.BRIDGE})


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
    handle = request.args.get("handle", "")
    return jsonify(store.list_threads(handle))


@app.route("/api/thread", methods=["POST"])
def api_create_thread():
    data = request.get_json(force=True)
    parts = data.get("participants") or []
    if not parts:
        return jsonify({"error": "participants required"}), 400
    tid = store.get_or_create_thread(parts, data.get("title"))
    return jsonify({"id": tid})


@app.route("/api/messages")
def api_messages():
    tid = request.args.get("thread_id", "")
    return jsonify(store.list_messages(tid))


@app.route("/api/send", methods=["POST"])
def api_send():
    data = request.get_json(force=True)
    sender = data.get("sender")
    participants = sorted(set((data.get("participants") or []) + [sender]))
    body = data.get("body")
    media_id = data.get("media_id")
    if not sender or (not body and not media_id):
        return jsonify({"error": "sender and body/media required"}), 400

    tid = store.get_or_create_thread(participants)
    stored = store.add_message(tid, sender, body=body, media_id=media_id,
                               service=bridge.service)
    socketio.emit("message", stored, room=tid)

    media = store.get_media(media_id) if media_id else None
    try:
        bridge.send(tid, sender, participants, body=body, media=media)
    except Exception as e:
        log.error("bridge send failed: %s", e)
        return jsonify({"error": f"delivery failed: {e}", "message": stored}), 502
    return jsonify(stored)


@app.route("/api/upload", methods=["POST"])
def api_upload():
    if "file" not in request.files:
        return jsonify({"error": "no file"}), 400
    f = request.files["file"]
    os.makedirs(config.MEDIA_DIR, exist_ok=True)
    safe = os.path.basename(f.filename or "file")
    mid = store.add_media(safe, f.mimetype, "")  # path filled below
    path = os.path.join(config.MEDIA_DIR, f"{mid}_{safe}")
    f.save(path)
    # update path
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
    return jsonify({"ok": True, "push_enabled": _PUSH_OK})


# --------------------------------------------------------------------------
# Socket.IO
# --------------------------------------------------------------------------
@socketio.on("join")
def on_join(data):
    tid = data.get("thread_id")
    if tid:
        join_room(tid)


@socketio.on("typing")
def on_typing(data):
    tid = data.get("thread_id")
    if tid:
        emit("typing", data, room=tid, include_self=False)


def main():
    store.init()
    os.makedirs(config.MEDIA_DIR, exist_ok=True)
    if bridge.__class__.__name__ != "LocalBridge":
        bridge.start()
    log.info("iOS-on-Huawei on http://%s:%s  (bridge=%s, push=%s)",
             config.HOST, config.PORT, config.BRIDGE, _PUSH_OK)
    socketio.run(app, host=config.HOST, port=config.PORT, allow_unsafe_werkzeug=True)


if __name__ == "__main__":
    main()
