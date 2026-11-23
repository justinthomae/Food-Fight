# Food Fight on the App Store and Google Play

The apps are the website in a Capacitor shell (`app/`). The same files, the same Supabase project, the same
online rooms, so app players and web players meet in the same matches. Everything builds on GitHub, nothing
needs a Mac: **Actions → Food Fight apps → Run workflow**.

Without any secrets the workflow already builds both apps (an unsigned Android bundle you can download from
the run, and an iPhone compile check). Add the secrets below and the same run signs them and sends them to
TestFlight and Google Play internal testing.

## What you need to do (once)

### Apple (App Store)
1. Join the Apple Developer Program (USD 99 a year) if the Grudge Match account isn't in it already.
2. App Store Connect → Apps → **+** → New App: iOS, name **Food Fight**, bundle id
   **com.grudgematchgames.foodfight** (register it under Certificates, Identifiers & Profiles → Identifiers first).
3. Users and Access → Integrations → App Store Connect API → generate a key with **App Manager** access.
   Download the `.p8` file (only offered once).
4. GitHub repo → Settings → Secrets and variables → Actions → New repository secret, four of them:
   - `ASC_KEY_ID`: the key's id
   - `ASC_ISSUER_ID`: the issuer id shown above the key list
   - `ASC_KEY_P8`: open the `.p8` file in a text editor and paste all of it
   - `APPLE_TEAM_ID`: Membership details → Team ID

   (If Broadside's keys are already in the BCSS repo, the same values work here.)

### Google (Play)
1. Play Console (one-off USD 25 developer fee) → Create app → **Food Fight**, game, free.
2. An upload key: the Broadside one can be reused, or make one. Secrets:
   `ANDROID_UPLOAD_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`.
3. The very first upload has to be done by hand: run the workflow, download `foodfight-android` from the run,
   and upload the `.aab` in Play Console → Testing → Internal testing.
4. After that, add `PLAY_SERVICE_ACCOUNT_JSON` (a Google Cloud service account invited in Play Console →
   Users and permissions) and every run uploads to internal testing by itself.

### Supabase
Run `supabase/migrations/20261123000009_ff_progress_daily_ranked.sql` in the SQL Editor (it also adds the
in-app data deletion used by the apps).

## Review checklist

| Requirement | Status |
|---|---|
| Sign in with Apple if Google/Facebook sign-in is offered | The app shows **email sign-in only** (the web Google/Facebook buttons are hidden in the app, because their redirect can't return to it), so Sign in with Apple isn't required. Adding native Google + Apple sign-in later is the Broadside pattern. |
| In-app account deletion | Friends → **Delete my Food Fight data** (`ff_delete_my_data`). The shared Grudge Match login stays and the screen says so. |
| User-generated content | No free-text chat; emotes are fixed lines. Player names are free text (14 characters) and shown to others: a name filter plus Report/Block on the player card are still to do before submitting. |
| Purchases / ads | None. |
| Privacy policy | `https://foodfight.grudgematchgames.com/privacy.html`, linked in Settings. |
| Privacy answers | Data linked to the user: email, user id, name, gameplay content (scores), friends. Not used for tracking. No analytics, no ads. |
| Age rating | No purchases, no ads, no chat; online play with other users (names visible). |
| No third-party brands, no placeholder art | Icon is upscaled from the 512 px web icon: replace `app/resources/icon-only.png` with a crisp 1024 px original before submitting. |
| Works offline or fails politely | Practice works offline; online, leaderboards and sign-in show messages when offline. |

## Not done yet (later passes)
- Live updates (OTA). For now every game update needs a new store build: run the workflow after a release.
- Push notifications for invites (web invites still arrive while the app is open).
- Invite links opening the app (`/.well-known/apple-app-site-association` and `assetlinks.json`).
- Haptics through `@capacitor/haptics` (the web vibration setting works on Android already).
- Store screenshots and listing text (`docs/STORE_LISTING.md`).
