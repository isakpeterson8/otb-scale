-- Canva Edits: "My AI flyer is not generated" attestation
--
-- Unlike the two checkboxes already on the form ("I have all essential flyer
-- info ready" and "I have shared edit access"), this one is persisted. Those
-- two are client-only submit gates — no column, never sent to the server — so
-- there was no existing storage pattern to mirror here.
--
-- not null default false gives the 42 pre-existing requests "unchecked", and
-- needs no backfill statement.

alter table public.canva_requests
  add column ai_flyer_not_generated boolean not null default false;

comment on column public.canva_requests.ai_flyer_not_generated is
  'Member attestation from the submission form ("My AI flyer is not generated"). Required to submit, so true on everything sent after 2026-10-05; false on requests predating the checkbox.';

-- No RLS change needed: the policies on canva_requests are row-level and the
-- table-level grants cover new columns.

-- ── Verification ─────────────────────────────────────────────────────────────

select
  (select count(*) from information_schema.columns
     where table_schema = 'public' and table_name = 'canva_requests'
       and column_name = 'ai_flyer_not_generated')                                  as column_exists_expect_1,
  (select is_nullable from information_schema.columns
     where table_schema = 'public' and table_name = 'canva_requests'
       and column_name = 'ai_flyer_not_generated')                                  as nullable_expect_NO,
  (select column_default from information_schema.columns
     where table_schema = 'public' and table_name = 'canva_requests'
       and column_name = 'ai_flyer_not_generated')                                  as default_expect_false,
  (select count(*) from public.canva_requests)                                      as total_rows,
  (select count(*) from public.canva_requests where ai_flyer_not_generated = false) as unchecked_expect_all;
