create table public.organic_outreach (
  id                   uuid        primary key default gen_random_uuid(),
  studio_id            uuid        not null references public.studios(id) on delete cascade,
  name                 text        not null,
  type                 text        not null check (type in ('Organization', 'Independent Teacher', 'Referral Partner', 'Other')),
  contact_info         text,
  last_contacted_date  date,
  notes                text,
  status               text        not null default 'Active' check (status in ('Active', 'Inactive')),
  created_at           timestamptz default now()
);

alter table public.organic_outreach enable row level security;

create policy "Studio members can manage their own outreach"
  on public.organic_outreach
  for all
  to authenticated
  using (
    exists (select 1 from public.studios where id = organic_outreach.studio_id and owner_user_id = auth.uid())
    or exists (select 1 from public.profiles where id = auth.uid() and studio_id = organic_outreach.studio_id)
  )
  with check (
    exists (select 1 from public.studios where id = organic_outreach.studio_id and owner_user_id = auth.uid())
    or exists (select 1 from public.profiles where id = auth.uid() and studio_id = organic_outreach.studio_id)
  );
