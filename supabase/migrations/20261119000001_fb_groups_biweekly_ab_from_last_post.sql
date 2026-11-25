-- One-time data fix: biweekly groups set to 'both' weeks showed as due every week.
-- Put each one on the A/B week it was last posted in, using the app's rule:
-- A-Week = odd ISO week, B-Week = even (see getISOWeek in src/app/facebook-groups/schedule.ts).
-- Postgres `extract(week ...)` is the ISO week, so the two agree.
--
-- Groups never posted keep 'both' and show in the schedule's "needs attention" list,
-- so someone picks their week by hand.
--
-- Safe to re-run: only touches rows still set to 'both'.

update public.facebook_groups
set post_week_pattern = case
  when extract(week from most_recent_post_date::date)::int % 2 = 1 then 'a_week'
  else 'b_week'
end
where post_frequency = 'biweekly'
  and post_week_pattern = 'both'
  and most_recent_post_date is not null;
