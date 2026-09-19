"""Offline tests: the full pipeline runs against a scripted fake LLM."""

import json
import subprocess
import sys
from pathlib import Path
from types import SimpleNamespace

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from superman.config import Config
from superman.memory import Memory
from superman.orchestrator import run_task
from superman.tools import ToolExecutor
from superman.workspace import WorkspaceError, resolve_inside


# ---------------------------------------------------------------- fakes ----

def _block(**kw):
    b = SimpleNamespace(**kw)
    b.to_dict = lambda: kw
    return b


def text_message(payload):
    text = payload if isinstance(payload, str) else json.dumps(payload)
    return SimpleNamespace(
        content=[_block(type="text", text=text)], stop_reason="end_turn"
    )


def tool_message(name, tool_input, tool_id="tu_1"):
    return SimpleNamespace(
        content=[_block(type="tool_use", name=name, input=tool_input, id=tool_id)],
        stop_reason="tool_use",
    )


class FakeLLM:
    """Returns queued responses in order; records every request."""

    def __init__(self, responses):
        self.responses = list(responses)
        self.requests = []

    def complete(self, **kwargs):
        self.requests.append(kwargs)
        if not self.responses:
            raise AssertionError("FakeLLM ran out of scripted responses")
        return self.responses.pop(0)


PLAN = {
    "summary": "Create hello.py that prints a greeting",
    "steps": [{"description": "write hello.py", "files": ["hello.py"]}],
    "test_strategy": "compile the module",
    "test_command": "python -m py_compile hello.py",
}


# ---------------------------------------------------------------- tools ----

class TestWorkspaceSafety:
    def test_rejects_absolute_and_escaping_paths(self, tmp_path):
        with pytest.raises(WorkspaceError):
            resolve_inside(tmp_path, "/etc/passwd")
        with pytest.raises(WorkspaceError):
            resolve_inside(tmp_path, "../outside.txt")
        with pytest.raises(WorkspaceError):
            resolve_inside(tmp_path, ".superman/memory.md")

    def test_allows_nested_relative_paths(self, tmp_path):
        assert resolve_inside(tmp_path, "a/b/c.txt") == (tmp_path / "a/b/c.txt").resolve()


class TestToolExecutor:
    def test_write_read_delete_roundtrip(self, tmp_path):
        ex = ToolExecutor(Config(workspace=tmp_path))
        out, err = ex.execute("write_file", {"path": "pkg/mod.py", "content": "x = 1\n"})
        assert not err and "pkg/mod.py" in ex.files_written
        out, err = ex.execute("read_file", {"path": "pkg/mod.py"})
        assert not err and out == "x = 1\n"
        out, err = ex.execute("delete_file", {"path": "pkg/mod.py"})
        assert not err and not (tmp_path / "pkg/mod.py").exists()

    def test_command_allowlist_blocks_arbitrary_commands(self, tmp_path):
        ex = ToolExecutor(Config(workspace=tmp_path))
        out, err = ex.execute("run_command", {"command": "rm -rf /"})
        assert err and "allowlist" in out

    def test_allowed_command_runs_and_reports_exit_code(self, tmp_path):
        (tmp_path / "ok.py").write_text("x = 1\n")
        ex = ToolExecutor(Config(workspace=tmp_path))
        out, err = ex.execute("run_command", {"command": "python -m py_compile ok.py"})
        assert not err
        assert json.loads(out)["exit_code"] == 0

    def test_errors_are_reported_not_raised(self, tmp_path):
        ex = ToolExecutor(Config(workspace=tmp_path))
        out, err = ex.execute("read_file", {"path": "missing.txt"})
        assert err and out.startswith("Error:")


# --------------------------------------------------------------- memory ----

class TestMemory:
    def test_append_and_read(self, tmp_path):
        memory = Memory(tmp_path / ".superman")
        memory.append("- prefers pytest")
        memory.append("- src layout")
        text = memory.read()
        assert "- prefers pytest" in text and "- src layout" in text

    def test_trims_oldest_sections_when_full(self, tmp_path):
        memory = Memory(tmp_path / ".superman")
        for i in range(60):
            memory.append(f"- learning {i}: " + "x" * 500)
        text = memory.read()
        assert "- learning 59" in text
        assert "- learning 0" not in text

    def test_run_records_are_listed_in_order(self, tmp_path):
        memory = Memory(tmp_path / ".superman")
        r1 = memory.new_run("first")
        r2 = memory.new_run("second")
        assert memory.runs() == sorted([r1.run_id, r2.run_id])
        assert memory.latest_run_dir().name == r2.run_id


