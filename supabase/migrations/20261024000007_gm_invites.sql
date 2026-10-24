-- Grudge Match game invites, shared by every game on the account (BoomTown project).
-- A friend invites you to a game session; whichever Grudge Match game you're in shows it.
-- Safe to re-run. ASCII only.
create table if not exists public.gm_invites (
  id          uuid primary key default gen_random_uuid(),
  from_user   uuid not null default auth.uid() references auth.users(id) on delete cascade,
  to_user     uuid not null references auth.users(id) on delete cascade,
  from_name   text not null default '' check (char_length(from_name) <= 40),
  game        text not null check (game ~ '^[a-z]{2,24}$'),
  game_name   text not null default '' check (char_length(game_name) <= 40),
  url         text not null check (url ~ '^https://([a-z0-9-]+\.)*(grudgematchgames\.com|boomtowngame\.com)(/[A-Za-z0-9/?=&#._~%-]*)?$' and char_length(url) <= 300),
  code        text not null default '' check (char_length(code) <= 24),
  mode        text not null default '' check (char_length(mode) <= 40),
  status      text not null default 'pending' check (status in ('pending','now','later','declined','joined','cancelled')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  expires_at  timestamptz not null default now() + interval '20 minutes',
  check (from_user <> to_user)
);
create index if not exists gm_invites_to_idx on public.gm_invites (to_user, created_at desc);
create index if not exists gm_invites_from_idx on public.gm_invites (from_user, created_at desc);
alter table public.gm_invites enable row level security;

drop policy if exists gm_invites_read on public.gm_invites;
create policy gm_invites_read on public.gm_invites for select to authenticated
  using ((select auth.uid()) in (from_user, to_user));

drop policy if exists gm_invites_insert on public.gm_invites;
create policy gm_invites_insert on public.gm_invites for insert to authenticated
  with check (
    from_user = (select auth.uid()) and status = 'pending'
    and exists (select 1 from public.friends f
                 where f.status = 'accepted'
                   and ((f.user_id = from_user and f.friend_user_id = to_user)
                     or (f.user_id = to_user and f.friend_user_id = from_user)))
    and not exists (select 1 from public.friends b
                 where b.status = 'blocked'
                   and ((b.user_id = from_user and b.friend_user_id = to_user)
                     or (b.user_id = to_user and b.friend_user_id = from_user))));

drop policy if exists gm_invites_update on public.gm_invites;
create policy gm_invites_update on public.gm_invites for update to authenticated
  using ((select auth.uid()) in (from_user, to_user))
  with check ((select auth.uid()) in (from_user, to_user));

create or replace function public.gm_invites_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if (select count(*) from public.gm_invites where from_user = new.from_user and created_at > now() - interval '10 minutes') >= 30 then
      raise exception 'too many invites';
    end if;
    new.created_at := now(); new.updated_at := now(); new.expires_at := now() + interval '20 minutes';
    return new;
  end if;
  if new.id <> old.id or new.from_user <> old.from_user or new.to_user <> old.to_user or new.game <> old.game
     or new.url <> old.url or new.code <> old.code or new.mode <> old.mode or new.from_name <> old.from_name
     or new.game_name <> old.game_name or new.created_at <> old.created_at or new.expires_at <> old.expires_at then
    raise exception 'only status can change';
  end if;
  if auth.uid() = old.to_user and new.status not in ('now','later','declined','joined') then raise exception 'bad status'; end if;
  if auth.uid() = old.from_user and auth.uid() <> old.to_user and new.status <> 'cancelled' then raise exception 'bad status'; end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists gm_invites_guard on public.gm_invites;
create trigger gm_invites_guard before insert or update on public.gm_invites for each row execute function public.gm_invites_guard();

grant select, insert, update on public.gm_invites to authenticated;
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='gm_invites') then
    alter publication supabase_realtime add table public.gm_invites;
  end if;
end $$;
