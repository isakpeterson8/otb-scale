-- Security Advisor: "Function Search Path Mutable" (WARN) on
--   get_user_role, get_user_studio_id, handle_new_user, set_updated_at,
--   school_contacts_default_primary, school_contacts_promote_on_delete,
--   normalize_grant_email, sync_work_plan_task_done, sync_work_plan_task_item_done
-- plus every SECURITY DEFINER function touched in 20261113000002..4.
--
-- Uses ALTER FUNCTION … SET search_path = public, pg_temp rather than
-- rewriting bodies with search_path = '':
--   * get_user_role / get_user_studio_id aren't in the repo, and handle_new_user
--     in production differs from the repo, so re-typing their bodies risks
--     overwriting live logic with a stale copy. ALTER leaves the body alone.
--   * Every body already resolves its tables in public, so `public` on the path
--     keeps them working unchanged.
--   * pg_temp is listed LAST on purpose. When it isn't named, Postgres searches
--     it FIRST for tables, which lets a caller shadow a table with a temp table
--     inside a SECURITY DEFINER function. The SECURITY DEFINER functions that
--     already say `search_path = public` get the same hardening here.
--
-- ALTER FUNCTION keeps privileges and bodies. Safe to re-run. Missing
-- functions are skipped with a NOTICE.

begin;

do $$
declare
  v_sig  text;
  v_proc regprocedure;
begin
  foreach v_sig in array array[
    -- flagged by the advisor
    'public.get_user_role()',
    'public.get_user_studio_id()',
    'public.handle_new_user()',
    'public.set_updated_at()',
    'public.school_contacts_default_primary()',
    'public.school_contacts_promote_on_delete()',
    'public.normalize_grant_email()',
    'public.sync_work_plan_task_done()',
    'public.sync_work_plan_task_item_done()',
    -- SECURITY DEFINER functions touched above (already search_path = public)
    'public.is_staff(uuid)',
    'public.current_studio_id()',
    'public.assert_client_task_access(uuid,boolean)',
    'public.assert_client_plan_access(uuid)',
    'public.create_work_plan_from_template(uuid,uuid)',
    'public.set_work_plan_task_status(uuid,text)',
    'public.create_client_work_plan_task(uuid,text,text,text)',
    'public.update_client_work_plan_task(uuid,text,text,text)',
    'public.delete_client_work_plan_task(uuid)',
    'public.move_client_work_plan_task(uuid,text)',
    'public.set_work_plan_task_client_note(uuid,text)',
    'public.set_work_plan_task_item_done(uuid,boolean)'
  ]
  loop
    v_proc := to_regprocedure(v_sig);
    if v_proc is null then
      raise notice 'skip %: function does not exist', v_sig;
      continue;
    end if;
    execute format('alter function %s set search_path = public, pg_temp', v_proc);
  end loop;
end $$;

commit;

-- ─── Verification ───────────────────────────────────────────────────────────
-- Any public function still without a pinned search_path (should be none of
-- the above; anything listed here was not in the advisor's report).
select p.oid::regprocedure as function, p.prosecdef as security_definer, p.proconfig
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.prokind = 'f'
   and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')
 order by 1;
