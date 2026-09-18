# 💸 TipClip — tap to tip in a cashless world

A wearable **clip** (metal or plastic, magnetic or spring-clip backing) for valets,
parking attendants, bellhops, baristas, ushers, dog walkers — anyone who used to
get a couple of folded dollars and now hears *"sorry, I don't carry cash."*

The guest takes out their iPhone, **taps the wearer's clip**, picks
**$1 / $2 / $5 / $10 / $25 / Custom**, confirms with Apple Pay / Google Pay —
done. Both sides get a **text message**: *"You've tipped Marcus $5"* /
*"You just received a $5 tip 💸"*. The money settles to the wearer's bank via an
instant-payout rail (Stripe Instant Payouts, or a Revolut/Wise account).

---

## 1. Why NFC (and where Bluetooth fits)

The brief says "very close Bluetooth," and the *experience* you want — hold the
phone against the clip, something appears — is exactly what **NFC** was built
for. It's the same tech as tap-to-pay:

| | **NFC tag in the clip (recommended)** | BLE beacon in the clip |
|---|---|---|
| Power | **None — passive sticker, works forever** | Coin cell, dies in months |
| Range | ~2 cm (deliberate tap = clear intent) | 1–30 m (which valet am I tipping?) |
| Tipper needs the app? | **No.** iPhone (XS+) auto-reads the tag and opens the tip page in Safari | Yes — background BLE scanning requires an installed app |
| Clip cost | **$0.10–0.40** (NTAG 213/215 inlay) | $5–15 + battery service |
| Android | Same tap behaviour | Works, same app requirement |

So the architecture is:

- **v1 — NFC**: every clip embeds an NFC tag encoded with a unique URL
  `https://tipcl.ip/t/<clipId>`. Tap → tip page opens → pay. No app needed to
  *give* a tip. (A QR code with the same URL is printed on the clip face as a
  fallback for older phones.)
- **v2 — BLE add-on**: an optional powered clip broadcasts the same clip ID
  over BLE advertising. The TipClip app can then show *"Marcus is nearby —
  tip him?"* from across the garage. Nice for drive-away moments; never
  required.

## 2. The two experiences

### Tipper (guest picking up their car)
1. Tap phone on the clip (or scan its QR code).
2. Tip page opens instantly: wearer's first name + photo + role
   ("Marcus — Valet, St. Mary's Hospital").
3. Six buttons: **$1 · $2 · $5 · $10 · $25 · Custom**.
4. Apple Pay / Google Pay sheet → Face ID → **"You've tipped Marcus $5 🎉"**.
5. Optional: enter phone number once to get an SMS receipt; the TipClip app
   remembers your card and favourite amount for one-tap next time.

### Wearer (person with the clip)
1. Signs up in the TipClip app, gets a clip mailed (or picks one up from their
   employer's batch), taps it once to **claim** it.
2. Connects a payout destination — debit card for **Stripe Instant Payouts**
   (money in ~minutes), or a Revolut/Wise/any bank account for standard payout.
3. Every tip → phone buzzes with an SMS + push: *"You just received $5 💸"*.
4. Dashboard shows today / this week / all-time, and payout status.

## 3. Money flow

```
Tipper's Apple Pay ──▶ Stripe PaymentIntent (destination charge)
                          │  platform fee (e.g. $0.30 + 5%) retained
                          ▼
                   Wearer's Stripe Connect Express account
                          │  Instant Payout (1% fee, arrives in minutes)
                          ▼
                   Wearer's debit card / bank (Revolut, Chase, …)
```

- **Stripe Connect Express** is the v1 rail: it handles KYC/onboarding,
  1099-K tax forms, and **Instant Payouts to a debit card** — the
  "Revolut-style instant deposit" the product needs, without building a bank
  integration. Revolut/Wise accounts plug in as ordinary payout bank accounts.
- The tipper's charge appears on **their** bank statement (`TIPCLIP *MARCUS`);
  the wearer's deposit appears on **theirs**. TipClip is the merchant of
  record via Stripe's platform model.
- SMS on both sides via Twilio.

## 4. What's in this folder

```
tipclip/
├── server/            Zero-dependency Node.js backend (runs with plain `node`)
│   ├── server.js      HTTP API + static hosting + /t/<clipId> tap route
│   ├── store.js       JSON-file persistence (swap for Postgres in prod)
│   ├── payments.js    Payment provider abstraction: Mock / Stripe Connect / Revolut notes
│   └── sms.js         SMS abstraction: Mock (console) / Twilio adapter
├── public/            The web app
│   ├── tip.html       Tip page — what an NFC tap opens (works with zero install)
│   ├── signup.html    Wearer onboarding — signup → payout connect → claim clip
│   └── dashboard.html Wearer dashboard — earnings, tips feed, payout status
├── ios/
│   └── TipClipApp.swift  SwiftUI sketch: Core NFC tag reading + BLE nearby-wearer scan
└── hardware/
    └── README.md      Clip industrial design, NFC tag selection, tag encoding, BLE option
```

## 5. Run the prototype

No dependencies — Node 18+ only:

```bash
cd tipclip/server
node server.js
# → TipClip server on http://localhost:8787
```

Then simulate a tap on the demo clip:

- **Tip page** (what the NFC tap opens): http://localhost:8787/t/demo
- **Wearer dashboard**: http://localhost:8787/dashboard.html?wearer=w_demo
- **Wearer onboarding** (signup → payout → claim clip): http://localhost:8787/signup.html

Tip a few dollars from the tip page and watch the dashboard update; "SMS"
messages print to the server console via the mock provider. Set
`STRIPE_SECRET_KEY` / `TWILIO_*` env vars (see `payments.js`, `sms.js`) to swap
in the real rails.

### API

| Method & path | Purpose |
|---|---|
| `GET  /t/:clipId` | The tap target. Serves the tip page for that clip |
| `GET  /api/clip/:clipId` | Public wearer profile + preset amounts |
| `POST /api/tip` | `{clipId, amountCents, tipperPhone?}` → charge, record, SMS both sides |
| `GET  /api/wearer/:wearerId` | Dashboard data: totals, recent tips, payout status |
| `POST /api/signup` | Create wearer + mint an unclaimed clip ID |
| `POST /api/wearer/:id/payout` | Connect payout destination (instant debit card vs bank) |
| `POST /api/clip/:clipId/claim` | Wearer claims a physical clip |

## 6. Production hardening (beyond this prototype)

- Postgres + an ORM instead of the JSON store; idempotency keys on `/api/tip`.
- Stripe webhooks (`payment_intent.succeeded`, `payout.paid`) as the source of
  truth instead of trusting the client round-trip.
- Rate limiting per clip and per device; signed clip URLs (NTAG 424 DNA tags
  can emit a rolling cryptographic code in the URL, killing clone/replay abuse).
- Employer/venue accounts: batch-order clips, team dashboards, tip pooling.
- Apple Pay merchant validation + Google Pay on the web tip page (the
  prototype simulates the payment sheet).
