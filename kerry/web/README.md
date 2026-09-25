# Kerry — web app

**Own the learning. Rent the model.**

A self-contained, offline-first web app (PWA) that runs the Kerry learning-loop
architecture entirely in your browser — no server, no API key. It's the browser
edition of the [reference architecture](../README.md): Kerry is not a model, it's
the loop that sits on top of a swappable generalist model and compounds a firm's
**human capital** (owned knowledge + human-set goals) and **token capital** (the
veteran's accumulated lessons).

## What you can do

- **Watch the hill-climb.** Run cycles and watch the private-eval score and token
  capital rise together as the loop learns from real traces.
- **Run the sovereignty test.** Swap the generalist model out and watch the eval
  score hold — because the value lives in the loop the firm owns, not the model.
- **Inspect the capital.** See the veteran's learned lessons, the institutional
  knowledge base, and the live trace log.
- **Make it your firm.** Edit the knowledge base and tasks as JSON; your loop and
  its learning are saved on your device and compound across reloads.

## Run it

It's pure static files — no build step.

```bash
cd kerry/web
python3 -m http.server 8000     # then open http://localhost:8000
```

Or just open `index.html` directly in a browser (the service worker is skipped on
`file://`, everything else works).

### Deploy

Vercel-ready (`vercel.json`). Point a Vercel project at `kerry/web/` as its root
directory, or `vercel deploy` from this folder. Any static host works.

## Architecture (mirrors the Python reference)

| Thesis | Module |
|---|---|
| Institutional memory, queried efficiently | `KnowledgeBase` (`engine.js`) |
| The company veteran that survives a model swap | `Veteran` |
| Private evals against business outcomes | `PrivateEvals` |
| A private RL environment learning from real traces | `RLEnvironment` |
| Swap the generalist without losing the veteran | `GENERALISTS` + the model selector |
| Human + token capital, compounding | `CapitalLedger` |
| The hill-climbing machine | `Kerry` |
| Learning as a durable, owned asset | `localStorage` |

The bundled generalists are deterministic offline stand-ins so the sovereignty
test is reproducible with no key. The same seam takes a frontier model (e.g.
Claude) in production — the loop above it does not change. That is the point.

## Files

- `index.html` — the single-page UI
- `engine.js` — the Kerry loop (a faithful JS port of the Python reference)
- `seed.js` — the sample firm (a cold-chain logistics advisory)
- `app.js` — UI controller, chart, persistence, sovereignty test
- `styles.css` — dark-first, light-mode aware, responsive
- `sw.js` / `manifest.webmanifest` / `icons/` — PWA (installable, offline)
