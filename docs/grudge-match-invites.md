# Grudge Match invites (shared by every game)

One player invites a friend into their game session. Whichever Grudge Match game the friend is in shows:

> **Ann** invited you to play **Food Fight** · Packed Lunch · room 605
> [Join now] [After this game] [x]

- **Join now / Accept invite**: same game, straight into the room; another game, it opens that game's link.
- **After this game** (shown only mid-match): when their match ends they get a 4-second heads-up
  ("Game over, joining Ann in Food Fight…", Go now / Stay here), then go.
- **x**: declines.
- The host gets a note for every answer: "Tim accepted, on the way!", "Tim accepted, joining after their
  current game.", "Tim can't make it right now.", "Tim joined." Food Fight's invite list also shows it per friend.

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

## Adding it to a game

Copy `js/gm-invites.js` (plain JS, no dependencies, styles itself, ASCII only) and call once, after the
game's supabase-js client exists (it must hold the player's Grudge Match session):

```js
GMInvites.init({
  supabase,                         // the game's supabase-js v2 client
  game: 'boomtown', gameName: 'BoomTown',
  isBusy: () => inAMatch,           // true while a match is being played
  joinHere: inv => false,           // optional: invite to THIS game -> join inv.code in-app, return true
  myName: () => 'Ann',              // only needed to send invites
});
GMInvites.send({ to, toName, url, code, mode });   // send (host side)
GMInvites.status(friendId, code);                  // 'pending' | 'now' | 'later' | 'declined' | 'joined' | null
GMInvites.onChange(fn);                            // re-render your list when answers come in
```

A game opened from an invite link gets `?gmi=<id>`; `init` marks that invite `joined` and removes the
parameter. The game's own `?room=` handling does the joining.

Games that can't use it yet: Riot Race (Unity, no supabase-js session in the page), Broadside (its
supabase-js session is never refreshed after its own server takes over), On Belay (its CLAUDE.md forbids
writing to the shared project's tables).
