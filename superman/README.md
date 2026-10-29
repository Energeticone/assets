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

You hand Superman a task in plain language and it runs a full engineering
team over your workspace:

```
YOU
 └─ Engineering Lead ── picks the specialists and skills this task needs
     ├─ Explore agent ──── researches the codebase and docs first
     ├─ Planner ────────── understands the task, breaks it down
     ├─ Implementer ────── writes the code through sandboxed tools
     ├─ Reviewers ──────── core reviewer + specialists, in parallel
     │    ├─ Frontend Specialist
     │    ├─ Security Reviewer
     │    ├─ Database Expert
     │    └─ Testing Engineer
     ├─ Tester ─────────── runs and interprets the test command
     └─ Documentation Writer ─ updates docs once everything is green
```

Rejections and test failures feed back into fix cycles automatically.
Everything — research, plans, transcripts, tool logs, verdicts, learnings —
is persisted, and you review one final report.

## Install

```bash
cd superman
pip install .
export ANTHROPIC_API_KEY=sk-ant-...
```

Requires Python 3.10+. Uses `claude-opus-5` by default.

### Alternative brain: any OpenAI-compatible endpoint (e.g. Kimi K3)

```bash
pip install '.[openai]'
export SUPERMAN_API_KEY=YOUR_KIMI_KEY
export SUPERMAN_BASE_URL=https://api.moonshot.ai/v1   # the default
superman run "..." --backend openai --model kimi-k3
```

Agents never touch provider wire formats, so any `/chat/completions`
endpoint with tool calling works.

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

`superman run` exits 0 when every reviewer approved and tests passed,
1 when the run needs your attention — the report says exactly why.

## Knowledge graph: agents get exactly what they need

Superman indexes the repository into a structured knowledge graph — files
as nodes, imports as edges, symbols as attributes — and hands agents the
relevant slice instead of the whole repo:

```
Bug reported in authentication
↓
graph finds: auth/service.py → auth/tokens.py → auth/session.py → tests
↓
agents work with this relevant slice only
```

Inspect it yourself:

```bash
superman graph "authentication bug"
```

The graph is rebuilt each run and stored at `.superman/graph.json`.

## Skills: packaged expertise

A skill is a directory the Engineering Lead can activate for a run:

```
.superman/skills/security-review/
├── SKILL.md      # instructions, rules, examples
├── scripts/      # automated checks (agents run them via run_command)
└── references/   # e.g. OWASP rules, security patterns
```

```bash
superman skills --init security-review   # scaffold
superman skills                          # list installed skills
```

Active skills are injected into the implementer's and the specialist
reviewers' context, and their `scripts/` are allowlisted for execution.

## How a run works

1. **Index** — the workspace is indexed into the knowledge graph; the task
   query selects the relevant slice.
2. **Explore** — the Explore agent reads the code the task will touch and
   writes research notes for the team.
3. **Route** — the Engineering Lead picks specialists (frontend, security,
   database, testing, docs) and skills for this specific task.
4. **Plan** — the Planner produces a structured plan: steps, files, test
   strategy, and a single test command.
5. **Implement** — the Implementer executes the plan with tools
   (`list_files`, `read_file`, `write_file`, `delete_file`, `run_command`),
   sandboxed to the workspace.
6. **Review** — the core Reviewer and every selected specialist review the
   changed files *in parallel*; any blocker sends the Implementer back with
   the exact issues as feedback (up to `--max-cycles` times).
7. **Test** — once approved, the Tester runs the plan's test command and
   interprets the output; failures feed another fix cycle.
8. **Document** — if the Lead brought in the Documentation Writer, it
   updates docs after everything is green.
9. **Remember** — a distiller appends durable learnings to
   `.superman/memory.md`, which every future run reads (oldest entries are
   trimmed automatically).
10. **You review** — `superman review` prints the report; the full record
    lives in `.superman/runs/<run-id>/`.

## Safety rails

- Agents can only touch files inside the workspace — absolute paths,
  `..` escapes, and `.git`/`.superman` are rejected.
- `run_command` only accepts allowlisted test/build commands
  (`pytest`, `go test`, `npm test`, skill scripts, ...) unless you pass
  `--allow-any-command`; every command runs with a timeout and its output
  is logged.
- Every tool call of every agent is recorded in the run directory, so the
  final report is auditable, not just trustable.

## Development

```bash
pip install pytest anthropic
python -m pytest tests/ -q
```

The test suite drives the entire pipeline — explore, routing, parallel
specialist reviews, fix cycles, the OpenAI-compatible adapter — against a
scripted fake LLM, so it runs offline with no API key.
