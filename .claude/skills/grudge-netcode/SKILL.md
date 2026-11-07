---
name: grudge-netcode
description: Design, build or debug online multiplayer for a Grudge Match web game — picking the right authority model, rooms and codes, seats and reconnects, hidden information, prediction and interpolation, rate limits, idempotent rewards, Supabase RPC races, and the shared Grudge Match account and invites. Use when adding online play, fixing desyncs, joins, reconnects, duplicate rewards or cheating, or when the user mentions netcode, rooms, lobby, WebSocket, snapshot, lag, Supabase Realtime, or invites.
---

# Grudge Match netcode

The studio already runs four kinds of online play. Pick the one that fits **before** writing code;
most bugs in this studio came from a game sitting between two models (client-written state in a
server game, or a casual peer model carrying rated rewards).

## 1. Pick the authority model

| Model | Use for | Studio example | Transport |
|---|---|---|---|
| **A. Real-time authoritative server** | action, physics, anything twitchy | Twigged (30 Hz), Broadside (20 Hz), Riot Race (Unity NGO) | Node `ws` on Fly; JSON now, binary later |
| **B. Turn/round authoritative room** | board, card, hidden-info strategy | Lost Empires (Node rooms), On Belay (Cloudflare Durable Objects) | WebSocket or HTTP actions + "changed" notices |
| **C. Database-authoritative turns** | async turn-based on Supabase | BoomTown | Supabase RPCs (`SECURITY DEFINER`, `FOR UPDATE`) + Realtime for notices |
| **D. Casual peer broadcast** | quick unrated party play | Food Fight rooms | Supabase Realtime broadcast + presence |

Rules of thumb:
- Anything that grants **XP, rating, currency, purchases or leaderboard places** must come from A, B or C. Model D may only *display*; rewards go through a validated server path (RPC or Edge Function).
- **Supabase Realtime is never the gameplay transport for A** (Twigged decision). Use it for invites, presence and "something changed" pings.
- Unity games use Netcode for GameObjects with the host/server owning state — same principles, use the `unity-*` skills for API detail.

## 2. Non-negotiables (every model)

1. **Clients send intents, never results.** `{t:'in', seq, …}` or `submit {round, stateVersion, card}` — never `hp`, `score`, `dmg`, `winner`. The server sets the acting player from the authenticated seat, not from the message. Unknown message types are ignored.
2. **Validate and clamp every field** with a schema (zod or hand checks): types, ranges, string length (names ≤ 16, NFKC-normalised, filtered), `maxPayload` (≈16 KB).
3. **Hidden information never leaves the server.** Build each player's view with one function (`publicStateFor(state, viewer)` / `viewFor()`); bots get the same view. Notices carry no data. Seeds for dice/shuffles stay server-side.
4. **Versioned protocol.** `hello {v}` must equal `PROTOCOL_VERSION`, else `error{code:'protocol'}` and a "please refresh" prompt. Pair with a deploy watchdog (`/version.json`, no-store, never auto-reload mid-game) so stale tabs don't re-introduce fixed bugs.
5. **Rate limit per connection** with a token bucket (Twigged 90/s burst 140; Broadside 15 commands/s; joins ~12/min). Drop and log excess as `suspicious`.
6. **Idempotent everything that pays.** Key rewards by `matchId` (+ user); repeat calls return the first result. Ledger table + unique constraint beats "we only call it once". BoomTown's XP regression (94 % of games granting nothing for a week) came from tying a grant to an animation stage — grant on *provable game end*, independently of UI.
7. **Never swallow failures** on writes that matter. A silent `catch {}` around a stats write is a data-loss bug.

## 3. Rooms, seats and reconnects

- **Codes** are for friends, not secrets (3-digit Broadside, 3-digit Food Fight). Rate-limit join attempts; a room only admits seats the server granted.
- **Session token** issued in `welcome`; the client stores it (localStorage) with the active room and **rejoins from the splash screen** after reload, iOS background-kill or network change ("Rejoining your match…").
- **Disconnect window** ~30 s: seat held (bot or auto-play takes over in real-time games, turn timer keeps running in turn games), then hand the seat to AI. Newest connection for the same session wins; close the old socket.
- **Humans trump AI**: max-players caps humans; a joining human evicts the most recent AI seat inside the same lock (BoomTown `join_game_atomic`).
- **Lifecycle**: lobby → countdown → active → ended → results → rematch/next. Abandon rooms with no humans after ~60 s; garbage-collect 2 min after the last human leaves.
- **Heartbeat** every ~10 s; terminate dead sockets.

