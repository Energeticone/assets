"""Model backends.

Superman's brain is pluggable:

- `ClaudeClient` (default) — the official Anthropic SDK, `claude-opus-5`.
- `OpenAICompatClient` — any OpenAI-compatible endpoint, e.g. Kimi K3 via
  `https://api.moonshot.ai/v1`.

Agents never touch provider wire formats. Every backend implements:

    complete(system, messages, tools, output_schema) -> ModelResponse
    assistant_message(response) -> dict            # append to history
    tool_result_messages(results) -> list[dict]    # append after running tools
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass, field

from .config import Config


@dataclass
class ToolCall:
    id: str
    name: str
    input: dict


@dataclass
class ModelResponse:
    text: str
    stop_reason: str                      # "tool_use" | "end_turn" | provider raw
    tool_calls: list[ToolCall] = field(default_factory=list)
    raw: object = None


def parse_structured(response: ModelResponse) -> dict:
    """Parse a JSON verdict, tolerating markdown code fences."""
    text = response.text.strip()
    fenced = re.match(r"^```(?:json)?\s*(.*?)\s*```$", text, re.DOTALL)
    if fenced:
        text = fenced.group(1)
    return json.loads(text)


# --------------------------------------------------------------- Claude ----


class ClaudeClient:
    """Anthropic SDK backend (streaming keeps long turns inside timeouts)."""

    def __init__(self, config: Config, client=None):
        import anthropic

        self.config = config
        self.client = client or anthropic.Anthropic()

    def complete(self, *, system, messages, tools=None, output_schema=None) -> ModelResponse:
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
            message = stream.get_final_message()
        return ModelResponse(
            text="\n".join(b.text for b in message.content if b.type == "text"),
            stop_reason=message.stop_reason,
            tool_calls=[
                ToolCall(id=b.id, name=b.name, input=dict(b.input))
                for b in message.content
                if b.type == "tool_use"
            ],
            raw=message,
        )

    def assistant_message(self, response: ModelResponse) -> dict:
        return {"role": "assistant", "content": response.raw.content}

    def tool_result_messages(self, results) -> list[dict]:
        blocks = []
        for tool_id, output, is_error in results:
            block = {"type": "tool_result", "tool_use_id": tool_id, "content": output}
            if is_error:
                block["is_error"] = True
            blocks.append(block)
        return [{"role": "user", "content": blocks}]


# -------------------------------------------- OpenAI-compatible (Kimi) ----


class OpenAICompatClient:
    """Any OpenAI-compatible /chat/completions endpoint (e.g. Kimi K3).

    Uses raw HTTP so Superman needs no extra SDK for alternative brains.
    """

    def __init__(self, config: Config, session=None):
        import requests

        self.config = config
        self.session = session or requests.Session()

    def complete(self, *, system, messages, tools=None, output_schema=None) -> ModelResponse:
        oai_messages = [{"role": "system", "content": system}, *messages]
        payload = {"model": self.config.model, "messages": oai_messages,
                   "max_tokens": self.config.max_tokens}
        if tools:
            payload["tools"] = [
                {
                    "type": "function",
                    "function": {
                        "name": t["name"],
                        "description": t["description"],
                        "parameters": t["input_schema"],
                    },
                }
                for t in tools
            ]
        if output_schema:
            payload["response_format"] = {"type": "json_object"}
            oai_messages[0]["content"] += (
                "\n\nRespond ONLY with a JSON object matching this schema:\n"
                + json.dumps(output_schema)
            )
        resp = self.session.post(
            f"{self.config.base_url.rstrip('/')}/chat/completions",
            headers={"Authorization": f"Bearer {self.config.api_key}"},
            json=payload,
            timeout=600,
        )
        resp.raise_for_status()
        choice = resp.json()["choices"][0]
        message = choice["message"]
        tool_calls = [
            ToolCall(
                id=tc["id"],
                name=tc["function"]["name"],
                input=json.loads(tc["function"]["arguments"] or "{}"),
            )
            for tc in message.get("tool_calls") or []
        ]
        finish = choice.get("finish_reason", "stop")
        return ModelResponse(
            text=message.get("content") or "",
            stop_reason="tool_use" if tool_calls or finish == "tool_calls" else "end_turn",
            tool_calls=tool_calls,
            raw=message,
        )

    def assistant_message(self, response: ModelResponse) -> dict:
        return response.raw  # already an OpenAI-shaped assistant message

    def tool_result_messages(self, results) -> list[dict]:
        return [
            {"role": "tool", "tool_call_id": tool_id,
             "content": f"Error: {output}" if is_error and not output.startswith("Error") else output}
            for tool_id, output, is_error in results
        ]


def make_client(config: Config):
    if config.backend == "openai":
        return OpenAICompatClient(config)
    return ClaudeClient(config)
