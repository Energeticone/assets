# Kerry

**A pioneer AI model that is the learning loop, not the model.**

Kerry is a reference architecture for the firm in an AI-driven economy. The premise:
the real opportunity is not picking the best model — it is building a learning loop
*on top of* models, where the firm's human capital and token capital compound and
stay owned by the firm.

You can offload a task, or even a job. You can never offload your learning. Kerry is
what owning that learning looks like in software.

## The two forms of capital

Every firm now builds two kinds of capital, and Kerry accounts for both:

- **Human capital** — the knowledge, judgment, relationships, ingenuity, and pattern
  recognition of its people. In Kerry: the **knowledge base** (institutional memory)
  and the **tasks** people set (human direction). Without human agency, the loop has
  nothing to climb toward — compute running in circles.
- **Token capital** — the AI capability the firm builds and owns. In Kerry: the
  **Veteran's lessons**, distilled from real in-house traces.

Human capital does not get less valuable as token capital grows. It gets *more*
valuable, because better knowledge and sharper goals are what make the loop climb.
The `CapitalLedger` is built to show the two compounding together.

## The architecture

```
                         a TASK set by people (human capital)
                                      │
                                      ▼
   ┌──────────────────────────  K E R R Y  (the loop you own) ──────────────────────────┐
   │                                                                                     │
   │   Veteran.decide ─► which institutional knowledge to surface   (firm judgment)      │
   │        │                                                                            │
   │        ▼                                                                            │
   │   KnowledgeBase ─► institutional memory, queried efficiently   (human capital)      │
   │        │                                                                            │
   │        ▼                                                                            │
   │  ┌───── the swappable seam ─────────────────────────────────────────────┐          │
   │  │  Generalist.generate ─► prose draft        (commodity: echo|Claude|…) │          │
   │  └───────────────────────────────────────────────────────────────────────┘         │
   │        │                                                                            │
   │        ▼                                                                            │
   │   PrivateEvals ─► grade against business outcomes, not benchmarks                    │
   │        │                                                                            │
   │        ▼                                                                            │
   │   RLEnvironment ─► reward the real trace, distill a durable Lesson  (token capital)  │
   │        │                                                                            │
   │        ▼                                                                            │
   │   Veteran.absorb ─► the firm gets permanently better        (the hill-climb)        │
   │                                                                                     │
   └─────────────────────────────────────────────────────────────────────────────────────┘
```

Every component maps to a line of the thesis:

| Thesis                                                              | Component            |
| ------------------------------------------------------------------ | -------------------- |
| Institutional memory, made queryable, tokens used efficiently      | `knowledge.py`       |
| The "company veteran" that survives a model swap                   | `veteran.py`         |
| Private evals against outcomes that matter to the business         | `evals.py`           |
| A private RL environment that learns from real in-house traces     | `rl.py`              |
| Swap the generalist without losing the veteran (sovereignty)       | `models/`            |
| Human + token capital, compounding                                 | `capital.py`         |
| The hill-climbing machine that ties it together                    | `loop.py`            |
| Learning is a durable, owned asset                                 | `persistence.py`     |

## Run it

No dependencies, no API key required — it runs offline by default.

```bash
cd kerry
python run.py reset          # start the firm from seed knowledge, no lessons
python run.py                # climb the hill, then run the sovereignty test
```

Other commands:

```bash
python run.py climb          # just climb: eval score rises as the loop learns
python run.py sovereignty    # climb, then swap the model and prove the veteran held
python run.py models         # list the swappable generalists
```

### Run the same loop on a frontier model

Nothing about the loop changes — that's the whole point of the swappable seam.

```bash
pip install -r requirements.pip
export ANTHROPIC_API_KEY=sk-ant-...
KERRY_GENERALIST=anthropic python run.py climb   # now drafting on Claude Opus 4.8
```

## What you should see

`climb` shows the mean private-eval score rising cycle over cycle as the Veteran
distills lessons from real traces — the hill-climbing machine compounding. `token_capital`
rises with it; `human_capital` is the owned base the climb stands on.

`sovereignty` then swaps the generalist for a different model and re-measures. The
score **holds**, because the institutional value lives in the loop the firm owns, not
in the commodity model. That is the test of control in the era ahead: you can switch
out the generalist without losing the company veteran.

## Make it your firm

Replace `seed.py` with your own `Knowledge` (institutional facts) and `Task`s (the
goals your people set), point `KERRY_GENERALIST` at whatever model you like, and the
loop is yours. Commit `state/` to version your firm's compounding learning as an
asset you own — independent of any single model's capability.
