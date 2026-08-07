# 🏛️ The Titans — talk with history's greatest minds

A self-contained replica of the [thetitans.app](https://thetitans.app/explore) explore
experience: browse **51 legendary mentors** — philosophers, strategists, scientists,
artists, writers — open any of them, and have a **1-on-1 mentoring conversation** in
their own voice. Built so the roster is pure data: adding a **modern-day expert** is a
form in the app or a few lines of JSON.

## Features

- **Explore page** — searchable, filterable grid of 51 titans across 9 categories
  (Philosophy, Strategy & Command, Leadership & Statecraft, Science, Innovation &
  Enterprise, Art & Music, Literature, Spirit & Wisdom, Modern Titans), each with a
  gradient medallion, epithet, and era.
- **Rich profiles** — biography, five core teachings, notable works, and suggested
  starter questions for every figure.
- **1-on-1 chat, two engines:**
  - **Built-in wisdom engine** (default, offline, zero setup) — replies are composed
    from each titan's curated, in-voice wisdom bank: ten themes (adversity, purpose,
    fear, ambition, discipline, leadership, relationships, creativity, failure,
    happiness) matched to your message by keyword, with principle-based improvisation
    as a fallback.
  - **Claude AI engine** (optional) — real conversational AI in each titan's voice via
    the Anthropic API. Paste your own API key in **Settings**; it is stored only in
    your browser's localStorage and sent only to `api.anthropic.com` (the app calls
    the Messages API directly with streaming). Default model: Claude Opus 5.
- **Daily wisdom** — a teaching from the pantheon, rotating by date.
- **Add modern experts** — the **+ Add expert** button opens a form (name, epithet,
  bio, teachings, voice, greeting, starter questions, optional wisdom bank). Custom
  experts are saved in your browser, get their own chat with both engines, can be
  edited or removed, and can be **exported/imported as JSON**.
- **Deep links** — `#/titan/<id>` opens a profile, `#/chat/<id>` opens a conversation.
- **Zero dependencies** — vanilla HTML/CSS/JS, no build step, no external requests
  (except the optional Claude API call you configure).

## Run it

It's a static site — open `index.html`, or serve the folder:

```bash
cd titans
python3 -m http.server 8000
# open http://localhost:8000
```

## Adding experts permanently (`data/titans.js`)

Everything on the explore page comes from `window.TITANS_DATA` in
[`data/titans.js`](data/titans.js). To add an expert for every visitor (rather than
just your browser), append an object to the `titans` array:

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
degrade gracefully — but the more you provide, the deeper the persona: `principles`
and `wisdom` feed the offline engine, and every field feeds the AI engine's system
prompt. The fastest path: add the expert in the app's form, **Export custom experts**,
and paste the resulting JSON objects into the array.

To add a category, append `{ key, label }` to the `categories` array in the same file.

## How the chat engines work

**Wisdom engine** (`app.js`): scores your message against per-theme keyword lists,
returns the titan's curated paragraph for the best-matching theme, and otherwise
improvises around one of their five principles (rotating by a message hash so replies
vary). Handles greetings, "who are you?", and thanks as special intents.

**Claude engine** (`app.js`): builds a system prompt from the titan's data (identity,
era, bio, teachings, voice, mentoring guidelines), sends the recent conversation to
`POST https://api.anthropic.com/v1/messages` with `stream: true` and the
`anthropic-dangerous-direct-browser-access` header, and streams tokens into the reply
bubble. Errors (bad key, network, refusal) surface inline with a hint.

All persona content is original writing that paraphrases each figure's documented
ideas — no verbatim quotations.

## Deployment

Deployed by `.github/workflows/pages.yml` alongside TravelNow: the Pages artifact is
assembled with TravelNow at the site root and this app under **`/titans/`**.
