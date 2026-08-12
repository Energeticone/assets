# TipClip hardware — the clip itself

## Industrial design

Two wearing styles, one electronics package:

1. **Magnetic badge** — two-piece: face disc + magnet backing plate through the
   fabric (like conference name badges). No holes in uniforms; hospitals and
   hotels prefer this.
2. **Spring clip** — stainless money-clip style that bites onto a pocket,
   lanyard, apron strap, or watch band.

Face options: brushed metal disc (premium, laser-etched "TAP TO TIP 💸" + QR
fallback) or injection-molded ABS (cheap, any color, employer branding).
Target size: 32–38 mm disc, 3–5 mm thick.

**Metal caveat:** NFC doesn't work flat against metal. For the metal version
use an **on-metal NFC tag** (ferrite-shielded inlay) or set the antenna in a
plastic/resin window on the face. The plastic version needs no special tag.

## v1 electronics: passive NFC (no battery, ~$0.15/unit)

| Choice | Recommendation | Why |
|---|---|---|
| Chip | **NTAG 213** (144 B) | Plenty for one URL; cheapest; universally read by iPhone XS+ and Android |
| Upgrade | **NTAG 424 DNA** (~$0.80) | Emits a rolling AES-CMAC code appended to the URL → server rejects cloned/replayed tags |
| Antenna | 25–30 mm round inlay | Reliable tap through a 3 mm face |
| Encoding | Single **NDEF URI record**, then **lock the tag** read-only | One tap = Safari opens the tip page |

### Tag payload

Each clip is encoded with its unique claim URL:

```
https://tipcl.ip/t/<clipId>          e.g. https://tipcl.ip/t/c_8f3ka92b
```

NDEF URI record, byte layout (what any tag-writer app or batch encoder writes):

```
D1 01 <len> 55 04 74 69 70 63 6C 2E 69 70 2F 74 2F <clipId…>
│  │        │  │  └─ "tipcl.ip/t/…" UTF-8
│  │        │  └─ URI prefix code 0x04 = "https://"
│  │        └─ Type "U" (URI)
└─ MB/ME/SR, well-known type
```

Batch encoding at manufacture: any USB NFC writer (ACR122U) + a loop over the
clip-ID CSV; print the matching QR on the face in the same pass. Tags ship
**unclaimed** — the first tap shows "Claim this clip" until a wearer signs up
and claims it, so stock is inert if stolen.

## v2 electronics: BLE beacon add-on (optional, ~$6/unit)

For "tip anyone nearby" without touching:

- nRF52810 or DA14531 SoC, CR2032 coin cell (12–18 months at 1 s advertising).
- Advertises a fixed TipClip service UUID + clip ID in manufacturer data.
- The phone app ranks by RSSI and shows wearers within a few meters.
- BLE is **discovery only** — payment still goes through the same
  `POST /api/tip`; the beacon just replaces the physical tap with a pick-list.

## Cost snapshot (1k units)

| | NFC plastic | NFC metal (on-metal tag) | NFC + BLE |
|---|---|---|---|
| Electronics | $0.15 | $0.80 | $6.50 |
| Housing + magnet/clip | $0.90 | $2.40 | $2.60 |
| **Landed unit cost** | **~$1.05** | **~$3.20** | **~$9.10** |

Which is why v1 ships NFC-only: a giveaway-priced clip with no battery to die
mid-shift, and the tipper never needs an app.
