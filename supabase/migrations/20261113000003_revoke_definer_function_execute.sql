-- Security Advisor: "Public Can Execute SECURITY DEFINER Function" (WARN) on
--   get_user_role(), get_user_studio_id(), handle_new_user(), is_staff(uuid)
-- and the matching "Signed-In Users Can Execute" warnings.
--
-- Supabase's default privileges grant EXECUTE to anon AND authenticated on new
-- functions in public. Revoking from PUBLIC alone leaves anon's direct grant,
-- which is why these four are still open to anon.
--
-- Who needs what:
--   handle_new_user()    Trigger on auth.users. Postgres does not check EXECUTE
--                        when a trigger fires, so it needs no grant for anyone.
--                        Revoked from public, anon AND authenticated.
--   is_staff(uuid)       Called inside RLS policies on every work_plan table,
--                        studios, and others. Policy expressions run as the
--                        caller, so authenticated KEEPS execute.
--   current_studio_id()  Called by the client views (as the caller, since the
--                        views are now security_invoker) and by the work plan
--                        RPCs. authenticated KEEPS execute. Already revoked from
--                        anon in 20260926000001; restated here.
--   get_user_role()      Not defined in any repo migration (created by hand in
--   get_user_studio_id() production) and never called by the app. They may be
--                        used by hand-made RLS policies the repo can't see, so
--                        authenticated is revoked ONLY if no policy, view or
--                        security-invoker function in the database references
--                        them. Otherwise it is kept and a NOTICE says why.
--
-- One more guard: if a policy that applies to anon (roles include public or
-- anon) calls one of these functions, revoking anon would turn that table's
-- anonymous reads from "no rows" into a permission error. In that case the anon
-- revoke is skipped for that function and a NOTICE names it.
--
-- Safe to re-run. Missing functions are skipped with a NOTICE.

begin;

do $$
declare
  f        record;
  v_proc   regprocedure;
  v_anon_policy_refs int;
  v_any_refs         int;
begin
  for f in
    select * from (values
      ('public.handle_new_user()',    'handle_new_user',    true,  false),
      ('public.is_staff(uuid)',       'is_staff',           false, false),
      ('public.current_studio_id()',  'current_studio_id',  false, false),
      ('public.get_user_role()',      'get_user_role',      false, true),
      ('public.get_user_studio_id()', 'get_user_studio_id', false, true)
    ) as t(sig, fname, revoke_authenticated, revoke_authenticated_if_unused)
  loop
    v_proc := to_regprocedure(f.sig);
    if v_proc is null then
      raise notice 'skip %: function does not exist', f.sig;
      continue;
    end if;

    -- Policies that apply to anonymous requests and call this function.
    select count(*) into v_anon_policy_refs
      from pg_policies
     where (roles && array['public', 'anon']::name[])
       and (coalesce(qual, '') ~* ('\m' || f.fname || '\s*\(')
         or coalesce(with_check, '') ~* ('\m' || f.fname || '\s*\('));

    if v_anon_policy_refs > 0 then
      raise notice 'KEEP anon on %: % polic(ies) applying to anon call it', f.sig, v_anon_policy_refs;
    else
      execute format('revoke execute on function %s from public, anon', v_proc);
      raise notice 'revoked anon/public on %', f.sig;
    end if;

    if f.revoke_authenticated then
      execute format('revoke execute on function %s from authenticated', v_proc);
      raise notice 'revoked authenticated on %', f.sig;
    elsif f.revoke_authenticated_if_unused then
      select (select count(*) from pg_policies
               where coalesce(qual, '') ~* ('\m' || f.fname || '\s*\(')
                  or coalesce(with_check, '') ~* ('\m' || f.fname || '\s*\('))
           + (select count(*) from pg_views
               where schemaname not in ('pg_catalog', 'information_schema')
                 and definition ~* ('\m' || f.fname || '\s*\('))
           + (select count(*) from pg_proc p
                join pg_namespace n on n.oid = p.pronamespace
               where n.nspname not in ('pg_catalog', 'information_schema')
                 and not p.prosecdef
                 and p.oid <> v_proc
                 and p.prosrc ~* ('\m' || f.fname || '\s*\('))
        into v_any_refs;

      if v_any_refs = 0 then
        execute format('revoke execute on function %s from authenticated', v_proc);
        raise notice 'revoked authenticated on % (no policy, view or invoker function uses it)', f.sig;
      else
        execute format('grant execute on function %s to authenticated', v_proc);
        raise notice 'KEEP authenticated on %: referenced % time(s) by policies/views/functions', f.sig, v_any_refs;
      end if;
    else
      execute format('grant execute on function %s to authenticated', v_proc);
    end if;
  end loop;
end $$;

commit;

-- ─── Verification ───────────────────────────────────────────────────────────
select sig,
       case when to_regprocedure(sig) is null then 'missing'
            else has_function_privilege('anon', to_regprocedure(sig), 'execute')::text end as anon_exec,
       case when to_regprocedure(sig) is null then 'missing'
            else has_function_privilege('authenticated', to_regprocedure(sig), 'execute')::text end as auth_exec
  from (values ('public.handle_new_user()'), ('public.is_staff(uuid)'),
               ('public.current_studio_id()'), ('public.get_user_role()'),
               ('public.get_user_studio_id()')) v(sig)
union all
-- The signup trigger is still attached to auth.users (EXECUTE isn't checked at fire time).
select 'trigger on auth.users → handle_new_user',
       coalesce(string_agg(tgname::text, ', '), 'MISSING'),
       coalesce(string_agg(case tgenabled when 'D' then 'DISABLED' else 'enabled' end, ', '), '')
  from pg_trigger
 where tgrelid = 'auth.users'::regclass
   and tgfoid = to_regprocedure('public.handle_new_user()');
-- Expect: anon_exec false on all five (unless a NOTICE said KEEP);
-- handle_new_user auth_exec false; is_staff and current_studio_id auth_exec true;
-- trigger row present and enabled.
