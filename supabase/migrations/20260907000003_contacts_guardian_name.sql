-- Add an optional guardian/parent/decision-maker name to contacts.
-- Surfaced on the Edit-lead modal as "Contact Name (parent, guardian or
-- decision maker)", between the required Name field and Email.
--
-- Named guardian_name rather than contact_name to avoid a confusing
-- contacts.name / contacts.contact_name pair on the same table.
-- school_outreach.contact_name is the analogous column on that table.
--
-- Applied by hand in the Supabase SQL editor. Do NOT run `supabase db push` in
-- this repo — the remote migration history is out of sync and a push would
-- abort on duplicate objects and re-run data backfills.
--
-- Known limitation: contacts is created by no migration in this repo, so this
-- file is coherent only against the live database, not a from-scratch
-- `db reset` — same as 20260907000001 and 20260907000002. Fixing that is the
-- separate schema-baseline task, not this migration's job.

alter table public.contacts
  add column if not exists guardian_name text;
