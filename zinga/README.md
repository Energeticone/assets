# Project Zinga 🎬

**A floating, always-on-top watch companion that rides over anything you're streaming.**

Zinga is a translucent bubble that sits on the edge of your screen, on top of the
video player. Tap it and it blooms into a companion panel where you can:

- 💬 **Chat about the scene** — a context-aware assistant that knows what's on screen *right now*
- 📝 **Read live captions** — every line, timestamped, scrollable
- 📌 **Pin timestamped notes** — jump the player back to any moment with one tap
- 🔒 **Stay spoiler-safe** — Zinga only ever knows up to your current playhead

It's the "chat bubble floating over your show" pattern, built as a **drop-in
overlay**: one `<script>` tag, one `Zinga.mount(...)` call, and it works over any
web player. No framework, no build step, no dependencies.

> This repo ships a **live demo** — a cinematic, Netflix-style mobile player
> (`REELIX`, episode *S1:E7 "Witness"*) with Zinga already riding on top of it.
> The show and its dialogue are fictional, generated for the showcase.

---

## Try it

Open **`app.html`** in a browser (or serve the folder and visit it):

```bash
cd zinga
python3 -m http.server 8080
# → http://localhost:8080/app.html   (the demo)
# → http://localhost:8080/index.html (the landing page)
```

Then:

1. The player auto-starts and the "show" begins streaming captions.
2. The **Zinga bubble** floats on the right edge — **drag it** anywhere; it snaps back to an edge.
3. **Tap it** to open the companion. Try *"recap what I missed"*, *"who is that?"*, or the suggestion chips.
4. Switch to **Captions** to see the live transcript, or **Notes** to pin the current moment and jump back later.

Everything persists to `localStorage`, so your chat and notes are still there next visit.

---

## How it's built

| File | Role |
|------|------|
| `zinga.js` | **The overlay engine.** Self-contained. Mounts a Shadow-DOM-isolated bubble + panel, handles drag/edge-snap, chat, captions, notes, persistence. This is the reusable "system." |
| `app.html` | The demo page — wires the player to `Zinga.mount(...)`. |
| `player.js` / `player.css` | The demo streaming player (synthetic cinematic scene + scripted caption track) exposing a **PlayerAdapter**. |
| `index.html` / `showcase.css` | Marketing / landing page. |
| `sw.js`, `manifest.webmanifest`, `icons/` | PWA shell — installable and offline-capable. |

Zinga lives entirely inside a **Shadow DOM**, so its styles can never collide with
the host page — it truly overlays *any* site.

---

## Embed it on your own player

```html
<script src="zinga.js"></script>
<script>
  Zinga.mount({
    title: 'S1:E7 "Witness"',
    subtitle: 'Zinga · watch companion',
    storageKey: 'my-show-ep7',

    // A PlayerAdapter — everything is optional.
    player: {
      currentTime: () => videoEl.currentTime,     // seconds
      seek:        (t) => { videoEl.currentTime = t; videoEl.play(); },
      onCaption:   (cb) => {                       // stream live captions in
        track.addEventListener('cuechange', () => {
          const cue = track.activeCues[0];
          if (cue) cb(cue.text, videoEl.currentTime);
        });
      },
      onTitle:     (cb) => { /* call cb(newTitle) when the episode changes */ }
    }
  });
</script>
```

### Plugging in a real LLM

By default Zinga ships with an **offline "brain"** — a context-aware, rule-based
responder so it works with zero setup. To route chat to a real model instead,
pass a `responder`:

```js
Zinga.mount({
  player: myPlayer,
  responder: async (message, ctx) => {
    // ctx = { title, time, clock, recentCaptions:[{t,text}], seed }
    const res = await fetch('/api/companion', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message, context: ctx })
    });
    const { reply } = await res.json();
    return reply;   // a string
  }
});
```

Your backend gets the recent captions and current timestamp as context, so the
model can answer "what did I miss?" accurately — and, because it's only ever fed
dialogue up to the current playhead, it stays **spoiler-safe by construction**.
A Claude-backed endpoint (recap / character Q&A / spoiler-safe theories) pairs
especially well with this — keep API keys on the server and expose only the
`/api/companion` route to the browser.

---

## The `Zinga.mount(opts)` API

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `title` | `string` | player title / `"Now Playing"` | Shown in the panel header. |
| `subtitle` | `string` | `"Zinga companion"` | Secondary header line. |
| `storageKey` | `string` | slug of `title` | Namespaces saved chat/notes/dock position. |
| `player` | `PlayerAdapter` | `null` | `{ currentTime, seek, onCaption, onTitle }` — all optional. |
| `responder` | `async (msg, ctx) => string` | offline brain | Chat backend. |

Returns the `Zinga` instance. Handy methods: `.toggle()`, `.pushCaption(text, t)`,
`.addNote(text)`.

---

## Design notes

- **Always on top** — fixed to the viewport at max `z-index`, `pointer-events`
  only on the bubble/panel so the player stays fully usable underneath.
- **Draggable + edge-snap** — grab and fling on mouse or touch; it snaps to the
  nearest side and remembers the dock across sessions.
- **Idle-translucent** — the bubble dims to ~60% opacity so it never blocks the
  picture, and brightens on hover/interaction.
- **Spoiler-safe** — the companion is only ever handed captions up to the current
  timestamp.

Zero dependencies. Vanilla JS. ~1 file to embed.
