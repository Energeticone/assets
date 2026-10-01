#!/usr/bin/env python3
"""AirDrop -> Huawei forwarder.

This is the *last mile* of the AirDrop bridge. An AirDrop catcher (OpenDrop,
running on a small Linux helper box with a compatible Wi-Fi adapter) receives a
file from an iPhone and drops it into a watch folder. This script notices the new
file and pushes it into the iOS-on-Huawei app, so it lands on the Huawei as a
message from "AirDrop" with the file attached.

It does NOT do the Apple radio protocol itself (that's OpenDrop's job, and it
needs special hardware — see README.md). This script is the reliable glue that
gets a received file onto the phone, and it is fully testable on its own.

Usage:
    python forwarder.py                 # watch forever
    python forwarder.py --once          # single pass (used by tests)

Config via environment (sensible defaults):
    AIRDROP_WATCH_DIR     folder OpenDrop saves received files into
    AIRDROP_SERVER_URL    iOS-on-Huawei base URL (default https://127.0.0.1:8770)
    AIRDROP_RECIPIENT     handle on the Huawei that should receive files
    AIRDROP_SENDER        display name shown as the sender (default "AirDrop")
    AIRDROP_POLL_SECONDS  how often to scan the folder (default 2)
    AIRDROP_VERIFY_TLS    "1" to verify TLS (default "0" for the self-signed cert)
"""
import argparse
import mimetypes
import os
import sys
import time

import requests

WATCH_DIR = os.getenv("AIRDROP_WATCH_DIR", os.path.join(os.path.dirname(__file__), "inbox"))
SERVER_URL = os.getenv("AIRDROP_SERVER_URL", "https://127.0.0.1:8770").rstrip("/")
RECIPIENT = os.getenv("AIRDROP_RECIPIENT", "me")
SENDER = os.getenv("AIRDROP_SENDER", "AirDrop")
POLL_SECONDS = float(os.getenv("AIRDROP_POLL_SECONDS", "2"))
VERIFY_TLS = os.getenv("AIRDROP_VERIFY_TLS", "0") in ("1", "true", "True")

# Subfolder where successfully forwarded files are moved, so they are not resent.
SENT_DIR = os.path.join(WATCH_DIR, ".forwarded")

if not VERIFY_TLS:
    # The app ships a self-signed cert by default; silence the noisy warning.
    requests.packages.urllib3.disable_warnings()  # type: ignore[attr-defined]


def _is_ready(path):
    """True if the file looks fully written (size stable across a short wait)."""
    try:
        s1 = os.path.getsize(path)
        time.sleep(0.4)
        return s1 == os.path.getsize(path) and s1 > 0
    except OSError:
        return False


def forward_file(path):
    """Upload one file to the app and post it as a message to the recipient."""
    name = os.path.basename(path)
    mime = mimetypes.guess_type(name)[0] or "application/octet-stream"
    with open(path, "rb") as fh:
        up = requests.post(
            f"{SERVER_URL}/api/upload",
            files={"file": (name, fh, mime)},
            verify=VERIFY_TLS, timeout=60,
        )
    up.raise_for_status()
    media_id = up.json()["media_id"]

    send = requests.post(
        f"{SERVER_URL}/api/send",
        json={"sender": SENDER, "participants": [RECIPIENT], "media_id": media_id,
              "body": f"AirDrop: {name}"},
        verify=VERIFY_TLS, timeout=30,
    )
    send.raise_for_status()
    return media_id


def scan_once():
    """Forward every ready file in the watch dir. Returns count forwarded."""
    os.makedirs(WATCH_DIR, exist_ok=True)
    os.makedirs(SENT_DIR, exist_ok=True)
    count = 0
    for name in sorted(os.listdir(WATCH_DIR)):
        path = os.path.join(WATCH_DIR, name)
        if not os.path.isfile(path) or name.startswith("."):
            continue
        if not _is_ready(path):
            continue
        try:
            forward_file(path)
            os.replace(path, os.path.join(SENT_DIR, name))
            print(f"[airdrop] forwarded {name} -> {RECIPIENT}", flush=True)
            count += 1
        except Exception as e:  # keep going; a bad file shouldn't stall the rest
            print(f"[airdrop] FAILED {name}: {e}", file=sys.stderr, flush=True)
    return count


def main():
    ap = argparse.ArgumentParser(description="AirDrop -> Huawei forwarder")
    ap.add_argument("--once", action="store_true", help="single pass then exit")
    args = ap.parse_args()

    print(f"[airdrop] watching {WATCH_DIR} -> {SERVER_URL} (recipient={RECIPIENT})",
          flush=True)
    if args.once:
        scan_once()
        return
    while True:
        scan_once()
        time.sleep(POLL_SECONDS)


if __name__ == "__main__":
    main()
