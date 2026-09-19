# 🏛️ RAWFOTRA v6.5 — a Magnetic Glass Initiative

Counsel from history's greatest minds.

A self-contained counsel experience: browse **66 legendary minds — historic and living** — philosophers, strategists,
scientists, artists, writers — chat 1-on-1 with any of them, or **convene your Supreme Council**:
ask one question, seat up to thirteen minds, and receive each voice's considered
answer plus the **Consensus of the Supreme Council** — a deep, sectioned ruling with
convergence, dissents, risks, verdict, directives, a minority opinion and the
conditions to reconvene. Built so the roster is
pure data: adding a **modern-day expert** is a form in the app or a few lines of JSON.

## Features

- **Explore page** — searchable, filterable grid of 66 minds across 9 categories
  (Philosophy, Strategy & Command, Leadership & Statecraft, Science, Innovation &
  Enterprise, Art & Music, Literature, Spirit & Wisdom, Modern Minds), each with a
  gradient medallion, epithet, and era.
- **Rich profiles** — biography, five core teachings, distilled **first principles**
  (see *The doctrine layer* below), notable works, and starter questions.
- **The Supreme Council** ⚖ — the centerpiece. Ask one question, seat up to **13 minds**, and:
  1. *(optional, Claude engine)* a **deep research pass** runs live web research on
     the question and briefs every council member;
  2. each mind deliberates **individually** — reasoning as if they were alive
     today, from their own documented principles and lived experience — and each
     voice card carries the member's **vote** (concurs / concurs with caution /
     dissents in part);
  3. a synthesis pass drafts the **Consensus of the Supreme Council** — a formal,
     sectioned ruling: the question as heard (with detected themes), points of
     convergence (credited to their holders), genuine dissents with a resolution,
     a risk register, a 200–400-word verdict, five to seven horizon-tagged
     directives, a minority opinion, conditions to reconvene, and a confidence
     seal (unanimous / strong consensus / a divided bench).
  Past consensus reports are kept on this device (last 10) and can be reopened
  from the setup screen; every report copies out as Markdown.
- **1-on-1 chat, two engines:**
  - **Built-in wisdom engine** (default, offline, zero setup) — replies composed from
    each mind's curated, in-voice wisdom bank: ten themes matched to your message by
    keyword, with principle-based improvisation as a fallback. The Council works
    offline too, with a teaching-based synthesis.
  - **Claude AI engine** (optional) — real conversational AI in each mind's voice via
    the Anthropic API. Paste your own API key in **Settings**; it is stored only in
    your browser's localStorage and sent only to `api.anthropic.com`. Default model:
    Claude Opus 5.
- **The Codex** — first principles of the whole pantheon, distilled across the 66
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
- **Deep links** — `#/mind/<id>` opens a profile, `#/chat/<id>` opens a conversation.
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

## Install it as an app (iPhone / iPad / Android / desktop)

RAWFOTRA is a full progressive web app: `manifest.webmanifest`, app icons in
`icons/`, and a service worker (`sw.js`) that precaches the shell and answers
network-first, so the installed app updates on the first online launch and
keeps working offline (the built-in wisdom engine needs no connection; the
Claude engine needs one).

On an **iPhone or iPad**: open the site in Safari → tap **Share** → **Add to
Home Screen**. It launches fullscreen with its own icon, keeps its own
settings, memory and chat history, and works offline. On **Android/desktop
Chrome**, use the install prompt in the address bar.

Note: iOS gives the installed app its **own separate storage** — settings,
memory, chats and custom experts you created in Safari don't carry over
automatically. To move custom experts across, use **Export** in Safari and
**Import** inside the installed app (the export button uses the iOS share
sheet in the installed app).

For a native App Store build, wrap this folder with
[Capacitor](https://capacitorjs.com) (`npx cap add ios`) on a Mac with Xcode —
no code changes are needed; the app is self-contained static files.

## Adding experts permanently (`data/freemasonry-circle.js`)

Everything comes from `window.FREEMASONRY_CIRCLE_DATA` in [`data/freemasonry-circle.js`](data/freemasonry-circle.js). To
add an expert for every visitor (rather than just your browser), append an object to
the `members` array:

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
Supreme Council goes further: it decomposes the question into themes, clusters
members' principles into convergence points (rare-stem weighted), scores every
member along four tension axes (tempo, self/institution, principle/consequence,
risk) to surface genuine dissents, mines doctrine for a risk register, composes a
verdict from the assembled material, and issues horizon-tagged directives — all
deterministic for a given question and bench, all traceable to member corpora.

**Claude engine** (`app.js`): builds a system prompt from the mind's data (identity,
era, bio, teachings, voice, mentoring guidelines) and calls
`POST https://api.anthropic.com/v1/messages` directly from the browser with the
`anthropic-dangerous-direct-browser-access` header. 1-on-1 chat streams tokens into
the reply bubble. The Council additionally: runs the optional research pass with the
`web_search` server tool, fans out one deliberation call per member (three at a
time), and finishes with a synthesis call using a deep structured-output JSON schema
(preamble, convergence, dissents, risks, verdict, directives, minority opinion,
conditions, confidence) so the Consensus of the Supreme Council always parses;
any failure falls back to the on-device consensus engine so a full document is
always delivered.

## Deployment

Live in two places, both updated automatically on every push to `master`:

- **https://rawfotra.vercel.app** — the primary link. A Vercel project imported
  from this repository; the root `vercel.json` serves this folder as the site
  root with no build step.
- **https://energeticone.github.io/assets/rawfotra/** — GitHub Pages, deployed
  by `.github/workflows/pages.yml` alongside TravelNow (TravelNow at the site
  root, RAWFOTRA under `/rawfotra/`).

The two URLs are separate origins, so an install or data saved on one does not
carry to the other — pick one (the Vercel link) to share and install from.

## Attribution

Doctrine & codex derivation method adapted from
[AI First Principles](https://aifirstprinciples.org), licensed
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). All principle content in
this repository is original writing distilled from each figure's documented life and
work.
