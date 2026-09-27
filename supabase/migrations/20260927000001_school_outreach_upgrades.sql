-- School Outreach upgrades: website, next-step dropdown, multiple contacts,
-- subject area, activity logging, outreach history.
--
-- Applied by hand in the Supabase SQL editor: `supabase db push` is unusable in
-- this repo (remote migration history is out of sync). One transaction,
-- re-runnable, no temporary or scratch tables — the editor does not keep them
-- across statements, so mappings are inline CTEs.
--
-- WHAT ALREADY EXISTS. public.school_contacts is already present with exactly the
-- shape items 3 and 4 need, and already holds 460 rows — all primary, all with
-- title and subject_area NULL, all created in one batch on 2026-08-31. No
-- application code reads or writes it. So those items are a BACKFILL plus
-- constraints, not a new table: 527 of 987 schools have no contact row, and 395
-- of those do have contact data on the school row that must not be lost.
--
-- INTEGRITY, NOT JUST POLICIES. The existing studio_owner policies scope
-- school_contacts by its OWN studio_id and never check that its school_id belongs
-- to the same studio, so a mislabelled row could point across studios and still
-- satisfy RLS. Composite foreign keys below make that unrepresentable rather than
-- merely disallowed. Postgres 17.6 here, so ON DELETE SET NULL takes a column
-- list and no trigger is needed.
--
-- SCHEMA NOTE. school_contacts.name is NOT NULL with no default on the live
-- table — a first attempt at this migration failed on it. Both inserts below
-- therefore coalesce contact_name to 'Main contact'. Verified against the live
-- column definitions: the only other NOT NULL columns without a default are
-- studio_id, school_id and is_primary, all of which the inserts supply; id,
-- created_at and updated_at are NOT NULL but defaulted.
--
-- ⚠️ FOUR SCHOOLS DISAGREE about the send address — see part (4) and the
-- verification rows. This migration deliberately does not touch them.

begin;

-- ─── (0) Guards: stop rather than fail ───────────────────────────────────────
-- Checked before any constraint is added, so a data problem produces a readable
-- message instead of a foreign-key violation. Both are 0 today.
do $$
declare
  v_cross  bigint;
  v_orphan bigint;
  v_null   bigint;
  v_blank  bigint;
