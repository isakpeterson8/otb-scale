-- Drop old table (data will be lost — schema is incompatible)
drop table if exists public.financial_months cascade;

-- New schema
create table public.financial_months (
  id               uuid        primary key default gen_random_uuid(),
  studio_id        uuid        not null,
  year             int         not null,
  month            int         not null check (month between 1 and 12),
  -- Studio metrics
  enrollment       int,
  booked_hrs       numeric,
  goal_hrs         numeric,
  avail_hrs        numeric,
  -- Pipeline
  leads            int,
  consults         int,
  poss_reg         int,
  new_enrollments  int,
  disenrollments   int,
  -- Financials
  est_revenue      numeric,
  collected_revenue numeric,
  expenses         numeric,
  notes            text,
  created_at       timestamptz default now(),
  updated_at       timestamptz default now(),
  unique (studio_id, year, month)
);

alter table public.financial_months enable row level security;

create policy "studio members can manage their financial months"
  on public.financial_months
  for all
  to authenticated
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and studio_id = financial_months.studio_id
    )
    or exists (
      select 1 from public.studios
      where id = financial_months.studio_id and owner_user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and studio_id = financial_months.studio_id
    )
    or exists (
      select 1 from public.studios
      where id = financial_months.studio_id and owner_user_id = auth.uid()
    )
  );
