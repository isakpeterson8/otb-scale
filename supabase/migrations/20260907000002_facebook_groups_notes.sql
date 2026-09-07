-- Add a per-group Notes field to facebook_groups, mirroring school_outreach.notes
-- (text, nullable) so both surfaces store notes the same way.
--
-- Applied by hand in the Supabase SQL editor. Do NOT run `supabase db push` in
-- this repo — the remote migration history is out of sync and a push would
-- abort on duplicate objects and re-run data backfills.
--
-- Known limitation: facebook_groups is created by no migration in this repo, so
-- this file is coherent only against the live database, not a from-scratch
-- `db reset` — the same situation as 20260907000001_lead_statuses.sql. Fixing
-- that is the separate schema-baseline task, not this migration's job.

alter table public.facebook_groups
  add column if not exists notes text;
