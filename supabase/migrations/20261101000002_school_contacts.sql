-- Multiple contacts per school, and a log of who each outreach email went to.
--
-- IDEMPOTENT ON PURPOSE. A "Phase A" step may already have created
-- public.school_contacts outside migrations and filled it from the embedded
-- school_outreach.contact_name / email / phone columns
-- (scripts/local/migrate_school_contacts_phasea.py). Whether or not that ran,
-- this migration ends in the same state:
--   * the table exists with every column below,
--   * every school that has old contact info has exactly one primary contact,
--   * at most one primary per school (partial unique index),
--   * RLS policies are exactly the ones defined here.
--
-- The old school_outreach contact columns are left in place and still hold
-- their data; the app stops reading and writing them in this change.
-- TODO: drop school_outreach.contact_name, .email and .phone once
--       school_contacts has been verified in production.
--
-- Relies on public.current_studio_id(), public.is_staff(uuid) and
-- public.set_updated_at() from the work-plans migrations.

begin;

-- ─── Table ──────────────────────────────────────────────────────────────────
create table if not exists public.school_contacts (
  id           uuid        primary key default gen_random_uuid(),
  school_id    uuid        not null references public.school_outreach (id) on delete cascade,
  studio_id    uuid        not null references public.studios (id) on delete cascade,
  name         text        not null,
  title        text,
  subject_area text,
  email        text,
  phone        text,
  notes        text,
  is_primary   boolean     not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- Columns a Phase A table may lack. Harmless when they already exist.
alter table public.school_contacts
  add column if not exists title        text,
  add column if not exists subject_area text,
  add column if not exists email        text,
  add column if not exists phone        text,
  add column if not exists notes        text,
  add column if not exists is_primary   boolean     not null default false,
  add column if not exists created_at   timestamptz not null default now(),
  add column if not exists updated_at   timestamptz not null default now();

-- school_id must cascade when the school is deleted. A Phase A table may have
-- been created with a plain FK (or none); replace it so the behaviour is known.
do $$
declare
  fk record;
begin
  for fk in
    select con.conname
    from pg_constraint con
    join pg_attribute att
      on att.attrelid = con.conrelid and att.attnum = any (con.conkey)
    where con.conrelid = 'public.school_contacts'::regclass
      and con.contype = 'f'
      and att.attname = 'school_id'
      and con.confdeltype <> 'c'
  loop
    execute format('alter table public.school_contacts drop constraint %I', fk.conname);
  end loop;

  if not exists (
    select 1
    from pg_constraint con
    join pg_attribute att
      on att.attrelid = con.conrelid and att.attnum = any (con.conkey)
    where con.conrelid = 'public.school_contacts'::regclass
      and con.contype = 'f'
      and att.attname = 'school_id'
  ) then
    alter table public.school_contacts
      add constraint school_contacts_school_id_fkey
      foreign key (school_id) references public.school_outreach (id) on delete cascade;
  end if;
end $$;

create index if not exists school_contacts_school_id_idx on public.school_contacts (school_id);
create index if not exists school_contacts_studio_id_idx on public.school_contacts (studio_id);

-- ─── One primary per school ─────────────────────────────────────────────────
-- Before adding the unique index, demote any extra primaries (keep the oldest)
-- so the index cannot fail on pre-existing data.
update public.school_contacts c
set is_primary = false
where c.is_primary
  and exists (
    select 1 from public.school_contacts o
    where o.school_id = c.school_id
      and o.is_primary
      and (o.created_at, o.id) < (c.created_at, c.id)
  );

create unique index if not exists school_contacts_one_primary_idx
  on public.school_contacts (school_id)
  where is_primary;

-- ─── Backfill from the old embedded columns ─────────────────────────────────
-- Only schools that have contact info and NO school_contacts row yet, so a
-- prior Phase A run is not duplicated. Same placeholder Phase A used when a
-- school had an email or phone but no name.
insert into public.school_contacts (school_id, studio_id, name, email, phone, is_primary, created_at)
select
  s.id,
  s.studio_id,
  coalesce(nullif(btrim(s.contact_name), ''), '(name needed)'),
  nullif(btrim(s.email), ''),
  nullif(btrim(s.phone), ''),
  true,
  s.created_at
from public.school_outreach s
where (nullif(btrim(s.contact_name), '') is not null
    or nullif(btrim(s.email), '') is not null
    or nullif(btrim(s.phone), '') is not null)
  and not exists (select 1 from public.school_contacts c where c.school_id = s.id);

-- A school with contacts but no primary (possible if Phase A rows were edited
-- by hand) gets its oldest contact promoted.
update public.school_contacts c
set is_primary = true
where c.id in (
  select distinct on (school_id) id
  from public.school_contacts
  where school_id in (
    select school_id from public.school_contacts
    group by school_id
    having not bool_or(is_primary)
  )
  order by school_id, created_at, id
);

-- ─── Primary-contact rules, enforced for every writer ───────────────────────
-- The first contact added to a school becomes its primary.
create or replace function public.school_contacts_default_primary()
returns trigger
language plpgsql
as $$
begin
  if not exists (select 1 from public.school_contacts where school_id = new.school_id) then
    new.is_primary := true;
  end if;
  return new;
end;
$$;

drop trigger if exists school_contacts_default_primary on public.school_contacts;
create trigger school_contacts_default_primary
  before insert on public.school_contacts
  for each row execute function public.school_contacts_default_primary();

-- Deleting the primary promotes the next-oldest contact of that school.
create or replace function public.school_contacts_promote_on_delete()
returns trigger
language plpgsql
as $$
begin
  if old.is_primary then
    update public.school_contacts
    set is_primary = true
    where id = (
      select id from public.school_contacts
      where school_id = old.school_id
      order by created_at, id
      limit 1
    );
  end if;
  return old;
end;
$$;

drop trigger if exists school_contacts_promote_on_delete on public.school_contacts;
create trigger school_contacts_promote_on_delete
  after delete on public.school_contacts
  for each row execute function public.school_contacts_promote_on_delete();

drop trigger if exists school_contacts_set_updated_at on public.school_contacts;
create trigger school_contacts_set_updated_at
  before update on public.school_contacts
  for each row execute function public.set_updated_at();

-- "Make primary": clear the current primary, then set the new one, in one
-- transaction. A single UPDATE flipping both rows could trip the unique index
-- mid-statement. SECURITY INVOKER, so RLS limits it to the caller's studio.
create or replace function public.set_primary_school_contact(p_contact_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_school_id uuid;
begin
  select school_id into v_school_id from public.school_contacts where id = p_contact_id;
  if v_school_id is null then
    raise exception 'contact not found' using errcode = 'P0002';
  end if;
  update public.school_contacts set is_primary = false
   where school_id = v_school_id and is_primary and id <> p_contact_id;
  update public.school_contacts set is_primary = true
   where id = p_contact_id;
end;
$$;

revoke all on function public.set_primary_school_contact(uuid) from public;
grant execute on function public.set_primary_school_contact(uuid) to authenticated, service_role;

-- ─── RLS ────────────────────────────────────────────────────────────────────
-- Drop whatever policies a Phase A table carried, so the end state is exactly
-- the two below. View As reads through the service-role client (no RLS) and is
-- read-only in the app.
alter table public.school_contacts enable row level security;

do $$
declare
  pol record;
begin
  for pol in select policyname from pg_policies where schemaname = 'public' and tablename = 'school_contacts' loop
    execute format('drop policy %I on public.school_contacts', pol.policyname);
  end loop;
end $$;

create policy "Studio members manage their school contacts"
  on public.school_contacts for all to authenticated
  using (studio_id = public.current_studio_id())
  with check (
    studio_id = public.current_studio_id()
    -- the contact's school must belong to the same studio
    and exists (
      select 1 from public.school_outreach s
      where s.id = school_id and s.studio_id = public.current_studio_id()
    )
  );

create policy "Staff manage all school contacts"
  on public.school_contacts for all to authenticated
  using (public.is_staff(auth.uid()))
  with check (public.is_staff(auth.uid()));

-- ─── Outreach email recipients log ──────────────────────────────────────────
-- One row per contact an outreach email was sent to. email/name are snapshots
-- so the log stays accurate if the contact is later edited or deleted.
create table if not exists public.outreach_email_recipients (
  id                uuid        primary key default gen_random_uuid(),
  studio_id         uuid        not null references public.studios (id) on delete cascade,
  school_id         uuid        not null references public.school_outreach (id) on delete cascade,
  enrollment_id     uuid        references public.cadence_enrollments (id) on delete cascade,
  school_contact_id uuid        references public.school_contacts (id) on delete set null,
  email             text        not null,
  name              text,
  email_number      smallint,
  gmail_thread_id   text,
  sent_at           timestamptz not null default now()
);

create index if not exists outreach_email_recipients_school_idx     on public.outreach_email_recipients (school_id, sent_at desc);
create index if not exists outreach_email_recipients_enrollment_idx on public.outreach_email_recipients (enrollment_id);

alter table public.outreach_email_recipients enable row level security;

drop policy if exists "Studio members read their outreach recipients"   on public.outreach_email_recipients;
drop policy if exists "Studio members insert their outreach recipients" on public.outreach_email_recipients;
drop policy if exists "Staff read all outreach recipients"              on public.outreach_email_recipients;

-- Insert + read only: the log is append-only from the app.
create policy "Studio members read their outreach recipients"
  on public.outreach_email_recipients for select to authenticated
  using (studio_id = public.current_studio_id());

create policy "Studio members insert their outreach recipients"
  on public.outreach_email_recipients for insert to authenticated
  with check (
    studio_id = public.current_studio_id()
    and exists (
      select 1 from public.school_outreach s
      where s.id = school_id and s.studio_id = public.current_studio_id()
    )
  );

create policy "Staff read all outreach recipients"
  on public.outreach_email_recipients for select to authenticated
  using (public.is_staff(auth.uid()));

commit;

-- Verification (returns rows, so "Success. No rows returned" cannot mislead).
select 'schools with old contact info'               as check, count(*)::text as value
  from public.school_outreach
 where nullif(btrim(contact_name), '') is not null
    or nullif(btrim(email), '') is not null
    or nullif(btrim(phone), '') is not null
union all
select '  ...of which have NO primary contact (want 0)', count(*)::text
  from public.school_outreach s
 where (nullif(btrim(s.contact_name), '') is not null
     or nullif(btrim(s.email), '') is not null
     or nullif(btrim(s.phone), '') is not null)
   and not exists (select 1 from public.school_contacts c where c.school_id = s.id and c.is_primary)
union all
select 'schools with >1 primary (want 0)', count(*)::text from (
  select school_id from public.school_contacts where is_primary group by school_id having count(*) > 1
) d
union all
select 'school_contacts rows', count(*)::text from public.school_contacts
union all
select 'school_contacts policies', string_agg(policyname, ' | ' order by policyname)
  from pg_policies where schemaname = 'public' and tablename = 'school_contacts';
