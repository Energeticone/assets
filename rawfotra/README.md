# 🏛️ RAWFOTRA x1 — counsel from history's greatest minds

An expanded, self-contained replica of the [thetitans.app](https://thetitans.app/explore)
explore experience: browse **51 legendary minds** — philosophers, strategists,
scientists, artists, writers — chat 1-on-1 with any of them, or **convene a council**:
ask one question, choose up to ten experts, and receive each expert's considered
answer plus a **consolidated view with three recommendations**. Built so the roster is
pure data: adding a **modern-day expert** is a form in the app or a few lines of JSON.

## Features

- **Explore page** — searchable, filterable grid of 51 minds across 9 categories
  (Philosophy, Strategy & Command, Leadership & Statecraft, Science, Innovation &
  Enterprise, Art & Music, Literature, Spirit & Wisdom, Modern Titans), each with a
  gradient medallion, epithet, and era.
- **Rich profiles** — biography, five core teachings, distilled **first principles**
  (see *The doctrine layer* below), notable works, and starter questions.
- **The Council** ⚖ — the centerpiece. Ask one question, seat up to **10 minds**, and:
  1. *(optional, Claude engine)* a **deep research pass** runs live web research on
     the question and briefs every council member;
  2. each expert deliberates **individually** — reasoning as if they were alive
     today, from their own documented principles and lived experience;
  3. a synthesis pass produces a **consolidated view** (where the council converges
     and where it splits) and **exactly three recommendations**, each stated first-principles
     style: a bold imperative, the observation and consequence behind it, and the
     council voices it draws from.
  The report can be copied out as Markdown.
- **1-on-1 chat, two engines:**
  - **Built-in wisdom engine** (default, offline, zero setup) — replies composed from
    each mind's curated, in-voice wisdom bank: ten themes matched to your message by
    keyword, with principle-based improvisation as a fallback. The Council works
    offline too, with a teaching-based synthesis.
  - **Claude AI engine** (optional) — real conversational AI in each mind's voice via
    the Anthropic API. Paste your own API key in **Settings**; it is stored only in
    your browser's localStorage and sent only to `api.anthropic.com`. Default model:
    Claude Opus 5.
- **The Codex** — first principles of the whole pantheon, distilled across the 51
  minds and chained into a sequence; each entry is an observation, its consequence,
  and one imperative, credited to the exemplar minds who embody it.
- **Memory** ✦ — every question you ask (chat and council) and every counsel the
  council produces is remembered — **stored only in this browser** — and folded
  back into the knowledge set: mentors greet returning themes instead of repeating
  themselves, "what do you remember about me?" gets a real answer, and with the
  Claude engine every mentor's system prompt carries a quiet memory brief (your
  recurring themes, recent questions, and counsel already given) so advice builds
  on your history instead of starting cold. Toggle and a **Forget everything**
  button live in Settings.
- **Insight+** 🔎 — ties into your Claude capabilities to *always check for more
  insight and knowledge*: with the Claude engine on, mentors get a live web-search
  tool and consult today's world whenever current facts would strengthen their
  counsel (woven in, in-voice), and the council's deep research pass defaults on.
- **Daily wisdom** — a teaching from the pantheon, rotating by date.
- **Add modern experts** — the **+ Add expert** button opens a form (name, epithet,
  bio, teachings, voice, greeting, starters, optional wisdom bank). Custom experts
  live in your browser, are fully chat- and council-capable with both engines, can be
  edited or removed, and can be **exported/imported as JSON**.
- **Deep links** — `#/titan/<id>` opens a profile, `#/chat/<id>` opens a conversation.
- **Zero dependencies** — vanilla HTML/CSS/JS, no build step, no external requests
  (except the optional Claude API calls you configure).

## The doctrine layer (how the knowledge set is derived)

