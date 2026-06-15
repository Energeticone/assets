# iOS-on-Huawei — an iPhone-style messaging experience for HarmonyOS / Huawei

> **Read this first — what this is and what it is not.**
>
> This project gives a Huawei phone (e.g. **Pure 80 Ultra**, HarmonyOS NEXT) an
> **iPhone-style home screen and a working iMessage-style Messages app**, installed
> as a PWA straight from the browser. No Google Play and no Apple ID required.
>
> It is **NOT** an iOS emulator. It **cannot** run real iOS `.app` binaries, and it
> **cannot** connect to Apple's real iMessage network on its own. Those two things
> are impossible on non-Apple hardware — see [Why](#why-it-cant-be-real-imessage-by-itself).
> What it *can* do is look and feel like iOS and provide real, live messaging
> between people who use this app — plus a clean adapter so that **if you add a Mac
> relay box later, real iMessage plugs straight in.**

---

## What you actually get

| Feature | Status |
|---|---|
| iOS-style home screen (springboard, dock, status bar, app icons) | ✅ Works now |
| iMessage-style Messages app (blue/green bubbles, threads, typing) | ✅ Works now |
| Send + receive text in real time | ✅ Works now (Socket.IO) |
| Message history (persists, searchable) | ✅ Works now (SQLite) |
| Photos / files attachments | ✅ Works now (upload/download) |
| Live notifications | ✅ In-app instantly; background via Web Push (optional VAPID) |
| Installable, full-screen, offline shell | ✅ PWA + service worker |
| **Real Apple iMessage to iPhone contacts** | ⚠️ Only with a Mac/iOS **relay box** (adapter included, see `bridge/`) |
| **Running real native iOS apps** | ❌ Impossible on Huawei hardware — see below |

## Why it can't be "real iMessage" by itself

1. **iMessage auth is tied to genuine Apple hardware.** Registering with Apple's
   IDS servers requires device-specific validation data that only real Apple silicon
   + Secure Enclave can produce. Beeper Mini reverse-engineered this in 2023; Apple
   blocked it within days. There is no stable, legal way to do it from a Huawei.
2. **The only durable path is a relay box** logged into your Apple ID — exactly what
   AirMessage and BlueBubbles do, and what a "GG box" is. This project ships a
   `bridge/imessage_relay.py` adapter so you can point it at a BlueBubbles server
   running on a Mac mini and get the real thing. No Mac, no real iMessage — that's
   just how Apple built it.
3. **Real iOS apps** are signed binaries for Apple's OS and chips. No Android/HarmonyOS
   device can execute them. This project gives the *look and feel*, not the binaries.

---

## Architecture

```
   Huawei (HarmonyOS NEXT browser)              Your server (anywhere)
  ┌─────────────────────────────┐            ┌──────────────────────────┐
  │  PWA  (webapp/)             │  Socket.IO │  Flask server.py         │
  │  • iOS springboard          │◄──────────►│  • REST  /api/*          │
  │  • Messages app             │  + REST    │  • realtime events       │
  │  • Web Push notifications   │            │  • SQLite store.py       │
  └─────────────────────────────┘            │  • bridge/ (pluggable)   │
                                             └────────────┬─────────────┘
                                                          │
                                   ┌──────────────────────┴───────────────┐
                                   │ bridge.local      → app-to-app (now)  │
                                   │ bridge.imessage_relay → BlueBubbles   │
                                   │                         on a Mac box  │
                                   └───────────────────────────────────────┘
```

## Quick start

```bash
cd ios-on-huawei
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.pip
python server.py            # serves the app + API on http://0.0.0.0:8770
```

Then on the Huawei:

1. Open `http://<your-server-ip>:8770` in the browser.
2. Pick a handle (your "phone number"/Apple-ID-style ID) when prompted.
3. **Add to Home Screen** → it installs as a full-screen app with an iOS icon.
4. Tap **Messages**, start a thread to another handle, chat in real time.

> Two phones/handles on the same server can message each other right away.

### Optional: background push notifications

Generate VAPID keys once and put them in your environment (see `config.py`):

```bash
python -c "from pywebpush import Vapid01; v=Vapid01(); v.generate_keys(); \
print('PUBLIC', v.public_key_pem()); print('PRIVATE', v.private_key_pem())"
```

Without keys, notifications still work while the app is open (in-app + Notification API).

### Optional: real iMessage via a Mac relay box

1. On a Mac mini/MacBook logged into your Apple ID, install **BlueBubbles Server**.
2. Set `BRIDGE=imessage_relay`, `BLUEBUBBLES_URL`, `BLUEBUBBLES_PASSWORD` (see `config.py`).
3. Restart `server.py`. Your real iMessages now flow into the Huawei app.

## Layout

```
ios-on-huawei/
├── server.py            Flask + Socket.IO app, REST API, static serving
├── store.py             SQLite persistence (users, threads, messages, media, push)
├── config.py            Env-driven config (matches repo convention)
├── requirements.pip     Dependencies
├── bridge/
│   ├── base.py          MessageBridge interface
│   ├── local.py         App-to-app delivery (works now)
│   └── imessage_relay.py BlueBubbles/AirMessage adapter (needs a Mac box)
└── webapp/
    ├── index.html       PWA shell
    ├── manifest.webmanifest
    ├── sw.js            Service worker (offline + push)
    ├── css/ios.css      iOS look & feel
    └── js/app.js        Springboard + Messages SPA
```

## Legal / honest note

This is for **your own messages on your own device** — the same interoperability use
case as AirMessage/BlueBubbles. It does not crack, spoof, or impersonate Apple
services. The relay path uses your own Apple device and Apple ID.
</invoke>
