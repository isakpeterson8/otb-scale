-- Live Support Sessions: rolling invite window.
--
-- Clients are added to a session's Google event only once it starts within
-- this many days (hosts are always added; removals apply to every upcoming
-- session). The nightly sync adds clients as sessions enter the window.
--
-- Safe to re-run.

alter table public.lss_settings
  add column if not exists invite_window_days integer not null default 14;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.lss_settings'::regclass
       and conname = 'lss_settings_invite_window_days_check'
  ) then
    alter table public.lss_settings
      add constraint lss_settings_invite_window_days_check
      check (invite_window_days between 1 and 365);
  end if;
end $$;

notify pgrst, 'reload schema';
