-- Shared sort / filter / group views for /leads and /school-outreach.
--
-- 1. school_outreach gains source, city, state and school_type (all optional
--    free text). city + state also form the CSV-import duplicate key.
-- 2. Generated rank columns so "Status in pipeline order" sorts in SQL.
--    contacts.status and school_outreach.stage are plain text, so .order() on
--    them would be alphabetical. Keep each CASE in sync with LEAD_STATUSES /
--    SCHOOL_STAGES in src/types/database.ts (same order, 1-based).
-- 3. Facet functions returning per-value counts for the filter chips, so the
--    page does not have to download every row just to count them.
--
-- contacts and school_outreach are created by no migration in this repo;
-- everything here is additive and uses IF NOT EXISTS where Postgres allows.

-- ─── 1. New school columns ──────────────────────────────────────────────────
alter table public.school_outreach
  add column if not exists source      text,
  add column if not exists city        text,
  add column if not exists state       text,
  add column if not exists school_type text;

-- ─── 2. Pipeline rank columns ───────────────────────────────────────────────
-- NULL status = "not yet triaged", which sorts before the first stage.
alter table public.contacts
  add column if not exists status_rank smallint
  generated always as (
    case status
      when 'to be contacted'           then 1
      when 'initial outreach campaign' then 2
      when 'consultation scheduled'    then 3
      when 'pending registration'      then 4
      when 'future follow-up'          then 5
      when 'not interested'            then 6
      when 'active student'            then 7
      when 'past student'              then 8
      when 'waitlist'                  then 9
      else 0
    end
  ) stored;

alter table public.school_outreach
  add column if not exists stage_rank smallint
  generated always as (
    case stage
      when 'lead'                    then 1
      when 'initial_contact'         then 2
      when 'replied'                 then 3
      when 'classroom_visit_offered' then 4
      when 'visit_scheduled'         then 5
      when 'visit_completed'         then 6
      when 'not_interested'          then 7
      else 99
    end
  ) stored;

create index if not exists contacts_studio_created_idx       on public.contacts (studio_id, created_at desc);
create index if not exists contacts_studio_status_rank_idx   on public.contacts (studio_id, status_rank);
create index if not exists school_outreach_studio_created_idx on public.school_outreach (studio_id, created_at desc);
create index if not exists school_outreach_studio_stage_rank_idx on public.school_outreach (studio_id, stage_rank);

-- ─── 3. Facet counts ────────────────────────────────────────────────────────
-- SECURITY INVOKER: RLS on the underlying table still applies, so a member can
-- only count their own studio's rows whatever p_studio_id they pass. View As
-- calls these through the service-role client, where p_studio_id is the filter.
create or replace function public.contacts_list_facets(p_studio_id uuid)
returns table (facet text, value text, n bigint)
language sql
stable
security invoker
set search_path = public
as $$
  select 'status', status, count(*) from public.contacts
   where studio_id = p_studio_id group by status
  union all
  select 'source', lead_source, count(*) from public.contacts
   where studio_id = p_studio_id group by lead_source
$$;

create or replace function public.school_outreach_list_facets(p_studio_id uuid)
returns table (facet text, value text, n bigint)
language sql
stable
security invoker
set search_path = public
as $$
  select 'status', stage, count(*) from public.school_outreach
   where studio_id = p_studio_id group by stage
  union all
  select 'source', source, count(*) from public.school_outreach
   where studio_id = p_studio_id group by source
$$;

revoke all on function public.contacts_list_facets(uuid)        from public;
revoke all on function public.school_outreach_list_facets(uuid) from public;
grant execute on function public.contacts_list_facets(uuid)        to authenticated, service_role;
grant execute on function public.school_outreach_list_facets(uuid) to authenticated, service_role;
