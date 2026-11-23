-- Food Fight v7: daily challenge, cook XP / levels, weekly ranked ratings. Run after v6. Safe to re-run. ASCII only.
--
-- Daily challenge: mode 'daily' (one board per UTC day; everyone gets the same seed from the client's date).
--   ff_leaderboard('daily', 1, 'today', ...) lists today's board.
-- XP: granted only here, by the server, from each accepted score (never by the game itself):
--   15 + min(score/40, 80) + 25 if won + 5 per KO (max 5) + 20 for the daily challenge, capped at 150 a game
--   and 2500 a day per device. Held (suspicious) scores give nothing. One grant per score row (ledger, unique).
--   Level: level n starts at 100 * n * (n - 1) / 2 XP  (1: 0, 2: 100, 3: 300, 4: 600, 5: 1000, ...).
--   A signed-in player's devices are linked to their Grudge Match account, so progress follows them.
-- Ranked (weekly, signed-in players in online rooms): every signed-in player in the match reports the finishing
--   order of the signed-in players. Once two reports agree, the server applies Elo (K 32, split over opponents)
--   to that week's ratings. One report per player per match; one application per match.

-- ---------- daily challenge + XP on scores ----------
create table if not exists public.ff_xp_log (
  id         bigserial primary key,
  device_id  text not null,
  score_id   bigint unique,
  xp         int not null check (xp between 0 and 200),
  reason     text not null default 'game',
  created_at timestamptz not null default now()
);
create index if not exists ff_xp_log_dev_idx on public.ff_xp_log (device_id, created_at desc);
alter table public.ff_xp_log enable row level security;   -- no policies: only the functions below touch it

create table if not exists public.ff_devices (
  device_id  text primary key check (char_length(device_id) between 8 and 64),
  user_id    uuid references auth.users(id) on delete set null,
  linked_at  timestamptz not null default now()
);
create index if not exists ff_devices_user_idx on public.ff_devices (user_id);
alter table public.ff_devices enable row level security;

create or replace function public.ff_level(p_xp bigint) returns int language sql immutable as $$
  select greatest(1, floor((1 + sqrt(1 + 8 * greatest(p_xp,0) / 100.0)) / 2)::int);
$$;

-- the 12-argument version is replaced by one with an optional 13th; drop it so calls aren't ambiguous
-- the daily challenge has its own board (mode 'daily')
alter table public.ff_scores drop constraint if exists ff_scores_mode_check;
alter table public.ff_scores add constraint ff_scores_mode_check check (mode ~ '^(daily|((order|stack|shot|boss|slurp|buffet|mold|pancake|merge|conveyor|pest)-)?(duel|brawl|brawl8|online))$');

drop function if exists public.ff_submit_score(text,text,text,int,int,int,int,boolean,int,int,text,text);

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
  p_version    text default '',
  p_avatar     text default '',
  p_daily      text default ''
) returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text; v_diff smallint; v_last timestamptz; v_rank_day bigint; v_rank_all bigint; v_best int; v_my_day int;
  v_av text; v_fam text; v_rate numeric; v_fam_n int; v_fam_rate numeric; v_fam_dur int; v_board_n int; v_board_top int;
  v_reason text := null; v_id bigint; v_xp int := 0; v_today int; v_total bigint; v_period text;
