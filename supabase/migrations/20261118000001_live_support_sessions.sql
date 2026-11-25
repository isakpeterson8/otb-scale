-- Live Support Sessions (Phase 1)
--
-- lss_sessions  — the recurring group calls. Staff manage them; Scale and
--                 Lifetime studios may read them (same tiers as the
--                 education_library row of ACCESS_MATRIX in src/lib/features.ts).
-- lss_settings  — a single row holding the shared Zoom join URL. Staff only.
--                 The app reads zoom_join_url server-side with the service role
--                 in /lss/join; no client role other than staff can select it.
--
-- Safe to re-run.

begin;

-- ─── Tier helper ─────────────────────────────────────────────────────────────
-- Reads the caller's studio tier from studios.subscription_tier (the one tier
-- system). SECURITY DEFINER so the policy doesn't depend on profiles/studios RLS.
create or replace function public.has_live_support_access(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    join public.studios s on s.id = p.studio_id
    where p.id = uid
      and s.subscription_tier in ('scale', 'lifetime')
  );
$$;

revoke all on function public.has_live_support_access(uuid) from public, anon;
grant execute on function public.has_live_support_access(uuid) to authenticated;

-- ─── lss_sessions ────────────────────────────────────────────────────────────
create table if not exists public.lss_sessions (
  id                 uuid primary key default gen_random_uuid(),
  title              text not null,
  coach_names        text,
  starts_at          timestamptz not null,
  duration_minutes   integer not null default 60 check (duration_minutes > 0),
  description        text,
  facebook_event_url text,
  recording_url      text,
  google_event_id    text, -- reserved for Phase 2
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index if not exists lss_sessions_starts_at_idx on public.lss_sessions (starts_at);

drop trigger if exists lss_sessions_set_updated_at on public.lss_sessions;
create trigger lss_sessions_set_updated_at
  before update on public.lss_sessions
  for each row execute function public.set_updated_at();

alter table public.lss_sessions enable row level security;

drop policy if exists "Staff manage lss_sessions" on public.lss_sessions;
create policy "Staff manage lss_sessions" on public.lss_sessions
  for all to authenticated
  using (public.is_staff(auth.uid()))
  with check (public.is_staff(auth.uid()));

drop policy if exists "Scale and Lifetime read lss_sessions" on public.lss_sessions;
create policy "Scale and Lifetime read lss_sessions" on public.lss_sessions
  for select to authenticated
  using (public.has_live_support_access(auth.uid()));

revoke all on public.lss_sessions from anon;

-- ─── lss_settings (single row) ───────────────────────────────────────────────
create table if not exists public.lss_settings (
  id                 boolean primary key default true check (id), -- only one row can exist
  zoom_join_url      text,
  waiting_room_note  text,
  updated_at         timestamptz not null default now()
);

insert into public.lss_settings (id) values (true) on conflict (id) do nothing;

drop trigger if exists lss_settings_set_updated_at on public.lss_settings;
create trigger lss_settings_set_updated_at
  before update on public.lss_settings
  for each row execute function public.set_updated_at();

alter table public.lss_settings enable row level security;

drop policy if exists "Staff manage lss_settings" on public.lss_settings;
create policy "Staff manage lss_settings" on public.lss_settings
  for all to authenticated
  using (public.is_staff(auth.uid()))
  with check (public.is_staff(auth.uid()));

revoke all on public.lss_settings from anon;

commit;

notify pgrst, 'reload schema';
