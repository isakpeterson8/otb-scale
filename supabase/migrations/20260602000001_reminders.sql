create table public.reminders (
  id         uuid        primary key default gen_random_uuid(),
  studio_id  uuid        not null references public.studios(id) on delete cascade,
  user_id    uuid        not null references auth.users(id) on delete cascade,
  type       text        not null check (type in ('cadence_weekly', 'data_recap_monthly', 'admin_manual')),
  message    text,
  is_read    boolean     not null default false,
  created_at timestamptz not null default now(),
  created_by uuid        references auth.users(id)
);

alter table public.reminders enable row level security;

create policy "Users can read their own reminders"
  on public.reminders
  for select
  to authenticated
  using (user_id = auth.uid());

create policy "Users can update their own reminders"
  on public.reminders
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "Admins can manage all reminders"
  on public.reminders
  for all
  to authenticated
  using (exists (select 1 from public.profiles where id = auth.uid() and role in ('otb_admin', 'otb_staff')));