begin
  if p_device_id is null or char_length(p_device_id) not between 8 and 64 then return json_build_object('ok',false,'reason','device'); end if;
  if p_mode is null or p_mode !~ '^(daily|((order|stack|shot|boss|slurp|buffet|mold|pancake|merge|conveyor|pest)-)?(duel|brawl|brawl8|online))$' then return json_build_object('ok',false,'reason','mode'); end if;
  -- the daily challenge must be today's (UTC): yesterday's can't be submitted late
  if p_mode = 'daily' and coalesce(p_daily,'') <> to_char((now() at time zone 'utc')::date, 'YYYYMMDD') then return json_build_object('ok',false,'reason','daily_over'); end if;
  if p_duration_s is null or p_duration_s < 10 or p_duration_s > 1200 then return json_build_object('ok',false,'reason','duration'); end if;
  if p_score is null or p_score < 0 then return json_build_object('ok',false,'reason','score'); end if;
  if p_score > p_duration_s * 120 + 2000 then return json_build_object('ok',false,'reason','implausible'); end if;

  v_diff := case when p_mode ~ 'online$' or p_mode = 'daily' then 1 else greatest(0, least(2, coalesce(p_difficulty,1))) end;
  v_av := case when coalesce(p_avatar,'') ~ '^[a-z]{1,16}$' then p_avatar else '' end;
  v_name := regexp_replace(coalesce(p_name,''), '[[:cntrl:]\u200B-\u200F\u202A-\u202E\u2060-\u206F]', '', 'g');
  v_name := left(btrim(regexp_replace(v_name, '\s+', ' ', 'g')), 14);
  if v_name = '' then v_name := 'Cook'; end if;

  select max(created_at) into v_last from ff_scores where device_id = p_device_id;
  if v_last is not null and v_last > now() - interval '15 seconds' then return json_build_object('ok',false,'reason','too_fast'); end if;

  v_fam := split_part(p_mode, '-', 1);
  v_rate := p_score::numeric / p_duration_s;
  select count(*), max(score::numeric / duration_s), max(duration_s) into v_fam_n, v_fam_rate, v_fam_dur
    from ff_scores where not held and split_part(mode, '-', 1) = v_fam;
  if v_fam_n >= 10 then
    if p_score > 1000 and v_rate > v_fam_rate * 1.5 then v_reason := 'rate';
    elsif p_duration_s > v_fam_dur * 2 then v_reason := 'duration'; end if;
  elsif p_score > 1000 and v_rate > 80 then v_reason := 'rate'; end if;
  if v_reason is null then
    select count(*), max(score) into v_board_n, v_board_top from ff_scores where not held and mode = p_mode and difficulty = v_diff;
    if v_board_n >= 3 and p_score > v_board_top * 3 then v_reason := 'jump'; end if;
  end if;

  select max(score) into v_best from ff_scores where device_id = p_device_id and mode = p_mode and difficulty = v_diff
    and (p_mode <> 'daily' or created_at >= (date_trunc('day', now() at time zone 'utc') at time zone 'utc'));

  insert into ff_scores(device_id,name,mode,difficulty,score,max_chain,kos,won,place,duration_s,version,avatar,held,held_reason)
  values (p_device_id, v_name, p_mode, v_diff, p_score, greatest(1, least(30, coalesce(p_max_chain,1))),
          greatest(0, least(7, coalesce(p_kos,0))), coalesce(p_won,false), greatest(1, least(8, coalesce(p_place,1))),
          p_duration_s, left(coalesce(p_version,''),16), v_av, v_reason is not null, v_reason)
  returning id into v_id;

  -- XP, granted here and only here
  if v_reason is null and p_duration_s >= 30 then
    v_xp := least(150, 15 + least(p_score / 40, 80) + case when coalesce(p_won,false) then 25 else 0 end
                      + least(greatest(coalesce(p_kos,0),0), 5) * 5 + case when p_mode = 'daily' then 20 else 0 end);
    select coalesce(sum(xp),0) into v_today from ff_xp_log
     where device_id = p_device_id and created_at >= (date_trunc('day', now() at time zone 'utc') at time zone 'utc');
    v_xp := greatest(0, least(v_xp, 2500 - v_today));
    if v_xp > 0 then insert into ff_xp_log(device_id, score_id, xp) values (p_device_id, v_id, v_xp) on conflict (score_id) do nothing; end if;
  end if;
  select coalesce(sum(xp),0) into v_total from ff_xp_log where device_id in (
    select p_device_id union
    select d2.device_id from ff_devices d1 join ff_devices d2 on d2.user_id = d1.user_id where d1.device_id = p_device_id and d1.user_id is not null);

  v_period := case when p_mode = 'daily' then 'today' else 'day' end;
  select max(score) into v_my_day from ff_scores where device_id = p_device_id and mode = p_mode and difficulty = v_diff
    and created_at >= case when p_mode = 'daily' then (date_trunc('day', now() at time zone 'utc') at time zone 'utc') else now() - interval '1 day' end;
  select count(*) + 1 into v_rank_day from (
    select max(score) s from ff_scores where mode = p_mode and difficulty = v_diff and device_id <> p_device_id and not held
      and created_at >= case when p_mode = 'daily' then (date_trunc('day', now() at time zone 'utc') at time zone 'utc') else now() - interval '1 day' end
     group by device_id) t where t.s > v_my_day;
  select count(*) + 1 into v_rank_all from (
    select max(score) s from ff_scores where mode = p_mode and difficulty = v_diff and device_id <> p_device_id and not held group by device_id) t
   where t.s > greatest(p_score, coalesce(v_best,0));

  return json_build_object('ok', true, 'rank_day', v_rank_day, 'rank_all', v_rank_all,
                           'personal_best', v_best is null or p_score > v_best, 'prev_best', v_best,
                           'xp', v_xp, 'xp_total', v_total, 'level', ff_level(v_total));
