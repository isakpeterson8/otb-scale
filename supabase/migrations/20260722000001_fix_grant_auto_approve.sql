-- Fix handle_new_user: auto-approve new signups that have a pre-existing access grant.
-- Previously the trigger unconditionally set status='pending', ignoring admin_access_grants.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_status text := 'pending';
begin
  -- If an active (non-revoked) grant exists for this email, skip the queue.
  if exists (
    select 1 from public.admin_access_grants
    where lower(email) = lower(new.email)
      and revoked_at is null
  ) then
    v_status := 'approved';
  end if;

  insert into public.profiles (id, email, role, status)
  values (new.id, new.email, 'studio_owner', v_status)
  on conflict (id) do nothing;

  return new;
end;
$$;

-- Backfill: approve any profiles that are still pending but already have an active grant.
update public.profiles
set status = 'approved'
where status = 'pending'
  and email is not null
  and lower(email) in (
    select lower(email)
    from public.admin_access_grants
    where revoked_at is null
  );