The persona knowledge is layered, and the deeper layers follow the derivation method
of [AI First Principles](https://aifirstprinciples.org) (CC BY 4.0) — a small chained
set of named principles, each built as **observation → consequence → one bold
imperative**, backed by evidence:

1. **Wisdom bank** — per mind, ten in-voice mentoring passages (one per life theme),
   grounded in the figure's documented biography and works.
2. **Core teachings** — per mind, five principles with explanations.
3. **Doctrine** — per mind, first principles in AIFP form: the observation their life
   kept proving, its consequence, and the imperative that follows.
4. **Codex** — pantheon-wide first principles distilled *across* minds, chained into
   a logical thread, each crediting its exemplars.

All of it is **original writing** that paraphrases each figure's documented ideas —
no verbatim quotations. The AIFP attribution covers the *method* (principle
structure, chaining, imperative form), not the content.

## Run it

It's a static site — open `index.html`, or serve the folder:

```bash
python3 -m http.server 8000
# open http://localhost:8000
```

## Adding experts permanently (`data/titans.js`)

Everything comes from `window.TITANS_DATA` in [`data/titans.js`](data/titans.js). To
add an expert for every visitor (rather than just your browser), append an object to
the `titans` array:

```js
{
  id: "grace-hopper",                    // unique kebab-case slug
  name: "Grace Hopper",
  epithet: "The Debugging Admiral",
  years: "1906 – 1992",
  place: "New York",
  category: "modern",                    // existing key, or add one to `categories`
  tags: ["computing", "leadership", "teaching"],
  monogram: "GH",                        // 1–2 letters on the medallion
  palette: { a: "#2f4858", b: "#5b7c99" }, // medallion gradient
  bio: "US Navy rear admiral and computer scientist…",
  knownFor: ["The first compiler", "COBOL", "Popularizing 'debugging'"],
  principles: [
    { title: "Ask forgiveness, not permission",
      text: "If you believe in an idea, build it and show it working." },
    // …aim for 5
  ],
  doctrine: [                            // optional first-principles layer (AIFP form)
    { name: "Permission Is a Queue",
      reasoning: "Institutions defend the present; a working demonstration argues better than a proposal ever can.",
      imperative: "Build it, then show it running." },
  ],
  voice: "Crisp, witty, precise; naval metaphors; impatient with bureaucracy.",
  greeting: "Come in, sit down. What are we building — and who told you it couldn't be done?",
  starters: ["How do I convince a skeptical boss?", "When should I break the rules?"],
  wisdom: {
    // one in-voice paragraph per theme — powers the offline engine.
    // Themes: adversity, purpose, fear, ambition, discipline, leadership,
    //         relationships, creativity, failure, happiness.
    adversity: "…", purpose: "…", fear: "…", /* … */
  },
}
```

Only `id`, `name`, `epithet`, `category`, and `bio` are strictly needed — the engines
degrade gracefully — but the more you provide, the deeper the persona: `principles`,
`wisdom`, and `doctrine` feed the offline engines, and every field feeds the AI
engine's system prompt and council deliberations. The fastest path: add the expert in
the app's form, **Export custom experts**, and paste the JSON into the array.

To add a category, append `{ key, label }` to the `categories` array in the same file.

## How the engines work

**Wisdom engine** (`app.js`): scores your message against per-theme keyword lists,
returns the mind's curated paragraph for the best-matching theme, and otherwise
improvises around one of their principles (rotating by a message hash). The offline
council picks each member's most relevant teachings and selects the three
question-relevant imperatives across the council.

**Claude engine** (`app.js`): builds a system prompt from the mind's data (identity,
era, bio, teachings, voice, mentoring guidelines) and calls
`POST https://api.anthropic.com/v1/messages` directly from the browser with the
`anthropic-dangerous-direct-browser-access` header. 1-on-1 chat streams tokens into
the reply bubble. The Council additionally: runs the optional research pass with the
`web_search` server tool, fans out one deliberation call per member (three at a
time), and finishes with a synthesis call using a structured-output JSON schema so
the three recommendations always parse.

## Deployment

Deployed by `.github/workflows/pages.yml` alongside TravelNow: the Pages artifact is
assembled with TravelNow at the site root and RAWFOTRA x1 under **`/rawfotra/`**.

## Attribution

Doctrine & codex derivation method adapted from
[AI First Principles](https://aifirstprinciples.org), licensed
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). All principle content in
this repository is original writing distilled from each figure's documented life and
work.
