# RAWFOTRA evaluation rubric (v1.0.0)

From the September 2026 live audit. Two layers: mechanical gates that block
release outright, and a 0–5 judged rubric for substantive advisory answers.

## Release gates (all-or-nothing)

- 100% pass on the deterministic mathematics regression fixtures
  (`fixtures.json` + the audit cases C01–C10, C01R, S01–S02) within tolerances.
- 100% pass on changed-input and missing-document critical fixtures.
- Zero fabricated citations, quotations or figures in the release set.
- Every requested-output slot answered or explicitly marked unresolved.
- No secret material (password digests excepted by design) reproduced in output.
- Mode transitions truthful: requested vs delivered engine recorded on every run.

A high average on the judged rubric cannot excuse a failed gate.

## Judged rubric — score each applicable dimension 0–5, require ≥4

1. **Correctness and calculation** — numbers exact, conventions stated.
2. **Relevance to the actual decision** — answers what was asked, not nearby.
3. **Evidence quality and traceability** — claims trace to member corpus /
   supplied facts; conflicts surfaced, never averaged.
4. **Constraint and assumption handling** — binding constraints named first;
   assumptions listed with the result.
5. **Non-obvious but defensible insight** — no fixed quota; absence honestly
   stated beats invention.
6. **Counterargument and uncertainty** — real dissent, honest ranges, no
   invented precision.
7. **Actionability and reversal conditions** — next action plus what would
   change the answer.
8. **Clarity and efficient use of detail** — the first viewport decides;
   length limits honored.

## Blinded comparison protocol (blocked on provider access)

Arms, identical inputs, comparable budgets, evaluators blinded to identity:

- **A** — one strong model, well-designed direct prompt.
- **B** — same model plus retrieval and the deterministic computation tools.
- **C** — RAWFOTRA council workflow (Claude engine).
- **D** — C plus independent critique pass.

Count ties, refusals and failures; report sample sizes and uncertainty.
Keep only the complexity that earns its cost. Do not market any superiority
claim until this comparison supports a precisely defined one.

## How to run

Serve the app locally (`python3 -m http.server` from the app root, or the
built `dist/`), then:

    node eval/run-extended.mjs http://localhost:8618/

Requires playwright-core and a Chromium binary (CI or the Claude Code
environment both provide one). The runner exits non-zero on any gate failure.
