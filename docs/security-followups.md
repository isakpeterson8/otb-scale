# Security follow-ups

Open items left over from the Security Advisor fixes (PR #43, migrations
`20261113000001`–`000006`). Not fixed yet.

## get_user_role() / get_user_studio_id() still callable by anon

- **Advisor:** 2 × "Public Can Execute SECURITY DEFINER Function" (WARN).
- **Why they stay:** 17 production policies call these two helpers, and they
  apply to every role, anon included. They are on `cadence_queue`, `contacts`,
  `email_bodies`, `email_sends`, `email_templates`, `pipeline_events`,
  `profiles` and `studios`. Revoking EXECUTE from anon would turn anonymous
  reads of those tables from "no rows" into permission errors, so the guard in
  `20261113000003` kept the grants.
- **Neither function is in the repo.** Both were created by hand in production.
- **To fix:** rewrite those 17 policies to use `current_studio_id()` /
  `is_staff(auth.uid())` (or scope them `to authenticated`). Then revoke
  EXECUTE on both helpers from anon and public, and add both functions to the
  repo or drop them.

Find the policies with:

```sql
select schemaname, tablename, policyname, roles
  from pg_policies
 where coalesce(qual, '') || coalesce(with_check, '') ~ 'get_user_(role|studio_id)\('
 order by 2, 3;
```