end;
$$;

create or replace function public.ff_leaderboard(
  p_mode text, p_difficulty int, p_period text, p_device_id text default null, p_limit int default 50
) returns table (rank bigint, name text, avatar text, score int, max_chain smallint, won boolean, created_at timestamptz, mine boolean)
language sql stable security definer set search_path = public as $$
  with board as (
    select s.* from ff_scores s
     where s.mode = p_mode
       and s.difficulty = case when p_mode ~ 'online$' or p_mode = 'daily' then 1 else greatest(0, least(2, p_difficulty)) end
       and s.created_at >= case p_period when 'today' then (date_trunc('day', now() at time zone 'utc') at time zone 'utc')
                                         when 'day'  then now() - interval '1 day'
                                         when 'week' then now() - interval '7 days'
                                         else '-infinity'::timestamptz end
       and (not s.held or (p_device_id is not null and s.device_id = p_device_id))
  ),
  best as (select distinct on (device_id) device_id, name, avatar, score, max_chain, won, created_at from board order by device_id, score desc, created_at asc),
  ranked as (select row_number() over (order by score desc, created_at asc) as rank, name, avatar, score, max_chain, won, created_at,
                    (p_device_id is not null and device_id = p_device_id) as mine from best)
  select rank, name, avatar, score, max_chain, won, created_at, mine from ranked
   where rank <= greatest(1, least(coalesce(p_limit,50), 100)) or mine order by rank;
$$;

-- your progress: this device, plus every device linked to your account when signed in
create or replace function public.ff_my_progress(p_device_id text) returns json
language plpgsql stable security definer set search_path = public as $$
declare v_total bigint; v_games int; v_uid uuid := auth.uid();
begin
  if p_device_id is null or char_length(p_device_id) not between 8 and 64 then return json_build_object('ok',false); end if;
  select coalesce(sum(xp),0), count(*) into v_total, v_games from ff_xp_log where device_id in (
    select p_device_id union select device_id from ff_devices where v_uid is not null and user_id = v_uid);
  return json_build_object('ok', true, 'xp_total', v_total, 'games', v_games, 'level', ff_level(v_total),
                           'linked', v_uid is not null and exists(select 1 from ff_devices where device_id = p_device_id and user_id = v_uid));
end $$;

