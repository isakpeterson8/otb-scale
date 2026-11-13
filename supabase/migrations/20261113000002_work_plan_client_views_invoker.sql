-- Security Advisor: "Security Definer View" (ERROR) on
--   public.work_plans_client, public.work_plan_tasks_client,
--   public.work_plan_task_items_client
--
-- ⚠ PROPOSED, NOT A STRAIGHT FLIP. Read before applying.
--
-- Why not just `security_invoker = true`:
--   Members have no SELECT policy on work_plans / work_plan_tasks /
--   work_plan_task_items (by design, see 20260926000001 section 4). Flipping the
--   views to invoker makes every client board EMPTY. Adding member SELECT
--   policies to fix that would let any member read internal_note (and done_by,
--   created_by, template ids) straight from the base table with their own login,
--   because RLS is row-level, not column-level. Column-level grants can't close
--   that either: staff read/write internal_note through their own session as the
--   same `authenticated` role (src/app/actions/work-plans.ts,
--   src/app/admin/work-plans/[id]/page.tsx), so revoking the column from
--   authenticated would break the admin editor.
--
-- What this does instead:
--   The row filter and column list move out of the views and into three
--   SECURITY DEFINER functions in a `private` schema that the REST API does not
--   expose. The views become security_invoker = true and select from those
--   functions. Same columns, same names, same filter
--   (published + active + studio_id = current_studio_id()), so:
--     * the app code is unchanged (it still selects from the same three views);
--     * a member still sees only their own studio's published active plan;
--     * internal_note still can't be reached by a member;
--     * the "Security Definer View" errors clear, and because the functions are
--       outside the exposed schema they aren't callable as /rpc endpoints and
--       don't add new "SECURITY DEFINER function" warnings.
--   The security boundary is the same as today: the function's WHERE clause.
--   This clears the advisor; it does not change who can see what.
--
-- Safe to re-run. One transaction. No code deploy needed.

begin;

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

