create table public.education_watch_progress (
  id               uuid        primary key default gen_random_uuid(),
  studio_id        uuid        not null references public.studios(id) on delete cascade,
  item_id          uuid        not null references public.education_library_items(id) on delete cascade,
  watch_pct        int         not null default 0 check (watch_pct >= 0 and watch_pct <= 100),
  seconds_watched  int         not null default 0,
  duration_seconds int         not null default 0,
  completed        bool        not null default false,
  last_watched_at  timestamptz default now(),
  updated_at       timestamptz default now(),
  unique (studio_id, item_id)
);

alter table public.education_watch_progress enable row level security;

-- Studio members can read and write their own rows
create policy "Studio members can manage their own watch progress"
  on public.education_watch_progress
  for all
  to authenticated
  using (
    exists (select 1 from public.profiles where id = auth.uid() and studio_id = education_watch_progress.studio_id)
    or exists (select 1 from public.studios where id = education_watch_progress.studio_id and owner_user_id = auth.uid())
  )
  with check (
    exists (select 1 from public.profiles where id = auth.uid() and studio_id = education_watch_progress.studio_id)
    or exists (select 1 from public.studios where id = education_watch_progress.studio_id and owner_user_id = auth.uid())
  );

-- Admins can read all rows for analytics
create policy "Admins can read all watch progress"
  on public.education_watch_progress
  for select
  to authenticated
  using (
    exists (select 1 from public.profiles where id = auth.uid() and role in ('otb_admin', 'otb_staff'))
  );
