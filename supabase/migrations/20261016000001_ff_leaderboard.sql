-- Food Fight leaderboard
-- One table, no direct client access. The browser (anon key) can only:
--   ff_submit_score(...)  -> validates and stores a finished game, returns your ranks
--   ff_leaderboard(...)   -> top scores for one board, best score per player, plus your own row
-- Safe to run in the shared Grudge Match / BoomTown project: everything is prefixed ff_.

create table if not exists public.ff_scores (
  id          bigint generated always as identity primary key,
  created_at  timestamptz not null default now(),
  device_id   text        not null check (char_length(device_id) between 8 and 64),
  name        text        not null check (char_length(name) between 1 and 14),
  mode        text        not null check (mode in ('duel','brawl','online')),
  difficulty  smallint    not null check (difficulty between 0 and 2),
  score       integer     not null check (score >= 0),
  max_chain   smallint    not null default 1 check (max_chain between 1 and 30),
  kos         smallint    not null default 0 check (kos between 0 and 3),
  won         boolean     not null default false,
  place       smallint    not null default 1 check (place between 1 and 4),
  duration_s  integer     not null check (duration_s between 10 and 3600),
  version     text        not null default '' check (char_length(version) <= 16),
  user_id     uuid        null   -- reserved for shared Grudge Match accounts
);

-- leaderboard reads: one board, newest window, highest score first
create index if not exists ff_scores_board_idx on public.ff_scores (mode, difficulty, created_at desc, score desc);
create index if not exists ff_scores_device_idx on public.ff_scores (device_id, created_at desc);

alter table public.ff_scores enable row level security;
-- no policies on purpose: anon/authenticated cannot select/insert/update/delete the table directly
revoke all on public.ff_scores from anon, authenticated;

-- ---------------------------------------------------------------------------
-- submit
-- ---------------------------------------------------------------------------
create or replace function public.ff_submit_score(
  p_device_id  text,
  p_name       text,
  p_mode       text,
  p_difficulty int,
  p_score      int,
  p_max_chain  int,
  p_kos        int,
  p_won        boolean,
  p_place      int,
  p_duration_s int,
  p_version    text default ''
) returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
  v_diff smallint;
  v_last timestamptz;
  v_rank_day bigint;
  v_rank_all bigint;
  v_best int;
  v_my_day int;
begin
  -- shape checks (fail quietly with a reason the client can show)
  if p_device_id is null or char_length(p_device_id) not between 8 and 64 then return json_build_object('ok',false,'reason','device'); end if;
  if p_mode not in ('duel','brawl','online') then return json_build_object('ok',false,'reason','mode'); end if;
  if p_duration_s is null or p_duration_s < 10 or p_duration_s > 3600 then return json_build_object('ok',false,'reason','duration'); end if;
  if p_score is null or p_score < 0 then return json_build_object('ok',false,'reason','score'); end if;
  -- plausibility: bots score ~17-36 pts/sec; anything past 120/sec (+ a little slack) is not a real game
  if p_score > p_duration_s * 120 + 3000 then return json_build_object('ok',false,'reason','implausible'); end if;

  v_diff := case when p_mode = 'online' then 1 else greatest(0, least(2, coalesce(p_difficulty,1))) end;

  -- name: strip control/format chars, collapse spaces, 1..14 chars
  v_name := regexp_replace(coalesce(p_name,''), '[[:cntrl:]​-‏‪-‮⁠-⁯]', '', 'g');
  v_name := btrim(regexp_replace(v_name, '\s+', ' ', 'g'));
  v_name := left(v_name, 14);
  if v_name = '' then v_name := 'Cook'; end if;

  -- rate limit: one game per device every 15 seconds
  select max(created_at) into v_last from ff_scores where device_id = p_device_id;
  if v_last is not null and v_last > now() - interval '15 seconds' then
    return json_build_object('ok',false,'reason','too_fast');
  end if;

  select max(score) into v_best from ff_scores
   where device_id = p_device_id and mode = p_mode and difficulty = v_diff;

  insert into ff_scores(device_id,name,mode,difficulty,score,max_chain,kos,won,place,duration_s,version)
  values (p_device_id, v_name, p_mode, v_diff, p_score,
          greatest(1, least(30, coalesce(p_max_chain,1))),
          greatest(0, least(3, coalesce(p_kos,0))),
          coalesce(p_won,false),
          greatest(1, least(4, coalesce(p_place,1))),
          p_duration_s, left(coalesce(p_version,''),16));

  -- your rank = 1 + number of other players whose best beats your best (today / all time)
  select max(score) into v_my_day from ff_scores
   where device_id = p_device_id and mode = p_mode and difficulty = v_diff and created_at >= now() - interval '1 day';
  select count(*) + 1 into v_rank_day from (
    select max(score) s from ff_scores
     where mode = p_mode and difficulty = v_diff and created_at >= now() - interval '1 day' and device_id <> p_device_id
     group by device_id) t
   where t.s > v_my_day;
  select count(*) + 1 into v_rank_all from (
    select max(score) s from ff_scores
     where mode = p_mode and difficulty = v_diff and device_id <> p_device_id
     group by device_id) t
   where t.s > greatest(p_score, coalesce(v_best,0));

  return json_build_object(
    'ok', true,
    'rank_day', v_rank_day,
    'rank_all', v_rank_all,
    'personal_best', v_best is null or p_score > v_best,
    'prev_best', v_best
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- read
-- ---------------------------------------------------------------------------
create or replace function public.ff_leaderboard(
  p_mode       text,
  p_difficulty int,
  p_period     text,          -- 'day' | 'week' | 'all'
  p_device_id  text default null,
  p_limit      int  default 50
) returns table (
  rank       bigint,
  name       text,
  score      int,
  max_chain  smallint,
  won        boolean,
  created_at timestamptz,
  mine       boolean
)
language sql
stable
security definer
set search_path = public
as $$
  with board as (
    select s.* from ff_scores s
     where s.mode = p_mode
       and s.difficulty = case when p_mode = 'online' then 1 else greatest(0, least(2, p_difficulty)) end
       and s.created_at >= case p_period when 'day'  then now() - interval '1 day'
                                         when 'week' then now() - interval '7 days'
                                         else '-infinity'::timestamptz end
  ),
  best as (   -- one row per player: their best score in the window (earliest if tied)
    select distinct on (device_id) device_id, name, score, max_chain, won, created_at
      from board
     order by device_id, score desc, created_at asc
  ),
  ranked as (
    select row_number() over (order by score desc, created_at asc) as rank,
           name, score, max_chain, won, created_at,
           (p_device_id is not null and device_id = p_device_id) as mine
      from best
  )
  select rank, name, score, max_chain, won, created_at, mine
    from ranked
   where rank <= greatest(1, least(coalesce(p_limit,50), 100)) or mine
   order by rank;
$$;

revoke all on function public.ff_submit_score(text,text,text,int,int,int,int,boolean,int,int,text) from public;
revoke all on function public.ff_leaderboard(text,int,text,text,int) from public;
grant execute on function public.ff_submit_score(text,text,text,int,int,int,int,boolean,int,int,text) to anon, authenticated;
grant execute on function public.ff_leaderboard(text,int,text,text,int) to anon, authenticated;
