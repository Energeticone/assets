# 🌍 TravelNow — where can your passport take you?

An interactive, installable app + website that shows where any of the world's
**199 passports** can travel **visa-free**, on a live, draggable 3D globe.

This replicates the tool shown in the reference screenshot ("travelnow.info"):
pick your passport and the world recolours instantly to show visa-free,
visa-on-arrival, eTA, e-Visa and visa-required destinations.

![globe preview](icons/icon-512.png)

## Features

- **Interactive globe** — hand-rolled orthographic projection rendered on
  `<canvas>`. Drag to rotate, scroll to zoom, click a country to fly to it.
  No mapping library, no runtime dependencies.
- **Flat map view** — toggle to an equirectangular world map.
- **Passport picker** — searchable list of all 199 passports with flag emojis.
- **Live colouring** — every country is shaded by its visa requirement for the
  selected passport (visa-free / visa on arrival / eTA / e-Visa / visa required).
- **Passport power** — "destinations without a prior visa" score and world rank,
  with a category breakdown you can click to filter.
- **Destination list** — searchable, filterable list with a badge per country
  (e.g. "90 days", "On arrival", "Visa required").
- **Installable PWA** — works offline via a service worker; "Install app" adds
  it to your home screen / desktop as a standalone app.

## Run it

It's a static site — serve the `travelnow/` folder with any static server:

```bash
cd travelnow
python3 -m http.server 8000
# open http://localhost:8000
```

A service worker requires `http://` or `https://` (it won't run from a `file://`
URL), so use a local server rather than double-clicking `index.html`.

### Deploy

Drop the `travelnow/` folder onto any static host (GitHub Pages, Netlify,
Vercel, Cloudflare Pages, S3…). Everything — including the data — is bundled,
so no backend is required.

## Data

`data/passports.json` is the visa-requirement matrix for 199 passports ×
199 destinations, derived from the open
[passport-index-dataset](https://github.com/ilyankou/passport-index-dataset).
`data/world.json` is country geometry from
[Natural Earth](https://www.naturalearthdata.com/) (110m), with ISO-A3 codes and
trimmed coordinate precision for a small payload.

Requirement values are categorised as:

| Source value                | Category        | Colour  |
|-----------------------------|-----------------|---------|
| a number (days) / `visa free` | Visa-free     | 🟢 green |
| `visa on arrival`           | Visa on arrival | 🟦 teal  |
| `eta`                       | eTA             | 🟩 lime  |
| `e-visa`                    | e-Visa          | 🟧 amber |
| `visa required`             | Visa required   | 🟥 red   |
| `no admission`              | No admission    | ⬜ grey  |

> ⚠️ For guidance only. Visa policies change frequently — always confirm with
> the destination's official sources before booking travel.

## Project layout

```
travelnow/
├── index.html              # showcase landing page (the "amazing work")
├── showcase.css            # landing-page styling (dark theme)
├── app.html                # the interactive globe app
├── styles.css              # app styling (light theme, responsive)
├── app.js                  # globe projection, rendering, interaction, PWA
├── manifest.webmanifest    # PWA manifest (start_url = app.html)
├── sw.js                   # offline service worker
├── data/
│   ├── world.json          # country geometry (ISO-A3)
│   └── passports.json      # names + iso2 + 199×199 visa matrix
├── assets/shots/           # rendered preview images for the landing page
└── icons/                  # app icons (192/512/maskable/apple-touch)
```

The landing page (`index.html`) showcases the project and links to the live
tool at `app.html`. Both are served from the same GitHub Pages site.
