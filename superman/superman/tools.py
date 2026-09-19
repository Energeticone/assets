"""Tools the agents can call while working on the workspace."""

from __future__ import annotations

import json
import subprocess
from dataclasses import dataclass, field
from pathlib import Path

from .config import Config
from .workspace import MAX_READ_BYTES, WorkspaceError, resolve_inside, snapshot

TOOL_DEFINITIONS = [
    {
        "name": "list_files",
        "description": "List every file in the workspace with its size in bytes.",
        "strict": True,
        "input_schema": {
            "type": "object",
            "properties": {},
            "required": [],
            "additionalProperties": False,
        },
    },
    {
        "name": "read_file",
        "description": "Read a file from the workspace. Path is relative to the workspace root.",
        "strict": True,
        "input_schema": {
            "type": "object",
            "properties": {"path": {"type": "string"}},
            "required": ["path"],
            "additionalProperties": False,
        },
    },
    {
        "name": "write_file",
        "description": (
            "Create or overwrite a file in the workspace with the given content. "
            "Path is relative to the workspace root; parent directories are created."
        ),
        "strict": True,
        "input_schema": {
            "type": "object",
            "properties": {
                "path": {"type": "string"},
                "content": {"type": "string"},
            },
            "required": ["path", "content"],
            "additionalProperties": False,
        },
    },
    {
        "name": "delete_file",
        "description": "Delete a file from the workspace. Path is relative to the workspace root.",
        "strict": True,
        "input_schema": {
            "type": "object",
            "properties": {"path": {"type": "string"}},
            "required": ["path"],
            "additionalProperties": False,
        },
    },
    {
        "name": "run_command",
        "description": (
            "Run a shell command inside the workspace (for tests, builds, quick checks). "
            "Only allowlisted commands are permitted; the result includes stdout, stderr "
            "and the exit code."
        ),
        "strict": True,
        "input_schema": {
            "type": "object",
            "properties": {"command": {"type": "string"}},
            "required": ["command"],
            "additionalProperties": False,
        },
    },
]


@dataclass
class ToolExecutor:
    """Executes agent tool calls against the workspace and records every action."""

    config: Config
    log: list[dict] = field(default_factory=list)
    files_written: set = field(default_factory=set)

    def execute(self, name: str, tool_input: dict) -> tuple[str, bool]:
        """Run one tool call. Returns (result_text, is_error)."""
        try:
            handler = getattr(self, f"_do_{name}", None)
            if handler is None:
                return f"Unknown tool: {name}", True
            result = handler(**tool_input)
            self.log.append({"tool": name, "input": tool_input, "ok": True})
            return result, False
        except (WorkspaceError, OSError, subprocess.TimeoutExpired, TypeError) as exc:
            self.log.append({"tool": name, "input": tool_input, "ok": False, "error": str(exc)})
            return f"Error: {exc}", True

    def _do_list_files(self) -> str:
        return snapshot(self.config.workspace)

    def _do_read_file(self, path: str) -> str:
        target = resolve_inside(self.config.workspace, path)
        data = target.read_bytes()
        if len(data) > MAX_READ_BYTES:
            return (
                data[:MAX_READ_BYTES].decode("utf-8", errors="replace")
                + f"\n... (truncated, file is {len(data)} bytes)"
            )
        return data.decode("utf-8", errors="replace")

    def _do_write_file(self, path: str, content: str) -> str:
        target = resolve_inside(self.config.workspace, path)
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(content, encoding="utf-8")
        self.files_written.add(str(Path(path)))
        return f"Wrote {len(content)} characters to {path}"

    def _do_delete_file(self, path: str) -> str:
        target = resolve_inside(self.config.workspace, path)
        if not target.is_file():
            raise WorkspaceError(f"not a file: {path}")
        target.unlink()
        self.files_written.discard(str(Path(path)))
        return f"Deleted {path}"

    def _do_run_command(self, command: str) -> str:
        if not self.config.command_allowed(command):
            raise WorkspaceError(
                f"command not in the allowlist: {command!r}. "
                "Use one of the permitted test/build commands, or the operator can "
                "re-run Superman with --allow-any-command."
            )
        proc = subprocess.run(
            command,
            shell=True,
            cwd=self.config.workspace,
            capture_output=True,
            text=True,
            timeout=self.config.command_timeout,
        )
        return json.dumps(
            {
                "exit_code": proc.returncode,
                "stdout": proc.stdout[-20_000:],
                "stderr": proc.stderr[-20_000:],
            }
        )
