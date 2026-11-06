-- Per-group "Initial engagement post complete" checkbox on /facebook-groups.
-- Drives the binary Engagement column in the group list.
--
-- Additive and safe to re-run. Existing groups start unchecked.
-- The older per-post likes/comments/dms columns on group_post_completions are
-- left in place (no longer shown in the UI); drop them in a later migration.

alter table public.facebook_groups
  add column if not exists initial_engagement_post_complete boolean not null default false;

notify pgrst, 'reload schema';
