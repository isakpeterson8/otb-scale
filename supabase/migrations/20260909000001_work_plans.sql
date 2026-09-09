-- Work Plan feature, Phase 1 (admin-only).
--
-- Additive only: four new tables, one staff helper, one clone RPC, and one
-- policy added to public.studios so staff can read client names. Nothing
-- existing is altered, renamed or dropped.
--
-- Applied by hand in the Supabase SQL editor: `supabase db push` is unusable in
-- this repo (remote migration history is out of sync; a push would abort on
-- duplicate objects and re-run data backfills). The whole migration is wrapped
-- in one transaction so a partial failure rolls back.
--
-- Known limitation: public.studios is created by no migration in this repo, so
-- the FK from work_plans is coherent against the live database but not a
-- from-scratch `db reset`. Same situation as 20260907000001..4. That is the
-- separate schema-baseline task, not this migration's job.

begin;

-- ─── Staff gate ──────────────────────────────────────────────────────────────
-- One helper for "who is staff", so the profiles.role escalation weakness is
-- handled in a single place rather than re-inlined per policy the way existing
-- tables do it. SECURITY DEFINER so it reads profiles without tripping that
-- table's own RLS (and without recursive policy evaluation).
create or replace function public.is_staff(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = uid
      and role in ('otb_admin', 'otb_staff')
  );
$$;

revoke all on function public.is_staff(uuid) from public;
grant execute on function public.is_staff(uuid) to authenticated;

