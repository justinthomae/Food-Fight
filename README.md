# Food Fight

A fast multiplayer food-matching battle from Grudge Match Games.
Live at **foodfight.grudgematchgames.com**.

Five game modes share the fighters, lobby, online rooms, Grudge Match rematches and leaderboards:
**Classic** (swap and splat), **Order Up!** (first kitchen to fill 10 orders), **Snack Stack** (falling pairs, connect 4, chain for junk),
**Splat Shot** (aim and throw, pop 3, drop the rest) and **Boss Brawl** (co-op against a giant fighter). Online, the host picks the mode in the lobby.

Plain static site: no build step, no framework. Online play runs on Supabase Realtime (broadcast + presence). Leaderboards use one locked-down Supabase table.

```
index.html            page, styles, overlays
js/engine.js          game rules (pure logic, no DOM), shared by site, artifact build and tests
                      also Order Up! (ticket race) and Boss Brawl (co-op) rules
js/stack.js           Snack Stack board (falling pairs, connect 4, chains)
js/shot.js            Splat Shot board (hex bubble shooter, pops and drops)
js/app.js             drawing, input, settings, practice mode, online lobby
js/cuisines.js        the cuisine tile sets (drawn in code)
sw.js                 offline support: saves the game on the device so vs-AI play works with no connection
js/net.js             Supabase Realtime rooms
js/scores.js          leaderboard calls (submit + read)
assets/               logo and the eight fighters (WebP, trimmed; *-face = avatar crops)
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
3. Run the leaderboard migrations once, in order: `20261016000001_ff_leaderboard.sql`, then `20261016000002_ff_leaderboard_v2.sql` (fighter avatars, Big Brawl board, 8-player limits), then `20261016000003_ff_leaderboard_v3.sql` (eight fighters; any fighter id accepted), then `20261017000004_ff_leaderboard_v4.sql` (a set of boards per game mode: `order-*`, `stack-*`, `shot-*`, `boss-*`), then `20261019000005_ff_leaderboard_v5.sql` (boards for Noodle Slurp, Buffet Grab, Mold Patrol, Pancake Tower, Recipe Merge, Conveyor Belt and Pest Control). Same method for both: paste `supabase/migrations/20261016000001_ff_leaderboard.sql` into the SQL editor (or apply it with the Supabase MCP / CLI). It creates one table, `ff_scores`, and two functions, `ff_submit_score` and `ff_leaderboard`. The table is locked: browsers can only go through those two functions. Everything is prefixed `ff_`, so it can't collide with BoomTown.

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
- Boards: per game mode (Classic, Order Up!, Snack Stack, Splat Shot, Boss Brawl), then Duel, Brawl, Big Brawl (one per bot skill) and Online, each with Today (last 24 hours), This week and All time. Each cook appears once, with their best score.
- Players are identified by a random device id plus the name they type. Shared Grudge Match accounts can fill the reserved `user_id` column later.
- Server checks: score must be plausible for the game length (at most 200 points/second), one submission per device every 15 seconds, and names are trimmed and cleaned. This stops casual cheating, not a determined one.
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
node test/modes-sim.js                    # every mode x size x difficulty finishes, all bots
NODE_PATH=<dir with jsdom> node test/dom-smoke.js
python3 tools/build-artifact.py           # single-file practice build in dist/
```

Version: shown on the start screen (`VERSION` in js/app.js). Bump MINOR for features, PATCH for tweaks.

## Friends (shared Grudge Match account)

`js/social.js` signs players in with the same Supabase Auth accounts as BoomTown (email + password, Google, Facebook)
and uses BoomTown's own tables, so friends are shared between the games:

- `public.friends`: one row per pair; the sender inserts `pending`, the recipient flips it to `accepted`; decline / cancel / remove delete the row(s). Existing RLS enforces this.
- `public.users_public`: other players' names and avatars for search (no emails).
- `public.user_statuses`: read only, so friends playing BoomTown show as online.
- Realtime channel `ff:social`: presence of signed-in Food Fight players, plus invite / room-code messages that are only acted on when they come from an accepted friend.

No database changes are needed. One dashboard step for Google / Facebook sign-in: in Supabase, Authentication → URL Configuration → Redirect URLs, add `https://foodfight.grudgematchgames.com/**`. Guests can still play without an account.
