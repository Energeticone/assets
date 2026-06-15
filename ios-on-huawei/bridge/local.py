"""Local app-to-app bridge.

This is the default. It needs no Apple hardware: any two handles registered on
this server can message each other. Outbound delivery is just realtime fan-out
to the recipients (persistence is handled by the server before send() is called),
so here we only need to notify the *other* participants in real time.
"""
from .base import MessageBridge


class LocalBridge(MessageBridge):
    service = "app"

    def send(self, thread_id, sender, participants, body=None, media=None):
        # The server has already stored the message and emitted it to the
        # thread room over Socket.IO. For the local bridge there is no external
        # network to hand off to, so delivery is complete. We still trigger
        # per-recipient notifications via emit_incoming for anyone offline.
        for handle in participants:
            if handle == sender:
                continue
            self.emit_incoming({
                "thread_id": thread_id,
                "sender": sender,
                "recipient": handle,
                "body": body,
                "media": media,
                "service": self.service,
                "_already_stored": True,   # server stored it; just notify
            })
