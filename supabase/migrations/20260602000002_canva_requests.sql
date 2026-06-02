create table public.canva_requests (
  id            uuid        primary key default gen_random_uuid(),
  studio_id     uuid        not null references public.studios(id) on delete cascade,
  user_id       uuid        not null references auth.users(id),
  asset_type    text        not null,
  instructions  text        not null,
  canva_link    text        not null,
  reference_url text,
  status        text        not null default 'pending' check (status in ('pending', 'in_progress', 'complete')),
  assigned_to   text,
  created_at    timestamptz not null default now(),
  completed_at  timestamptz
);

alter table public.canva_requests enable row level security;

create policy "Users can manage their own requests"
  on public.canva_requests
  for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "Admins can manage all requests"
  on public.canva_requests
  for all
  to authenticated
  using (exists (select 1 from public.profiles where id = auth.uid() and role in ('otb_admin', 'otb_staff')));
