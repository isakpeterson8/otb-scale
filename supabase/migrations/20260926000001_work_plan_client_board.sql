-- Client-facing Work Plan board, Phase 2.
--
-- Adds a three-state task status, lets a member read ONLY their own published
-- plan (with internal_note structurally unreadable), and lets them move a card
-- through exactly one SECURITY DEFINER RPC. No member UPDATE policy is added to
-- any table, and members are granted nothing on the base tables at all.
--
-- Applied by hand in the Supabase SQL editor: `supabase db push` is unusable in
-- this repo (remote migration history is out of sync). The whole migration is
-- wrapped in one transaction so a partial failure rolls back. Re-runnable.
--
-- SAFE TO APPLY BEFORE THE APP CODE SHIPS. The sync trigger below keeps is_done
-- and status consistent in BOTH directions, so the currently-deployed admin
-- editor — which writes is_done and knows nothing about status — keeps working
-- unchanged between this migration and the UI deploy.
--
-- Naming note: work_plans.status is ('active','archived') — the plan lifecycle.
-- work_plan_tasks.status added here is ('todo','doing','done') — the board
-- column. Different meanings, same column name, deliberately kept short.

begin;

-- ─── (1) Three-state task status ─────────────────────────────────────────────
alter table public.work_plan_tasks
  add column if not exists status text not null default 'todo'
    check (status in ('todo', 'doing', 'done'));

-- Backfill BEFORE the sync trigger exists, so it cannot recurse through it.
-- 'doing' has no historical equivalent — every existing task was done or not.
update public.work_plan_tasks
   set status = case when is_done then 'done' else 'todo' end
 where status is distinct from (case when is_done then 'done' else 'todo' end);

-- ─── (2) Keep is_done / status in lockstep ───────────────────────────────────
-- A TRIGGER rather than application logic, because three separate writers now
-- touch completion: the admin editor (is_done today, status after the UI
-- deploy), the member RPC below (status only), and any hand-run SQL. A trigger
-- enforces the invariant at the single point they all converge. Application
-- logic would have to be duplicated per writer and would drift — and
-- completionPercent() plus the admin list's work_plan_tasks(is_done) count
-- would silently start lying the moment it did.
create or replace function public.sync_work_plan_task_done()
returns trigger
language plpgsql
as $$
declare
  v_status_moved  boolean;
  v_is_done_moved boolean;
  v_was_done      boolean;
begin
  if tg_op = 'INSERT' then
    -- Default rows ('todo' / false) are already consistent; reconcile only when
    -- the inserter set one side explicitly.
    if new.status = 'done' and not new.is_done then
      new.is_done := true;
    elsif new.is_done and new.status <> 'done' then
      new.status := 'done';
    end if;
    v_was_done := false;
  else
    v_status_moved  := new.status  is distinct from old.status;
    v_is_done_moved := new.is_done is distinct from old.is_done;

    -- status is the richer representation, so it wins whenever it moved.
    -- When only is_done moved (the currently-deployed admin editor), status
    -- follows it instead.
    if v_status_moved then
      new.is_done := (new.status = 'done');
    elsif v_is_done_moved then
      new.status := case when new.is_done then 'done' else 'todo' end;
    end if;

    v_was_done := old.is_done;
  end if;

  -- Stamp completion metadata only on a real transition, and never clobber a
  -- value the caller set deliberately in the same statement.
  if new.is_done and not v_was_done then
    new.done_at := coalesce(new.done_at, now());
    new.done_by := coalesce(new.done_by, auth.uid());
  elsif not new.is_done then
    new.done_at := null;
    new.done_by := null;
  end if;

  return new;
end;
$$;

drop trigger if exists work_plan_tasks_sync_done on public.work_plan_tasks;
create trigger work_plan_tasks_sync_done
  before insert or update on public.work_plan_tasks
  for each row execute function public.sync_work_plan_task_done();

-- ─── (3) Which studio is the caller? ─────────────────────────────────────────
-- Mirrors is_staff(): SECURITY DEFINER so it reads profiles without tripping
-- that table's RLS. Uses profiles.studio_id — the app's real user→studio link —
-- and NOT studios.owner_user_id, which is nullable.
create or replace function public.current_studio_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select studio_id from public.profiles where id = auth.uid();
$$;

