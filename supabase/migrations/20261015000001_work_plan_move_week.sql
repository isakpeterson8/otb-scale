-- Work Plan: members move steps between weeks.
--
-- Members may now move ANY non-recurring step on their own published plan —
-- coach-set or client-added — into Week 1 through Week 6. They still cannot edit
-- the content of a coach-set step: the new RPC writes timeframe_group,
-- week_number and (once) original_timeframe_group, and nothing else.
--
-- Also fixes update_client_work_plan_task, which changed timeframe_group but
-- left week_number describing the old group (null for every client-added step).
--
-- Applied by hand in the Supabase SQL editor: `supabase db push` is unusable in
-- this repo (remote migration history is out of sync). One transaction, so a
-- partial failure rolls back. Re-runnable.

begin;

-- ─── (1) Where a step started ────────────────────────────────────────────────
-- Set by move_client_work_plan_task on a step's FIRST move only, and never
-- overwritten after that, so staff can see that the client rescheduled it.
-- Staff writes never touch it.
--
-- Staff-only: deliberately NOT added to work_plan_tasks_client. The member board
-- has no use for it, and the views list their columns explicitly, so a new base
-- column stays out of them unless someone adds it on purpose.
alter table public.work_plan_tasks
  add column if not exists original_timeframe_group text;

-- ─── (2) The member move ─────────────────────────────────────────────────────
-- Modeled on update_client_work_plan_task, minus the client-added requirement:
-- assert_client_task_access(p_task_id, false) still pins the task to the
-- caller's studio (profiles.studio_id) and to a published, active plan.
--
-- week_number follows the same mapping as shapeForGroup() in
-- src/app/actions/work-plans.ts: "Week N" → N. The target is restricted to
-- Week 1-6, so N is always set here.
create or replace function public.move_client_work_plan_task(
  p_task_id      uuid,
  p_target_group text
)
returns void language plpgsql security definer set search_path = public
as $$
declare
  v_target    text := btrim(p_target_group);
  v_current   text;
  v_recurring boolean;
begin
  if v_target is null or v_target !~ '^Week [1-6]$' then
    raise exception 'steps can only be moved to Week 1 through Week 6' using errcode = '22023';
  end if;

  perform public.assert_client_task_access(p_task_id, false);

  -- Locked so a concurrent move cannot record the wrong original group.
  select timeframe_group, is_recurring
    into v_current, v_recurring
    from public.work_plan_tasks
   where id = p_task_id
     for update;

  if v_recurring or v_current in ('Weekly', 'Monthly', 'Semester') then
    raise exception 'recurring steps (weekly, monthly, semester) can''t be moved to a week'
      using errcode = '22023';
  end if;

  -- Already there: nothing to move, and nothing to record as an original.
  if v_current = v_target then
    return;
  end if;

  update public.work_plan_tasks
     set original_timeframe_group = coalesce(original_timeframe_group, timeframe_group),
         timeframe_group          = v_target,
         week_number              = substring(v_target from '^Week ([1-6])$')::int
   where id = p_task_id;
end $$;

-- ─── (3) Fix: client edits keep week_number in step with the group ───────────
-- Same body as 20260926000002 plus week_number, mapped as shapeForGroup() does:
-- "Week N" → N; Weekly/Monthly/Semester/Brain dump → null; any custom group
-- leaves week_number alone. is_recurring is left as it was — that column
-- governs whether a step can be moved, and members don't set it.
create or replace function public.update_client_work_plan_task(
  p_task_id         uuid,
  p_title           text,
  p_description     text,
  p_timeframe_group text
)
returns void language plpgsql security definer set search_path = public
as $$
declare
  v_title text := btrim(p_title);
  v_group text := btrim(p_timeframe_group);
  v_desc  text := nullif(btrim(p_description), '');
