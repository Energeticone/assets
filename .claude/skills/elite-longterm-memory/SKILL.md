---
name: elite-longterm-memory
description: "File-based long-term memory for this repo: write-ahead session state, curated MEMORY.md, daily logs, decisions and lessons — all committed to git so they survive ephemeral cloud containers. Use at session start (load context), whenever the user states a preference, decision, deadline or correction (write BEFORE responding), and at session end (distill and commit)."
---

# Elite Longterm Memory (Claude Code adaptation)

Adapted from NextFrontierBuilds `elite-longterm-memory` v1.2.0
(https://github.com/nextfrontierbuilds/elite-longterm-memory). Kept: the
write-ahead protocol and the file layers. Dropped on purpose: LanceDB
vectors, git-notes `memory.py`, SuperMemory and Mem0 — they need Clawdbot
plugins or third-party API keys, and would send conversation content
off-device. Plain files + grep cover this repo's scale.

## Why commit matters here

Cloud sessions run in a container that is reclaimed after inactivity.
A memory file that is written but not committed and pushed is lost.
**Memory is durable only once it is in git.**

## Layout (`memory/` at repo root)

| File | Layer | Purpose |
|---|---|---|
| `memory/SESSION-STATE.md` | Hot | Current task, key context, pending actions. Overwritten freely. |
| `memory/MEMORY.md` | Curated | Distilled long-term facts and preferences. Keep under 5 KB. |
| `memory/daily/YYYY-MM-DD.md` | Log | What happened in a session, timestamped (UTC). |
| `memory/decisions/YYYY-MM.md` | Cold | Decisions with date, reason, and whether reversible (Type 1/2). |
| `memory/lessons.md` | Cold | Mistakes and their fixes, so they are not repeated. |

## Protocol

### On session start
1. Read `memory/SESSION-STATE.md` and `memory/MEMORY.md`.
2. Skim the latest file in `memory/daily/`.
3. `grep -ri "<topic>" memory/` for anything relevant to the request.

### During the session — write-ahead
When the user gives a preference, decision, deadline or correction:
write it to `memory/SESSION-STATE.md` **first**, then respond.
Decisions also get an entry in `memory/decisions/YYYY-MM.md`;
corrections of your own mistakes also go in `memory/lessons.md`.

### On session end (or before any push)
1. Update `SESSION-STATE.md` with final state.
2. Append a dated entry to `memory/daily/YYYY-MM-DD.md`.
3. Promote anything durable into `MEMORY.md`.
4. Commit memory changes together with the work, then push.

### Hygiene (monthly)
Archive finished tasks out of SESSION-STATE, fold daily logs into
MEMORY.md, delete stale entries. Smaller memory recalls better.

## Rules
- Timestamp every entry in UTC (`date -u +"%Y-%m-%d %H:%M UTC"`).
- Facts only: label anything inferred or generated as such (matches the
  RAWFOTRA memory-provenance rule — generated advice never becomes fact).
- Never store secrets, API keys, tokens, or third-party personal data.
