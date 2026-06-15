"""SQLite persistence: users, threads, messages, media, push subscriptions.

A "thread" is identified deterministically by the sorted set of participant
handles joined by '|', so two users always resolve to the same conversation.
"""
import json
import sqlite3
import time
import uuid
from contextlib import contextmanager

import config

_SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    handle      TEXT PRIMARY KEY,
    display     TEXT,
    created_at  REAL
);
CREATE TABLE IF NOT EXISTS threads (
    id           TEXT PRIMARY KEY,
    participants TEXT NOT NULL,          -- JSON array of handles
    title        TEXT,
    updated_at   REAL
);
CREATE TABLE IF NOT EXISTS messages (
    id          TEXT PRIMARY KEY,
    thread_id   TEXT NOT NULL,
    sender      TEXT NOT NULL,
    body        TEXT,
    media_id    TEXT,                    -- nullable
    service     TEXT DEFAULT 'app',      -- 'app' | 'imessage' | 'sms'
    created_at  REAL,
    FOREIGN KEY (thread_id) REFERENCES threads(id)
);
CREATE TABLE IF NOT EXISTS media (
    id          TEXT PRIMARY KEY,
    filename    TEXT,
    mime        TEXT,
    path        TEXT,
    created_at  REAL
);
CREATE TABLE IF NOT EXISTS push_subs (
    handle      TEXT,
    subscription TEXT,                   -- JSON
    PRIMARY KEY (handle, subscription)
);
CREATE INDEX IF NOT EXISTS idx_msg_thread ON messages(thread_id, created_at);
"""


@contextmanager
def _conn():
    con = sqlite3.connect(config.DB_PATH)
    con.row_factory = sqlite3.Row
    try:
        yield con
        con.commit()
    finally:
        con.close()


def init():
    with _conn() as con:
        con.executescript(_SCHEMA)


def _now():
    return time.time()


def _new_id():
    return uuid.uuid4().hex


# --- users -----------------------------------------------------------------
def upsert_user(handle, display=None):
    with _conn() as con:
        con.execute(
            "INSERT INTO users(handle, display, created_at) VALUES(?,?,?) "
            "ON CONFLICT(handle) DO UPDATE SET display=COALESCE(excluded.display, users.display)",
            (handle, display or handle, _now()),
        )


# --- threads ---------------------------------------------------------------
def thread_id_for(participants):
    """Deterministic id for a set of participant handles."""
    key = "|".join(sorted(set(participants)))
    return uuid.uuid5(uuid.NAMESPACE_URL, key).hex


def get_or_create_thread(participants, title=None):
    tid = thread_id_for(participants)
    with _conn() as con:
        row = con.execute("SELECT id FROM threads WHERE id=?", (tid,)).fetchone()
        if not row:
            con.execute(
                "INSERT INTO threads(id, participants, title, updated_at) VALUES(?,?,?,?)",
                (tid, json.dumps(sorted(set(participants))), title, _now()),
            )
    return tid


def list_threads(handle):
    with _conn() as con:
        rows = con.execute(
            "SELECT * FROM threads WHERE participants LIKE ? ORDER BY updated_at DESC",
            (f'%"{handle}"%',),
        ).fetchall()
        out = []
        for r in rows:
            last = con.execute(
                "SELECT body, sender, created_at, media_id FROM messages "
                "WHERE thread_id=? ORDER BY created_at DESC LIMIT 1",
                (r["id"],),
            ).fetchone()
            out.append({
                "id": r["id"],
                "participants": json.loads(r["participants"]),
                "title": r["title"],
                "updated_at": r["updated_at"],
                "last": dict(last) if last else None,
            })
        return out


# --- messages --------------------------------------------------------------
def add_message(thread_id, sender, body=None, media_id=None, service="app"):
    mid = _new_id()
    ts = _now()
    with _conn() as con:
        con.execute(
            "INSERT INTO messages(id, thread_id, sender, body, media_id, service, created_at) "
            "VALUES(?,?,?,?,?,?,?)",
            (mid, thread_id, sender, body, media_id, service, ts),
        )
        con.execute("UPDATE threads SET updated_at=? WHERE id=?", (ts, thread_id))
    return {
        "id": mid, "thread_id": thread_id, "sender": sender, "body": body,
        "media_id": media_id, "service": service, "created_at": ts,
    }


def list_messages(thread_id, limit=200):
    with _conn() as con:
        rows = con.execute(
            "SELECT * FROM messages WHERE thread_id=? ORDER BY created_at ASC LIMIT ?",
            (thread_id, limit),
        ).fetchall()
        return [dict(r) for r in rows]


# --- media -----------------------------------------------------------------
def add_media(filename, mime, path):
    mid = _new_id()
    with _conn() as con:
        con.execute(
            "INSERT INTO media(id, filename, mime, path, created_at) VALUES(?,?,?,?,?)",
            (mid, filename, mime, path, _now()),
        )
    return mid


def get_media(media_id):
    with _conn() as con:
        row = con.execute("SELECT * FROM media WHERE id=?", (media_id,)).fetchone()
        return dict(row) if row else None


# --- push ------------------------------------------------------------------
def save_push_sub(handle, subscription):
    with _conn() as con:
        con.execute(
            "INSERT OR IGNORE INTO push_subs(handle, subscription) VALUES(?,?)",
            (handle, json.dumps(subscription)),
        )


def get_push_subs(handle):
    with _conn() as con:
        rows = con.execute("SELECT subscription FROM push_subs WHERE handle=?", (handle,)).fetchall()
        return [json.loads(r["subscription"]) for r in rows]