begin
  if v_title is null or length(v_title) = 0 or length(v_title) > 200 then
    raise exception 'title must be 1-200 characters' using errcode = '22023';
  end if;
  if v_group is null or length(v_group) = 0 or length(v_group) > 60 then
    raise exception 'timeframe group must be 1-60 characters' using errcode = '22023';
  end if;
  if v_desc is not null and length(v_desc) > 5000 then
    raise exception 'description must be 5000 characters or fewer' using errcode = '22001';
  end if;

  perform public.assert_client_task_access(p_task_id, true);

  update public.work_plan_tasks
     set title           = v_title,
         description     = v_desc,
         timeframe_group = v_group,
         week_number     = case
           when v_group ~ '^Week [0-9]{1,9}$'
             then substring(v_group from '^Week ([0-9]{1,9})$')::int
           when v_group in ('Weekly', 'Monthly', 'Semester', 'Brain dump')
             then null
           else week_number
         end
   where id = p_task_id;
end $$;

-- Backfill rows the bug already wrote: client-added steps sitting in a "Week N"
-- group with no week_number. Scoped to exactly that shape; re-running is a no-op.
update public.work_plan_tasks
   set week_number = substring(timeframe_group from '^Week ([0-9]{1,9})$')::int
 where is_client_added
   and week_number is null
   and timeframe_group ~ '^Week [0-9]{1,9}$';

-- ─── (4) Privileges ──────────────────────────────────────────────────────────
-- anon named explicitly: Supabase's default privileges grant it EXECUTE on new
-- functions, and revoking from PUBLIC does not remove that grant.
revoke all on function public.move_client_work_plan_task(uuid, text) from public, anon;
grant execute on function public.move_client_work_plan_task(uuid, text) to authenticated;

-- CREATE OR REPLACE preserves privileges; restated so this file stands alone.
revoke all on function public.update_client_work_plan_task(uuid, text, text, text) from public, anon;
grant execute on function public.update_client_work_plan_task(uuid, text, text, text) to authenticated;

commit;

-- ─── Verification (returns rows, so "Success. No rows returned" cannot mislead)
select 'original_timeframe_group column exists (must be 1)' as check,
       count(*)::text as value
  from information_schema.columns
 where table_schema = 'public' and table_name = 'work_plan_tasks'
   and column_name = 'original_timeframe_group'
union all
select 'original_timeframe_group in ANY client view (must be 0)', count(*)::text
  from information_schema.columns
 where table_schema = 'public' and table_name like '%\_client' escape '\'
   and column_name = 'original_timeframe_group'
union all
select 'move RPC: anon / authenticated EXECUTE (must be false / true)',
       has_function_privilege('anon', 'public.move_client_work_plan_task(uuid,text)', 'execute')::text || ' / ' ||
       has_function_privilege('authenticated', 'public.move_client_work_plan_task(uuid,text)', 'execute')::text
union all
select 'move RPC skips the client-added check (must be true)',
       (pg_get_functiondef('public.move_client_work_plan_task(uuid,text)'::regprocedure)
          like '%assert_client_task_access(p_task_id, false)%')::text
union all
select 'move RPC SET list has no content columns (must be true)',
       (pg_get_functiondef('public.move_client_work_plan_task(uuid,text)'::regprocedure)
          not similar to '%(title|description|internal_note|status|links|is_recurring)[[:space:]]*=%')::text
union all
select 'update RPC now sets week_number (must be true)',
       (pg_get_functiondef('public.update_client_work_plan_task(uuid,text,text,text)'::regprocedure)
          like '%week_number     = case%')::text
union all
select 'update RPC: anon EXECUTE (must be false)',
       has_function_privilege('anon', 'public.update_client_work_plan_task(uuid,text,text,text)', 'execute')::text
union all
select 'client-added tasks in Week N with null week_number (must be 0)',
       count(*)::text
  from public.work_plan_tasks
 where is_client_added and timeframe_group ~ '^Week [0-9]{1,9}$' and week_number is null
 order by 1;

-- ─── ROLLBACK ────────────────────────────────────────────────────────────────
-- begin;
--   drop function if exists public.move_client_work_plan_task(uuid, text);
--   alter table public.work_plan_tasks drop column if exists original_timeframe_group;
--   -- Restore the previous update_client_work_plan_task body from
--   -- 20260926000002_work_plan_client_writes.sql (section 6) if needed; the
--   -- version above differs only by also setting week_number.
-- commit;
