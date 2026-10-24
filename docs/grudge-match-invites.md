# Grudge Match invites (`gm_cross_invites`, studio-wide)

Every Grudge Match game sends and receives room invites through `public.gm_cross_invites` in the shared Supabase
project (zhfkcjzajazsrpqeyaea). The table and its functions belong to the studio, not this repo: nothing here
creates or changes them.

## Sending (`js/social.js`)

The room's **Invite friends** list sends each invite with

```js
sb.rpc('gm_send_invite', { p_app: 'foodfight', p_to: friendId, p_code: roomCode, p_from_name: myName })
```

Only accepted friends can be invited. The server builds the join link from the code
(`https://foodfight.grudgematchgames.com/?room={code}`). Its refusals ("You can only invite friends.",
"Too many invites; try again later.", "No such room.") are shown in the list as the send's error. A network
error still lets the `gm:social` pop-up through to friends who are in Food Fight.

**Friends in Food Fight** get the invite over the `gm:social` Realtime channel as Food Fight's own pop-up
(`#inviteToast`). `js/gm-cross-invites.js` skips invites to the game it's running in, so they never get a second card
for the same invite. **Join** takes them into the room, which marks the invite joined (below). **Not now** declines
the shared invite through `gm_respond_invite`.

## The host sees the answers

While the Invite friends list is open, the host reads their own rows for the room every 4.5 s (the table isn't on
Realtime):

```js
sb.from('gm_cross_invites').select('to_user,status,expires_at,created_at')
  .eq('app', 'foodfight').eq('game_ref', code).eq('from_user', me)
```

The newest row per friend is shown as: pending → **Invited**, accepted → **Joining now**, later → **Joins after their
game**, declined → **Declined**, joined → **Joined**, expired (or pending / later past `expires_at`) → **Expired**.
Invited, Declined and Expired get an **Again** button after 20 s.

## Arriving

Whenever a signed-in player is in a room, Food Fight calls `rpc('gm_mark_joined', { p_app: 'foodfight', p_game_ref: code })`
once for that code. It only changes the player's own pending / accepted / later invites to that room, so it does
nothing for someone who wasn't invited.

## Receiving invites from other games (`js/gm-cross-invites.js`)

- `rpc('gm_my_invites')` every 9 s while signed in and the tab is visible (and as soon as it becomes visible).
  Invites for `foodfight` itself and non-https links are ignored.
- Card: "Ann invites you to Lost Empires". Mid-match it's a slim strip with Join now / After this game / x;
  otherwise Join / No thanks. An invite answered "later" comes back once the match ends as
  "Ann is waiting for you in Lost Empires" (Join / No thanks).
- Answers go through `rpc('gm_respond_invite', {p_invite, p_choice:'now'|'later'|'decline', p_from_app:'foodfight'})`;
  Join opens the join link it returns.

## History: `public.gm_invites`

Food Fight used to send into the older `public.gm_invites` table (migration
`supabase/migrations/20261024000007_gm_invites.sql`) and to show its own card for it (`js/gm-invites.js`, retired in
v1.22.1). Nothing in Food Fight reads or writes `gm_invites` any more as of v1.23.0. The table is still in the
database; this repo doesn't drop it.