-- Keeps updated_at honest. contacts.updated_at is dead in this database
-- (equal to created_at on every row) because nothing maintains it; these
-- tables get a trigger so the column means something.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ─── Templates ───────────────────────────────────────────────────────────────
create table public.work_plan_templates (
  id          uuid        primary key default gen_random_uuid(),
  name        text        not null unique,
  description text,
  is_active   boolean     not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table public.work_plan_template_tasks (
  id                uuid        primary key default gen_random_uuid(),
  template_id       uuid        not null references public.work_plan_templates(id) on delete cascade,
  title             text        not null,
  description       text,
  internal_note     text,
  timeframe_group   text        not null,
  week_number       int,
  is_recurring      boolean     not null default false,
  starts_after_week int,
  sort_order        int         not null default 0,
  milestone_tag     text        not null default 'general'
    check (milestone_tag in ('website', 'gbp', 'instagram', 'flyer', 'seo', 'general')),
  links             jsonb       not null default '[]'::jsonb
    check (jsonb_typeof(links) = 'array'),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- ─── Per-client plans ────────────────────────────────────────────────────────
create table public.work_plans (
  id           uuid        primary key default gen_random_uuid(),
  studio_id    uuid        not null references public.studios(id) on delete cascade,
  template_id  uuid        references public.work_plan_templates(id) on delete set null,
  title        text        not null,
  status       text        not null default 'active' check (status in ('active', 'archived')),
  is_published boolean     not null default false,
  created_by   uuid        references auth.users(id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table public.work_plan_tasks (
  id                uuid        primary key default gen_random_uuid(),
  work_plan_id      uuid        not null references public.work_plans(id) on delete cascade,
  title             text        not null,
  description       text,
  internal_note     text,
  timeframe_group   text        not null,
  week_number       int,
  is_recurring      boolean     not null default false,
  starts_after_week int,
  sort_order        int         not null default 0,
  milestone_tag     text        not null default 'general'
    check (milestone_tag in ('website', 'gbp', 'instagram', 'flyer', 'seo', 'general')),
  links             jsonb       not null default '[]'::jsonb
    check (jsonb_typeof(links) = 'array'),
  is_done           boolean     not null default false,
  done_at           timestamptz,
  done_by           uuid        references auth.users(id),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- ─── Indexes ─────────────────────────────────────────────────────────────────
create index if not exists work_plan_template_tasks_order_idx
  on public.work_plan_template_tasks (template_id, timeframe_group, sort_order);

create index if not exists work_plan_tasks_order_idx
  on public.work_plan_tasks (work_plan_id, timeframe_group, sort_order);

create index if not exists work_plans_studio_status_idx
  on public.work_plans (studio_id, status);

-- ─── updated_at triggers ─────────────────────────────────────────────────────
create trigger work_plan_templates_set_updated_at
  before update on public.work_plan_templates
  for each row execute function public.set_updated_at();

create trigger work_plan_template_tasks_set_updated_at
  before update on public.work_plan_template_tasks
  for each row execute function public.set_updated_at();

create trigger work_plans_set_updated_at
  before update on public.work_plans
  for each row execute function public.set_updated_at();

create trigger work_plan_tasks_set_updated_at
  before update on public.work_plan_tasks
  for each row execute function public.set_updated_at();

-- ─── RLS: staff only, Phase 1 ────────────────────────────────────────────────
-- No client policies this phase. When client access is added it is scoped via
-- profiles.studio_id (the app's real link) and NOT studios.owner_user_id, which
-- is nullable — plus a constrained SECURITY DEFINER RPC for the done-toggle so
-- a client can never edit task content directly.
alter table public.work_plan_templates      enable row level security;
alter table public.work_plan_template_tasks enable row level security;
alter table public.work_plans               enable row level security;
alter table public.work_plan_tasks          enable row level security;

create policy "Staff manage work plan templates"
  on public.work_plan_templates for all to authenticated
  using (public.is_staff(auth.uid()))
  with check (public.is_staff(auth.uid()));

create policy "Staff manage work plan template tasks"
  on public.work_plan_template_tasks for all to authenticated
  using (public.is_staff(auth.uid()))
  with check (public.is_staff(auth.uid()));

create policy "Staff manage work plans"
  on public.work_plans for all to authenticated
  using (public.is_staff(auth.uid()))
  with check (public.is_staff(auth.uid()));

create policy "Staff manage work plan tasks"
  on public.work_plan_tasks for all to authenticated
  using (public.is_staff(auth.uid()))
  with check (public.is_staff(auth.uid()));

-- The admin list joins plans to studio names through the staff member's own
-- session, but the only SELECT policy on studios today is
-- `owner_user_id = auth.uid()`, so staff would read nothing. Added by name only
-- if absent, so re-running is safe and an existing staff policy is left alone.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename  = 'studios'
      and policyname = 'Staff can read studios'
  ) then
    execute 'create policy "Staff can read studios" on public.studios '
         || 'for select to authenticated using (public.is_staff(auth.uid()))';
  end if;
end $$;

-- ─── Clone RPC ───────────────────────────────────────────────────────────────
-- SECURITY DEFINER so the bulk copy runs in one statement, with the staff check
-- re-done inside rather than relying on the caller's policies.
create or replace function public.create_work_plan_from_template(
  p_template_id uuid,
  p_studio_id   uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan_id uuid;
  v_title   text;
begin
  if not public.is_staff(auth.uid()) then
    raise exception 'not authorized';
  end if;

  select name into v_title
  from public.work_plan_templates
  where id = p_template_id;

  if v_title is null then
    raise exception 'template % not found', p_template_id;
  end if;

  insert into public.work_plans (studio_id, template_id, title, created_by)
  values (p_studio_id, p_template_id, v_title, auth.uid())
  returning id into v_plan_id;

  insert into public.work_plan_tasks (
    work_plan_id, title, description, internal_note, timeframe_group,
    week_number, is_recurring, starts_after_week, sort_order, milestone_tag, links
  )
  select v_plan_id, t.title, t.description, t.internal_note, t.timeframe_group,
         t.week_number, t.is_recurring, t.starts_after_week, t.sort_order,
         t.milestone_tag, t.links
  from public.work_plan_template_tasks t
  where t.template_id = p_template_id;

  return v_plan_id;
end;
$$;

revoke all on function public.create_work_plan_from_template(uuid, uuid) from public;
grant execute on function public.create_work_plan_from_template(uuid, uuid) to authenticated;

commit;

-- Verification (returns rows, so "Success. No rows returned" cannot mislead).
select table_name, (select count(*) from information_schema.columns c
                    where c.table_schema = 'public' and c.table_name = t.table_name) as columns
  from information_schema.tables t
 where table_schema = 'public' and table_name like 'work_plan%'
 union all
select 'fn: ' || p.proname, p.prosecdef::int
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.proname in ('is_staff', 'create_work_plan_from_template', 'set_updated_at')
 union all
select 'policy: ' || tablename || ' / ' || policyname, 1
  from pg_policies
 where schemaname = 'public'
   and (tablename like 'work_plan%' or policyname = 'Staff can read studios')
 order by 1;
