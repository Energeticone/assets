# RAWFOTRA — Claude Code standing instructions

App root: `rawfotra/`
Live: https://rawfotra.vercel.app
Pantheon file: `rawfotra/data/freemasonry-circle.js` (`window.FREEMASONRY_CIRCLE_DATA`)

## Honesty contract (v6.8 — from the live audit; do not regress)

- **Answer the actual question.** `analyzeQuestion()` runs before any teaching
  is chosen, in council AND 1-on-1 chat. Computable tasks (NPV, Bayes/base-rate,
  arithmetic, cash-timing) are computed deterministically with working shown;
  the decisive number leads the brief, verdict and directives.
- **Never fake analysis.** Live-fact and document requests are declined by
  name offline (`analysis.blocked` → no verdict, no directives, no sensitivity).
  Silent engine fallback is forbidden: `report.mode` records requested vs
  delivered with the reason, and provenance displays it.
- **Simulation semantics.** The Monte Carlo is "Council weight sensitivity" —
  conviction stability, never outcome probability or a forecast; limitation
  text sits beside the number; gated off when the task was declined.
- **Word limits are honored** with a hard-capped short answer; ceremony folds
  into a details element.
- **Memory provenance:** generated counsel is labeled as generated advice in
  every prompt that carries it — it never becomes verified fact.
- The audit regression suite (C01–C10, C01R, S01–S02) lives in session
  tooling and must stay green: NPV −$7.8315m / +$53.6142m / break-even
  $16.2745m, PPV 15.3846%, 391 with working, both C03 gap readings ($2m/$8m).

## Supreme Council consensus (v6.5+, extended v6.6)

The Council view produces the "Consensus of the Supreme Council": a sectioned
ruling (preamble/themes, debate, convergence, dissents, risks, verdict,
directives, minority, conditions, Monte Carlo trial, confidence). Both engines
fill the SAME report shape — `buildOfflineConsensus()` on-device, or the
structured-output synthesis in `runClaudeCouncil()` with the offline builder
as its fallback. New sections or engines must keep filling that shape;
`renderConsensus()` and the Markdown export consume only the report object.
The Monte Carlo trial (`runMonteCarlo`) is engine-independent, seeded and
deterministic; it perturbs the report's own weights — never present it as a
forecast of the world. History: last 10 reports in `localStorage` key
`freemasonry-circle.council.history`; admin activity log in
`freemasonry-circle.admin.log` (device-local, exportable from the admin
dashboard in Settings). Selection cap is 10 seats; all 66 members permanent.

## Locked built-in seats (v6.4)

These 13 are permanent members of `rawfotra/data/freemasonry-circle.js`.
Do not remove. Do not rename ids. Do not duplicate via Import / `customExperts`.
Do not overwrite `kerry-adler` or `charlie-munger`.

| id | name | epithet | category |
|---|---|---|---|
| lee-kuan-yew | Lee Kuan Yew | The Institution Builder | leadership |
| deng-xiaoping | Deng Xiaoping | The Sequencer | leadership |
| george-marshall | George C. Marshall | The Organizer of Victory | leadership |
| hyman-rickover | Hyman G. Rickover | The Unforgiving Engineer | innovation |
| jean-monnet | Jean Monnet | The Quiet Architect | leadership |
| ibn-khaldun | Ibn Khaldun | The Cycle Reader | philosophy |
| mary-parker-follett | Mary Parker Follett | The Integrator | leadership |
| katherine-graham | Katharine Graham | The Publisher Who Held | modern |
| peter-drucker | Peter Drucker | The Inventor of Management | innovation |
| warren-buffett | Warren Buffett | The Capital Allocator | modern |
| carl-von-clausewitz | Carl von Clausewitz | The Dialectician of War | strategy |
| niccolo-machiavelli | Niccolò Machiavelli | The Clerk of Power | strategy |
| anwar-sadat | Anwar Sadat | The Breaker of the Freeze | leadership |

If asked to add an expert who matches one of these names, deepen the existing object — do not create a second id.
If asked to reset the pantheon, keep these 13 and the original 53.
Custom experts belong only in `localStorage` key `freemasonry-circle.customExperts` via the in-app form / Import. Built-in seats do not go there.

## How to add a *new* permanent seat later

1. Research with the RAWFOTRA Council Member protocol (paraphrase only, 5 principles, 10 wisdom keys, failure signature, 3–5 doctrine).
2. Append to `FREEMASONRY_CIRCLE_DATA.members` in `data/freemasonry-circle.js`.
3. Add Codex exemplars only if the new mind teaches a first principle the Codex does not already carry.
4. Bump the public count and `sw.js` cache name.
5. Add the id to this table.

## House rules

- Original paraphrase. No verbatim quotations in member objects.
- Category keys only: philosophy, strategy, leadership, science, innovation, art, literature, spirit, modern.
- Wisdom keys exact: adversity, purpose, fear, ambition, discipline, leadership, relationships, creativity, failure, happiness.
