# Food Fight

A fast multiplayer food-matching battle from Grudge Match Games.
Live at **foodfight.grudgematchgames.com**.

Plain static site: no build step, no framework. Online play runs on Supabase Realtime (broadcast + presence). Leaderboards use one locked-down Supabase table.

```
index.html            page, styles, overlays
js/engine.js          game rules (pure logic, no DOM), shared by site, artifact build and tests
js/app.js             drawing, input, settings, practice mode, online lobby
js/net.js             Supabase Realtime rooms
js/scores.js          leaderboard calls (submit + read)
supabase/migrations/  leaderboard table + functions
js/config.js          Supabase URL + anon key  ← fill in
CNAME                 custom domain for GitHub Pages
tools/build-artifact.py   bundles a single-file practice build
test/net-sim.js       simulated online matches (node)
test/specials-sim.js  bot matches exercising special tiles and items
test/sql-test.mjs     leaderboard migration tests in an in-process Postgres (needs @electric-sql/pglite)
test/dom-smoke.js     two-player end-to-end test over a fake Realtime bus (needs jsdom)
```

## Deploy

### 1. Supabase
You can reuse the BoomTown Supabase project. Using the same project now makes a shared Grudge Match account easy later.

1. Supabase → Project Settings → API: copy the **Project URL** and the **anon / publishable key** into `js/config.js`.
2. Supabase → Realtime → Settings: make sure **"Allow public access"** is on. Food Fight uses public channels named `ff:ROOMCODE`.
   - If you'd rather keep private-only channels, that needs a Realtime authorization policy plus signed-in users, which can be done later alongside shared accounts.
3. Run the leaderboard migration once: paste `supabase/migrations/20261016000001_ff_leaderboard.sql` into the SQL editor (or apply it with the Supabase MCP / CLI). It creates one table, `ff_scores`, and two functions, `ff_submit_score` and `ff_leaderboard`. The table is locked: browsers can only go through those two functions. Everything is prefixed `ff_`, so it can't collide with BoomTown.

### 2. GitHub Pages (same setup as Fliptide and ChipWreck)
1. Push this folder to `justinthomae/FoodFight`. The `CNAME` file already says `foodfight.grudgematchgames.com`, and `.nojekyll` makes Pages serve the files as-is.
2. Repo → Settings → Pages: set Source to "Deploy from a branch", choose `main` and `/ (root)`, then tick **Enforce HTTPS** once it's offered.

### 3. Domain (GoDaddy DNS)
Add a record next to the existing fliptide and chipwreck ones:
`CNAME  foodfight  →  justinthomae.github.io`
It usually goes live within minutes to an hour.

### 4. Check it
Open the site on two devices, tap **Play online → Create a room** on one, and open the invite link on the other.

## How online play works
- **Rooms:** a 4-letter code maps to Realtime channel `ff:CODE`. Presence lists who is in the room, and the earliest joiner is the host. If the host leaves, the next player in line becomes host.
- **Start:** the host broadcasts the roster, a shared random seed and a 3-second countdown. Everyone gets the same starting board and the same rising rows.
- **During play:** each phone runs its own board. About 5 times a second it broadcasts a tiny snapshot (72 characters) so others can draw it. Attacks, hot sauce and knockouts are one-off messages. Bots run on the host's device.
- **Leaving or disconnecting** counts as a knockout. The match ends when one cook is left, then everyone returns to the lobby for a rematch.
- **Traffic:** a 4-player match is roughly 25 small messages per second per room. Check the Realtime quota for your plan if many rooms run at once.

## Leaderboards
- Boards: Duel, Brawl (one per bot skill) and Online, each with Today (last 24 hours), This week and All time. Each cook appears once, with their best score.
- Players are identified by a random device id plus the name they type. Shared Grudge Match accounts can fill the reserved `user_id` column later.
- Server checks: score must be plausible for the game length (at most 120 points/second), one submission per device every 15 seconds, and names are trimmed and cleaned. This stops casual cheating, not a determined one.
- Without Supabase configured, the board shows the player's own games on that device.

## Known limits (v0.1)
- Clients trust each other, with no anti-cheat. That's fine for friends and needs a server referee before any ranked mode.
- A phone that backgrounds the tab pauses its own board, since browsers stop animation frames. Its stack freezes until it returns.
- Names are guest names stored on the device. Shared Grudge Match accounts (same login across games, guest stats syncing on sign-in) are the natural next step and can use this same Supabase project's Auth.

## Develop
Serve the folder with any static server, for example `python3 -m http.server 5173`, then open http://localhost:5173.

```
node test/net-sim.js                      # bot-vs-bot online matches over a fake network
node test/specials-sim.js                 # special tiles/items get earned and used
NODE_PATH=<dir with jsdom> node test/dom-smoke.js
python3 tools/build-artifact.py           # single-file practice build in dist/
```

Version: shown on the start screen (`VERSION` in js/app.js). Bump MINOR for features, PATCH for tweaks.