## 4. Real-time (model A) specifics

- Fixed tick (20–30 Hz) separate from snapshot rate (every 2nd tick). Exactly **one input per player per tick**; cap the queue (~10) so flooding can't speed anyone up.
- **Client prediction** with shared deterministic movement code (`shared/`), unacked input replay on each snapshot `ack`, and error blended over ~70 ms, not snapped.
- **Interpolate remote entities** ~2–3 ticks behind (≈130–140 ms) with teleport detection.
- Projectiles simulated on the server; cap fire-latency compensation (`min(RTT/2, 100 ms)`); document any rewind/no-rewind trade-off.
- Damage applies when the server's hit lands on its tick — never when a client animation finishes.
- Measure: tick p95 well under budget, bytes/s per client, snapshot interval jitter. Add a `?lag=150&jitter=30` dev switch and a headless `npm run load`.

## 5. Turn-based (models B and C) specifics

- Submissions quote `round` + `stateVersion`; mismatches are `409 stale`. An identical retry is a success, a *different* second move is `already_committed`.
- Exactly-once resolution: serialise per room (Durable Object, single-threaded room loop, or `SELECT … FOR UPDATE` / compare-and-swap in Postgres).
- Supabase (model C): put game rules that touch shared rows in **RPCs or Edge Functions**, not client read-modify-write. Lock the row, re-check, write, return a code (`OK`/`FULL`/`STARTED`/`STALE`) and show honest messages for each.
- Realtime `postgres_changes` is a hint to refetch; always be correct on a plain refetch (missed events happen).
- Never trust client clocks for deadlines; store server timestamps.

## 6. Casual peer (model D) specifics

- One host per room owns the shared random seed and match start; peers broadcast their own moves only.
- Expect cheats and drops: keep it unrated, or send end-of-match results to a validating RPC (sanity bounds per mode/time) before anything lands on a leaderboard.
- Presence for lobby lists; debounce updates (send only on change).

## 7. Grudge Match account and invites

- One login for every game: the shared Supabase project (BoomTown's). Game servers **verify the access token themselves** (JWT verify or `GET /auth/v1/user`), never decode-and-trust. Guests get a server-signed key; signing in **merges** guest progress into the account.
- Only server-hosted matches are rated; never rate a game the browser hosted.
- Invites: two shared tables exist — `gm_invites` (on Realtime, used by Food Fight and any game that copies its `js/gm-invites.js`) and `gm_cross_invites` (RPCs `gm_my_invites`, `gm_respond_invite`, used by Lost Empires, Silent Depths and the other studio games). **Reuse them; don't add a third.** Check `docs/grudge-match-invites.md` in Food-Fight for the current contract. "Join now / After this game / Decline", and retire invites when the game starts or is deleted.
- Some games may not write to the shared project's tables (On Belay's CLAUDE.md forbids it) — check the game's CLAUDE.md first.

## 8. Testing checklist (report what you ran)

- [ ] Two (or N) real clients on different devices complete a full match.
- [ ] Reload mid-match → same seat; kill the app on iPhone → rejoins.
- [ ] Forged message (`score`, wrong seat, stale version) is refused — automated test.
- [ ] Double-submit / double-grant → one effect (idempotency test).
- [ ] Simulated lag/jitter: game stays playable, corrections small.
- [ ] Host leaves, last human leaves, room full, game already started → clear messages.
- [ ] Old client against new server → protocol error + refresh prompt, not silent breakage.

Reference implementations: `twigged/NETWORKING.md`, `BCSS/Broadside/docs/ARCHITECTURE.md`,
`BCSS/OnBelay/SERVER.md`, `BCSS/LostEmpires/CLAUDE.md` (hidden-info rules), BoomTown `join_game_atomic`.
