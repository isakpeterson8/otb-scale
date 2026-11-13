-- Bring production's handle_new_user up to the 20260722000001 version:
-- a new signup whose email has an active (non-revoked) admin_access_grant
-- lands as 'approved'; everyone else stays 'pending'. The profile row is
-- created either way.
--
-- Production never received 20260722000001: its live body still inserts
-- 'pending' unconditionally (snapshot:
-- supabase/snapshots/handle_new_user-pre-20261113000007.sql).
--
-- Differences from the 20260722000001 file, on purpose:
--   * search_path = public, pg_temp (not just public), so this keeps the
--     hardening from 20261113000005 instead of undoing it.
--   * No backfill. 20260722000001 also approved existing pending profiles that
--     had a grant. Production has 0 such profiles today (8 pending, none with an
--     active grant), so there is nothing to backfill, and this migration
--     changes no data.
--   * The function is re-revoked from anon, authenticated and PUBLIC.
--     CREATE OR REPLACE keeps existing grants, so this is belt and braces
--     after 20261113000003. A trigger function needs no EXECUTE grant to fire.
--
-- "Active grant" means revoked_at is null, the same rule the app uses
-- (src/app/actions/_shared.ts, src/app/actions/admin.ts). admin_access_grants
-- has no expires_at column. Emails are stored lowercased
-- (normalize_grant_email_trg); lower() on both sides covers older rows.
--
-- Safe to re-run. Changes no data. Rollback: run the snapshot file above.

begin;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_status text := 'pending';
begin
  -- If an active (non-revoked) grant exists for this email, skip the queue.
  if new.email is not null and exists (
    select 1
      from public.admin_access_grants g
     where lower(g.email) = lower(new.email)
       and g.revoked_at is null
  ) then
    v_status := 'approved';
  end if;

  insert into public.profiles (id, email, role, status)
  values (new.id, new.email, 'studio_owner', v_status)
  on conflict (id) do nothing;

  return new;
end;
$$;

revoke all on function public.handle_new_user() from public, anon, authenticated;

commit;

-- ─── Verification ───────────────────────────────────────────────────────────
select 'grant check present' as check,
       (pg_get_functiondef('public.handle_new_user()'::regprocedure) ~* 'admin_access_grants')::text as value
union all
select 'search_path', array_to_string(proconfig, ',')
  from pg_proc where oid = 'public.handle_new_user()'::regprocedure
union all
select 'anon / authenticated can execute (want false / false)',
       has_function_privilege('anon', 'public.handle_new_user()', 'execute')::text || ' / ' ||
       has_function_privilege('authenticated', 'public.handle_new_user()', 'execute')::text
union all
select 'trigger on auth.users',
       coalesce(string_agg(tgname::text || ' (' || case tgenabled when 'D' then 'DISABLED' else 'enabled' end || ')', ', '), 'MISSING')
  from pg_trigger
 where tgrelid = 'auth.users'::regclass
   and tgfoid = 'public.handle_new_user()'::regprocedure;
-- Expect: true; search_path=public, pg_temp; false / false; on_auth_user_created (enabled).
