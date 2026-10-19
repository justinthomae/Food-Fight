-- Food Fight leaderboard v5: boards for the seven newer modes
--   slurp-*, buffet-*, mold-*, pancake-*, merge-*, conveyor-*, pest-* (e.g. 'merge-duel', 'pest-online').
-- Run after v4. Safe to re-run. ASCII only.

alter table public.ff_scores drop constraint if exists ff_scores_mode_check;
alter table public.ff_scores add constraint ff_scores_mode_check check (mode ~ '^((order|stack|shot|boss|slurp|buffet|mold|pancake|merge|conveyor|pest)-)?(duel|brawl|brawl8|online)$');

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
  p_avatar     text default ''
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
  v_av text;
begin
  if p_device_id is null or char_length(p_device_id) not between 8 and 64 then return json_build_object('ok',false,'reason','device'); end if;
  if p_mode is null or p_mode !~ '^((order|stack|shot|boss|slurp|buffet|mold|pancake|merge|conveyor|pest)-)?(duel|brawl|brawl8|online)$' then return json_build_object('ok',false,'reason','mode'); end if;
  if p_duration_s is null or p_duration_s < 10 or p_duration_s > 3600 then return json_build_object('ok',false,'reason','duration'); end if;
  if p_score is null or p_score < 0 then return json_build_object('ok',false,'reason','score'); end if;
  if p_score > p_duration_s * 200 + 5000 then return json_build_object('ok',false,'reason','implausible'); end if;

  v_diff := case when p_mode ~ 'online$' then 1 else greatest(0, least(2, coalesce(p_difficulty,1))) end;
  v_av := case when coalesce(p_avatar,'') ~ '^[a-z]{1,16}$' then p_avatar else '' end;

  v_name := regexp_replace(coalesce(p_name,''), '[[:cntrl:]\u200B-\u200F\u202A-\u202E\u2060-\u206F]', '', 'g');
  v_name := btrim(regexp_replace(v_name, '\s+', ' ', 'g'));
  v_name := left(v_name, 14);
  if v_name = '' then v_name := 'Cook'; end if;

  select max(created_at) into v_last from ff_scores where device_id = p_device_id;
  if v_last is not null and v_last > now() - interval '15 seconds' then
    return json_build_object('ok',false,'reason','too_fast');
  end if;

  select max(score) into v_best from ff_scores
   where device_id = p_device_id and mode = p_mode and difficulty = v_diff;

  insert into ff_scores(device_id,name,mode,difficulty,score,max_chain,kos,won,place,duration_s,version,avatar)
  values (p_device_id, v_name, p_mode, v_diff, p_score,
          greatest(1, least(30, coalesce(p_max_chain,1))),
          greatest(0, least(7, coalesce(p_kos,0))),
          coalesce(p_won,false),
          greatest(1, least(8, coalesce(p_place,1))),
          p_duration_s, left(coalesce(p_version,''),16), v_av);

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

  return json_build_object('ok', true, 'rank_day', v_rank_day, 'rank_all', v_rank_all,
                           'personal_best', v_best is null or p_score > v_best, 'prev_best', v_best);
end;
$$;

create or replace function public.ff_leaderboard(
  p_mode       text,
  p_difficulty int,
  p_period     text,
  p_device_id  text default null,
  p_limit      int  default 50
) returns table (
  rank       bigint,
  name       text,
  avatar     text,
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
       and s.difficulty = case when p_mode ~ 'online$' then 1 else greatest(0, least(2, p_difficulty)) end
       and s.created_at >= case p_period when 'day'  then now() - interval '1 day'
                                         when 'week' then now() - interval '7 days'
                                         else '-infinity'::timestamptz end
  ),
  best as (
    select distinct on (device_id) device_id, name, avatar, score, max_chain, won, created_at
      from board
     order by device_id, score desc, created_at asc
  ),
  ranked as (
    select row_number() over (order by score desc, created_at asc) as rank,
           name, avatar, score, max_chain, won, created_at,
           (p_device_id is not null and device_id = p_device_id) as mine
      from best
  )
  select rank, name, avatar, score, max_chain, won, created_at, mine
    from ranked
   where rank <= greatest(1, least(coalesce(p_limit,50), 100)) or mine
   order by rank;
$$;

revoke all on function public.ff_submit_score(text,text,text,int,int,int,int,boolean,int,int,text,text) from public;
revoke all on function public.ff_leaderboard(text,int,text,text,int) from public;
grant execute on function public.ff_submit_score(text,text,text,int,int,int,int,boolean,int,int,text,text) to anon, authenticated;
grant execute on function public.ff_leaderboard(text,int,text,text,int) to anon, authenticated;
