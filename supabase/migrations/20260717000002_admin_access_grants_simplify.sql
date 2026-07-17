alter table public.admin_access_grants
  drop column if exists expires_at,
  drop column if exists reason;
