"""Workspace helpers: path safety and file snapshots."""

from __future__ import annotations

from pathlib import Path

# Directories never shown to or writable by agents.
IGNORED_DIRS = {".git", ".superman", "__pycache__", "node_modules", ".venv", "venv"}

MAX_SNAPSHOT_FILES = 400
MAX_READ_BYTES = 200_000


class WorkspaceError(Exception):
    pass


def resolve_inside(workspace: Path, relative: str) -> Path:
    """Resolve a path relative to the workspace, refusing escapes.

    Agents address files by relative path only; absolute paths and any
    form of `..` traversal outside the workspace are rejected.
    """
    if not relative or relative.strip() == "":
        raise WorkspaceError("empty path")
    candidate = Path(relative)
    if candidate.is_absolute():
        raise WorkspaceError(f"absolute paths are not allowed: {relative}")
    resolved = (workspace / candidate).resolve()
    root = workspace.resolve()
    if resolved != root and root not in resolved.parents:
        raise WorkspaceError(f"path escapes the workspace: {relative}")
    for part in resolved.relative_to(root).parts:
        if part in IGNORED_DIRS:
            raise WorkspaceError(f"path touches a protected directory: {relative}")
    return resolved


def iter_files(workspace: Path):
    """Yield workspace files as paths relative to the root, ignoring noise."""
    root = workspace.resolve()
    for path in sorted(root.rglob("*")):
        if not path.is_file():
            continue
        rel = path.relative_to(root)
        if any(part in IGNORED_DIRS for part in rel.parts):
            continue
        yield rel


def snapshot(workspace: Path) -> str:
    """A compact listing of the workspace for agent context."""
    lines = []
    for i, rel in enumerate(iter_files(workspace)):
        if i >= MAX_SNAPSHOT_FILES:
            lines.append(f"... (truncated at {MAX_SNAPSHOT_FILES} files)")
            break
        size = (workspace / rel).stat().st_size
        lines.append(f"{rel} ({size} bytes)")
    return "\n".join(lines) if lines else "(empty workspace)"
