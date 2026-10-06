-- Canva Edits: canva_link optional for new_build, AI attestation no longer gates submit
--
-- (1) A "New flyer build" request is for a flyer that does not exist yet, so
--     requiring a link to an existing Canva project was asking for something
--     the member cannot supply. Still required by the form and the server
--     action for 'refresh' and 'support'.
--
-- (2) Re-comments ai_flyer_not_generated. 20261005000002 described it as
--     required to submit; it is now optional, so false no longer means only
--     "predates the checkbox" — it also means the member left it unticked.
--     Comment-only change, since that migration is already applied.

alter table public.canva_requests
  alter column canva_link drop not null;

comment on column public.canva_requests.canva_link is
  'Null allowed for new_build requests — a brand-new flyer has no existing Canva project yet. Required by the form and the server action for refresh and support.';

comment on column public.canva_requests.ai_flyer_not_generated is
  'Member attestation from the submission form ("My AI flyer is not generated"). Optional — it does not gate submission — so false means the member left it unticked, or the request predates the checkbox (2026-10-05).';

-- ── Verification ─────────────────────────────────────────────────────────────

select
  (select is_nullable from information_schema.columns
     where table_schema = 'public' and table_name = 'canva_requests'
       and column_name = 'canva_link')                                   as canva_link_nullable_expect_YES,
  (select count(*) from public.canva_requests where canva_link is null)  as null_links_expect_0,
  (select count(*) from public.canva_requests)                           as total_rows_expect_42;
