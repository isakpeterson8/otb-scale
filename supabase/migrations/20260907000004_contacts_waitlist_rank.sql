-- Add a manual ranking column for the Waitlist tab at /leads/waitlist.
--
-- Nullable on purpose: a newly waitlisted lead has no rank and sorts to the
-- bottom (ORDER BY waitlist_rank ASC NULLS LAST, name ASC) until someone drags
-- it into position. Reordering renumbers the whole ordered set 0..n-1.
--
-- Applied by hand in the Supabase SQL editor. Do NOT run `supabase db push` in
-- this repo — the remote migration history is out of sync and a push would
-- abort on duplicate objects and re-run data backfills.
--
-- Known limitation: contacts is created by no migration in this repo, so this
-- file is coherent only against the live database, not a from-scratch
-- `db reset` — same as 20260907000001, 20260907000002 and 20260907000003.
-- Fixing that is the separate schema-baseline task, not this migration's job.

alter table public.contacts
  add column if not exists waitlist_rank integer;
