-- Work Plan Phase 3: client writes.
--
-- Members gain four new abilities — tick checklist items, keep their own notes,
-- add their own tasks, and name their own timeframe groups. Every one of them
-- goes through a SECURITY DEFINER RPC. No member INSERT/UPDATE/DELETE policy is
-- added to any table, and members hold no grants that reach a base table row:
-- they read through views only.
--
-- internal_note remains unreadable AND unwritable by members. The client views
-- do not select it, and no RPC below names it in a SET list; the one INSERT
-- that could reach it pins it to null explicitly.
--
-- Applied by hand in the Supabase SQL editor: `supabase db push` is unusable in
-- this repo (remote migration history is out of sync). One transaction, so a
-- partial failure rolls back. Re-runnable.
--
-- NOTE: this migration does NOT convert the existing "Sub-steps: (1)…" task
-- descriptions. That conversion is a separate, pinned script at the bottom of
-- this file, commented out.

begin;

-- ─── (1) Provenance and client content on tasks ──────────────────────────────
-- is_client_added is the authority for "may the member edit this", set once at
-- insert time. created_by records who; a role can change later, so the boolean
-- rather than a role lookup is what the RPCs test.
-- template_task_id lets the clone RPC copy checklist items set-based (below).
alter table public.work_plan_tasks
  add column if not exists client_note      text,
  add column if not exists is_client_added  boolean not null default false,
  add column if not exists created_by       uuid references auth.users(id),
  add column if not exists template_task_id uuid references public.work_plan_template_tasks(id) on delete set null;

-- Belt and braces behind the RPC's own length check: even a direct staff write
-- cannot park unbounded text in a column the client UI renders.
alter table public.work_plan_tasks
  drop constraint if exists work_plan_tasks_client_note_len;
alter table public.work_plan_tasks
  add constraint work_plan_tasks_client_note_len
  check (client_note is null or length(client_note) <= 10000);

create index if not exists work_plan_tasks_template_task_idx
  on public.work_plan_tasks (template_task_id);

-- Makes the per-plan client-task cap and the "added by client" filter cheap.
create index if not exists work_plan_tasks_client_added_idx
  on public.work_plan_tasks (work_plan_id) where is_client_added;

