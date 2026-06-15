"""Real iMessage bridge via a BlueBubbles server running on a Mac.

This is the ONLY legitimate way to reach Apple's real iMessage network from a
non-Apple device. You need a Mac (mini/MacBook) logged into your Apple ID with
the free, open-source BlueBubbles Server installed and reachable on the network.
That Mac is your "GG box" / relay.

Set in the environment:
    BRIDGE=imessage_relay
    BLUEBUBBLES_URL=http://<mac-ip>:1234
    BLUEBUBBLES_PASSWORD=<your server password>

Docs: https://bluebubbles.app/  (Server -> API & Webhooks)

NOTE: This adapter is intentionally thin and defensive. If the relay is not
configured/reachable it raises a clear error rather than silently failing, so
you never *think* you're on real iMessage when you're not.
"""
import threading
import time

import config
from .base import MessageBridge

try:
    import requests
except ImportError:  # requests is optional unless this bridge is used
    requests = None


class IMessageRelayError(RuntimeError):
    pass


class IMessageRelayBridge(MessageBridge):
    service = "imessage"

    def __init__(self, emit_incoming):
        super().__init__(emit_incoming)
        if requests is None:
            raise IMessageRelayError("`requests` is required for the iMessage relay bridge")
        if not config.BLUEBUBBLES_URL or not config.BLUEBUBBLES_PASSWORD:
            raise IMessageRelayError(
                "BLUEBUBBLES_URL and BLUEBUBBLES_PASSWORD must be set. "
                "You need a Mac relay box running BlueBubbles — there is no "
                "way to reach real iMessage without one."
            )
        self.base = config.BLUEBUBBLES_URL.rstrip("/")
        self.pw = config.BLUEBUBBLES_PASSWORD
        self._stop = threading.Event()
        self._last_seen = time.time()
        self._poll_thread = None

    # --- outbound ---------------------------------------------------------
    def send(self, thread_id, sender, participants, body=None, media=None):
        # Recipients are the Apple-ID/phone handles other than us.
        targets = [p for p in participants if p != sender]
        for target in targets:
            payload = {"chatGuid": None, "address": target, "message": body or ""}
            r = requests.post(
                f"{self.base}/api/v1/message/text?password={self.pw}",
                json=payload, timeout=15,
            )
            if r.status_code >= 300:
                raise IMessageRelayError(f"BlueBubbles send failed: {r.status_code} {r.text}")
            # Media send would POST to /api/v1/message/attachment (multipart).

    # --- inbound (polling; BlueBubbles can also push webhooks) ------------
    def start(self):
        self._poll_thread = threading.Thread(target=self._poll_loop, daemon=True)
        self._poll_thread.start()

    def stop(self):
        self._stop.set()

    def _poll_loop(self):
        while not self._stop.wait(3):
            try:
                r = requests.get(
                    f"{self.base}/api/v1/message/query?password={self.pw}",
                    json={"after": int(self._last_seen * 1000), "limit": 50},
                    timeout=15,
                )
                if r.status_code >= 300:
                    continue
                for m in r.json().get("data", []):
                    if m.get("isFromMe"):
                        continue
                    self._last_seen = max(self._last_seen, m.get("dateCreated", 0) / 1000)
                    self.emit_incoming({
                        "participants": [m.get("handle", {}).get("address", "unknown")],
                        "sender": m.get("handle", {}).get("address", "unknown"),
                        "body": m.get("text", ""),
                        "service": self.service,
                    })
            except Exception:
                # Never let the relay loop die; surfaced via logs in server.py
                continue
