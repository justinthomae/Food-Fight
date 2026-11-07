---
name: grudge-games
description: Start here for any work on a Grudge Match Games title (BoomTown, Twigged, Food Fight, Riot Race, Broadside, Lost Empires, On Belay, ChipWreck, Woodlot, Silent Depths, Grudge Match Party, Cloud Cartel, or a new game). Picks which game-dev skills to load and runs the polish pass so features ship feeling professional.
---

# Grudge Match Games — skill router and polish standard

Use at the start of any feature, fix, or review in a Grudge Match game. Pick the skills
below, read their `SKILL.md` before writing code, and open `references/` only when needed.
Load the **fewest** skills that cover the task. The project's own CLAUDE.md, rules, and frozen-file
lists always win over a skill's general advice.

## 1. Find the game and its stack

| Game | Stack | Engine / genre skills |
|------|-------|-----------------------|
| BoomTown | React + Vite + Supabase | `card-game` |
| Twigged | three.js client + Node authoritative server | `threejs-*`, `fps-shooter` |
| Food Fight | Web (DOM/canvas) + Supabase | `puzzle` |
| Riot Race | Unity 6 + URP + Netcode for GameObjects | `unity-*` (navmesh for AI racers) |
| Broadside | React + three.js + Node/ws, Capacitor app | `threejs-*`, `tower-defense` |
| Lost Empires | React + three.js + Node/ws | `threejs-*`, `card-game` (if cards/hand) |
| On Belay | React + Tailwind + motion, PWA | `card-game` |
| ChipWreck | three.js + Vite + Supabase | `threejs-*`, `physics-tuning` |
| Woodlot | TypeScript tycoon sim | `procedural-gen`, `game-ai` |
| Silent Depths | React + Vite + Supabase, co-op dice | `puzzle` (board/rule resolution) |
| New / unlisted game | check package.json / ProjectSettings | `prototype-fast` first |

If the table is out of date, trust the project files and say so.

## 2. Add discipline skills by task

- Feels flat, needs "juice", hits/matches/scores land weakly → `game-feel`
- HUD, menus, lobby, phone/tablet/desktop layout, safe areas, accessibility → `game-ui-ux`
- Touch, drag, swipe, controller, rebinding → `input-systems`
- Music, SFX, mixing, ducking → `audio-design`
- Opponent AI, difficulty tiers → `game-ai`, `ai-behavior-trees-utility-ai`
- Camera follow, shake, framing → `camera-systems`
- Frame drops, battery, load time, big bundles → `performance-optimization`
- Art direction, style bible, icons, sprites, 3D models (Meshy) → `create-game-assets`
- Save/progress/cloud sync → `save-systems`; maps/levels → `level-design`, `procedural-gen`
- Shaders/visual effects → `shader-programming`; physics feel → `physics-tuning`
- Story/tutorial text, characters' lines → `dialogue-systems`
- Online play, rooms, lobby, reconnects, lag, cheating, rewards, invites, shared account → `grudge-netcode`
- Packaging as an iPhone/Android app, store review, purchases, ads, push, OTA → `grudge-store-release`

## 3. Grudge Match house rules (apply on every game)

- Mobile first: must feel great on iPhone held as the game intends; then tablet; then desktop.
- Colour-deficiency friendly: never rely on colour alone (pair with shape, icon or label).
- Respect reduced-motion settings; haptics only where the platform supports them.
- Shared Grudge Match account, friends and invites are cross-game — reuse the shared system, don't fork it.
- Multiplayer is server-authoritative; clients never grant XP, currency or wins.
- No borrowed brand names or references in player-facing text.

## 4. Polish pass (before calling a feature done)

Run through only the items relevant to the change and report what was checked:

1. **Feedback:** every player action has an immediate visual + audio response (`game-feel`).
2. **Layout:** check smallest phone, tablet, desktop; nothing clipped under notches/toolbars (`game-ui-ux`).
3. **Input:** touch targets ≥ 44 pt; drags forgiving; no accidental double-actions (`input-systems`).
4. **Audio:** levels balanced, music ducks under key SFX, mute fully silences everything (`audio-design`).
5. **Performance:** no frame drops on a mid-range phone during the busiest moment (`performance-optimization`).
6. **Readability:** colour-blind safe, text legible at arm's length, state is always clear.
7. **Edge cases:** reconnect, opponent leaves, app backgrounded, slow network.

## Source

`grudge-games`, `grudge-netcode` and `grudge-store-release` are Grudge Match's own skills,
written from the studio's existing games. The other discipline, genre, engine and workflow skills in this folder are a curated copy of
gamedev-skills/awesome-gamedev-agent-skills (Apache-2.0), pinned at commit 19d93f9 and
audited 2026-11-07. Re-audit the diff before updating the copy. See
`.claude/THIRD_PARTY_awesome-gamedev-agent-skills/` for the licence.
