# AirDrop → Huawei bridge

> **Goal:** make a file AirDropped from an iPhone end up on your Huawei.
>
> **The honest limit (read this):** a Huawei phone **cannot** appear in an
> iPhone's AirDrop list. AirDrop needs a private Apple Wi-Fi mode called **AWDL**,
> and that requires putting a Wi-Fi chip into a special low-level mode that
> HarmonyOS/Android phones do not allow. No app installed on the Huawei can change
> that — it's a radio/driver lock, not a software gap.
>
> What *is* possible: a small **Linux helper box** appears in your iPhone's AirDrop
> list as the recipient, catches the file, and this bridge forwards it onto your
> Huawei a second later. The iPhone "sees" the box, not the phone directly.

```
  iPhone                 Linux helper box                     Huawei
 ┌────────┐   AirDrop   ┌──────────────────────────┐        ┌──────────┐
 │        │────────────►│ OpenDrop (receives file) │        │ iOS-on-  │
 │        │  (AWDL+BLE) │        ↓ saves to inbox/  │        │ Huawei   │
 └────────┘             │ forwarder.py ────────────┼───────►│ app      │
                        └──────────────────────────┘  Wi-Fi └──────────┘
                              (this folder)          upload   file shows
                                                              up as a msg
```

## Two parts

| Part | What it does | Can it be tested without special hardware? |
|---|---|---|
| **OpenDrop** (the catcher) | Speaks Apple's AirDrop so the iPhone sees a recipient | ❌ Needs a compatible Wi-Fi adapter — see below |
| **`forwarder.py`** (this repo) | Moves received files onto the Huawei via the app | ✅ Yes — plain file-watch + HTTP upload |

## Part 1 — the catcher (OpenDrop) on a Linux helper box

**Hardware you need:** a Raspberry Pi or Linux laptop, **plus a Wi-Fi adapter that
supports monitor mode + active frame injection.** This is the real gating
requirement. Known-working chipsets include Broadcom `bcm43xx` (the Pi's built-in
Wi-Fi works with the `nexmon` patch) and some Atheros `ath9k_htc` USB adapters.
A random USB Wi-Fi stick will likely **not** work — check it supports monitor mode
first. The iPhone must also have AirDrop set to **"Everyone" (or "Everyone for 10
Minutes")** to show an unknown recipient.

**Install (on the helper box, not the phone):**

```bash
# 1. owl — the open AWDL daemon (the hard, hardware-dependent piece)
#    https://github.com/seemoo-lab/owl   (build per its README)
sudo owl -i wlan0            # puts the adapter into AWDL mode

# 2. OpenDrop — the AirDrop protocol itself
pip install opendrop

# 3. Receive into this bridge's inbox folder so the forwarder picks files up
mkdir -p inbox && cd inbox
opendrop receive            # now your iPhone's AirDrop will list this box
```

> OpenDrop and owl are third-party research projects; follow their own docs for
> the exact build steps for your adapter. If `owl` can't start, your Wi-Fi adapter
> doesn't support the required mode — that's the usual failure, and the fix is a
> different adapter, not a code change.

## Part 2 — the forwarder (this repo, fully working)

Point it at the folder OpenDrop saves into and at your running iOS-on-Huawei
server. Each received file is uploaded and appears on the Huawei as a message
from **"AirDrop"** with the file attached.

```bash
pip install -r requirements.pip

export AIRDROP_WATCH_DIR=./inbox          # where OpenDrop drops files
export AIRDROP_SERVER_URL=https://127.0.0.1:8770
export AIRDROP_RECIPIENT=me               # your handle in the Huawei app
python forwarder.py                       # watches forever
```

Forwarded files are moved into `inbox/.forwarded/` so they are never sent twice.

### Config (environment variables)

| Variable | Default | Meaning |
|---|---|---|
| `AIRDROP_WATCH_DIR` | `./inbox` | Folder OpenDrop saves received files into |
| `AIRDROP_SERVER_URL` | `https://127.0.0.1:8770` | The iOS-on-Huawei server |
| `AIRDROP_RECIPIENT` | `me` | Handle on the Huawei that receives the files |
| `AIRDROP_SENDER` | `AirDrop` | Display name shown as the sender |
| `AIRDROP_POLL_SECONDS` | `2` | How often to scan the folder |
| `AIRDROP_VERIFY_TLS` | `0` | `1` to verify TLS (off for the self-signed cert) |

## What this does and does not give you

- ✅ AirDrop a photo/file from the iPhone → it appears on the Huawei, hands-free.
- ✅ Uses the app you already have; files show up in Messages as attachments.
- ❌ The Huawei itself never appears in AirDrop — the helper box does.
- ❌ Not tested end-to-end here: the OpenDrop/owl half needs real Wi-Fi hardware
  this build environment doesn't have. The `forwarder.py` half **is** tested.
