# Superman

An AI agent orchestration system.

```
Wrong approach:
You → AI chat → copy output → paste → repeat

Right approach:
You → orchestrate → agents plan, implement, review, test
     → system remembers everything
     → you review final output
```

You hand Superman a task in plain language. It orchestrates a team of
Claude-powered agents over your workspace — a **Planner** drafts the approach,
an **Implementer** writes the code through sandboxed file/command tools, a
**Reviewer** rejects it until there are no blockers, and a **Tester** runs the
test command and interprets the results. Rejections and failures feed back
into fix cycles automatically. Everything — plans, transcripts, tool logs,
verdicts, learnings — is persisted, and you review one final report.

## Install

```bash
cd superman
pip install .
export ANTHROPIC_API_KEY=sk-ant-...
```

Requires Python 3.10+. Uses `claude-opus-5` by default (override with
`--model` or `SUPERMAN_MODEL`).

## Use

```bash
# run a task against the current directory
superman run "Add input validation to signup.py and cover it with tests"

# run against another workspace, with more fix cycles
superman -w ~/code/myapp run "Migrate the config loader to TOML" --max-cycles 5

# you review the final output
superman review

# the system remembers everything
superman history          # every recorded run
superman memory           # durable learnings carried into future runs
superman memory --clear
```

`superman run` exits 0 when the reviewer approved and tests passed, 1 when
the run needs your attention — the report says exactly why.

## How a run works

1. **Plan** — the Planner reads the workspace file listing plus persistent
   memory and produces a structured plan: steps, files, test strategy, and a
   single test command.
2. **Implement** — the Implementer executes the plan with tools
   (`list_files`, `read_file`, `write_file`, `delete_file`, `run_command`),
   sandboxed to the workspace.
3. **Review** — the Reviewer reads every changed file against the task and
   plan and returns a structured verdict. Blockers send the Implementer back
   with the exact issues as feedback (up to `--max-cycles` times).
4. **Test** — once approved, the Tester runs the plan's test command and
   interprets the output; failures feed another fix cycle.
5. **Remember** — a distiller summarizes durable learnings (conventions,
   decisions, pitfalls) into `.superman/memory.md`, which every future run
   reads. Oldest entries are trimmed automatically.
6. **You review** — `superman review` prints the report; the full record of
   the run lives in `.superman/runs/<run-id>/`.

## Safety rails

- Agents can only touch files inside the workspace — absolute paths,
  `..` escapes, and `.git`/`.superman` are rejected.
- `run_command` only accepts allowlisted test/build commands
  (`pytest`, `go test`, `npm test`, ...) unless you pass
  `--allow-any-command`; every command runs with a timeout and its output
  is logged.
- Every tool call of every agent is recorded in the run directory, so the
  final report is auditable, not just trustable.

## Development

```bash
pip install pytest anthropic
python -m pytest tests/ -q
```

The test suite drives the entire pipeline against a scripted fake LLM, so it
runs offline — no API key needed.
