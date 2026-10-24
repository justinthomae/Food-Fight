# Grudge Match invites (`gm_invites`, the older shared table)

> **Food Fight no longer shows these.** The studio standardised on `public.gm_cross_invites` (see the last
> section). Food Fight's copy of the `gm_invites` drop-in, `js/gm-invites.js`, was retired in v1.22.1 because its
> card overlapped the `gm_cross_invites` card at the top of the screen. The last version of that file is in this
> repo's history (commit 2412cce) for games that still use it.
>
> Food Fight still **sends** room invites into `gm_invites` (`gmSend` in `js/social.js`), because
> `gm_cross_invites` has no sender Food Fight can use (its live senders are game-specific: `le_invite`,
> `sd_online_invite`). Friends in BoomTown, Fliptide… keep getting them there; the answers show in Food Fight's
> Invite friends list. Friends in Food Fight get the invite over the `gm:social` channel as Food Fight's own
> pop-up (Join / Not now), which marks the shared invite joined or declined.

## Storage: `public.gm_invites` (Supabase project zhfkcjzajazsrpqeyaea)

Migration: `supabase/migrations/20261024000007_gm_invites.sql` in this repo.

| column | meaning |
|---|---|
| from_user, to_user | the two players (must be accepted friends; blocked pairs can't) |
| from_name | host's name as shown |
| game, game_name | e.g. `foodfight` / `Food Fight` |
| url | join link; must be https on grudgematchgames.com or boomtowngame.com |
| code, mode | room code and mode name, shown in the pop-up |
| status | pending → now / later / declined / joined (invitee), cancelled (host) |
| expires_at | 20 minutes after sending |

RLS: you see invites you sent or got; only the status can change after sending; 30 invites per 10 minutes.
The table is in the `supabase_realtime` publication.

## How the old drop-in worked (for games that still use it)

`js/gm-invites.js` (removed here, see commit 2412cce) showed "Ann invited you to play Food Fight"
[Join now] [After this game] [x], told the host each answer, and marked `?gmi=<id>` arrivals joined.
Food Fight keeps only that last part: opening Food Fight from an invite link with `?gmi=<id>` still marks the
invite `joined` and removes the parameter; the game's own `?room=` handling does the joining.

## Invites from the other studio games (`gm_cross_invites`)

Lost Empires, Silent Depths and the other studio games send invites through the studio-wide
`public.gm_cross_invites` table (not created by this repo). `js/gm-cross-invites.js` receives them in Food Fight:

- `rpc('gm_my_invites')` every 9 s while signed in and the tab is visible (and as soon as it becomes visible);
  the table isn't on Realtime. Invites for `foodfight` itself and non-https links are ignored.
- Card: "Ann invites you to Lost Empires". Mid-match it's a slim strip with Join now / After this game / x;
  otherwise Join / No thanks. An invite answered "later" comes back once the match ends as
  "Ann is waiting for you in Lost Empires" (Join / No thanks).
- Answers go through `rpc('gm_respond_invite', {p_invite, p_choice:'now'|'later'|'decline', p_from_app:'foodfight'})`;
  Join opens the join link it returns.
