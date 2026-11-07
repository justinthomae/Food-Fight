-- Undo v6: put the v5 functions back and remove the review view. Paste in the Supabase SQL editor.
-- Production was on v5 when v6 was applied (2026-11-07; function hashes checked against the repo).
-- Then also paste supabase/migrations/20261019000005_ff_leaderboard_v5.sql to restore ff_submit_score
-- and ff_leaderboard exactly. The held / held_reason columns can stay (v5 ignores them); to publish
-- everything that v6 held first:
update public.ff_scores set held = false where held;
drop view if exists public.ff_held_scores;
