-- Studio tier guard: fix the "is this a user request?" check.
--
-- 20261125000001 decided with auth.role(). In production a probe user's
-- PATCH of its own studios.subscription_tier still succeeded with both
-- triggers present, i.e. auth.role() did not return 'authenticated' inside
-- the trigger. This version does not depend on auth.role(): it treats the
-- request as a user request when ANY of these say authenticated/anon:
--   * the JWT claims PostgREST sets   (request.jwt.claims ->> 'role')
--   * the legacy per-claim setting    (request.jwt.claim.role)
--   * the role PostgREST switched to  (SET LOCAL ROLE → current_setting('role'))
-- Service role requests report 'service_role'; the SQL editor and
-- migrations report none of these, so admin paths are unaffected.
--
-- Safe to re-run.

create or replace function public.is_end_user_request()
returns boolean
language plpgsql
stable
set search_path = ''
as $$
declare
  v_claims text := nullif(current_setting('request.jwt.claims', true), '');
  v_roles  text[];
begin
  v_roles := array[
    case when v_claims is not null then (v_claims::jsonb ->> 'role') end,
    nullif(current_setting('request.jwt.claim.role', true), ''),
    nullif(current_setting('role', true), '')
  ];
  return v_roles && array['authenticated', 'anon'];
end;
$$;

revoke execute on function public.is_end_user_request() from public, anon, authenticated;

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
  if not public.is_end_user_request() then
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
  if not public.is_end_user_request() then
    return new;
  end if;

  if new.subscription_tier is distinct from old.subscription_tier then
    raise exception 'Studio tier can only be changed by an admin'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

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