-- sign in once on a device and its progress joins your account (the first account to claim a device keeps it)
create or replace function public.ff_link_device(p_device_id text) returns json
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_owner uuid;
begin
  if v_uid is null then return json_build_object('ok',false,'reason','signin'); end if;
  if p_device_id is null or char_length(p_device_id) not between 8 and 64 then return json_build_object('ok',false,'reason','device'); end if;
  select user_id into v_owner from ff_devices where device_id = p_device_id;
  if v_owner is not null and v_owner <> v_uid then return json_build_object('ok',false,'reason','other_account'); end if;
  insert into ff_devices(device_id, user_id) values (p_device_id, v_uid) on conflict (device_id) do update set user_id = v_uid where ff_devices.user_id is null;
  return public.ff_my_progress(p_device_id);
end $$;

-- ---------- weekly ranked ----------
create table if not exists public.ff_rank_reports (
  mid        text not null check (char_length(mid) between 4 and 40),
  reporter   uuid not null references auth.users(id) on delete cascade,
  finish     uuid[] not null,
  created_at timestamptz not null default now(),
  primary key (mid, reporter)
);
create table if not exists public.ff_rank_applied (mid text primary key, week date not null, applied_at timestamptz not null default now());
create table if not exists public.ff_ratings (
  user_id uuid not null references auth.users(id) on delete cascade,
  week    date not null,
  rating  int  not null default 1000,
  games   int  not null default 0,
  wins    int  not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, week)
);
create index if not exists ff_ratings_week_idx on public.ff_ratings (week, rating desc);
alter table public.ff_rank_reports enable row level security;
alter table public.ff_rank_applied enable row level security;
alter table public.ff_ratings enable row level security;

create or replace function public.ff_week() returns date language sql stable as $$ select date_trunc('week', now() at time zone 'utc')::date $$;

create or replace function public.ff_report_match(p_mid text, p_finish uuid[]) returns json
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid(); v_n int; v_agree int; v_week date := ff_week(); v_r int[]; v_new int[]; i int; j int;
  v_exp numeric; v_k numeric; v_delta numeric;
begin
  if v_uid is null then return json_build_object('ok',false,'reason','signin'); end if;
  v_n := coalesce(array_length(p_finish,1),0);
  if p_mid is null or char_length(p_mid) not between 4 and 40 or v_n < 2 or v_n > 8 then return json_build_object('ok',false,'reason','bad'); end if;
  if not (v_uid = any(p_finish)) then return json_build_object('ok',false,'reason','not_in_match'); end if;
  if (select count(distinct x) from unnest(p_finish) x) <> v_n then return json_build_object('ok',false,'reason','bad'); end if;
  if (select count(*) from ff_rank_reports where reporter = v_uid and created_at > now() - interval '1 minute') >= 6 then
    return json_build_object('ok',false,'reason','too_fast'); end if;
  insert into ff_rank_reports(mid, reporter, finish) values (p_mid, v_uid, p_finish) on conflict do nothing;

  select count(*) into v_agree from ff_rank_reports where mid = p_mid and finish = p_finish and reporter = any(p_finish);
  if v_agree >= 2 and not exists(select 1 from ff_rank_applied where mid = p_mid) then
    insert into ff_rank_applied(mid, week) values (p_mid, v_week) on conflict do nothing;
    if found then
      for i in 1..v_n loop insert into ff_ratings(user_id, week) values (p_finish[i], v_week) on conflict do nothing; end loop;
      select array_agg(r.rating order by o.ord) into v_r
        from unnest(p_finish) with ordinality o(uid, ord) join ff_ratings r on r.user_id = o.uid and r.week = v_week;
      v_new := v_r; v_k := 32.0 / (v_n - 1);
      for i in 1..v_n loop
        v_delta := 0;
        for j in 1..v_n loop
          if i <> j then
            v_exp := 1 / (1 + power(10, (v_r[j] - v_r[i]) / 400.0));
            v_delta := v_delta + v_k * ((case when i < j then 1 else 0 end) - v_exp);
          end if;
        end loop;
        v_new[i] := greatest(100, v_r[i] + round(v_delta)::int);
      end loop;
      for i in 1..v_n loop
        update ff_ratings set rating = v_new[i], games = games + 1, wins = wins + case when i = 1 then 1 else 0 end, updated_at = now()
         where user_id = p_finish[i] and week = v_week;
      end loop;
    end if;
  end if;
  return json_build_object('ok', true, 'applied', exists(select 1 from ff_rank_applied where mid = p_mid),
    'rating', (select rating from ff_ratings where user_id = v_uid and week = v_week),
    'games', (select games from ff_ratings where user_id = v_uid and week = v_week));
