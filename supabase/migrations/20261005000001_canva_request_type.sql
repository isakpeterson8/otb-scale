-- Canva Edits: request type picker
--
-- Mirrors the Squarespace Concierge pattern from 20260718000001: a dedicated
-- Postgres enum plus one column on the requests table.
--
-- Two deliberate differences from squarespace_requests.request_type:
--   * a separate enum type, not a reuse of public.request_type — the two
--     pipelines are free to diverge, and Canva has no 'billing_transfer'.
--   * NULLABLE, where the Squarespace column is NOT NULL. Canva requests
--     predate the picker, and we are not guessing a type for them. The form
--     and the server action both require it on new submissions; reads treat
--     null as "No type".

-- ── Enum ─────────────────────────────────────────────────────────────────────

create type public.canva_request_type as enum (
  'new_build',
  'refresh',
  'support'
);

-- ── Column ───────────────────────────────────────────────────────────────────

alter table public.canva_requests
  add column request_type public.canva_request_type;

comment on column public.canva_requests.request_type is
  'Null on requests submitted before the picker shipped (2026-10-05). Never backfilled with a guess; displayed as "No type".';

-- No RLS change needed: the existing policies on canva_requests are row-level
-- (own rows, or any row for otb_admin/otb_staff) and cover the new column.

-- ── Verification ─────────────────────────────────────────────────────────────

select
  (select count(*) from pg_type where typname = 'canva_request_type')                        as enum_exists_expect_1,
  (select count(*) from pg_enum e join pg_type t on t.oid = e.enumtypid
     where t.typname = 'canva_request_type')                                                 as enum_values_expect_3,
  (select count(*) from information_schema.columns
     where table_schema = 'public' and table_name = 'canva_requests'
       and column_name = 'request_type')                                                     as column_exists_expect_1,
  (select is_nullable from information_schema.columns
     where table_schema = 'public' and table_name = 'canva_requests'
       and column_name = 'request_type')                                                     as nullable_expect_YES,
  (select count(*) from public.canva_requests)                                               as total_rows,
  (select count(*) from public.canva_requests where request_type is null)                    as untyped_rows_expect_all;
