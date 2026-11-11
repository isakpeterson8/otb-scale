-- Applied manually in production on 2026-11-11 (129 rows). Safe to re-run.
--
-- Backfill: schools still in "Lead" that have at least one cadence email marked
-- sent move to "Initial Contact". Until this release nothing moved a school out
-- of Lead when an email went out; recordEmailSent (src/lib/cadence-progress.ts)
-- now does it going forward.
--
-- Forward-only and idempotent: only rows whose stage is exactly 'lead' change,
-- so a second run changes nothing.

update public.school_outreach s
   set stage = 'initial_contact'
 where s.stage = 'lead'
   and exists (
     select 1
       from public.cadence_enrollments e
      where e.school_id = s.id
        and (e.email_1_sent_at is not null
          or e.email_2_sent_at is not null
          or e.email_3_sent_at is not null
          or e.email_4_sent_at is not null)
   );
