-- Security Advisor: "Public Bucket Allows Listing" (WARN) on storage bucket
-- education-library.
--
-- How the app uses the bucket:
--   * Upload: src/app/api/education/pdf-upload/route.ts, staff-only, through the
--     service-role client (bypasses storage RLS).
--   * Read: the same route stores getPublicUrl(filename) in
--     education_library_items.pdf_url, and the education pages link to that URL
--     (/storage/v1/object/public/education-library/<file>).
--   * Nothing calls .list() or downloads through an authenticated storage client.
--
-- Public-URL downloads from a public bucket don't go through storage.objects
-- RLS, so they don't need this SELECT policy. All the policy adds is the
-- ability for anyone with the anon key to LIST every file in the bucket.
-- Dropping it stops listing; existing PDF links keep working.
--
-- Not done here (needs your OK): the PDFs stay reachable by anyone who has or
-- guesses a URL (filenames are <timestamp>-<original name>). Making them
-- members-only means a private bucket plus short-lived signed URLs, which needs
-- an app change to sign the URL server-side after the tier check.
--
-- If this errors with "must be owner of table objects", delete the policy in
-- Dashboard → Storage → Policies → education-library instead.

drop policy if exists "Public read for education library" on storage.objects;

-- Verification
select policyname, cmd, qual
  from pg_policies
 where schemaname = 'storage' and tablename = 'objects'
   and coalesce(qual, '') like '%education-library%';
-- Expect: no rows.
select id, public from storage.buckets where id = 'education-library';
-- Expect: public = true (unchanged).

-- ROLLBACK
-- create policy "Public read for education library"
--   on storage.objects for select
--   using (bucket_id = 'education-library');
