"""Bridge interface. A bridge is responsible for *outbound* delivery and for
feeding *inbound* messages back via the emit_incoming callback."""
from abc import ABC, abstractmethod


class MessageBridge(ABC):
    #: human-readable service label stored on messages ('app', 'imessage', ...)
    service = "app"

    def __init__(self, emit_incoming):
        self.emit_incoming = emit_incoming

    @abstractmethod
    def send(self, thread_id, sender, participants, body=None, media=None):
        """Deliver an outbound message. `media` is an optional dict
        {id, filename, mime, path}. Return nothing; raise on failure."""

    def start(self):
        """Optional: start any background polling/listeners."""

    def stop(self):
        """Optional: clean shutdown."""