# --------------------------------------------------------- orchestrator ----

class TestOrchestrator:
    def test_happy_path_single_cycle(self, tmp_path):
        llm = FakeLLM([
            text_message(PLAN),                                           # planner
            tool_message("write_file",
                         {"path": "hello.py", "content": "print('hi')\n"}),
            text_message("done"),                                         # implementer stops
            text_message({"approved": True, "issues": [],
                          "summary": "clean"}),                           # reviewer
            text_message({"passed": True, "summary": "compiled",
                          "failures": []}),                               # tester
            text_message({"learnings": "- workspace uses plain scripts"}),  # memory
        ])
        result = run_task("say hi", Config(workspace=tmp_path), llm=llm, log=lambda *_: None)

        assert result.success
        assert (tmp_path / "hello.py").read_text() == "print('hi')\n"
        report = Path(result.report_path).read_text()
        assert "hello.py" in report and "Superman run report" in report
        assert "workspace uses plain scripts" in Memory(tmp_path / ".superman").read()

    def test_review_rejection_triggers_fix_cycle_with_feedback(self, tmp_path):
        llm = FakeLLM([
            text_message(PLAN),
            tool_message("write_file", {"path": "hello.py", "content": "prnt('hi')\n"}),
            text_message("done"),
            text_message({"approved": False, "summary": "typo",
                          "issues": [{"file": "hello.py", "problem": "prnt is not defined",
                                      "severity": "blocker"}]}),
            tool_message("write_file", {"path": "hello.py", "content": "print('hi')\n"},
                         tool_id="tu_2"),
            text_message("fixed"),
            text_message({"approved": True, "issues": [], "summary": "fixed"}),
            text_message({"passed": True, "summary": "ok", "failures": []}),
            text_message({"learnings": "- watch for typos"}),
        ])
        result = run_task("say hi", Config(workspace=tmp_path), llm=llm, log=lambda *_: None)

        assert result.success
        assert (tmp_path / "hello.py").read_text() == "print('hi')\n"
        # The fix cycle's implementer prompt carried the reviewer's feedback.
        fix_request = llm.requests[4]
        assert "prnt is not defined" in fix_request["messages"][0]["content"]

    def test_unapproved_run_reports_needs_attention(self, tmp_path):
        rejection = text_message({"approved": False, "summary": "wrong approach",
                                  "issues": [{"file": "hello.py", "problem": "bad",
                                              "severity": "blocker"}]})
        llm = FakeLLM([
            text_message(PLAN),
            tool_message("write_file", {"path": "hello.py", "content": "?\n"}),
            text_message("done"), rejection,
            text_message("done"), rejection,
            text_message("done"), rejection,
            text_message({"learnings": "- task was unclear"}),
        ])
        config = Config(workspace=tmp_path)
        result = run_task("say hi", config, llm=llm, log=lambda *_: None)
        assert not result.success
        assert "needs human attention" in result.report


# -------------------------------------------------------------------- cli ----

class TestCLI:
    def test_history_review_and_memory_commands(self, tmp_path):
        env_dir = str(Path(__file__).resolve().parents[1])
        memory = Memory(tmp_path / ".superman")
        record = memory.new_run("demo task")
        record.save("report.md", "# Superman run report\ndemo")
        memory.append("- demo learning")

        def cli(*args):
            return subprocess.run(
                [sys.executable, "-m", "superman", "-w", str(tmp_path), *args],
                capture_output=True, text=True, cwd=env_dir,
            )
        history = cli("history")
        assert history.returncode == 0 and record.run_id in history.stdout
        review = cli("review")
        assert review.returncode == 0 and "demo" in review.stdout
        shown = cli("memory")
        assert "- demo learning" in shown.stdout
        cleared = cli("memory", "--clear")
        assert cleared.returncode == 0
        assert "(memory is empty)" in cli("memory").stdout
