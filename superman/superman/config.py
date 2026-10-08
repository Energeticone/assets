"""Configuration for a Superman run."""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path

DEFAULT_MODEL = "claude-opus-5"
DEFAULT_OPENAI_MODEL = "kimi-k3"  # when pointing at an OpenAI-compatible endpoint

# Command prefixes the implementer/tester agents may execute without
# per-command approval. Anything else requires --allow-any-command.
DEFAULT_ALLOWED_COMMANDS = (
    "pytest",
    "python -m pytest",
    "python -m unittest",
    "python -m py_compile",
    "python -c",
    "python3 -m pytest",
    "python3 -m unittest",
    "python3 -m py_compile",
    "python3 -c",
    "node --test",
    "npm test",
    "npm run test",
    "go test",
    "go build",
    "go vet",
    "cargo test",
    "cargo check",
    "make test",
    "ls",
    "cat",
    # user-authored skill scripts
    "python .superman/skills/",
    "python3 .superman/skills/",
    "bash .superman/skills/",
)


@dataclass
class Config:
    """Settings for one orchestration run."""

    workspace: Path
    backend: str = field(default_factory=lambda: os.environ.get("SUPERMAN_BACKEND", "claude"))
    model: str = field(default_factory=lambda: os.environ.get("SUPERMAN_MODEL", ""))
    base_url: str = field(default_factory=lambda: os.environ.get("SUPERMAN_BASE_URL",
                                                                 "https://api.moonshot.ai/v1"))
    api_key: str = field(default_factory=lambda: os.environ.get("SUPERMAN_API_KEY", ""))
    parallel_reviews: bool = True
    max_agent_turns: int = 30          # tool-use turns per agent session
    max_review_cycles: int = 3         # implement -> review -> fix loops
    max_test_cycles: int = 3           # implement -> test -> fix loops
    max_tokens: int = 16000
    command_timeout: int = 300         # seconds per shell command
    allow_any_command: bool = False
    allowed_commands: tuple[str, ...] = DEFAULT_ALLOWED_COMMANDS
    effort: str | None = None          # None = API default ("high")

    def __post_init__(self):
        if not self.model:
            self.model = DEFAULT_OPENAI_MODEL if self.backend == "openai" else DEFAULT_MODEL

    @property
    def state_dir(self) -> Path:
        """Directory where Superman persists memory and run records."""
        return self.workspace / ".superman"

    def command_allowed(self, command: str) -> bool:
        if self.allow_any_command:
            return True
        stripped = command.strip()
        return any(
            stripped.startswith(prefix) if prefix.endswith("/")
            else stripped == prefix or stripped.startswith(prefix + " ")
            for prefix in self.allowed_commands
        )
