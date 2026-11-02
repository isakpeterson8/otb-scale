-- Sources that differ only by case or surrounding spaces ("book" / "Book ")
-- are the same source.
--
-- 1. One-time cleanup: within each studio, every spelling of a source is
--    rewritten to the most common one (on a tie, the one on the oldest row).
--    Blank sources become NULL.
-- 2. Generated key columns, lower(nullif(btrim(x), '')), which the source
--    filter chips, group-by and "Source A→Z" sort use, so case variants can
--    never split again even if one is saved.
-- 3. The facet functions count per key and label each key with its preferred
--    spelling (same rule as the cleanup and src/lib/source.ts).
--
-- Safe to re-run: the cleanup only touches rows whose spelling differs from
-- the preferred one, and everything else is IF NOT EXISTS / CREATE OR REPLACE.

-- ─── 1. Cleanup ─────────────────────────────────────────────────────────────
update public.school_outreach
set source = null
where source is not null and btrim(source) = '';

with spellings as (
  select studio_id,
         lower(btrim(source)) as k,
         btrim(source)        as spelling,
         count(*)             as n,
         min(created_at)      as first_seen
  from public.school_outreach
  where source is not null
  group by 1, 2, 3
),
preferred as (
  select distinct on (studio_id, k) studio_id, k, spelling
  from spellings
  order by studio_id, k, n desc, first_seen asc, spelling
)
update public.school_outreach s
set source = p.spelling
from preferred p
where s.studio_id = p.studio_id
  and lower(btrim(s.source)) = p.k
  and s.source is distinct from p.spelling;

-- Lead sources are a fixed list of lowercase codes, so this normally changes
-- nothing; it only folds stray case/space variants onto the code.
update public.contacts
set lead_source = null
where lead_source is not null and btrim(lead_source) = '';

with spellings as (
  select studio_id,
         lower(btrim(lead_source)) as k,
         btrim(lead_source)        as spelling,
         count(*)                  as n,
         min(created_at)           as first_seen
  from public.contacts
  where lead_source is not null
  group by 1, 2, 3
),
preferred as (
  select distinct on (studio_id, k) studio_id, k, spelling
  from spellings
  order by studio_id, k, n desc, first_seen asc, spelling
)
update public.contacts c
set lead_source = p.spelling
from preferred p
where c.studio_id = p.studio_id
  and lower(btrim(c.lead_source)) = p.k
  and c.lead_source is distinct from p.spelling;

-- ─── 2. Key columns ─────────────────────────────────────────────────────────
alter table public.school_outreach
  add column if not exists source_key text
  generated always as (lower(nullif(btrim(source), ''))) stored;

alter table public.contacts
  add column if not exists lead_source_key text
  generated always as (lower(nullif(btrim(lead_source), ''))) stored;

create index if not exists school_outreach_studio_source_key_idx on public.school_outreach (studio_id, source_key);
create index if not exists contacts_studio_lead_source_key_idx   on public.contacts (studio_id, lead_source_key);

-- ─── 3. Facet counts per key ────────────────────────────────────────────────
-- Same signature as before; `value` for the source facet is now the
-- preferred spelling of each key, and its count covers every spelling.
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
  select 'source', (array_agg(spelling order by n desc, first_seen, spelling))[1], sum(n)::bigint
  from (
    select lead_source_key as k, nullif(btrim(lead_source), '') as spelling,
           count(*) as n, min(created_at) as first_seen
    from public.contacts
    where studio_id = p_studio_id
    group by 1, 2
  ) s
  group by k
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
  select 'source', (array_agg(spelling order by n desc, first_seen, spelling))[1], sum(n)::bigint
  from (
    select source_key as k, nullif(btrim(source), '') as spelling,
           count(*) as n, min(created_at) as first_seen
    from public.school_outreach
    where studio_id = p_studio_id
    group by 1, 2
  ) s
  group by k
$$;

notify pgrst, 'reload schema';
