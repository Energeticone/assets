# kerryO

**kerryO** is the *Second Brain Playbook* as an installable iOS app — a brain that
files itself. You talk in plain language; it reads, links, and files into plain
Markdown you own. The app is the field playbook in your pocket: *what to type in
each situation*, one tap to copy.

> The wordmark is lowercase **kerry** + a large **O** — the "O" is a glowing
> second-brain node (violet → coral).

## Runs on iOS

kerryO is a **Progressive Web App (PWA)** — the same zero-dependency, no-build
approach used elsewhere in this repo. On iPhone/iPad:

1. Open `index.html` in **Safari**.
2. Tap **Share** → **Add to Home Screen**.
3. Launch from the home-screen icon — it runs **full-screen and offline**, with
   its own icon, splash, and status bar, indistinguishable from a native app.

The app also shows an in-app "Add to Home Screen" hint on iOS until installed.

## What's inside

A single self-contained `index.html` (inline CSS + JS) with a native-feeling
iOS shell:

- **Bottom tab bar** — *Plays · Rhythm · Memory*.
- **Plays** — the `/save` habit pinned up top, a live search box, and every
  situation card with a **Copy** button (Clipboard API + haptic feedback + toast).
- **Rhythm** — the ten-minute weekly maintenance loop.
- **Memory** — how the Markdown-backed memory works, and why it compounds.
- Safe-area insets for the notch and home indicator, tap states, and offline
  caching via `sw.js`.

| File | Purpose |
| --- | --- |
| `index.html` | The whole app (shell, views, logic, styles) |
| `manifest.webmanifest` | PWA metadata — name, icons, standalone display |
| `sw.js` | Service worker — offline-first app-shell cache |
| `icons/` | App icons (192, 512, maskable 512, apple-touch 180) |

## The plays

| Situation | Type this |
| --- | --- |
| End of a working session (**the only habit that matters**) | `/save` |
| You read something good | `ingest <url or file>` |
| You've hoarded a pile | `ingest all of these` |
| You're trying to remember | `what do you know about <anything>?` |
| A hard decision that matters | `/think <your hard question>` |
| You want it researched hands-off | `/autoresearch <topic>` |
| The graph feels messy | `lint the wiki` |

Built on the LLM-wiki pattern · plain Markdown · yours forever.