-- ─── Row functions (same columns and filter as the current views) ───────────
create or replace function private.work_plans_client_rows()
returns table (
  id           uuid,
  title        text,
  status       text,
  is_published boolean,
  created_at   timestamptz,
  updated_at   timestamptz
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p.id, p.title, p.status, p.is_published, p.created_at, p.updated_at
    from public.work_plans p
   where p.is_published
     and p.status = 'active'
     and p.studio_id = public.current_studio_id();
$$;

create or replace function private.work_plan_tasks_client_rows()
returns table (
  id                uuid,
  work_plan_id      uuid,
  title             text,
  description       text,
  timeframe_group   text,
  week_number       int,
  is_recurring      boolean,
  starts_after_week int,
  sort_order        int,
  milestone_tag     text,
  links             jsonb,
  status            text,
  is_done           boolean,
  done_at           timestamptz,
  client_note       text,
  is_client_added   boolean,
  created_at        timestamptz,
  updated_at        timestamptz
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select t.id, t.work_plan_id, t.title, t.description, t.timeframe_group,
         t.week_number, t.is_recurring, t.starts_after_week, t.sort_order,
         t.milestone_tag, t.links, t.status, t.is_done, t.done_at,
         t.client_note, t.is_client_added,
         t.created_at, t.updated_at
    from public.work_plan_tasks t
    join public.work_plans p on p.id = t.work_plan_id
   where p.is_published
     and p.status = 'active'
     and p.studio_id = public.current_studio_id();
$$;

create or replace function private.work_plan_task_items_client_rows()
returns table (
  id         uuid,
  task_id    uuid,
  title      text,
  sort_order int,
  is_done    boolean,
  done_at    timestamptz,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select i.id, i.task_id, i.title, i.sort_order, i.is_done, i.done_at,
         i.created_at, i.updated_at
    from public.work_plan_task_items i
    join public.work_plan_tasks t on t.id = i.task_id
    join public.work_plans p on p.id = t.work_plan_id
   where p.is_published
     and p.status = 'active'
     and p.studio_id = public.current_studio_id();
$$;

-- With invoker views, the CALLER needs EXECUTE on these functions.
revoke all on function private.work_plans_client_rows()           from public, anon;
revoke all on function private.work_plan_tasks_client_rows()      from public, anon;
revoke all on function private.work_plan_task_items_client_rows() from public, anon;
grant execute on function private.work_plans_client_rows()           to authenticated;
grant execute on function private.work_plan_tasks_client_rows()      to authenticated;
grant execute on function private.work_plan_task_items_client_rows() to authenticated;

-- ─── Views: same names and columns, now security_invoker ────────────────────
drop view if exists public.work_plans_client;
create view public.work_plans_client
  with (security_invoker = true) as
  select * from private.work_plans_client_rows();

drop view if exists public.work_plan_tasks_client;
create view public.work_plan_tasks_client
  with (security_invoker = true) as
  select * from private.work_plan_tasks_client_rows();

drop view if exists public.work_plan_task_items_client;
create view public.work_plan_task_items_client
  with (security_invoker = true) as
  select * from private.work_plan_task_items_client_rows();

-- Dropping the views dropped their grants; restate them.
revoke all on public.work_plans_client           from public, anon;
revoke all on public.work_plan_tasks_client      from public, anon;
revoke all on public.work_plan_task_items_client from public, anon;
grant select on public.work_plans_client           to authenticated;
grant select on public.work_plan_tasks_client      to authenticated;
grant select on public.work_plan_task_items_client to authenticated;

commit;

notify pgrst, 'reload schema';

-- ─── Verification ───────────────────────────────────────────────────────────
select 'views are security_invoker (must be 3)' as check,
       count(*)::text as value
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public'
   and c.relname in ('work_plans_client', 'work_plan_tasks_client', 'work_plan_task_items_client')
   and 'security_invoker=true' = any (c.reloptions)
union all
select 'leaky columns in client views (must be 0)', count(*)::text
  from information_schema.columns
 where table_schema = 'public'
   and table_name in ('work_plans_client', 'work_plan_tasks_client', 'work_plan_task_items_client')
   and column_name in ('internal_note', 'done_by', 'created_by', 'template_id',
                       'template_task_id', 'studio_id', 'original_timeframe_group')
union all
select 'member SELECT policies on base tables (must be 0)', count(*)::text
  from pg_policies
 where schemaname = 'public'
   and tablename in ('work_plans', 'work_plan_tasks', 'work_plan_task_items')
   and coalesce(qual, '') not like '%is_staff%'
union all
select 'anon can SELECT views (must be false/false/false)',
       has_table_privilege('anon', 'public.work_plans_client', 'select')::text || ' / ' ||
       has_table_privilege('anon', 'public.work_plan_tasks_client', 'select')::text || ' / ' ||
       has_table_privilege('anon', 'public.work_plan_task_items_client', 'select')::text
union all
select 'authenticated can SELECT views (must be true/true/true)',
       has_table_privilege('authenticated', 'public.work_plans_client', 'select')::text || ' / ' ||
       has_table_privilege('authenticated', 'public.work_plan_tasks_client', 'select')::text || ' / ' ||
       has_table_privilege('authenticated', 'public.work_plan_task_items_client', 'select')::text
union all
-- Run in the SQL editor this is the postgres role, where auth.uid() is null:
-- current_studio_id() is null, so every view must return 0 rows here.
select 'rows visible with no logged-in user (must be 0)',
       ((select count(*) from public.work_plans_client) +
        (select count(*) from public.work_plan_tasks_client) +
        (select count(*) from public.work_plan_task_items_client))::text
 order by 1;

-- ROLLBACK: re-run section (4) of 20260926000002_work_plan_client_writes.sql
-- and the work_plans_client block of 20260926000001_work_plan_client_board.sql,
-- plus their grants, then:
--   drop function if exists private.work_plans_client_rows();
--   drop function if exists private.work_plan_tasks_client_rows();
--   drop function if exists private.work_plan_task_items_client_rows();
