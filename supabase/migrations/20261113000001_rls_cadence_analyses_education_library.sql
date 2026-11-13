-- Security Advisor: "RLS Disabled in Public" (ERROR) on
--   public.cadence_analyses, public.education_library_items
--
-- Both tables are reached ONLY through the service-role client (adminClient),
-- which bypasses RLS:
--   cadence_analyses        src/app/admin/cadence/actions.ts (insert + latest read,
--                           behind requireAdmin)
--   education_library_items src/app/actions/library.ts (all CRUD + getLibraryItems,
--                           which the /education pages call server-side with their
--                           own tier gate), src/lib/work-plans-data.ts (slug → title),
--                           src/app/actions/admin.ts (embedded in a watch-progress read),
--                           scripts/upload-library.mjs (service role)
--
-- Neither table has a studio_id column, so "clients see their own studio's rows"
-- does not apply: cadence_analyses is one global admin cache, and the library is
-- one shared catalogue.
--
-- So RLS is enabled with NO policies. Effect:
--   * anon and authenticated (any logged-in member, any tier, or a non-member
--     holding the public anon key) can no longer read or write either table
--     through the REST API. Today anyone with the anon key can read every
--     library row, including cf_uid video ids and pdf_url, and insert/update/
--     delete rows in both tables.
--   * the app is unaffected: every read and write is service-role.
--   * library writes are staff-only in practice: the only write paths are the
--     admin server actions (requireAdmin) and the service-role upload script.
--
-- The advisor will then list both tables under "RLS Enabled No Policy" (INFO).
-- That is the intended state, the same as public.video_document_links today.
--
-- Safe to re-run. Applies before or after any code deploy (no code change).

begin;

alter table public.cadence_analyses        enable row level security;
alter table public.education_library_items enable row level security;

commit;

-- Verification
select relname as table_name, relrowsecurity as rls_enabled,
       (select count(*) from pg_policies p
         where p.schemaname = 'public' and p.tablename = c.relname) as policies
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public'
   and relname in ('cadence_analyses', 'education_library_items')
 order by 1;
-- Expect: both rls_enabled = true, policies = 0.

-- ROLLBACK
-- alter table public.cadence_analyses        disable row level security;
-- alter table public.education_library_items disable row level security;
