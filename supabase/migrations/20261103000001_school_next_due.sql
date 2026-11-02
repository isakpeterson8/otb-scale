-- "Next due date" sort for /school-outreach.
--
-- The due date is the one behind the cadence badge ("Email 2 due May 2"):
-- the school's most recent cadence enrollment, if active, and the due date of
-- its next email. Same rule as getCadenceBadge() in SchoolOutreachClient and
-- nextDueFor() on the dashboard:
--   current_email_number 1/2/3 → email_2/3/4_due_at
--   current_email_number 0 ("Email 1 ready") → today: it can go out now
--   not enrolled, or latest enrollment completed/removed/replied → NULL
-- Dates are UTC days, like the badge's todayStr.
--
-- A PostgREST computed field (a function over the table's row type) rather
-- than a stored column: it reads cadence_enrollments at query time, so it is
-- always current whichever code path enrolls, sends, removes or detects a
-- reply, and there is nothing to backfill. The page orders by it with
-- order=next_due_on.asc.nullslast, then school_name.
--
-- SECURITY INVOKER: RLS on cadence_enrollments applies, so the date is based
-- on the same enrollments the page shows in the badge.

create index if not exists cadence_enrollments_school_created_idx
  on public.cadence_enrollments (school_id, created_at desc);

create or replace function public.next_due_on(s public.school_outreach)
returns date
language sql
stable
security invoker
set search_path = public
as $$
  select case
           when e.status is distinct from 'active' then null
           when coalesce(e.current_email_number, 0) = 0
             then (now() at time zone 'utc')::date
           else (case e.current_email_number
                   when 1 then e.email_2_due_at
                   when 2 then e.email_3_due_at
                   when 3 then e.email_4_due_at
                 end at time zone 'utc')::date
         end
  from public.cadence_enrollments e
  where e.school_id = s.id
  order by e.created_at desc
  limit 1
$$;

revoke all on function public.next_due_on(public.school_outreach) from public;
grant execute on function public.next_due_on(public.school_outreach) to authenticated, service_role;

notify pgrst, 'reload schema';