-- ─── (4) Member reads go through two column-omitting views ───────────────────
-- SECURITY NOTE — read this whole block.
--
-- Postgres RLS is row-level, not column-level. A member SELECT policy on a base
-- table exposes EVERY column of the matching rows to anyone holding the anon
-- key, regardless of which columns the page asks for. Two consequences drove
-- the design here:
--
--   * work_plan_tasks.internal_note is team-only (dated promos to re-verify,
--     seasonal wording) and must never reach a client.
--   * work_plans has no staff-only column TODAY, but a full-row policy would
--     automatically expose any column added later — a plan-level note field
--     would leak the day it was created, with no code change to review.
--
-- So members are granted nothing on either base table. They read these views,
-- which cannot return a column they do not select. internal_note and done_by
-- are omitted from tasks; template_id and created_by from plans.
--
-- security_invoker = false is INTENTIONAL and set explicitly rather than left
-- to the version default. The view runs as its owner and bypasses the base
-- table's RLS, which makes each view's WHERE clause THE security boundary for
-- member reads. Supabase's database advisor flags these as "security definer
-- view" — that warning is EXPECTED here and should not be "fixed" by flipping
-- security_invoker on, which would return zero rows (members have no policy on
-- the base tables) and, if a policy were then added to compensate, would put
-- internal_note back within reach.
--
-- Dropped and recreated rather than CREATE OR REPLACE so a future column change
-- cannot fail on "cannot change name of view column".

drop view if exists public.work_plans_client;
create view public.work_plans_client as
  select
    p.id,
    p.title,
    p.status,
    p.is_published,
    p.created_at,
    p.updated_at
  from public.work_plans p
  where p.is_published
    and p.status = 'active'
    and p.studio_id = public.current_studio_id();

alter view public.work_plans_client set (security_invoker = false);

drop view if exists public.work_plan_tasks_client;
create view public.work_plan_tasks_client as
  select
    t.id,
    t.work_plan_id,
    t.title,
    t.description,
    t.timeframe_group,
    t.week_number,
    t.is_recurring,
    t.starts_after_week,
    t.sort_order,
    t.milestone_tag,
    t.links,
    t.status,
    t.is_done,
    t.done_at,
    t.created_at,
    t.updated_at
  from public.work_plan_tasks t
  join public.work_plans p on p.id = t.work_plan_id
  where p.is_published
    and p.status = 'active'
    and p.studio_id = public.current_studio_id();

alter view public.work_plan_tasks_client set (security_invoker = false);

-- Cleanup: an earlier draft of this migration granted members a full-row SELECT
-- policy on work_plans instead of the view above. Dropped unconditionally so a
-- partial run of that draft cannot leave the wider grant in place.
drop policy if exists "Members read their published work plans" on public.work_plans;

