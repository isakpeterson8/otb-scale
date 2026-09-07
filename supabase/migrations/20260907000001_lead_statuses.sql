-- Replace the contacts.status option set with the nine-stage lead pipeline.
--
-- contacts.status is plain `text` (no Postgres enum, so no enum values to drop).
-- Sequence:
--   1. snapshot the current values so nothing is lost irrecoverably,
--   2. clear every row holding one of the five retired values
--      (prospect, lead, active, inactive, student) — deliberately NOT mapped
--      onto the new set, so each lead is re-triaged by hand,
--   3. drop any pre-existing CHECK constraint on the column,
--   4. add a CHECK allowing only the nine new values (or NULL = needs triage).
--
-- Keep the value list in sync with LEAD_STATUSES in src/types/database.ts.

-- 1. Snapshot the pre-migration values. Service-role only (RLS on, no policies).
create table if not exists public.contacts_status_backup_20260907 (
  contact_id   uuid primary key references public.contacts (id) on delete cascade,
  old_status   text,
  backed_up_at timestamptz not null default now()
);

alter table public.contacts_status_backup_20260907 enable row level security;

insert into public.contacts_status_backup_20260907 (contact_id, old_status)
select id, status
from public.contacts
where status in ('prospect', 'lead', 'active', 'inactive', 'student')
on conflict (contact_id) do nothing;

-- 2. Clear the retired values.
update public.contacts
set status = null
where status in ('prospect', 'lead', 'active', 'inactive', 'student');

-- 3. Drop any CHECK constraint that covers contacts.status.
do $$
declare
  con_name text;
  status_attnum smallint;
begin
  select attnum into status_attnum
  from pg_attribute
  where attrelid = 'public.contacts'::regclass and attname = 'status';

  for con_name in
    select con.conname
    from pg_constraint con
    where con.conrelid = 'public.contacts'::regclass
      and con.contype = 'c'
      and status_attnum = any (con.conkey)
  loop
    execute format('alter table public.contacts drop constraint %I', con_name);
  end loop;
end $$;

-- 4. Only the nine pipeline statuses are storable from here on.
alter table public.contacts
  add constraint contacts_status_check
  check (status is null or status in (
    'to be contacted',
    'initial outreach campaign',
    'consultation scheduled',
    'pending registration',
    'future follow-up',
    'not interested',
    'active student',
    'past student',
    'waitlist'
  ));
