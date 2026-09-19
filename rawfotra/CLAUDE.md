# RAWFOTRA — Claude Code standing instructions

App root: `rawfotra/`
Live: https://rawfotra.vercel.app
Pantheon file: `rawfotra/data/freemasonry-circle.js` (`window.FREEMASONRY_CIRCLE_DATA`)

## Supreme Council consensus (v6.5)

The Council view produces the "Consensus of the Supreme Council": a sectioned
ruling (preamble/themes, convergence, dissents, risks, verdict, directives,
minority, conditions, confidence). Both engines fill the SAME report shape —
`buildOfflineConsensus()` on-device, or the structured-output synthesis in
`runClaudeCouncil()` with the offline builder as its fallback. New sections or
engines must keep filling that shape; `renderConsensus()` and the Markdown
export consume only the report object. History: last 10 reports in
`localStorage` key `freemasonry-circle.council.history`.

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
