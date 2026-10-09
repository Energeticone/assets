# TipClip Android app

The Android counterpart to `ios/` — both sides of TipClip with **Google Pay**
and **Samsung Pay** in mind:

- **Tip tab** — tapping a clip launches the app directly (Android routes the
  tag's `https://tipcl.ip/t/<clipId>` NDEF record via `NDEF_DISCOVERED`);
  manual clip-code entry works everywhere. The pay button brands itself
  **Samsung Pay** (Galaxy + SDK), **Google Pay** (device sheet available), or
  plain card.
- **My Clip tab** — three-step wearer onboarding and the live earnings
  dashboard.
- **Settings** — demo mode (default, runs with no server), server URL, reset.

```
android/
├── settings.gradle.kts / build.gradle.kts / gradle.properties
└── app/
    ├── build.gradle.kts            Compose + play-services-wallet
    └── src/main/
        ├── AndroidManifest.xml     NFC + App Link intent filters, Google Pay meta-data
        └── java/app/tipclip/android/
            ├── MainActivity.kt     Compose root, NFC/deep-link intent handling
            ├── AppState.kt         Prefs-backed state (demo mode, wearer, history)
            ├── Api.kt              TipClipApi: LiveApi (HTTP) · DemoApi (on-device)
            ├── Models.kt / NfcReader.kt
            ├── wallet/GooglePay.kt    Google Pay API wiring (Stripe gateway token)
            ├── wallet/SamsungPay.kt   Samsung Pay SDK stub + integration notes
            └── ui/Screens.kt       Home · TipSheet · Onboarding · Dashboard · Settings
```

## Run it

Open `tipclip/android/` in **Android Studio** (Koala+ / AGP 8.5); let it
generate the Gradle wrapper, sync, and run on an emulator or device. **Demo
mode is on by default** — enter clip code `demo`, tip Marcus, then onboard as
a wearer and watch the dashboard. For the real backend run
`node tipclip/server/server.js` and turn demo mode off (the default URL
`http://10.0.2.2:8787` reaches your machine's localhost from the emulator).

## Wallet status

| Wallet | No-install path (tap → browser) | In-app |
|---|---|---|
| **Google Pay** | ✅ Chrome surfaces it on the web tip page via the Payment Request API | Wired: `GooglePay.kt` builds the `IsReadyToPay`/`PaymentDataRequest` JSON with a Stripe `tokenizationSpecification`; set your Stripe publishable key, switch `ENVIRONMENT_TEST`→`PRODUCTION` after Google Pay Console approval |
| **Samsung Pay** | ✅ Samsung Internet surfaces it on the web tip page via the same API (`https://spay.samsung.com`) | Stub: the Samsung Pay SDK jar comes from Samsung's developer portal, not Maven — drop it in `app/libs`, register the app (INAPP_PAYMENT) in the portal, and fill in `SamsungPay.kt` |
| Card fallback | ✅ | ✅ plain pay button |

The prototype settles tips server-side (mock provider) after the tap; in
production the wallet token confirms the Stripe PaymentIntent whose
`clientSecret` is already returned by `POST /api/tip`.

**Not compiled here** — this environment has no Android SDK. The project
targets AGP 8.5 / Kotlin 2.0 / SDK 35; expect possible minor fix-ups on first
sync, same caveat as the iOS project.

## Production TODOs

- Host `/.well-known/assetlinks.json` on the tip domain so the `autoVerify`
  App Link opens the app without the disambiguation sheet.
- Google Pay & Wallet Console registration; replace the test environment and
  publishable key in `GooglePay.kt`.
- Samsung Pay portal registration + SDK jar; implement `startInAppPay`.
- Push notifications (FCM) alongside the SMS receipts.