-- ─── (5) The only way a member changes a card ────────────────────────────────
-- SECURITY DEFINER, and it updates exactly one column: status. is_done, done_at
-- and done_by are derived by the trigger in (2), so this function cannot be
-- coaxed into writing task content even if called with unexpected arguments.
create or replace function public.set_work_plan_task_status(
  p_task_id uuid,
  p_status  text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_studio_id    uuid;
  v_is_published boolean;
  v_plan_status  text;
begin
  if p_status not in ('todo', 'doing', 'done') then
    raise exception 'invalid status %', p_status using errcode = '22023';
  end if;

  select p.studio_id, p.is_published, p.status
    into v_studio_id, v_is_published, v_plan_status
    from public.work_plan_tasks t
    join public.work_plans p on p.id = t.work_plan_id
   where t.id = p_task_id;

  if not found then
    raise exception 'task not found' using errcode = 'P0002';
  end if;

  -- Staff act on any plan (the admin editor calls this too, so there is one
  -- write path). Members are held to their own studio's published active plan.
  if not public.is_staff(auth.uid()) then
    if v_studio_id is distinct from public.current_studio_id() then
      raise exception 'not authorized' using errcode = '42501';
    end if;
    if not v_is_published or v_plan_status <> 'active' then
      raise exception 'plan is not available' using errcode = '42501';
    end if;
  end if;

  update public.work_plan_tasks
     set status = p_status
   where id = p_task_id;
end;
$$;

-- ─── (6) Privileges ──────────────────────────────────────────────────────────
-- Supabase's default privileges grant SELECT/EXECUTE to BOTH anon and
-- authenticated on new objects in public. Revoking from PUBLIC does not remove
-- an explicit grant to the anon role, so anon is revoked by name.
--
-- Defence in depth rather than the only line: current_studio_id() returns null
-- for an unauthenticated caller, so every view predicate above would already
-- match zero rows. The revokes make that a guarantee instead of a side effect.

revoke all on public.work_plans_client      from public, anon;
revoke all on public.work_plan_tasks_client from public, anon;
grant select on public.work_plans_client      to authenticated;
grant select on public.work_plan_tasks_client to authenticated;

revoke all on function public.current_studio_id()                        from public, anon;
revoke all on function public.set_work_plan_task_status(uuid, text)      from public, anon;
-- Trigger functions are invoked by the trigger, not called directly, and need
-- no EXECUTE grant to fire. Revoked anyway so it is not callable as an RPC.
revoke all on function public.sync_work_plan_task_done()                 from public, anon;

grant execute on function public.current_studio_id()                   to authenticated;
grant execute on function public.set_work_plan_task_status(uuid, text) to authenticated;

commit;

-- ─── Verification (returns rows, so "Success. No rows returned" cannot mislead)
select 'status column exists' as check,
       (select count(*)::text from information_schema.columns
         where table_schema = 'public' and table_name = 'work_plan_tasks'
           and column_name = 'status') as value
union all
select 'tasks by status',
       coalesce(string_agg(status || '=' || n, ', ' order by status), 'no tasks')
  from (select status, count(*)::text n from public.work_plan_tasks group by status) s
union all
select 'is_done/status disagree (must be 0)', count(*)::text
  from public.work_plan_tasks where is_done <> (status = 'done')
union all
select 'leaky columns in client views (must be 0)', count(*)::text
  from information_schema.columns
 where table_schema = 'public'
   and table_name in ('work_plan_tasks_client', 'work_plans_client')
   and column_name in ('internal_note', 'done_by', 'template_id', 'created_by', 'studio_id')
union all
select 'new functions', coalesce(string_agg(proname, ', ' order by proname), 'MISSING')
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and proname in ('current_studio_id', 'set_work_plan_task_status', 'sync_work_plan_task_done')
union all
select 'member policy on work_plans (must be MISSING)',
       coalesce(string_agg(policyname, ', '), 'MISSING')
  from pg_policies
 where schemaname = 'public' and tablename = 'work_plans'
   and policyname = 'Members read their published work plans'
union all
-- anon must reach nothing. has_*_privilege accounts for grants inherited via
-- PUBLIC as well as direct ones.
select 'anon can SELECT client views (must be false/false)',
       has_table_privilege('anon', 'public.work_plans_client', 'select')::text || ' / ' ||
       has_table_privilege('anon', 'public.work_plan_tasks_client', 'select')::text
union all
select 'anon can EXECUTE new functions (must be false/false/false)',
       has_function_privilege('anon', 'public.current_studio_id()', 'execute')::text || ' / ' ||
       has_function_privilege('anon', 'public.set_work_plan_task_status(uuid,text)', 'execute')::text || ' / ' ||
       has_function_privilege('anon', 'public.sync_work_plan_task_done()', 'execute')::text
union all
select 'authenticated can SELECT client views (must be true/true)',
       has_table_privilege('authenticated', 'public.work_plans_client', 'select')::text || ' / ' ||
       has_table_privilege('authenticated', 'public.work_plan_tasks_client', 'select')::text
union all
select 'anon can SELECT base tables (RLS still blocks rows)',
       has_table_privilege('anon', 'public.work_plans', 'select')::text || ' / ' ||
       has_table_privilege('anon', 'public.work_plan_tasks', 'select')::text
union all
-- Informational: you asked to be told rather than have this enforced.
select 'studios with >1 published active plan', count(*)::text
  from (select studio_id from public.work_plans
         where is_published and status = 'active'
         group by studio_id having count(*) > 1) d
 order by 1;

-- ─── ROLLBACK ────────────────────────────────────────────────────────────────
-- Reverses this migration completely. The status column is dropped last so the
-- trigger cannot fire against a half-removed schema.
--
-- begin;
--   drop function if exists public.set_work_plan_task_status(uuid, text);
--   drop view if exists public.work_plan_tasks_client;
--   drop view if exists public.work_plans_client;
--   drop trigger if exists work_plan_tasks_sync_done on public.work_plan_tasks;
--   drop function if exists public.sync_work_plan_task_done();
--   drop function if exists public.current_studio_id();
--   alter table public.work_plan_tasks drop column if exists status;
-- commit;
