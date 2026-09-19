"""Offline tests: the full pipeline runs against a scripted fake LLM."""

import json
import subprocess
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from superman import kgraph, skills as skills_mod
from superman.config import Config
from superman.llm import ModelResponse, OpenAICompatClient, ToolCall, parse_structured
from superman.memory import Memory
from superman.orchestrator import run_task
from superman.tools import ToolExecutor
from superman.workspace import WorkspaceError, resolve_inside


# ---------------------------------------------------------------- fakes ----

def text_response(payload):
    text = payload if isinstance(payload, str) else json.dumps(payload)
    return ModelResponse(text=text, stop_reason="end_turn", raw=text)


def tool_response(name, tool_input, tool_id="tu_1"):
    return ModelResponse(
        text="", stop_reason="tool_use",
        tool_calls=[ToolCall(id=tool_id, name=name, input=tool_input)], raw="",
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

    def assistant_message(self, response):
        return {"role": "assistant", "content": response.text}

    def tool_result_messages(self, results):
        return [{"role": "user",
                 "content": [{"tool_use_id": i, "content": o, "is_error": e}
                             for i, o, e in results]}]


PLAN = {
    "summary": "Create hello.py that prints a greeting",
    "steps": [{"description": "write hello.py", "files": ["hello.py"]}],
    "test_strategy": "compile the module",
    "test_command": "python -m py_compile hello.py",
}

NO_TEAM = {"specialists": [], "skills": [], "reasoning": "simple task"}


def offline_config(tmp_path, **kw):
    kw.setdefault("parallel_reviews", False)  # deterministic response order
    return Config(workspace=tmp_path, **kw)


def preamble(route=NO_TEAM):
    """Scripted responses for the explore + lead + plan phases."""
    return [
        text_response("research notes: empty workspace"),  # explore (no tools)
        text_response(route),                              # engineering lead
        text_response(PLAN),                               # planner
    ]


APPROVED = {"approved": True, "issues": [], "summary": "clean"}
PASSED = {"passed": True, "summary": "compiled", "failures": []}


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


# ------------------------------------------------------- knowledge graph ----

class TestKnowledgeGraph:
    def test_indexes_symbols_and_import_edges(self, tmp_path):
        (tmp_path / "auth").mkdir()
        (tmp_path / "auth/service.py").write_text(
            "from auth.tokens import TokenManager\n\nclass AuthService:\n    pass\n")
        (tmp_path / "auth/tokens.py").write_text("class TokenManager:\n    pass\n")
        (tmp_path / "app.js").write_text(
            "import { login } from './auth/service'\nfunction main() {}\n")
        graph = kgraph.build(tmp_path)
        assert graph["nodes"]["auth/service.py"]["symbols"] == ["AuthService"]
        assert ["auth/service.py", "auth/tokens.py"] in graph["edges"]

    def test_slice_ranks_relevant_files_and_pulls_neighbors(self, tmp_path):
        (tmp_path / "auth").mkdir()
        (tmp_path / "auth/service.py").write_text(
            "from auth.tokens import TokenManager\nclass AuthService:\n    pass\n")
        (tmp_path / "auth/tokens.py").write_text("class TokenManager:\n    pass\n")
        (tmp_path / "billing.py").write_text("class Invoice:\n    pass\n")
        graph = kgraph.build(tmp_path)
        slice_text = kgraph.relevant_slice(graph, "bug in authentication auth service")
        assert "auth/service.py" in slice_text
        assert "auth/tokens.py" in slice_text        # neighbor via import edge
        assert "billing.py" not in slice_text

    def test_empty_slice_for_unrelated_query(self, tmp_path):
        (tmp_path / "billing.py").write_text("class Invoice:\n    pass\n")
        graph = kgraph.build(tmp_path)
        assert kgraph.relevant_slice(graph, "zzz qqq") == ""


# --------------------------------------------------------------- skills ----

class TestSkills:
    def test_scaffold_then_discover(self, tmp_path):
        state = tmp_path / ".superman"
        skill_dir = skills_mod.scaffold(state, "security-review")
        (skill_dir / "SKILL.md").write_text(
            "# security-review\n\nCheck code against OWASP rules.\n")
        (skill_dir / "scripts/check.py").write_text("print('ok')\n")
        (skill_dir / "references/owasp.md").write_text("- no string-built SQL\n")
        skills = skills_mod.discover(state)
        assert [s.name for s in skills] == ["security-review"]
        skill = skills[0]
        assert skill.description == "Check code against OWASP rules."
        rendered = skill.render()
        assert "OWASP" in rendered
        assert ".superman/skills/security-review/scripts/check.py" in rendered
        assert "no string-built SQL" in rendered

    def test_skill_scripts_are_allowlisted(self, tmp_path):
        config = Config(workspace=tmp_path)
        assert config.command_allowed("python .superman/skills/x/scripts/check.py")
        assert not config.command_allowed("python evil.py")


# --------------------------------------------------------- orchestrator ----

class TestOrchestrator:
    def test_happy_path_core_team_only(self, tmp_path):
        llm = FakeLLM([
            *preamble(),
            tool_response("write_file",
                          {"path": "hello.py", "content": "print('hi')\n"}),
            text_response("done"),                    # implementer stops
            text_response(APPROVED),                  # core reviewer
            text_response(PASSED),                    # tester
            text_response({"learnings": "- workspace uses plain scripts"}),
        ])
        result = run_task("say hi", offline_config(tmp_path), llm=llm,
                          log=lambda *_: None)
        assert result.success
        assert (tmp_path / "hello.py").read_text() == "print('hi')\n"
        report = Path(result.report_path).read_text()
        assert "hello.py" in report and "Superman run report" in report
        assert "workspace uses plain scripts" in Memory(tmp_path / ".superman").read()

    def test_specialists_review_and_docs_writer_runs(self, tmp_path):
        route = {"specialists": ["security", "docs"], "skills": [],
                 "reasoning": "auth code"}
        llm = FakeLLM([
            *preamble(route),
            tool_response("write_file", {"path": "hello.py", "content": "print('hi')\n"}),
            text_response("done"),
            text_response(APPROVED),                                  # core review
            text_response({"approved": True, "issues": [],
                           "summary": "no injection risk"}),          # security review
            text_response(PASSED),                                    # tester
            tool_response("write_file", {"path": "README.md", "content": "# hi\n"},
                          tool_id="tu_docs"),
            text_response("docs updated"),                            # docs writer stops
            text_response({"learnings": "- security review is cheap"}),
        ])
        result = run_task("say hi securely", offline_config(tmp_path), llm=llm,
                          log=lambda *_: None)
        assert result.success
        assert (tmp_path / "README.md").read_text() == "# hi\n"
        assert "no injection risk" in result.report
        assert "Security Reviewer" in result.report

    def test_review_rejection_triggers_fix_cycle_with_feedback(self, tmp_path):
        llm = FakeLLM([
            *preamble(),
            tool_response("write_file", {"path": "hello.py", "content": "prnt('hi')\n"}),
            text_response("done"),
            text_response({"approved": False, "summary": "typo",
                           "issues": [{"file": "hello.py",
                                       "problem": "prnt is not defined",
                                       "severity": "blocker"}]}),
            tool_response("write_file", {"path": "hello.py", "content": "print('hi')\n"},
                          tool_id="tu_2"),
            text_response("fixed"),
            text_response(APPROVED),
            text_response(PASSED),
            text_response({"learnings": "- watch for typos"}),
        ])
        result = run_task("say hi", offline_config(tmp_path), llm=llm,
                          log=lambda *_: None)
        assert result.success
        assert (tmp_path / "hello.py").read_text() == "print('hi')\n"
        # The fix cycle's implementer prompt carried the reviewer's feedback.
        fix_request = next(r for r in llm.requests
                           if "prnt is not defined" in str(r["messages"][0]))
        assert "core review" in str(fix_request["messages"][0])

    def test_unapproved_run_reports_needs_attention(self, tmp_path):
        rejection = text_response(
            {"approved": False, "summary": "wrong approach",
             "issues": [{"file": "hello.py", "problem": "bad",
                         "severity": "blocker"}]})
        llm = FakeLLM([
            *preamble(),
            tool_response("write_file", {"path": "hello.py", "content": "?\n"}),
            text_response("done"), rejection,
            text_response("done"), rejection,
            text_response("done"), rejection,
            text_response({"learnings": "- task was unclear"}),
        ])
        result = run_task("say hi", offline_config(tmp_path), llm=llm,
                          log=lambda *_: None)
        assert not result.success
        assert "needs human attention" in result.report

    def test_explore_agent_reads_files_before_planning(self, tmp_path):
        (tmp_path / "existing.py").write_text("VALUE = 41\n")
        llm = FakeLLM([
            tool_response("read_file", {"path": "existing.py"}),   # explore reads
            text_response("notes: VALUE lives in existing.py"),    # explore concludes
            text_response(NO_TEAM),
            text_response(PLAN),
            tool_response("write_file", {"path": "hello.py", "content": "print('hi')\n"},
                          tool_id="tu_2"),
            text_response("done"),
            text_response(APPROVED),
            text_response(PASSED),
            text_response({"learnings": "- ok"}),
        ])
        result = run_task("bump VALUE", offline_config(tmp_path), llm=llm,
                          log=lambda *_: None)
        assert result.success
        # Planner saw the explore agent's research notes.
        planner_request = llm.requests[3]
        assert "VALUE lives in existing.py" in str(planner_request["messages"][0])


# ------------------------------------------------- OpenAI-compat backend ----

class FakeHTTPSession:
    def __init__(self, reply):
        self.reply = reply
        self.calls = []

    def post(self, url, **kwargs):
        self.calls.append((url, kwargs))
        reply = self.reply

        class Resp:
            def raise_for_status(self):
                pass

            def json(self):
                return reply

        return Resp()


class TestOpenAICompatBackend:
    def test_tool_call_roundtrip_and_translation(self, tmp_path):
        reply = {"choices": [{"finish_reason": "tool_calls", "message": {
            "role": "assistant", "content": None,
            "tool_calls": [{"id": "c1", "type": "function", "function": {
                "name": "read_file", "arguments": '{"path": "a.py"}'}}],
        }}]}
        session = FakeHTTPSession(reply)
        config = Config(workspace=tmp_path, backend="openai", api_key="k")
        client = OpenAICompatClient(config, session=session)
        response = client.complete(system="sys", messages=[{"role": "user", "content": "go"}],
                                   tools=[{"name": "read_file", "description": "d",
                                           "input_schema": {"type": "object"}}])
        assert config.model == "kimi-k3"
        assert response.stop_reason == "tool_use"
        assert response.tool_calls[0].input == {"path": "a.py"}
        url, kwargs = session.calls[0]
        assert url == "https://api.moonshot.ai/v1/chat/completions"
        assert kwargs["json"]["tools"][0]["function"]["name"] == "read_file"
        assert kwargs["headers"]["Authorization"] == "Bearer k"
        # history round-trip shapes
        assert client.assistant_message(response)["tool_calls"][0]["id"] == "c1"
        results = client.tool_result_messages([("c1", "content", False)])
        assert results == [{"role": "tool", "tool_call_id": "c1", "content": "content"}]

    def test_structured_output_parses_fenced_json(self, tmp_path):
        reply = {"choices": [{"finish_reason": "stop", "message": {
            "role": "assistant", "content": '```json\n{"approved": true}\n```'}}]}
        client = OpenAICompatClient(Config(workspace=tmp_path, backend="openai"),
                                    session=FakeHTTPSession(reply))
        response = client.complete(system="s", messages=[{"role": "user", "content": "x"}],
                                   output_schema={"type": "object"})
        assert parse_structured(response) == {"approved": True}


# -------------------------------------------------------------------- cli ----

class TestCLI:
    def cli(self, tmp_path, *args):
        return subprocess.run(
            [sys.executable, "-m", "superman", "-w", str(tmp_path), *args],
            capture_output=True, text=True,
            cwd=str(Path(__file__).resolve().parents[1]),
        )

    def test_history_review_and_memory_commands(self, tmp_path):
        memory = Memory(tmp_path / ".superman")
        record = memory.new_run("demo task")
        record.save("report.md", "# Superman run report\ndemo")
        memory.append("- demo learning")

        history = self.cli(tmp_path, "history")
        assert history.returncode == 0 and record.run_id in history.stdout
        review = self.cli(tmp_path, "review")
        assert review.returncode == 0 and "demo" in review.stdout
        assert "- demo learning" in self.cli(tmp_path, "memory").stdout
        assert self.cli(tmp_path, "memory", "--clear").returncode == 0
        assert "(memory is empty)" in self.cli(tmp_path, "memory").stdout

    def test_skills_and_graph_commands(self, tmp_path):
        init = self.cli(tmp_path, "skills", "--init", "security-review")
        assert init.returncode == 0 and "scaffolded" in init.stdout
        listing = self.cli(tmp_path, "skills")
        assert "security-review" in listing.stdout
        (tmp_path / "auth.py").write_text("class AuthService:\n    pass\n")
        graph = self.cli(tmp_path, "graph", "auth service")
        assert graph.returncode == 0 and "auth.py" in graph.stdout
