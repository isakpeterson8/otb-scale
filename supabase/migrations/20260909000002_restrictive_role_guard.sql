-- Record the profiles role-escalation fix in the repo.
--
-- ⚠️  RECONSTRUCTED, NOT TRANSCRIBED. The policy was applied by hand in the
-- Supabase SQL editor and the applied text was never captured here, so this
-- file is rebuilt from two pieces of evidence:
--   1. the original permissive policy in 20260528000001_prevent_role_self_escalation.sql
--   2. the runtime error it now raises, which names it verbatim:
--      42501 new row violates row-level security policy
--      "Users cannot update their own role" for table "profiles"
-- Confirm it matches production before trusting it — query at the bottom.
--
-- DO NOT APPLY to production: the policy already exists there and this is a
-- no-op. It exists so a from-scratch rebuild recreates the guard, which a
-- rebuild would otherwise silently omit — the fix lives only in the live
-- database today.
--
-- Why the original did not hold: 20260528000001 created this policy as
-- PERMISSIVE, and Postgres ORs permissive policies for the same command. The
-- sibling policy "Users can update their own profile" (20260424000002) has
-- WITH CHECK (id = auth.uid()), which passes for anyone editing their own row,
-- so the role guard never had to pass. AS RESTRICTIVE makes it AND rather than
-- OR, so it must pass in addition to the permissive policy.
--
-- The permissive policy is deliberately left alone: legitimate self-edits such
-- as display_name still depend on it.

begin;

drop policy if exists "Users cannot update their own role" on public.profiles;

create policy "Users cannot update their own role"
  as restrictive
  on public.profiles
  for update
  to authenticated
  using (auth.uid() = id)
  with check (role = (select role from public.profiles where id = auth.uid()));

commit;

-- Confirm this matches what is live. permissive should read RESTRICTIVE.
select policyname, permissive, cmd, qual, with_check
  from pg_policies
 where schemaname = 'public'
   and tablename = 'profiles'
 order by policyname;
