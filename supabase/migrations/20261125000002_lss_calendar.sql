-- Live Support Sessions (Phase 2): Google Calendar invites.
--
-- lss_coaches        — coach first names + emails. Staff only (is_staff).
-- lss_session_hosts  — which coaches host which session. Staff only.
-- lss_google_tokens  — the OAuth tokens for the calendar owner. RLS on with
--                      NO policies: only the service role (server code) can
--                      read or write it. No signed-in user, staff included.
-- lss_settings       — + google_calendar_id, sync settings, ignored events.
-- lss_session_sync   — per-session sync results. Staff only.
-- lss_sessions       — clients keep reading coach_names,
--                      which server code fills with host FIRST NAMES only
--                      ("Alyssa & Isak"); host emails never go in lss_sessions.
--
-- Safe to re-run.

begin;

-- ─── lss_coaches ─────────────────────────────────────────────────────────────
create table if not exists public.lss_coaches (
  id          uuid primary key default gen_random_uuid(),
  first_name  text not null,
  email       text not null,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

create unique index if not exists lss_coaches_email_lower_idx on public.lss_coaches (lower(email));

alter table public.lss_coaches enable row level security;
revoke all on public.lss_coaches from anon;

drop policy if exists "Staff manage lss_coaches" on public.lss_coaches;
create policy "Staff manage lss_coaches" on public.lss_coaches
  for all to authenticated
  using (public.is_staff(auth.uid()))
  with check (public.is_staff(auth.uid()));

insert into public.lss_coaches (first_name, email) values
  ('Alyssa',  'alyssa@alyssamartinvoice.com'),
  ('Chaz',    'charlessonoda2018@u.northwestern.edu'),
  ('Kim',     'kimn.business.education@gmail.com'),
  ('Isak',    'isak@outsidethebachs.com'),
  ('Kelly',   'kelly@outsidethebachs.com'),
  ('Lyndi',   'lyndi@outsidethebachs.com'),
  ('Natasha', 'natasha@outsidethebachs.com')
on conflict ((lower(email))) do nothing;

-- ─── lss_session_hosts ───────────────────────────────────────────────────────
create table if not exists public.lss_session_hosts (
  session_id  uuid not null references public.lss_sessions (id) on delete cascade,
  coach_id    uuid not null references public.lss_coaches (id) on delete restrict,
  position    integer not null default 0,
  primary key (session_id, coach_id)
);

alter table public.lss_session_hosts enable row level security;
revoke all on public.lss_session_hosts from anon;

drop policy if exists "Staff manage lss_session_hosts" on public.lss_session_hosts;
create policy "Staff manage lss_session_hosts" on public.lss_session_hosts
  for all to authenticated
  using (public.is_staff(auth.uid()))
  with check (public.is_staff(auth.uid()));

-- ─── lss_google_tokens (single row, service role only) ───────────────────────
create table if not exists public.lss_google_tokens (
  id                       boolean primary key default true check (id),
  account_email            text,
  refresh_token            text,
  access_token             text,
  access_token_expires_at  timestamptz,
  scope                    text,
  connected_at             timestamptz,
  connected_by             uuid,
  updated_at               timestamptz not null default now()
);

alter table public.lss_google_tokens enable row level security;
-- Deliberately no policies. Belt and braces: no table privileges either.
revoke all on public.lss_google_tokens from anon, authenticated;

drop trigger if exists lss_google_tokens_set_updated_at on public.lss_google_tokens;
create trigger lss_google_tokens_set_updated_at
  before update on public.lss_google_tokens
  for each row execute function public.set_updated_at();

-- ─── lss_settings additions ──────────────────────────────────────────────────
alter table public.lss_settings
  add column if not exists google_calendar_id        text,
  add column if not exists ignored_google_event_ids  text[] not null default '{}',
  add column if not exists invite_send_updates       text not null default 'none'
    check (invite_send_updates in ('all', 'externalOnly', 'none')),
  add column if not exists last_sync_at              timestamptz,
  add column if not exists last_sync_summary         text;

update public.lss_settings
   set google_calendar_id = 'c_b6b32b5a82154861faa2578a1c1fa0f206a61482fe607a48ac21d93a508f2853@group.calendar.google.com'
 where id and google_calendar_id is null;

-- ─── lss_session_sync (staff only) ───────────────────────────────────────────
-- Per-session sync bookkeeping. Kept out of lss_sessions because Scale and
-- Lifetime clients can select every column there, and Google error text can
-- contain email addresses.
create table if not exists public.lss_session_sync (
  session_id     uuid primary key references public.lss_sessions (id) on delete cascade,
  synced_at      timestamptz,
  error          text,
  last_added     integer,
  last_removed   integer,
  attendee_count integer
);

alter table public.lss_session_sync enable row level security;
revoke all on public.lss_session_sync from anon;

drop policy if exists "Staff read lss_session_sync" on public.lss_session_sync;
create policy "Staff read lss_session_sync" on public.lss_session_sync
  for select to authenticated
  using (public.is_staff(auth.uid()));

create unique index if not exists lss_sessions_google_event_id_idx
  on public.lss_sessions (google_event_id) where google_event_id is not null;

commit;

notify pgrst, 'reload schema';
