"""Pluggable message delivery bridges.

Select with the BRIDGE env var:
    local           -> app-to-app delivery (works with no Apple hardware)
    imessage_relay  -> real iMessage via a BlueBubbles server on a Mac box
"""
import config


def get_bridge(emit_incoming):
    """Return the configured bridge.

    `emit_incoming(message_dict)` is the callback the bridge uses to push an
    inbound message into the server (realtime + persistence + notifications).
    """
    name = (config.BRIDGE or "local").lower()
    if name == "imessage_relay":
        from .imessage_relay import IMessageRelayBridge
        return IMessageRelayBridge(emit_incoming)
    from .local import LocalBridge
    return LocalBridge(emit_incoming)
