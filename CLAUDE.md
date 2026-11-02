# otb-scale

## Database migrations: apply to production BEFORE deploying code

Merging to `main` deploys to production on Vercel immediately, but nothing
applies `supabase/migrations/` to the production database. If code that
reads or writes a new column, table or function ships first, production
breaks (for example: "Could not find the 'city' column of 'school_outreach'
in the schema cache", and stats showing 0 when an RPC is missing).

For any PR that adds a migration:

1. Write migrations to be safe to re-run (`if not exists`, `create or replace`,
   guarded `do $$` blocks). Production may already have parts of a change
   that were applied by hand.
2. Apply the migration to production **before** merging the PR:
   `supabase db push --linked`, or paste the file into the Supabase SQL editor.
   If you use the SQL editor, also record the version so `db push` won't rerun it:
   `insert into supabase_migrations.schema_migrations (version, name) values ('<timestamp>', '<name>') on conflict do nothing;`
3. Reload the PostgREST schema cache: `notify pgrst, 'reload schema';`
   (`db push` does this for you).
4. Check the new columns or tables are visible through the API, then merge.

Migrations should be additive (new columns nullable, old columns kept), so
the code that is live now keeps working after the migration and before the
deploy. Drop old columns only in a later migration, once no deployed code
uses them.
