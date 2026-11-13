-- Security Advisor: "Signed-In Users Can Execute SECURITY DEFINER Function"
-- (WARN) on the eight work plan RPCs.
--
-- Audit result: all eight already check ownership before acting, in the repo
-- versions (20260909000001, 20260926000001, 20260926000002, 20261015000001):
--
--   create_work_plan_from_template   staff only: is_staff(auth.uid()) or raise
--   set_work_plan_task_status        staff, or task's plan studio = current_studio_id()
--                                    and plan published + active, else raise 42501
--   create_client_work_plan_task     assert_client_plan_access(p_plan_id)
--   update_client_work_plan_task     assert_client_task_access(p_task_id, true)
--   delete_client_work_plan_task     assert_client_task_access(p_task_id, true)
--   move_client_work_plan_task       assert_client_task_access(p_task_id, false)
--   set_work_plan_task_client_note   assert_client_task_access(p_task_id, false)
--   set_work_plan_task_item_done     item → task, then assert_client_task_access(v_task_id, false)
--
--   assert_client_task_access / assert_client_plan_access: staff pass; otherwise
--   studio_id must equal current_studio_id() and the plan must be published and
--   active, else raise 42501. (…_task_access(…, true) also refuses staff-set steps.)
--
-- Members must be able to call these (that's how the board writes), so the
-- "signed-in users can execute" warnings are expected and stay.
--
-- No function body changes. Production has drifted from the repo before
-- (handle_new_user is flagged for a mutable search_path even though the repo
-- version sets one), so this migration checks the DEPLOYED bodies and aborts
-- with a list of failures if any ownership check is missing. If it raises, stop
-- and send me the message; don't apply the remaining migrations.

do $$
declare
  c        record;
  v_def    text;
  v_failed text[] := '{}';
begin
  for c in
    select * from (values
      ('public.create_work_plan_from_template(uuid,uuid)',    'is_staff\s*\(\s*auth\.uid\(\)\s*\)'),
      ('public.set_work_plan_task_status(uuid,text)',         'current_studio_id\s*\(\s*\)'),
      ('public.set_work_plan_task_status(uuid,text)',         'is_staff\s*\(\s*auth\.uid\(\)\s*\)'),
      ('public.create_client_work_plan_task(uuid,text,text,text)', 'assert_client_plan_access\s*\(\s*p_plan_id\s*\)'),
      ('public.update_client_work_plan_task(uuid,text,text,text)', 'assert_client_task_access\s*\(\s*p_task_id\s*,\s*true\s*\)'),
      ('public.delete_client_work_plan_task(uuid)',           'assert_client_task_access\s*\(\s*p_task_id\s*,\s*true\s*\)'),
      ('public.move_client_work_plan_task(uuid,text)',        'assert_client_task_access\s*\(\s*p_task_id\s*,\s*false\s*\)'),
      ('public.set_work_plan_task_client_note(uuid,text)',    'assert_client_task_access\s*\(\s*p_task_id\s*,\s*false\s*\)'),
      ('public.set_work_plan_task_item_done(uuid,boolean)',   'assert_client_task_access\s*\(\s*v_task_id\s*,\s*false\s*\)'),
      ('public.assert_client_task_access(uuid,boolean)',      'current_studio_id\s*\(\s*\)'),
      ('public.assert_client_plan_access(uuid)',              'current_studio_id\s*\(\s*\)'),
      ('public.current_studio_id()',                          'profiles\s+where\s+id\s*=\s*auth\.uid\(\)')
    ) as t(sig, pattern)
  loop
    if to_regprocedure(c.sig) is null then
      v_failed := v_failed || (c.sig || ': missing');
      continue;
    end if;
    v_def := pg_get_functiondef(to_regprocedure(c.sig));
    if v_def !~* c.pattern then
      v_failed := v_failed || (c.sig || ': no match for ' || c.pattern);
    end if;
  end loop;

  if array_length(v_failed, 1) > 0 then
    raise exception 'work plan RPC ownership check missing in deployed body: %',
      array_to_string(v_failed, ' | ');
  end if;

  raise notice 'all 8 work plan RPCs and both assert helpers contain their ownership checks';
end $$;
