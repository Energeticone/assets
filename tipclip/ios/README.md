# TipClip iOS app

The native app for both sides of TipClip:

- **Tip tab** — tap a clip (Core NFC) or enter its code, pick
  $1 / $2 / $5 / $10 / $25 / custom, pay, see your tip history.
- **My Clip tab** — wearer onboarding (about you → payout → claim your clip)
  and the live earnings dashboard.
- **Settings** — demo mode vs the real backend, server URL, account reset.

```
ios/
├── TipClip.xcodeproj      Xcode 16 project (file-system-synchronized groups)
└── TipClip/
    ├── TipClipApp.swift   App entry, AppState (persistence), tab root, URL handling
    ├── Models.swift       Codable mirrors of the server JSON API
    ├── APIClient.swift    TipClipAPI protocol · LiveAPI (HTTP) · DemoAPI (on-device)
    ├── ClipScanner.swift  Core NFC NDEF reading → clip ID
    ├── Views/
    │   ├── HomeView.swift     Tipper home: scan button, manual code, history
    │   ├── TipSheetView.swift Amount picker → pay → success
    │   ├── MyClipView.swift   Onboarding wizard + wearer dashboard
    │   └── SettingsView.swift
    ├── Info.plist         NFC usage string, tipclip:// URL scheme, local ATS
    └── TipClip.entitlements   NFC tag-reading capability
```

## Run it

Requires **Xcode 16+** (the project uses file-system-synchronized groups).

1. `open tipclip/ios/TipClip.xcodeproj`
2. Select your development team under *Signing & Capabilities*.
3. Run. **Demo mode is on by default** — the whole app works in the Simulator
   with no server: on the Tip tab enter clip code `demo`, tip Marcus, then
   watch it land if you onboard as a wearer.

### Against the real backend

1. `cd tipclip/server && node server.js`
2. In the app: Settings → turn off *Demo mode*. In the Simulator the default
   `http://localhost:8787` just works; on a device use your Mac's LAN IP.
   (`Info.plist` has `NSAllowsLocalNetworking` so plain-HTTP localhost works
   during development — remove it for App Store builds.)

### NFC notes

- Tag reading needs a **real iPhone (XS or later)** — the Simulator has no NFC,
  so the app automatically falls back to manual code entry there.
- The *Near Field Communication Tag Reading* capability
  (`TipClip.entitlements`) requires a **paid Apple Developer account**. On a
  free account, signing fails: delete the entitlements file and clear
  `CODE_SIGN_ENTITLEMENTS` in build settings, and use manual entry instead.
- The scanner reads the same `https://tipcl.ip/t/<clipId>` NDEF URI the web
  flow uses, so one encoded clip serves both app and no-app tippers.

## Production TODOs

- **Apple Pay**: `POST /api/tip` already returns a Stripe `clientSecret`; wire
  a `PKPaymentAuthorizationController` (or Stripe's PaymentSheet SDK) to
  confirm it instead of the server-settled prototype flow. Needs a merchant ID
  + certificates in the developer portal.
- **Universal links**: host `apple-app-site-association` on the tip domain so
  tapping a clip opens the app when installed (Safari otherwise). The
  `onOpenURL` handler and `tipclip://` scheme are already in place.
- **Push notifications** alongside the SMS receipts (APNs token per wearer).
- **BLE nearby-wearer discovery** for the v2 powered clips (see
  `hardware/README.md`).
