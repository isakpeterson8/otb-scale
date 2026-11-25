-- Studio tier guard.
--
-- The "Users can insert their own studio" policy only checks owner_user_id,
-- so a signed-in user with no studio could insert one with any
-- subscription_tier straight through the API and give themselves Scale
-- (which now also means Live Support calendar invites).
--
-- These triggers apply to requests made with a user's JWT (role
-- 'authenticated' or 'anon'). The service role (adminClient), the SQL editor
-- and migrations are not affected, so admin tier changes keep working.
--
-- * INSERT: subscription_tier is forced to the newest active
--   admin_access_grants tier for the user's email, else 'free'.
-- * UPDATE: changing subscription_tier is rejected.
--
-- (studios.requested_tier / tier_updated_* are referenced by app code but do
-- not exist in production, so they are not guarded here.)
--
-- Safe to re-run.

create or replace function public.studio_tier_guard_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text;
  v_tier  text;
begin
  if coalesce(auth.role(), '') not in ('authenticated', 'anon') then
    return new;
  end if;

  select lower(u.email) into v_email from auth.users u where u.id = auth.uid();

  if v_email is not null then
    select g.tier into v_tier
      from public.admin_access_grants g
     where lower(g.email) = v_email
       and g.revoked_at is null
     order by g.granted_at desc
     limit 1;
  end if;

  new.subscription_tier := coalesce(v_tier, 'free');
  return new;
end;
$$;

create or replace function public.studio_tier_guard_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(auth.role(), '') not in ('authenticated', 'anon') then
    return new;
  end if;

  if new.subscription_tier is distinct from old.subscription_tier then
    raise exception 'Studio tier can only be changed by an admin'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

-- Trigger functions run as the table's trigger, not via RPC: no one needs
-- EXECUTE on them directly.
revoke execute on function public.studio_tier_guard_insert() from public, anon, authenticated;
revoke execute on function public.studio_tier_guard_update() from public, anon, authenticated;

drop trigger if exists studio_tier_guard_insert on public.studios;
create trigger studio_tier_guard_insert
  before insert on public.studios
  for each row execute function public.studio_tier_guard_insert();

drop trigger if exists studio_tier_guard_update on public.studios;
create trigger studio_tier_guard_update
  before update on public.studios
  for each row execute function public.studio_tier_guard_update();
