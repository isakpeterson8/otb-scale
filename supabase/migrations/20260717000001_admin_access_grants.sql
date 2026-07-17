-- admin_access_grants: bypass billing to grant tier access by email
create table if not exists public.admin_access_grants (
  id          uuid primary key default gen_random_uuid(),
  email       text not null,
  tier        text not null,
  granted_by  uuid references auth.users(id),
  granted_at  timestamptz not null default now(),
  expires_at  timestamptz,
  reason      text,
  revoked_at  timestamptz,
  revoked_by  uuid references auth.users(id)
);

create index if not exists admin_access_grants_email_idx
  on public.admin_access_grants (lower(email));

-- normalize email to lowercase on insert/update
create or replace function public.normalize_grant_email()
returns trigger language plpgsql as $$
begin
  new.email := lower(new.email);
  return new;
end;
$$;

create trigger normalize_grant_email_trg
  before insert or update on public.admin_access_grants
  for each row execute procedure public.normalize_grant_email();

alter table public.admin_access_grants enable row level security;

create policy "otb_staff_manage_grants"
  on public.admin_access_grants
  for all
  to authenticated
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid()
        and role in ('otb_admin', 'otb_staff')
    )
  )
  with check (
    exists (
      select 1 from public.profiles
      where id = auth.uid()
        and role in ('otb_admin', 'otb_staff')
    )
  );
