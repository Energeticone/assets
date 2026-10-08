"""Offline demo: watch a full Superman run with no API key.

    python examples/offline_demo.py

Everything is real — the orchestrator, the knowledge graph, the sandboxed
tools, the files written, and the pytest run the Tester executes — except
the model, which is a small scripted brain so the demo needs no credentials.
Swap in a real brain by exporting ANTHROPIC_API_KEY and using
`superman run` instead.
"""

from __future__ import annotations

import json
import sys
import tempfile
import threading
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from superman.config import Config
from superman.llm import ModelResponse, ToolCall
from superman.orchestrator import run_task

SLUGIFY = '''\
"""String helpers."""

import re


def slugify(text: str) -> str:
    """Lowercase, trim, and join words with single hyphens."""
    words = re.findall(r"[a-z0-9]+", text.lower())
    return "-".join(words)
'''

TEST_SLUGIFY = '''\
from helpers import slugify


def test_basic():
    assert slugify("Hello, World!") == "hello-world"


def test_collapses_whitespace_and_symbols():
    assert slugify("  A  --  B  ") == "a-b"


def test_empty():
    assert slugify("") == ""
'''


def text(payload):
    body = payload if isinstance(payload, str) else json.dumps(payload)
    return ModelResponse(text=body, stop_reason="end_turn", raw=body)


def tool(name, tool_input, tool_id):
    return ModelResponse(text="", stop_reason="tool_use", raw="",
                         tool_calls=[ToolCall(id=tool_id, name=name, input=tool_input)])


class ScriptedBrain:
    """A deterministic stand-in for the model. Thread-safe for parallel reviews."""

    def __init__(self, responses):
        self.responses = list(responses)
        self.lock = threading.Lock()

    def complete(self, **_kwargs):
        with self.lock:
            return self.responses.pop(0)

    def assistant_message(self, response):
        return {"role": "assistant", "content": response.text}

    def tool_result_messages(self, results):
        return [{"role": "user",
                 "content": [{"tool_use_id": i, "content": o, "is_error": e}
                             for i, o, e in results]}]


APPROVAL = {"approved": True, "issues": [],
            "summary": "Approved — implementation is clean and the tests cover it."}

SCRIPT = [
    # Explore agent researches the workspace
    tool("list_files", {}, "t1"),
    text("Research notes: fresh workspace with only app.py; no helpers module "
         "yet; plain pytest layout is appropriate."),
    # Engineering Lead assembles the team
    text({"specialists": ["testing", "docs"], "skills": [],
          "reasoning": "New helper with tests: bring in the Testing Engineer to "
                       "vet coverage and the Documentation Writer for the README."}),
    # Planner breaks the task down
    text({"summary": "Add helpers.slugify with pytest coverage",
          "steps": [
              {"description": "create helpers.py with slugify()", "files": ["helpers.py"]},
              {"description": "add pytest tests", "files": ["test_helpers.py"]},
          ],
          "test_strategy": "pytest over the new module",
          "test_command": "python -m pytest -q"}),
    # Implementer writes the code
    tool("write_file", {"path": "helpers.py", "content": SLUGIFY}, "t2"),
    tool("write_file", {"path": "test_helpers.py", "content": TEST_SLUGIFY}, "t3"),
    tool("run_command", {"command": "python -m py_compile helpers.py"}, "t4"),
    text("Implemented helpers.slugify and its tests."),
    # Core reviewer + Testing Engineer review in parallel (order-independent)
    text(APPROVAL),
    text(APPROVAL),
    # Tester interprets the (real) pytest output
    text({"passed": True, "failures": [],
          "summary": "3 tests ran, exit code 0 — all passing."}),
    # Documentation Writer updates the README
    tool("write_file",
         {"path": "README.md",
          "content": "# demo\n\n`slugify(text)` turns any string into a "
                     "URL-friendly slug. Run `python -m pytest -q`.\n"}, "t5"),
    text("Documented slugify in the README."),
    # Learnings distilled into persistent memory
    text({"learnings": "- plain pytest layout, no src/ package\n"
                       "- helpers live in helpers.py\n"
                       "- README documents every public helper"}),
]


def main():
    workspace = Path(tempfile.mkdtemp(prefix="superman-demo-"))
    (workspace / "app.py").write_text("print('demo app')\n")
    print(f"demo workspace: {workspace}\n")

    config = Config(workspace=workspace)
    result = run_task("Add a slugify(text) helper with tests and docs",
                      config, llm=ScriptedBrain(SCRIPT))

    print("\n" + "=" * 70)
    print(result.report)
    print("=" * 70)
    print(f"\nworkspace to inspect: {workspace}")
    print(f"run record:           {Path(result.report_path).parent}")
    return 0 if result.success else 1


if __name__ == "__main__":
    sys.exit(main())
