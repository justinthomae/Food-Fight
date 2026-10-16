-- Food Fight leaderboard v3: eight fighters. Avatars become any short lowercase fighter id,
-- so adding characters later needs no migration. Run after v2. Safe to re-run.

alter table public.ff_scores drop constraint if exists ff_scores_avatar_check;
alter table public.ff_scores add constraint ff_scores_avatar_check check (avatar ~ '^[a-z]{0,16}$');

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
  if p_mode not in ('duel','brawl','brawl8','online') then return json_build_object('ok',false,'reason','mode'); end if;
  if p_duration_s is null or p_duration_s < 10 or p_duration_s > 3600 then return json_build_object('ok',false,'reason','duration'); end if;
  if p_score is null or p_score < 0 then return json_build_object('ok',false,'reason','score'); end if;
  if p_score > p_duration_s * 120 + 3000 then return json_build_object('ok',false,'reason','implausible'); end if;

  v_diff := case when p_mode = 'online' then 1 else greatest(0, least(2, coalesce(p_difficulty,1))) end;
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

