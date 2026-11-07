---
name: grudge-store-release
description: Ship a Grudge Match web game to the App Store and Google Play as a Capacitor app — CI signing and uploads without a local Mac, icons and splash, Sign in with Apple, account deletion, chat moderation, server-granted purchases and reward ads, native push, invite deep links, live updates, privacy and store listings. Use when packaging a game as a mobile app, preparing a store submission, or when the user mentions App Store, Google Play, TestFlight, Capacitor, app review, in-app purchases, RevenueCat, AdMob, haptics or OTA updates.
---

# Grudge Match store release

**Broadside is the reference implementation** (`BCSS/Broadside/docs/STORE_RELEASE.md`,
`docs/STORE_LISTING.md`, `capacitor.config.ts`). Copy its patterns; don't reinvent them.
Riot Race (Unity) uses `unity-build-pipeline` for builds but the store checklist below still applies.

Justin can't run command-line tools on his PC, so **everything builds and uploads from GitHub
Actions** (manual "Run workflow" with checkboxes), and setup steps are written as dashboard clicks.

## 1. Shape of the app

- The app is the **same web build** in a Capacitor shell (`npm run build:app` = web build with the
  production server URL baked in). One codebase, one server.
- App id `com.grudgematchgames.<game>` on both stores. Version from `package.json`; build number =
  workflow run number.
- Portrait/landscape lock, safe areas (`env(safe-area-inset-*)`), status bar and splash via Capacitor
  plugins; haptics via `@capacitor/haptics` behind the game's existing reduced-motion/feedback settings.

## 2. CI build and upload

| Secret | Gives |
|---|---|
| `ANDROID_UPLOAD_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD` | Signed `.aab` |
| `PLAY_SERVICE_ACCOUNT_JSON` | Upload to Play internal testing (first upload is manual once) |
| `ASC_KEY_ID`, `ASC_ISSUER_ID`, `ASC_KEY_P8` | Signed iOS build to TestFlight |
| `APPLE_TEAM_ID` | Signing + universal links |

Without secrets the workflow must still prove both apps compile (unsigned `.aab` + simulator build).

## 3. Review blockers (check every one before submitting)

- [ ] **Sign in with Apple** offered on iPhone if Google sign-in is offered (native sheets via `signInWithIdToken` to the shared Grudge Match Supabase; add the bundle id under Apple Client IDs).
- [ ] **In-app account deletion** (deletes the game's profile; the shared Grudge Match login stays because other games use it — say so on screen).
- [ ] **User-generated content** (chat, names): server-side filtering, **Report** and **Block**, an admin queue to act on reports. Prefer fixed quick-chat lines in matches.
- [ ] **Purchases are granted by the server**, never the app: app calls `/api/purchases/sync`, server asks RevenueCat and grants each transaction once; RevenueCat webhook covers closed-app purchases. "Restore purchases" button. Consumable vs non-consumable typed correctly.
- [ ] **Reward ads pay only through AdMob server-side verification** (signature checked), capped per day.
- [ ] No selling on the website version if it would bypass store rules; point to the apps.
- [ ] Privacy policy + terms URLs live on the game's subdomain and linked in Settings; contact `justin@grudgematchgames.com`.
- [ ] Privacy "nutrition label" / Data safety answers match what the code actually collects (analytics, push tokens, account id, purchases).
- [ ] Age rating questionnaire answered for chat, ads and purchases.
- [ ] Works offline or fails politely; no dead buttons; no "beta"/"test" text; no placeholder art.
- [ ] No third-party brand names or references in the app or listing.

## 4. Platform features

- **Invite deep links**: `https://<game>.grudgematchgames.com/?room=CODE` opens the app; serve
  `/.well-known/apple-app-site-association` (team id) and `/.well-known/assetlinks.json` (Play app-signing SHA-256).
- **Push**: web push doesn't work in the app — APNs key (`.p8`) + Firebase FCM service account on the server;
  the app registers its token with the server; tapped invite opens that room; drop dead tokens.
- **OAuth redirect** for browser-sheet sign-in: `com.grudgematchgames.<game>://auth-callback` added to
  Supabase Redirect URLs.
- **Game Center / Play Games** (optional): leaderboard and achievement ids never change once live; verify the
  identity signature on the server.

## 5. Live updates (OTA)

Self-hosted Capgo updater: every deploy publishes `ota/<game>-<version>-n<NATIVE_API>.zip`; apps download in
the background and switch **on next launch or resume, never mid-match**; failed bundles roll back.
**Bump `NATIVE_API` whenever native code, plugins, permissions or Info.plist/AndroidManifest change** — those need
a store build. OTA is for fixes and small improvements only (Apple 3.3.1(b)/2.5.2).

## 6. Store listing and assets

- Sources in `assets/`: `icon-only.png` 1024², Android `icon-foreground.png` + `icon-background.png`,
  `splash.png` 2732²; generate with `@capacitor/assets`. Use `create-game-assets` for art direction consistency.
- Screenshots captured by a Playwright script at each required size (`npm run store:shots`) from real game
  states, not mock-ups.
- Listing text, keywords, privacy answers and rating answers kept in `docs/STORE_LISTING.md`.

## 7. Before tapping Submit

- [ ] TestFlight + Play internal test on a real iPhone and a mid-range Android: install, sign in (each method),
      play a full online match, buy (sandbox) and restore, get a push, open an invite link, delete account.
- [ ] The `grudge-games` polish pass is clean (feel, layout on smallest phone, audio, performance, colour-blind).
- [ ] In-app purchases and Game Center items attached to the app version in App Store Connect.