begin
  select count(*) into v_cross
    from public.school_contacts c
    join public.school_outreach s on s.id = c.school_id
   where c.studio_id is distinct from s.studio_id;
  if v_cross > 0 then
    raise exception
      'STOPPING: % school_contacts row(s) have a studio_id different from their school''s. '
      'Reassign or delete them before re-running; the composite foreign key below would '
      'otherwise fail. Query: select c.id, c.studio_id, s.studio_id from public.school_contacts c '
      'join public.school_outreach s on s.id = c.school_id where c.studio_id is distinct from s.studio_id;',
      v_cross;
  end if;

  select count(*) into v_orphan
    from public.school_contacts c
   where not exists (select 1 from public.school_outreach s where s.id = c.school_id);
  if v_orphan > 0 then
    raise exception 'STOPPING: % school_contacts row(s) reference a school that does not exist.', v_orphan;
  end if;

  select count(*) into v_null
    from public.school_contacts
   where school_id is null or studio_id is null;
  if v_null > 0 then
    raise exception
      'STOPPING: % school_contacts row(s) have a NULL school_id or studio_id. A composite key '
      'containing a NULL is not enforced (MATCH SIMPLE), so these must be fixed first.', v_null;
  end if;

  -- Checked here so the school_contacts_has_identity CHECK in part (4) cannot
  -- fail halfway through with an opaque message. Zero rows today.
  select count(*) into v_blank
    from public.school_contacts
   where coalesce(nullif(btrim(name), ''), nullif(btrim(email), ''), nullif(btrim(phone), '')) is null;
  if v_blank > 0 then
    raise exception
      'STOPPING: % school_contacts row(s) have name, email AND phone all blank, which the '
      'school_contacts_has_identity CHECK would reject. Delete or complete them first. '
      'Query: select id, school_id, studio_id from public.school_contacts where '
      'coalesce(nullif(btrim(name), ''''), nullif(btrim(email), ''''), nullif(btrim(phone), '''')) is null;',
      v_blank;
  end if;
end $$;

-- ─── (1) School website ──────────────────────────────────────────────────────
-- Normalisation (adding https:// to a bare domain) happens in the app before the
-- write; the constraint is the backstop so a bare domain cannot be stored and
-- then rendered as a broken relative link.
alter table public.school_outreach
  add column if not exists website text;

alter table public.school_outreach
  drop constraint if exists school_outreach_website_scheme;
alter table public.school_outreach
  add constraint school_outreach_website_scheme
  check (website is null or website ~* '^https?://[^\s]+$');

-- ─── (2) Next step: dropdown + Other notes ───────────────────────────────────
-- next_step_option holds the chosen option. The existing free-text column is
-- KEPT and becomes the "Other" notes box, so no wording is lost and the change is
-- reversible by dropping one column.
alter table public.school_outreach
  add column if not exists next_step_option text;

alter table public.school_outreach
  drop constraint if exists school_outreach_next_step_option;
alter table public.school_outreach
  add constraint school_outreach_next_step_option
  check (next_step_option is null or next_step_option in (
    'send_intro_email', 'follow_up_email', 'call_the_school', 'schedule_a_visit',
    'drop_off_flyers', 'waiting_to_hear_back', 'not_interested_right_now',
    'new_school_year_check_in', 'other'
  ));

-- ⚠️ THE ALIAS LIST IS A JUDGEMENT CALL.
--
-- ZERO of the 182 non-empty next_step values match an option exactly — not even
-- case-insensitively. A strict exact-match rule therefore sends 100% of them to
-- "Other", shipping the dropdown effectively empty.
--
-- These aliases map 143 of 182 (79%) onto real options; the remaining 39 become
-- "Other". The original text is preserved in next_step either way, so nothing is
-- destroyed and any mapping can be revised later. Delete rows from the CTE to
-- reject individual aliases.
with alias(raw, option) as (values
  -- Send intro email
  ('make initial contact', 'send_intro_email'),
  ('initial contact', 'send_intro_email'),
  ('reach out', 'send_intro_email'),
  ('restart contact', 'send_intro_email'),
  ('contact her', 'send_intro_email'),
  -- Follow-up email
  ('follow up', 'follow_up_email'),
  ('follow up 2', 'follow_up_email'),
  ('follow up 3', 'follow_up_email'),
  ('follow up 4', 'follow_up_email'),
  ('follow up 8/25', 'follow_up_email'),
  ('follow up email 4', 'follow_up_email'),
  ('follow up again', 'follow_up_email'),
  ('follow back up if no response', 'follow_up_email'),
  ('send second follow up', 'follow_up_email'),
  ('send second follow up email', 'follow_up_email'),
  ('send second follow-up email', 'follow_up_email'),
  ('send final follow-up email', 'follow_up_email'),
  ('send third follow up', 'follow_up_email'),
  ('send one final follow up', 'follow_up_email'),
  ('send 2nd email in cadence', 'follow_up_email'),
  ('no response email', 'follow_up_email'),
  -- Call the school
  ('call school', 'call_the_school'),
  ('call front desk to get email', 'call_the_school'),
  ('call front desk to get all teacher info', 'call_the_school'),
  ('call front desk and request email directly', 'call_the_school'),
  ('get email', 'call_the_school'),
  -- Schedule a visit
  ('visit', 'schedule_a_visit'),
  ('schedule session', 'schedule_a_visit'),
  ('schedule guest instruction', 'schedule_a_visit'),
  ('booking a date for the visit', 'schedule_a_visit'),
  ('follow up to schedule visit', 'schedule_a_visit'),
  ('follow up about scheduling visit', 'schedule_a_visit'),
  ('follow up for visit', 'schedule_a_visit'),
  -- New school year check-in. Only the hyphenated form exists today (7 rows);
  -- the variants are here so a hand-typed one lands correctly later. Note the
  -- "background check" values are deliberately NOT matched — these are exact.
  ('new school year check-in', 'new_school_year_check_in'),
  ('new school year check in', 'new_school_year_check_in'),
  ('new school year checkin', 'new_school_year_check_in'),
  ('school year check-in', 'new_school_year_check_in'),
  ('school year check in', 'new_school_year_check_in')
)
update public.school_outreach s
   set next_step_option = coalesce(
         (select a.option from alias a
           where a.raw = lower(regexp_replace(btrim(s.next_step), '\s+', ' ', 'g'))),
         'other')
 where s.next_step is not null
   and btrim(s.next_step) <> ''
   and s.next_step_option is null;   -- re-runnable: never revisits a decided row

-- ─── (3) Contacts: backfill ──────────────────────────────────────────────────
-- Every school with contact data on the school row but no contact row gets one,
-- copied verbatim. email comes from school_outreach.email specifically, because
-- that is the address sending uses TODAY — so an existing cadence keeps going to
-- the same place after the switch.
insert into public.school_contacts (studio_id, school_id, name, email, phone, is_primary)
select s.studio_id, s.id,
       -- name is NOT NULL with no default on the live table, and 2 schools carry
       -- an email or phone but no contact_name. A placeholder keeps their reach
       -- details rather than skipping the row.
       coalesce(nullif(btrim(s.contact_name), ''), 'Main contact'),
       nullif(btrim(s.email), ''),
       nullif(btrim(s.phone), ''),
       true
  from public.school_outreach s
 where not exists (select 1 from public.school_contacts c where c.school_id = s.id)
   and coalesce(nullif(btrim(s.contact_name), ''),
                nullif(btrim(s.email), ''),
                nullif(btrim(s.phone), '')) is not null;

-- ─── (3a) Primary contacts missing an email the school row already has ───────
-- Four schools had a primary contact with the right NAME but a NULL email, while
-- the address lived only on the school row. The backfill skipped them (a contact
-- already existed) and (3b) only looks at DIFFERING emails, not missing ones — so
-- sending would have had no address to use. Fills the gap and never overwrites:
-- only a blank contact email is touched.
update public.school_contacts c
   set email = nullif(btrim(s.email), '')
  from public.school_outreach s
 where c.school_id = s.id
   and c.is_primary
   and nullif(btrim(c.email), '') is null
   and nullif(btrim(s.email), '') is not null;

-- ─── (3b) Schools whose contact row disagrees with the send address ──────────
-- Four schools have a primary contact whose email differs from
-- school_outreach.email, which is what sending uses today. Rather than choosing
-- between the two addresses, BOTH are kept: the school row's address becomes the
-- primary, so sending is byte-for-byte unchanged, and the differing address stays
-- as a non-primary contact so the person is not lost.
--
-- Demote first, insert second. The one-primary-per-school unique index is created
-- in part (4) below, so on a first run it does not exist yet — but the order is
-- required for every re-run after that, and the statements are written to be
-- naturally idempotent: once the primary matches, neither matches anything.

update public.school_contacts c
   set is_primary = false
  from public.school_outreach s
 where c.school_id = s.id
   and c.is_primary
   and nullif(btrim(s.email), '') is not null
   and nullif(btrim(c.email), '') is not null
   and lower(btrim(c.email)) <> lower(btrim(s.email));

-- Re-create the primary from the school row. Also repairs any school that has
-- contacts but no primary for some other reason.
insert into public.school_contacts (studio_id, school_id, name, email, phone, is_primary)
select s.studio_id, s.id,
       -- name is NOT NULL with no default on the live table, and 2 schools carry
       -- an email or phone but no contact_name. A placeholder keeps their reach
       -- details rather than skipping the row.
       coalesce(nullif(btrim(s.contact_name), ''), 'Main contact'),
       nullif(btrim(s.email), ''),
       nullif(btrim(s.phone), ''),
       true
  from public.school_outreach s
 where nullif(btrim(s.email), '') is not null
   and not exists (
     select 1 from public.school_contacts c where c.school_id = s.id and c.is_primary
   );

-- Last resort: a school with contacts but no primary and no email to copy gets
-- its oldest contact promoted, so "exactly one primary" holds unconditionally.
update public.school_contacts
   set is_primary = true
 where id in (
   select distinct on (x.school_id) x.id
     from public.school_contacts x
    where not exists (
      select 1 from public.school_contacts p where p.school_id = x.school_id and p.is_primary)
    order by x.school_id, x.created_at, x.id
 );

-- ─── (4) Contact constraints and cross-studio integrity ──────────────────────

-- A composite key containing a NULL is not enforced under MATCH SIMPLE, so these
-- must be NOT NULL for the foreign key below to mean anything. Zero rows violate
-- it today (guarded above).
alter table public.school_contacts
  alter column school_id set not null,
  alter column studio_id set not null;

-- FK target: redundant with the primary key on id, but a composite foreign key
-- needs a matching unique constraint to point at.
alter table public.school_outreach
  drop constraint if exists school_outreach_id_studio_key;
alter table public.school_outreach
  add constraint school_outreach_id_studio_key unique (id, studio_id);

-- The single-column school_id foreign key is superseded by the composite one. It
-- is dropped by discovered name, because two FKs on the same column with
-- different delete rules would leave deletion semantics ambiguous — the stricter
-- rule would silently win.
do $$
declare
  v_name text;
  v_attnum smallint;
begin
  select attnum into v_attnum from pg_attribute
   where attrelid = 'public.school_contacts'::regclass and attname = 'school_id';
  for v_name in
    select conname from pg_constraint
     where conrelid = 'public.school_contacts'::regclass
       and contype = 'f' and conkey = array[v_attnum]
  loop
    execute format('alter table public.school_contacts drop constraint %I', v_name);
    raise notice 'dropped superseded single-column FK %', v_name;
  end loop;
end $$;

-- A contact can now only point at a school in its OWN studio. Not merely
-- disallowed by policy — unrepresentable.
alter table public.school_contacts
  drop constraint if exists school_contacts_school_studio_fkey;
alter table public.school_contacts
  add constraint school_contacts_school_studio_fkey
  foreign key (school_id, studio_id)
  references public.school_outreach (id, studio_id)
  on update cascade on delete cascade;

-- One primary per school, enforced rather than hoped for. Zero schools currently
-- have two, so this cannot fail on today's data.
create unique index if not exists school_contacts_one_primary_per_school
  on public.school_contacts (school_id) where is_primary;

-- A contact needs at least one way to reach it. Tautological while name is NOT
-- NULL, kept so the intent survives if name is ever relaxed.
alter table public.school_contacts
  drop constraint if exists school_contacts_has_identity;
alter table public.school_contacts
  add constraint school_contacts_has_identity
  check (coalesce(name, email, phone) is not null);

-- FK target for the activity table's (contact_id, school_id) pair.
alter table public.school_contacts
  drop constraint if exists school_contacts_id_school_key;
alter table public.school_contacts
  add constraint school_contacts_id_school_key unique (id, school_id);

-- ─── (5) Subject area ────────────────────────────────────────────────────────
-- Column already exists and is NULL on all 460 rows, so the constraint is free.
alter table public.school_contacts
  drop constraint if exists school_contacts_subject_area;
alter table public.school_contacts
  add constraint school_contacts_subject_area
  check (subject_area is null or subject_area in (
    'band', 'choir', 'orchestra', 'general_music', 'piano_keyboard', 'guitar',
    'theater_drama', 'administration', 'other'
  ));

create index if not exists school_contacts_school_idx
  on public.school_contacts (school_id);
create index if not exists school_contacts_subject_area_idx
  on public.school_contacts (studio_id, subject_area) where subject_area is not null;

-- ─── (6) + (7) Activity log and outreach history ─────────────────────────────
-- ONE table for emails, calls, visits and next-step changes, so the timeline is a
-- single ordered read rather than a merge of three sources.
--
-- Unlike the work-plan tables, members write here through ordinary RLS rather
-- than SECURITY DEFINER RPCs: there is no team-only column to keep out of reach,
-- so column-level containment is unnecessary and policies are the simpler tool.
create table if not exists public.school_outreach_activity (
  id              uuid        primary key default gen_random_uuid(),
  studio_id       uuid        not null,
  school_id       uuid        not null,
  -- Which contact it concerned. Nullable: a call to the front desk has none, and
  -- deleting a contact must not erase the history of having talked to them.
  contact_id      uuid,
  activity_type   text        not null
    check (activity_type in ('email', 'call', 'visit', 'other', 'next_step_change')),
  occurred_at     timestamptz not null default now(),
  subject         text,
  notes           text,
  -- Captured at send time for 'email', so history survives a later change of
  -- contact details or a deleted contact.
  email_to        text,
  gmail_thread_id text,
  created_by      uuid        references auth.users(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint school_outreach_activity_subject_len check (subject is null or length(subject) <= 300),
  constraint school_outreach_activity_notes_len   check (notes   is null or length(notes)   <= 5000)
);

-- Same cross-studio guarantee as contacts: an activity row cannot reference
-- another studio's school.
alter table public.school_outreach_activity
  drop constraint if exists school_outreach_activity_school_studio_fkey;
alter table public.school_outreach_activity
  add constraint school_outreach_activity_school_studio_fkey
  foreign key (school_id, studio_id)
  references public.school_outreach (id, studio_id)
  on update cascade on delete cascade;

-- And the contact must belong to the SAME school. Postgres 17 applies SET NULL to
-- the listed column only, so deleting a contact clears contact_id and leaves
-- school_id — the history entry survives, just unattributed.
alter table public.school_outreach_activity
  drop constraint if exists school_outreach_activity_contact_school_fkey;
alter table public.school_outreach_activity
  add constraint school_outreach_activity_contact_school_fkey
  foreign key (contact_id, school_id)
  references public.school_contacts (id, school_id)
  on update cascade on delete set null (contact_id);

create index if not exists school_outreach_activity_timeline_idx
  on public.school_outreach_activity (school_id, occurred_at desc);
create index if not exists school_outreach_activity_studio_idx
  on public.school_outreach_activity (studio_id, occurred_at desc);
create index if not exists school_outreach_activity_contact_idx
  on public.school_outreach_activity (contact_id) where contact_id is not null;

drop trigger if exists school_outreach_activity_set_updated_at on public.school_outreach_activity;
create trigger school_outreach_activity_set_updated_at
  before update on public.school_outreach_activity
  for each row execute function public.set_updated_at();

-- ─── (8) RLS ─────────────────────────────────────────────────────────────────
-- Matches the existing school_outreach / school_contacts pattern exactly: an ALL
-- studio_owner policy using the profiles subquery, plus an otb_admin SELECT
-- policy, both TO PUBLIC.
--
-- Deliberately otb_admin only, NOT otb_staff — consistent with the existing
-- school outreach policies. Note this differs from the work_plan tables, which
-- use is_staff() and so include otb_staff.
--
-- View As runs on the service-role client and bypasses RLS entirely; the app's
-- viewOnly flag is what keeps it read-only, as on every other surface.
alter table public.school_outreach_activity enable row level security;

drop policy if exists studio_owner_school_outreach_activity on public.school_outreach_activity;
create policy studio_owner_school_outreach_activity
  on public.school_outreach_activity for all
  using (studio_id = (select profiles.studio_id from public.profiles where profiles.id = auth.uid()))
  with check (studio_id = (select profiles.studio_id from public.profiles where profiles.id = auth.uid()));

drop policy if exists otb_admin_school_outreach_activity on public.school_outreach_activity;
create policy otb_admin_school_outreach_activity
  on public.school_outreach_activity for select
  using ((select profiles.role from public.profiles where profiles.id = auth.uid()) = 'otb_admin');

-- school_contacts already carries working policies created outside this repo.
-- They are left exactly as they are; this only ensures RLS is on.
alter table public.school_contacts enable row level security;

-- ─── (9) Privileges ─────────────────────────────────────────────────────────
-- Supabase default privileges grant to BOTH anon and authenticated on new objects
-- in public, and revoking from PUBLIC does not remove the anon grant, so anon is
-- named. The studio_owner policy is TO PUBLIC and would evaluate for anon —
-- auth.uid() is null there so it matches nothing, but the revoke makes that a
-- guarantee rather than a consequence.
revoke all on public.school_outreach_activity from public, anon;
grant select, insert, update, delete on public.school_outreach_activity to authenticated;

revoke all on public.school_contacts from public, anon;
grant select, insert, update, delete on public.school_contacts to authenticated;

commit;

-- ─── Verification ────────────────────────────────────────────────────────────
select 'website + next_step_option columns exist (must be 2)' as check,
       count(*)::text as value
  from information_schema.columns
 where table_schema = 'public' and table_name = 'school_outreach'
   and column_name in ('website', 'next_step_option')
union all
select 'activity table exists (must be 1)', count(*)::text
  from information_schema.tables
 where table_schema = 'public' and table_name = 'school_outreach_activity'
union all
-- ── contacts: nothing lost ──
select 'schools with contact data on the school row', count(*)::text
  from public.school_outreach
 where coalesce(nullif(btrim(contact_name), ''), nullif(btrim(email), ''), nullif(btrim(phone), '')) is not null
union all
select 'those schools now having a contact row (must match the line above)', count(*)::text
  from public.school_outreach s
 where coalesce(nullif(btrim(s.contact_name), ''), nullif(btrim(s.email), ''), nullif(btrim(s.phone), '')) is not null
   and exists (select 1 from public.school_contacts c where c.school_id = s.id)
union all
select 'schools with contact data but NO contact row (must be 0)', count(*)::text
  from public.school_outreach s
 where coalesce(nullif(btrim(s.contact_name), ''), nullif(btrim(s.email), ''), nullif(btrim(s.phone), '')) is not null
   and not exists (select 1 from public.school_contacts c where c.school_id = s.id)
union all
select 'every school with contacts has exactly one primary (must be 0 bad)', count(*)::text
  from (select c.school_id from public.school_contacts c
         group by c.school_id
        having count(*) filter (where c.is_primary) <> 1) d
union all
select 'distinct contact emails preserved from school rows (must be 0 missing)', count(*)::text
  from public.school_outreach s
 where nullif(btrim(s.email), '') is not null
   and not exists (
     select 1 from public.school_contacts c
      where c.school_id = s.id and lower(btrim(c.email)) = lower(btrim(s.email)))
union all
-- ── the recipient sending would use, before vs after ──
select 'primary-contact email == school_outreach.email', count(*)::text
  from public.school_outreach s
  join public.school_contacts c on c.school_id = s.id and c.is_primary
 where nullif(btrim(s.email), '') is not null
   and lower(btrim(c.email)) = lower(btrim(s.email))
union all
-- THE assertion that sending is unchanged. Catches both "primary has a different
-- address" and "there is no primary at all".
select 'schools whose primary email != school_outreach.email (MUST BE 0)', count(*)::text
  from public.school_outreach s
 where nullif(btrim(s.email), '') is not null
   and not exists (
     select 1 from public.school_contacts c
      where c.school_id = s.id and c.is_primary
        and lower(btrim(c.email)) = lower(btrim(s.email))
   )
union all
-- The four schools fixed in part (3b), both contacts each. Identified as "schools
-- with more than one contact row" rather than by pinned id, because zero schools
-- had two before this migration.
select 'multi-contact: ' || left(s.school_name, 30)
         || (case when c.is_primary then '  [PRIMARY]' else '  [secondary]' end),
       coalesce(c.email, '(no email)') || '   name=' || coalesce(c.name, '(none)')
  from public.school_outreach s
  join public.school_contacts c on c.school_id = s.id
 where (select count(*) from public.school_contacts x where x.school_id = s.id) > 1
union all
-- ── cross-studio integrity is now structural ──
select 'contacts pointing at another studio''s school (must be 0)', count(*)::text
  from public.school_contacts c
  join public.school_outreach s on s.id = c.school_id
 where c.studio_id is distinct from s.studio_id
union all
select 'composite FKs present (must be 3)', count(*)::text
  from pg_constraint
 where contype = 'f'
   and conname in ('school_contacts_school_studio_fkey',
                   'school_outreach_activity_school_studio_fkey',
                   'school_outreach_activity_contact_school_fkey')
union all
select 'FK ' || conname,
       confupdtype::text || '/' || confdeltype::text || '  (u/d: c=cascade n=setnull a=noaction)'
  from pg_constraint
 where contype = 'f'
   and conrelid in ('public.school_contacts'::regclass, 'public.school_outreach_activity'::regclass)
union all
select 'school_contacts.school_id + studio_id are NOT NULL (must be 2)', count(*)::text
  from information_schema.columns
 where table_schema = 'public' and table_name = 'school_contacts'
   and column_name in ('school_id', 'studio_id') and is_nullable = 'NO'
union all
-- ── next step mapping outcome ──
select 'next_step_option: ' || coalesce(next_step_option, '(null)'), count(*)::text
  from public.school_outreach group by next_step_option
union all
select 'rows with next_step text but no option (must be 0)', count(*)::text
  from public.school_outreach
 where next_step is not null and btrim(next_step) <> '' and next_step_option is null
union all
select 'original next_step text still present (must be 182)', count(*)::text
  from public.school_outreach where next_step is not null and btrim(next_step) <> ''
union all
-- ── anon reaches nothing ──
select 'anon privileges on activity + contacts (must be false / false)',
       has_table_privilege('anon', 'public.school_outreach_activity', 'select')::text || ' / ' ||
       has_table_privilege('anon', 'public.school_contacts', 'select')::text
union all
select 'authenticated can use them (must be true / true)',
       has_table_privilege('authenticated', 'public.school_outreach_activity', 'select')::text || ' / ' ||
       has_table_privilege('authenticated', 'public.school_contacts', 'select')::text
union all
select 'RLS enabled on activity + contacts (must be 2)', count(*)::text
  from pg_tables
 where schemaname = 'public'
   and tablename in ('school_outreach_activity', 'school_contacts')
   and rowsecurity
union all
-- Prints every policy on the three tables, including the pre-existing ones this
-- migration deliberately left alone.
select 'policy: ' || tablename || ' / ' || policyname, cmd
  from pg_policies
 where schemaname = 'public'
   and tablename in ('school_outreach', 'school_contacts', 'school_outreach_activity')
 order by 1;


-- ─── ROLLBACK ────────────────────────────────────────────────────────────────
-- begin;
--   drop table if exists public.school_outreach_activity;
--   alter table public.school_contacts
--     drop constraint if exists school_contacts_school_studio_fkey,
--     drop constraint if exists school_contacts_id_school_key,
--     drop constraint if exists school_contacts_subject_area,
--     drop constraint if exists school_contacts_has_identity;
--   drop index if exists public.school_contacts_one_primary_per_school;
--   drop index if exists public.school_contacts_school_idx;
--   drop index if exists public.school_contacts_subject_area_idx;
--   -- Restore the single-column FK the migration superseded.
--   alter table public.school_contacts
--     add constraint school_contacts_school_id_fkey
--     foreign key (school_id) references public.school_outreach (id) on delete cascade;
--   alter table public.school_outreach
--     drop constraint if exists school_outreach_id_studio_key;
--   -- Removes ONLY the rows this migration created: primary, made after the cutoff,
--   -- and still identical to the contact details on their school row.
--   delete from public.school_contacts c
--    using public.school_outreach s
--    where c.school_id = s.id and c.is_primary
--      and c.created_at > '2026-09-27'
--      and coalesce(c.name,  '') = coalesce(nullif(btrim(s.contact_name), ''), '')
--      and coalesce(c.email, '') = coalesce(nullif(btrim(s.email), ''), '')
--      and coalesce(c.phone, '') = coalesce(nullif(btrim(s.phone), ''), '');
--   alter table public.school_outreach
--     drop constraint if exists school_outreach_next_step_option,
--     drop constraint if exists school_outreach_website_scheme,
--     drop column if exists next_step_option,
--     drop column if exists website;
--   -- NOTE: school_contacts.school_id / studio_id are left NOT NULL. Reverting that
--   -- is only necessary if something depended on them being nullable, which nothing did.
-- commit;
