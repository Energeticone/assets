"""Thin wrapper around the Anthropic SDK used by every agent."""

from __future__ import annotations

import json

import anthropic

from .config import Config


class LLMClient:
    """Streams messages to Claude and returns the final message.

    A single seam for the whole system: tests replace this class with a fake,
    and every agent goes through `complete()`.
    """

    def __init__(self, config: Config, client: anthropic.Anthropic | None = None):
        self.config = config
        self.client = client or anthropic.Anthropic()

    def complete(self, *, system: str, messages: list, tools: list | None = None,
                 output_schema: dict | None = None):
        """One model turn. Streaming keeps long responses inside HTTP timeouts."""
        params = {
            "model": self.config.model,
            "max_tokens": self.config.max_tokens,
            "system": system,
            "messages": messages,
        }
        if tools:
            params["tools"] = tools
        if output_schema:
            params["output_config"] = {
                "format": {"type": "json_schema", "schema": output_schema}
            }
        if self.config.effort:
            params.setdefault("output_config", {})["effort"] = self.config.effort
        with self.client.messages.stream(**params) as stream:
            return stream.get_final_message()


def text_of(message) -> str:
    """Concatenated text blocks of a response message."""
    return "\n".join(b.text for b in message.content if b.type == "text")


def parse_structured(message) -> dict:
    """Parse a structured-output (json_schema) response."""
    return json.loads(text_of(message))
