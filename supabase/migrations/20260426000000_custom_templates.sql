create table public.custom_templates (
  id           uuid        primary key default gen_random_uuid(),
  studio_id    uuid        not null,
  template_key text        not null,
  subject      text        not null,
  body         text        not null,
  created_at   timestamptz default now(),
  updated_at   timestamptz default now(),
  unique(studio_id, template_key)
);

alter table public.custom_templates enable row level security;

create policy "studio members can manage their custom templates"
  on public.custom_templates
  for all
  to authenticated
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and studio_id = custom_templates.studio_id
    )
    or exists (
      select 1 from public.studios
      where id = custom_templates.studio_id and owner_user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and studio_id = custom_templates.studio_id
    )
    or exists (
      select 1 from public.studios
      where id = custom_templates.studio_id and owner_user_id = auth.uid()
    )
  );
