"""GraphRAG-style knowledge graph of the workspace.

The repository is indexed into a structured graph — files as nodes, imports
as edges, symbols as node attributes — so agents work with exactly the
relevant slice of the codebase instead of the whole thing:

    Bug reported in authentication
    -> graph finds: AuthService -> TokenManager -> RedisSession -> ...
    -> agents work with this relevant slice only
"""

from __future__ import annotations

import json
import re
from pathlib import Path

from .workspace import iter_files

CODE_EXTENSIONS = {".py", ".js", ".jsx", ".ts", ".tsx", ".go", ".rb", ".java", ".php"}
MAX_INDEXED_BYTES = 300_000

_PY_SYMBOL = re.compile(r"^(?:class|def)\s+([A-Za-z_]\w*)", re.MULTILINE)
_JS_SYMBOL = re.compile(
    r"^(?:export\s+)?(?:default\s+)?(?:async\s+)?"
    r"(?:function|class|const|let|var)\s+([A-Za-z_$][\w$]*)",
    re.MULTILINE,
)
_GO_SYMBOL = re.compile(r"^(?:func|type)\s+(?:\([^)]*\)\s*)?([A-Za-z_]\w*)", re.MULTILINE)
_PY_IMPORT = re.compile(r"^(?:from\s+([.\w]+)\s+import|import\s+([.\w]+))", re.MULTILINE)
_JS_IMPORT = re.compile(r"""(?:from\s+|require\(\s*)['"]([^'"]+)['"]""")
_WORD = re.compile(r"[A-Za-z_][A-Za-z0-9_]+")


def _symbols(suffix: str, text: str) -> list[str]:
    if suffix == ".py":
        pattern = _PY_SYMBOL
    elif suffix in {".js", ".jsx", ".ts", ".tsx"}:
        pattern = _JS_SYMBOL
    elif suffix == ".go":
        pattern = _GO_SYMBOL
    else:
        return []
    return sorted(set(pattern.findall(text)))[:40]


def _resolve_py(module: str, source: Path, files: set[str]) -> str | None:
    if module.startswith("."):
        base = source.parent
        module = module.lstrip(".")
        for _ in range(len(source.parts)):  # each extra leading dot walks up
            candidates = [base / (module.replace(".", "/") + ".py"),
                          base / module.replace(".", "/") / "__init__.py"]
            for c in candidates:
                if str(c) in files:
                    return str(c)
            base = base.parent
        return None
    for candidate in (module.replace(".", "/") + ".py",
                      module.replace(".", "/") + "/__init__.py"):
        if candidate in files:
            return candidate
    return None


def _resolve_js(spec: str, source: Path, files: set[str]) -> str | None:
    if not spec.startswith("."):
        return None
    base = (source.parent / spec).as_posix()
    base = str(Path(base))  # normalize ../ segments
    for suffix in ("", ".js", ".jsx", ".ts", ".tsx", "/index.js", "/index.ts"):
        if base + suffix in files:
            return base + suffix
    return None


def build(workspace: Path) -> dict:
    """Index the workspace into {nodes: {path: {symbols}}, edges: [[a, b]]}."""
    paths = [rel for rel in iter_files(workspace) if rel.suffix in CODE_EXTENSIONS]
    file_set = {str(p) for p in paths}
    nodes, edges = {}, []
    for rel in paths:
        full = workspace / rel
        if full.stat().st_size > MAX_INDEXED_BYTES:
            nodes[str(rel)] = {"symbols": []}
            continue
        text = full.read_text(encoding="utf-8", errors="replace")
        nodes[str(rel)] = {"symbols": _symbols(rel.suffix, text)}
        if rel.suffix == ".py":
            for match in _PY_IMPORT.finditer(text):
                target = _resolve_py(match.group(1) or match.group(2), rel, file_set)
                if target and target != str(rel):
                    edges.append([str(rel), target])
        elif rel.suffix in {".js", ".jsx", ".ts", ".tsx"}:
            for spec in _JS_IMPORT.findall(text):
                target = _resolve_js(spec, rel, file_set)
                if target and target != str(rel):
                    edges.append([str(rel), target])
    unique_edges = sorted({tuple(e) for e in edges})
    return {"nodes": nodes, "edges": [list(e) for e in unique_edges]}


def save(graph: dict, state_dir: Path) -> Path:
    state_dir.mkdir(parents=True, exist_ok=True)
    path = state_dir / "graph.json"
    path.write_text(json.dumps(graph, indent=2), encoding="utf-8")
    return path


def relevant_slice(graph: dict, query: str, max_files: int = 12) -> str:
    """Rank files against the query, expand one hop, render the slice."""
    words = {w.lower() for w in _WORD.findall(query) if len(w) > 2}
    scores: dict[str, int] = {}
    for path, node in graph["nodes"].items():
        tokens = {t.lower() for t in _WORD.findall(path)}
        tokens |= {s.lower() for s in node["symbols"]}
        # split CamelCase / snake_case symbols into sub-words too
        for symbol in node["symbols"]:
            tokens |= {w.lower() for w in re.findall(r"[A-Z]?[a-z]+|[A-Z]+", symbol)}
        score = len(words & tokens)
        if score:
            scores[path] = score
    seeds = sorted(scores, key=lambda p: -scores[p])[: max_files // 2 or 1]

    neighbors: dict[str, set[str]] = {}
    for a, b in graph["edges"]:
        neighbors.setdefault(a, set()).add(b)
        neighbors.setdefault(b, set()).add(a)
    selected = list(seeds)
    for seed in seeds:
        for other in sorted(neighbors.get(seed, ())):
            if other not in selected and len(selected) < max_files:
                selected.append(other)

    if not selected:
        return ""
    lines = ["Relevant code slice (knowledge graph):"]
    for path in selected:
        node = graph["nodes"].get(path, {"symbols": []})
        symbols = ", ".join(node["symbols"][:15]) or "-"
        related = ", ".join(sorted(neighbors.get(path, ()))[:6]) or "-"
        lines.append(f"- {path} | symbols: {symbols} | linked to: {related}")
    remaining = len(graph["nodes"]) - len(selected)
    if remaining > 0:
        lines.append(f"({remaining} more indexed files not shown; "
                     "use list_files/read_file to go beyond the slice)")
    return "\n".join(lines)
