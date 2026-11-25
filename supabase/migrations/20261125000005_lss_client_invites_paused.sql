-- Live Support Sessions: pause client invites.
--
-- While true, no sync (nightly cron, tier changes, session edits, the admin
-- "Send invites / sync now" button) adds clients to Google events; hosts are
-- still synced and removals still apply. "Preview changes" ignores it so the
-- admin can see what would be sent. Defaults to paused.
--
-- Safe to re-run.

alter table public.lss_settings
  add column if not exists client_invites_paused boolean not null default true;

notify pgrst, 'reload schema';
