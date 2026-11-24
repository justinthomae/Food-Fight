# Food Fight audio clips

Recorded with ElevenLabs (flow "Food Fight callouts"). `js/sfx.js` loads these after the first tap; any file
that's missing falls back to the synthesized sound or the device's speech voice, so the game never breaks.

**Announcer** (voice "Ed - Late Night Announcer", eleven_v4) — `v-<key>.mp3`, said when your own board shows the
matching pop-up: hotdog, b2bhotdog, ko, chain2, chain3, chain4, chain5, megachain, feast, fight, win, knockedout,
perfect, orderup, rush, slurp, allyoucaneat, bigplate, spotless, kaboom, closing, notthecat, pestfrenzy, overtime,
bossangry, bossenraged, snackattack, doublehelping, trash, splatattack, cooking.

**Packed Lunch announcer** (voice "Ember", eleven_v4) — `f-<key>.mp3`, used instead of his line in Packed Lunch:
double, triple, hotdog, b2bhotdog, base (perfect clear), sizzlin (3 combo), roll (5 combo), diggity (7 combo), grillmaster
(grill spin), topdog (your KO), loaded (6+ line attack), relish (you win).

**Effects** (eleven_text_to_sound_v2) — `s-<name>.mp3`, replacing the synthesized effect of the same name:
throw, junk, ko, sauce, freeze, blender, cream, pin, fight, win, lose, break, feast, compact.

Keep clips short, trimmed of silence, mono, about -16 LUFS for voice and -18 LUFS for effects.

**Music** (eleven_music_v2_5) — `m-main.mp3` (calm kitchen groove, 28 bars at 117.8 BPM) and `m-intense.mp3`
(tense loop, 24 bars at 139.25 BPM). Each is cut to whole bars with a short crossfade at the seam so it loops
without a click, peak about -1 dB, stereo 96 kbps. Loaded only when music is on; the game crossfades between them
(`FFSound.music`). If you replace them, update `MUS_LEN` in js/sfx.js to the new exact lengths.