end $$;

create or replace function public.ff_rank_board(p_limit int default 50) returns table (rank bigint, user_id uuid, name text, rating int, games int, wins int, mine boolean)
language sql stable security definer set search_path = public as $$
  select row_number() over (order by r.rating desc, r.updated_at asc), r.user_id,
         coalesce(nullif(p.display_name,''), nullif(u.display_name,''), u.username, 'Cook'), r.rating, r.games, r.wins, r.user_id = auth.uid()
    from ff_ratings r
    left join users_public u on u.id = r.user_id
    left join gm_app_profiles p on p.user_id = r.user_id and p.app = 'foodfight'
   where r.week = ff_week() and r.games > 0
   order by r.rating desc, r.updated_at asc
   limit greatest(1, least(coalesce(p_limit,50), 100));
$$;

create or replace function public.ff_my_rating() returns json language sql stable security definer set search_path = public as $$
  select json_build_object('rating', coalesce(r.rating, 1000), 'games', coalesce(r.games, 0), 'wins', coalesce(r.wins, 0), 'week', ff_week())
    from (select 1) x left join ff_ratings r on r.user_id = auth.uid() and r.week = ff_week();
$$;

-- In-app account deletion (store requirement): removes everything Food Fight keeps for the signed-in player:
-- the Food Fight profile, ratings and reports, and the scores and XP of every device linked to the account.
-- The shared Grudge Match login itself stays, because the other games use it.
create or replace function public.ff_delete_my_data(p_device_id text default null) returns json
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_devs text[];
begin
  if v_uid is null then return json_build_object('ok',false,'reason','signin'); end if;
  select coalesce(array_agg(device_id), '{}') into v_devs from ff_devices where user_id = v_uid;
  if p_device_id is not null and char_length(p_device_id) between 8 and 64 then v_devs := array_append(v_devs, p_device_id); end if;
  delete from ff_xp_log where device_id = any(v_devs);
  delete from ff_scores where device_id = any(v_devs);
  delete from ff_devices where user_id = v_uid or device_id = any(v_devs);
  delete from ff_ratings where user_id = v_uid;
  delete from ff_rank_reports where reporter = v_uid;
  delete from gm_app_profiles where user_id = v_uid and app = 'foodfight';
  return json_build_object('ok', true);
end $$;
revoke all on function public.ff_delete_my_data(text) from public;
grant execute on function public.ff_delete_my_data(text) to authenticated;

revoke all on function public.ff_submit_score(text,text,text,int,int,int,int,boolean,int,int,text,text,text) from public;
revoke all on function public.ff_leaderboard(text,int,text,text,int) from public;
revoke all on function public.ff_my_progress(text) from public;
revoke all on function public.ff_link_device(text) from public;
revoke all on function public.ff_report_match(text,uuid[]) from public;
revoke all on function public.ff_rank_board(int) from public;
revoke all on function public.ff_my_rating() from public;
grant execute on function public.ff_submit_score(text,text,text,int,int,int,int,boolean,int,int,text,text,text) to anon, authenticated;
grant execute on function public.ff_leaderboard(text,int,text,text,int) to anon, authenticated;
grant execute on function public.ff_my_progress(text) to anon, authenticated;
grant execute on function public.ff_link_device(text) to authenticated;
grant execute on function public.ff_report_match(text,uuid[]) to authenticated;
grant execute on function public.ff_rank_board(int) to anon, authenticated;
grant execute on function public.ff_my_rating() to authenticated;