-- ─── (2) Checklist items ─────────────────────────────────────────────────────
-- Two tables mirroring the existing template/instance split, so the shared task
-- form can edit checklists in both places and the clone carries them across.
create table if not exists public.work_plan_template_task_items (
  id               uuid        primary key default gen_random_uuid(),
  template_task_id uuid        not null references public.work_plan_template_tasks(id) on delete cascade,
  title            text        not null check (length(btrim(title)) between 1 and 300),
  sort_order       int         not null default 0,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create table if not exists public.work_plan_task_items (
  id         uuid        primary key default gen_random_uuid(),
  task_id    uuid        not null references public.work_plan_tasks(id) on delete cascade,
  title      text        not null check (length(btrim(title)) between 1 and 300),
  sort_order int         not null default 0,
  is_done    boolean     not null default false,
  done_at    timestamptz,
  done_by    uuid        references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists work_plan_template_task_items_order_idx
  on public.work_plan_template_task_items (template_task_id, sort_order);
create index if not exists work_plan_task_items_order_idx
  on public.work_plan_task_items (task_id, sort_order);

drop trigger if exists work_plan_template_task_items_set_updated_at on public.work_plan_template_task_items;
create trigger work_plan_template_task_items_set_updated_at
  before update on public.work_plan_template_task_items
  for each row execute function public.set_updated_at();

drop trigger if exists work_plan_task_items_set_updated_at on public.work_plan_task_items;
create trigger work_plan_task_items_set_updated_at
  before update on public.work_plan_task_items
  for each row execute function public.set_updated_at();

-- Stamp/clear completion metadata, mirroring work_plan_tasks_sync_done. The
-- toggle RPC therefore sets only is_done; done_at/done_by are derived here and
-- are never accepted from the caller.
create or replace function public.sync_work_plan_task_item_done()
returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    if new.is_done then
      new.done_at := coalesce(new.done_at, now());
      new.done_by := coalesce(new.done_by, auth.uid());
    else
      new.done_at := null;
      new.done_by := null;
    end if;
    return new;
  end if;

  if new.is_done and not old.is_done then
    new.done_at := coalesce(new.done_at, now());
    new.done_by := coalesce(new.done_by, auth.uid());
  elsif not new.is_done then
    new.done_at := null;
    new.done_by := null;
  end if;
  return new;
end $$;

drop trigger if exists work_plan_task_items_sync_done on public.work_plan_task_items;
create trigger work_plan_task_items_sync_done
  before insert or update on public.work_plan_task_items
  for each row execute function public.sync_work_plan_task_item_done();

-- ─── (3) RLS: staff only, as with every other work_plan table ────────────────
alter table public.work_plan_template_task_items enable row level security;
alter table public.work_plan_task_items          enable row level security;

drop policy if exists "Staff manage work plan template task items" on public.work_plan_template_task_items;
create policy "Staff manage work plan template task items"
  on public.work_plan_template_task_items for all to authenticated
  using (public.is_staff(auth.uid())) with check (public.is_staff(auth.uid()));

drop policy if exists "Staff manage work plan task items" on public.work_plan_task_items;
create policy "Staff manage work plan task items"
  on public.work_plan_task_items for all to authenticated
  using (public.is_staff(auth.uid())) with check (public.is_staff(auth.uid()));

-- ─── (4) Client views ────────────────────────────────────────────────────────
-- work_plan_tasks_client gains client_note and is_client_added. internal_note,
-- done_by, created_by and template_task_id stay out. security_invoker = false
-- is intentional — see the Phase 2 migration's note; the WHERE clause is the
-- security boundary and Supabase's "security definer view" advisory is expected
-- and must not be "fixed".
drop view if exists public.work_plan_tasks_client;
create view public.work_plan_tasks_client as
  select
    t.id, t.work_plan_id, t.title, t.description, t.timeframe_group,
    t.week_number, t.is_recurring, t.starts_after_week, t.sort_order,
    t.milestone_tag, t.links, t.status, t.is_done, t.done_at,
    t.client_note, t.is_client_added,
    t.created_at, t.updated_at
  from public.work_plan_tasks t
  join public.work_plans p on p.id = t.work_plan_id
  where p.is_published and p.status = 'active'
    and p.studio_id = public.current_studio_id();

alter view public.work_plan_tasks_client set (security_invoker = false);

-- Instance checklist items only. done_by omitted (staff attribution).
-- There is deliberately NO client view over work_plan_template_task_items:
-- templates are staff-only at every layer.
drop view if exists public.work_plan_task_items_client;
create view public.work_plan_task_items_client as
  select i.id, i.task_id, i.title, i.sort_order, i.is_done, i.done_at,
         i.created_at, i.updated_at
  from public.work_plan_task_items i
  join public.work_plan_tasks t on t.id = i.task_id
  join public.work_plans p on p.id = t.work_plan_id
  where p.is_published and p.status = 'active'
    and p.studio_id = public.current_studio_id();

alter view public.work_plan_task_items_client set (security_invoker = false);

-- ─── (5) One place the member rules live ─────────────────────────────────────
-- Five RPCs need the same checks. Repeating them five times is how they drift,
-- so they are asserted here once and each RPC calls this first.
-- Returns the plan id so callers that need it do not re-query.
create or replace function public.assert_client_task_access(
  p_task_id              uuid,
  p_require_client_added boolean
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan_id      uuid;
  v_studio_id    uuid;
  v_is_published boolean;
  v_plan_status  text;
  v_client_added boolean;
begin
  select p.id, p.studio_id, p.is_published, p.status, t.is_client_added
    into v_plan_id, v_studio_id, v_is_published, v_plan_status, v_client_added
    from public.work_plan_tasks t
    join public.work_plans p on p.id = t.work_plan_id
   where t.id = p_task_id;

  if not found then
    raise exception 'task not found' using errcode = 'P0002';
  end if;

  -- Staff are unrestricted: the admin editor calls these same RPCs.
  if public.is_staff(auth.uid()) then
    return v_plan_id;
  end if;

  if v_studio_id is distinct from public.current_studio_id() then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if not v_is_published or v_plan_status <> 'active' then
    raise exception 'plan is not available' using errcode = '42501';
  end if;
  if p_require_client_added and not v_client_added then
    raise exception 'that step was set by your OTB coach' using errcode = '42501';
  end if;

  return v_plan_id;
end $$;

-- Plan-level equivalent, for creating a task (there is no task id yet).
create or replace function public.assert_client_plan_access(p_plan_id uuid)
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
  select studio_id, is_published, status
    into v_studio_id, v_is_published, v_plan_status
    from public.work_plans where id = p_plan_id;

  if not found then
    raise exception 'plan not found' using errcode = 'P0002';
  end if;
  if public.is_staff(auth.uid()) then return; end if;
  if v_studio_id is distinct from public.current_studio_id() then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if not v_is_published or v_plan_status <> 'active' then
    raise exception 'plan is not available' using errcode = '42501';
  end if;
end $$;

-- ─── (6) The member write surface ────────────────────────────────────────────
-- Each function names its SET / INSERT columns explicitly, and the one INSERT
-- pins internal_note to null rather than relying on the column default.

-- Tick a checklist item. Resolves item → task, then the shared task assert
-- covers task → plan → studio + published + active. Sets only is_done.
create or replace function public.set_work_plan_task_item_done(
  p_item_id uuid,
  p_is_done boolean
)
returns void language plpgsql security definer set search_path = public
as $$
declare v_task_id uuid;
begin
  select task_id into v_task_id from public.work_plan_task_items where id = p_item_id;
  if not found then raise exception 'item not found' using errcode = 'P0002'; end if;

  perform public.assert_client_task_access(v_task_id, false);

  update public.work_plan_task_items
     set is_done = p_is_done
   where id = p_item_id;
end $$;

-- The client's own notes on a task. Never internal_note.
create or replace function public.set_work_plan_task_client_note(
  p_task_id uuid,
  p_note    text
)
returns void language plpgsql security definer set search_path = public
as $$
begin
  if p_note is not null and length(p_note) > 10000 then
    raise exception 'note must be 10000 characters or fewer' using errcode = '22001';
  end if;

  perform public.assert_client_task_access(p_task_id, false);

  update public.work_plan_tasks
     set client_note = nullif(btrim(p_note), '')
   where id = p_task_id;
end $$;

-- Add a task of the client's own. Starts in To Do. sort_order is computed here,
-- never accepted from the caller.
create or replace function public.create_client_work_plan_task(
  p_plan_id         uuid,
  p_title           text,
  p_description     text,
  p_timeframe_group text
)
returns uuid language plpgsql security definer set search_path = public
as $$
declare
  -- Ceiling on client-added tasks per plan, so the board cannot be flooded.
  c_max_client_tasks constant int := 200;
  v_title text := btrim(p_title);
  v_group text := btrim(p_timeframe_group);
  v_desc  text := nullif(btrim(p_description), '');
  v_count int;
  v_next  int;
  v_id    uuid;
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

  perform public.assert_client_plan_access(p_plan_id);

  select count(*) into v_count
    from public.work_plan_tasks
   where work_plan_id = p_plan_id and is_client_added;
  if v_count >= c_max_client_tasks then
    raise exception 'this plan already has the maximum of % client-added steps', c_max_client_tasks
      using errcode = '54000';
  end if;

  select coalesce(max(sort_order), 0) + 1 into v_next
    from public.work_plan_tasks
   where work_plan_id = p_plan_id and timeframe_group = v_group;

  insert into public.work_plan_tasks (
    work_plan_id, title, description, internal_note, timeframe_group,
    sort_order, status, is_client_added, created_by
  ) values (
    p_plan_id, v_title, v_desc, null, v_group,
    v_next, 'todo', true, auth.uid()
  )
  returning id into v_id;

  return v_id;
end $$;

-- Edit a task the client added. Refuses anything set by staff. The SET list is
-- exactly three columns: work_plan_id, is_client_added, created_by, sort_order,
-- status, internal_note and everything else are unreachable through this path.
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
         timeframe_group = v_group
   where id = p_task_id;
end $$;

-- Delete a task the client added. Refuses anything set by staff.
create or replace function public.delete_client_work_plan_task(p_task_id uuid)
returns void language plpgsql security definer set search_path = public
as $$
begin
  perform public.assert_client_task_access(p_task_id, true);
  delete from public.work_plan_tasks where id = p_task_id;
end $$;

-- ─── (7) Clone carries checklist items ───────────────────────────────────────
-- Extends the Phase 1 RPC. template_task_id on the new rows gives a set-based
-- join for the items, so no per-row loop is needed.
create or replace function public.create_work_plan_from_template(
  p_template_id uuid,
  p_studio_id   uuid
)
returns uuid language plpgsql security definer set search_path = public
as $$
declare
  v_plan_id uuid;
  v_title   text;
begin
  if not public.is_staff(auth.uid()) then
    raise exception 'not authorized';
  end if;

  select name into v_title from public.work_plan_templates where id = p_template_id;
  if v_title is null then
    raise exception 'template % not found', p_template_id;
  end if;

  insert into public.work_plans (studio_id, template_id, title, created_by)
  values (p_studio_id, p_template_id, v_title, auth.uid())
  returning id into v_plan_id;

  insert into public.work_plan_tasks (
    work_plan_id, title, description, internal_note, timeframe_group,
    week_number, is_recurring, starts_after_week, sort_order, milestone_tag, links,
    template_task_id, created_by
  )
  select v_plan_id, t.title, t.description, t.internal_note, t.timeframe_group,
         t.week_number, t.is_recurring, t.starts_after_week, t.sort_order,
         t.milestone_tag, t.links,
         t.id, auth.uid()
  from public.work_plan_template_tasks t
  where t.template_id = p_template_id;

  insert into public.work_plan_task_items (task_id, title, sort_order)
  select nt.id, ti.title, ti.sort_order
  from public.work_plan_tasks nt
  join public.work_plan_template_task_items ti on ti.template_task_id = nt.template_task_id
  where nt.work_plan_id = v_plan_id;

  return v_plan_id;
end $$;

-- ─── (8) Privileges ─────────────────────────────────────────────────────────
-- Supabase default privileges grant to BOTH anon and authenticated on new
-- objects in public, and revoking from PUBLIC does not remove the anon grant,
-- so anon is named everywhere.
--
-- The two new base tables keep their authenticated grant, because staff read
-- and write them through their own session with RLS as the gate. anon is
-- revoked outright: it has no policy and no business holding the grant.
revoke all on public.work_plan_task_items          from public, anon;
revoke all on public.work_plan_template_task_items from public, anon;

revoke all on public.work_plan_task_items_client from public, anon;
grant select on public.work_plan_task_items_client to authenticated;

-- work_plan_tasks_client was dropped and recreated above, so its grants went
-- with it and must be restated.
revoke all on public.work_plan_tasks_client from public, anon;
grant select on public.work_plan_tasks_client to authenticated;

revoke all on function public.assert_client_task_access(uuid, boolean)             from public, anon, authenticated;
revoke all on function public.assert_client_plan_access(uuid)                      from public, anon, authenticated;
revoke all on function public.set_work_plan_task_item_done(uuid, boolean)          from public, anon;
revoke all on function public.set_work_plan_task_client_note(uuid, text)           from public, anon;
revoke all on function public.create_client_work_plan_task(uuid, text, text, text) from public, anon;
revoke all on function public.update_client_work_plan_task(uuid, text, text, text) from public, anon;
revoke all on function public.delete_client_work_plan_task(uuid)                   from public, anon;
revoke all on function public.sync_work_plan_task_item_done()                      from public, anon;

-- create_work_plan_from_template is REPLACED above, not created. CREATE OR REPLACE
-- preserves privileges, so restating them is belt-and-braces — except that Phase 1
-- revoked only from public, leaving anon's default EXECUTE in place. anon is added
-- here. The function fails closed for anon regardless (is_staff(null) is false), so
-- this closes an inconsistency rather than a hole.
revoke all on function public.create_work_plan_from_template(uuid, uuid) from public, anon;
grant execute on function public.create_work_plan_from_template(uuid, uuid) to authenticated;

grant execute on function public.set_work_plan_task_item_done(uuid, boolean)          to authenticated;
grant execute on function public.set_work_plan_task_client_note(uuid, text)           to authenticated;
grant execute on function public.create_client_work_plan_task(uuid, text, text, text) to authenticated;
grant execute on function public.update_client_work_plan_task(uuid, text, text, text) to authenticated;
grant execute on function public.delete_client_work_plan_task(uuid)                   to authenticated;
-- The two assert_* helpers stay internal. The RPCs above call them as their own
-- owner, so authenticated needs no EXECUTE and deliberately does not get it.

commit;

-- ─── Verification ────────────────────────────────────────────────────────────
select 'new tables' as check,
       coalesce(string_agg(table_name, ', ' order by table_name), 'MISSING') as value
  from information_schema.tables
 where table_schema = 'public'
   and table_name in ('work_plan_task_items', 'work_plan_template_task_items')
union all
select 'new task columns',
       coalesce(string_agg(column_name, ', ' order by column_name), 'MISSING')
  from information_schema.columns
 where table_schema = 'public' and table_name = 'work_plan_tasks'
   and column_name in ('client_note', 'is_client_added', 'created_by', 'template_task_id')
union all
-- ── internal_note containment ──
select 'internal_note in ANY client view (must be 0)', count(*)::text
  from information_schema.columns
 where table_schema = 'public' and table_name like '%\_client' escape '\'
   and column_name = 'internal_note'
union all
select 'other leaky columns in client views (must be 0)', count(*)::text
  from information_schema.columns
 where table_schema = 'public'
   and table_name in ('work_plan_tasks_client', 'work_plans_client', 'work_plan_task_items_client')
   and column_name in ('done_by', 'created_by', 'template_id', 'template_task_id', 'studio_id')
union all
select 'client_note + is_client_added exposed (must be 2)', count(*)::text
  from information_schema.columns
 where table_schema = 'public' and table_name = 'work_plan_tasks_client'
   and column_name in ('client_note', 'is_client_added')
union all
-- ── no member write path to any base table ──
select 'non-staff write policies on work_plan tables (must be 0)', count(*)::text
  from pg_policies
 where schemaname = 'public' and tablename like 'work_plan%'
   and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL')
   and coalesce(qual, '') not like '%is_staff%'
union all
select 'RLS enabled on both new tables (must be 2)', count(*)::text
  from pg_tables
 where schemaname = 'public'
   and tablename in ('work_plan_task_items', 'work_plan_template_task_items')
   and rowsecurity
union all
-- ── template items have no member path at all ──
select 'any client view over template items (must be 0)', count(*)::text
  from information_schema.views
 where table_schema = 'public' and table_name like '%template_task_items%'
union all
select 'anon privileges on new base tables (must be false / false)',
       has_table_privilege('anon', 'public.work_plan_task_items', 'select')::text || ' / ' ||
       has_table_privilege('anon', 'public.work_plan_template_task_items', 'select')::text
union all
-- ── anon reaches nothing new ──
select 'anon can SELECT new/changed views (must be false / false)',
       has_table_privilege('anon', 'public.work_plan_task_items_client', 'select')::text || ' / ' ||
       has_table_privilege('anon', 'public.work_plan_tasks_client', 'select')::text
union all
select 'authenticated can SELECT them (must be true / true)',
       has_table_privilege('authenticated', 'public.work_plan_task_items_client', 'select')::text || ' / ' ||
       has_table_privilege('authenticated', 'public.work_plan_tasks_client', 'select')::text
union all
select 'anon can EXECUTE any new RPC (must be all false)',
       has_function_privilege('anon', 'public.set_work_plan_task_item_done(uuid,boolean)', 'execute')::text || ' / ' ||
       has_function_privilege('anon', 'public.set_work_plan_task_client_note(uuid,text)', 'execute')::text || ' / ' ||
       has_function_privilege('anon', 'public.create_client_work_plan_task(uuid,text,text,text)', 'execute')::text || ' / ' ||
       has_function_privilege('anon', 'public.update_client_work_plan_task(uuid,text,text,text)', 'execute')::text || ' / ' ||
       has_function_privilege('anon', 'public.delete_client_work_plan_task(uuid)', 'execute')::text
union all
select 'assert_* helpers stay internal (all four must be false)',
       has_function_privilege('anon',          'public.assert_client_task_access(uuid,boolean)', 'execute')::text || ' / ' ||
       has_function_privilege('anon',          'public.assert_client_plan_access(uuid)',         'execute')::text || ' / ' ||
       has_function_privilege('authenticated', 'public.assert_client_task_access(uuid,boolean)', 'execute')::text || ' / ' ||
       has_function_privilege('authenticated', 'public.assert_client_plan_access(uuid)',         'execute')::text
union all
-- ── the deployed function bodies really contain the guards ──
select 'create RPC pins internal_note null + caps at 200 (must be true / true)',
       (pg_get_functiondef('public.create_client_work_plan_task(uuid,text,text,text)'::regprocedure)
          like '%internal_note%null%')::text || ' / ' ||
       (pg_get_functiondef('public.create_client_work_plan_task(uuid,text,text,text)'::regprocedure)
          like '%c_max_client_tasks constant int := 200%')::text
union all
select 'update RPC SET list is exactly 3 columns (must be true)',
       (pg_get_functiondef('public.update_client_work_plan_task(uuid,text,text,text)'::regprocedure)
          not like '%internal_note%'
        and pg_get_functiondef('public.update_client_work_plan_task(uuid,text,text,text)'::regprocedure)
          not like '%is_client_added =%'
        and pg_get_functiondef('public.update_client_work_plan_task(uuid,text,text,text)'::regprocedure)
          not like '%work_plan_id =%'
        and pg_get_functiondef('public.update_client_work_plan_task(uuid,text,text,text)'::regprocedure)
          not like '%status =%')::text
union all
select 'anon can EXECUTE clone RPC (must be false)',
       has_function_privilege('anon', 'public.create_work_plan_from_template(uuid,uuid)', 'execute')::text
union all
select 'staff can EXECUTE clone RPC (must be true)',
       has_function_privilege('authenticated', 'public.create_work_plan_from_template(uuid,uuid)', 'execute')::text
union all
select 'tasks by provenance',
       coalesce(string_agg(k || '=' || n, ', ' order by k), 'no tasks')
  from (select case when is_client_added then 'client' else 'staff' end k, count(*)::text n
          from public.work_plan_tasks group by 1) s
union all
select 'checklist items', (select count(*)::text from public.work_plan_task_items)
 order by 1;


-- ═══════════════════════════════════════════════════════════════════════════
-- SUB-STEP CONVERSION — NOT RUN BY THIS MIGRATION.
--
-- Three rows contain "Sub-steps: (1)…", and in all three the description is
-- ENTIRELY the sub-step text (197 chars, starting at "Sub-steps:"), so the
-- description becomes NULL rather than keeping a prefix. Ids are pinned rather
-- than pattern-matched, so what runs is what was reviewed.
--
-- begin;
--   -- Guard: all three rows must still look as reviewed.
--   do $$
--   declare v_n int;
--   begin
--     select count(*) into v_n from public.work_plan_tasks
--      where id in ('3f25d6f8-829e-4456-9482-0617d3076c4f',
--                   '7f534dd5-920f-4217-b61e-5b48c33e7698')
--        and description like 'Sub-steps: (1) outline package options%';
--     if v_n <> 2 then raise exception 'expected 2 instance rows, found %', v_n; end if;
--
--     select count(*) into v_n from public.work_plan_template_tasks
--      where id = '10c3faaa-f788-4e24-a57f-0b61cd19df6f'
--        and description like 'Sub-steps: (1) outline package options%';
--     if v_n <> 1 then raise exception 'expected 1 template row, found %', v_n; end if;
--   end $$;
--
--   insert into public.work_plan_template_task_items (template_task_id, title, sort_order)
--   values
--     ('10c3faaa-f788-4e24-a57f-0b61cd19df6f', 'Outline package options (3-6 lessons)', 1),
--     ('10c3faaa-f788-4e24-a57f-0b61cd19df6f', 'Create promo flyer (request Canva edit support)', 2),
--     ('10c3faaa-f788-4e24-a57f-0b61cd19df6f', 'Set up enrollment process (consultation + registration in studio management software)', 3);
--
--   insert into public.work_plan_task_items (task_id, title, sort_order)
--   select t.id, v.title, v.sort_order
--   from (values
--     ('3f25d6f8-829e-4456-9482-0617d3076c4f'::uuid),
--     ('7f534dd5-920f-4217-b61e-5b48c33e7698'::uuid)
--   ) as t(id)
--   cross join (values
--     ('Outline package options (3-6 lessons)', 1),
--     ('Create promo flyer (request Canva edit support)', 2),
--     ('Set up enrollment process (consultation + registration in studio management software)', 3)
--   ) as v(title, sort_order);
--
--   -- Only now is the original text cleared.
--   update public.work_plan_tasks set description = null
--    where id in ('3f25d6f8-829e-4456-9482-0617d3076c4f',
--                 '7f534dd5-920f-4217-b61e-5b48c33e7698');
--   update public.work_plan_template_tasks set description = null
--    where id = '10c3faaa-f788-4e24-a57f-0b61cd19df6f';
-- commit;
--
-- select 'template items' as check, count(*)::text as value from public.work_plan_template_task_items
-- union all select 'instance items', count(*)::text from public.work_plan_task_items;


-- ─── ROLLBACK for this migration ─────────────────────────────────────────────
-- begin;
--   drop function if exists public.delete_client_work_plan_task(uuid);
--   drop function if exists public.update_client_work_plan_task(uuid, text, text, text);
--   drop function if exists public.create_client_work_plan_task(uuid, text, text, text);
--   drop function if exists public.set_work_plan_task_client_note(uuid, text);
--   drop function if exists public.set_work_plan_task_item_done(uuid, boolean);
--   drop function if exists public.assert_client_plan_access(uuid);
--   drop function if exists public.assert_client_task_access(uuid, boolean);
--   drop view if exists public.work_plan_task_items_client;
--   drop table if exists public.work_plan_task_items;
--   drop table if exists public.work_plan_template_task_items;
--   drop function if exists public.sync_work_plan_task_item_done();
--   alter table public.work_plan_tasks
--     drop constraint if exists work_plan_tasks_client_note_len,
--     drop column if exists template_task_id,
--     drop column if exists created_by,
--     drop column if exists is_client_added,
--     drop column if exists client_note;
--   drop view if exists public.work_plan_tasks_client;
--   create view public.work_plan_tasks_client as
--     select t.id, t.work_plan_id, t.title, t.description, t.timeframe_group,
--            t.week_number, t.is_recurring, t.starts_after_week, t.sort_order,
--            t.milestone_tag, t.links, t.status, t.is_done, t.done_at,
--            t.created_at, t.updated_at
--       from public.work_plan_tasks t
--       join public.work_plans p on p.id = t.work_plan_id
--      where p.is_published and p.status = 'active'
--        and p.studio_id = public.current_studio_id();
--   alter view public.work_plan_tasks_client set (security_invoker = false);
--   revoke all on public.work_plan_tasks_client from public, anon;
--   grant select on public.work_plan_tasks_client to authenticated;
--   -- NOTE: also restore the Phase 1 create_work_plan_from_template (no item copy)
--   -- from 20260909000001_work_plans.sql.
-- commit;
