-- Drop old monthly table
drop table if exists public.financial_months cascade;

-- Snapshot-based studio metrics
create table public.studio_snapshots (
  id                uuid        primary key default gen_random_uuid(),
  studio_id         uuid        not null,
  snapshot_date     date        not null,
  -- Studio metrics
  enrollment        int,
  booked_hrs        numeric,
  goal_hrs          numeric,
  avail_hrs         numeric,
  -- Pipeline
  leads             int,
  consults          int,
  poss_reg          int,
  new_enrollments   int,
  disenrollments    int,
  -- Financials
  est_revenue       numeric,
  collected_revenue numeric,
  expenses          numeric,
  created_at        timestamptz default now()
);

alter table public.studio_snapshots enable row level security;

create policy "studio members can manage their snapshots"
  on public.studio_snapshots
  for all
  to authenticated
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and studio_id = studio_snapshots.studio_id
    )
    or exists (
      select 1 from public.studios
      where id = studio_snapshots.studio_id and owner_user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and studio_id = studio_snapshots.studio_id
    )
    or exists (
      select 1 from public.studios
      where id = studio_snapshots.studio_id and owner_user_id = auth.uid()
    )
  );
