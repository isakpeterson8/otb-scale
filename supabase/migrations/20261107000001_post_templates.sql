-- Shared post template library for /facebook-groups.
--
-- Before: post copy / image variants lived in group_post_assets, one row per
-- group, so the same copy had to be re-entered for every group.
-- After:
--   * post_templates        – one studio-wide library of post copy
--   * group_post_templates  – which templates a group uses (shown on its card)
--   * group_post_completions.template_id – the template used for a logged post
--
-- Every existing group_post_assets row is copied into the library. Copies with
-- the same text (ignoring leading/trailing whitespace and runs of whitespace)
-- within a studio become ONE template; image variants merge on the same URL.
-- Each group keeps a link to the templates its old copies became, and logged
-- posts that pointed at an old copy now point at its template.
--
-- Additive and safe to re-run: group_post_assets and last_used_asset_id are
-- kept (the app stops using them); only assets not yet mapped are migrated.
-- TODO: drop group_post_assets and group_post_completions.last_used_asset_id
--       once this is verified in production.
--
-- RLS mirrors the other Facebook Groups tables (group_post_completions): a user
-- may use rows for the studio in their profile, or a studio they own.
-- Relies on public.set_updated_at() from the work-plans migrations.

begin;

-- ─── Tables ─────────────────────────────────────────────────────────────────
create table if not exists public.post_templates (
  id            uuid        primary key default gen_random_uuid(),
  studio_id     uuid        not null references public.studios (id) on delete cascade,
  title         text        not null,
  body          text        not null default '',
  variant_label text,
  tags          text[]      not null default '{}',
  image_url     text,
  archived      boolean     not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists post_templates_studio_idx on public.post_templates (studio_id, archived);

drop trigger if exists post_templates_set_updated_at on public.post_templates;
create trigger post_templates_set_updated_at
  before update on public.post_templates
  for each row execute function public.set_updated_at();

create table if not exists public.group_post_templates (
  group_id    uuid        not null references public.facebook_groups (id) on delete cascade,
  template_id uuid        not null references public.post_templates (id) on delete cascade,
  studio_id   uuid        not null references public.studios (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (group_id, template_id)
);

create index if not exists group_post_templates_template_idx on public.group_post_templates (template_id);
create index if not exists group_post_templates_studio_idx   on public.group_post_templates (studio_id);

alter table public.group_post_completions
  add column if not exists template_id uuid references public.post_templates (id) on delete set null;

-- Records which template each old asset became, so a re-run skips it.
alter table public.group_post_assets
  add column if not exists template_id uuid references public.post_templates (id) on delete set null;

-- ─── RLS ────────────────────────────────────────────────────────────────────
alter table public.post_templates       enable row level security;
alter table public.group_post_templates enable row level security;

drop policy if exists "Studio members can manage post templates" on public.post_templates;
create policy "Studio members can manage post templates"
  on public.post_templates for all to authenticated
  using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.studio_id = post_templates.studio_id)
    or exists (select 1 from public.studios s where s.id = post_templates.studio_id and s.owner_user_id = auth.uid())
  )
  with check (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.studio_id = post_templates.studio_id)
    or exists (select 1 from public.studios s where s.id = post_templates.studio_id and s.owner_user_id = auth.uid())
  );

drop policy if exists "Studio members can manage group post templates" on public.group_post_templates;
create policy "Studio members can manage group post templates"
  on public.group_post_templates for all to authenticated
  using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.studio_id = group_post_templates.studio_id)
    or exists (select 1 from public.studios s where s.id = group_post_templates.studio_id and s.owner_user_id = auth.uid())
  )
  with check (
    (
      exists (select 1 from public.profiles p where p.id = auth.uid() and p.studio_id = group_post_templates.studio_id)
      or exists (select 1 from public.studios s where s.id = group_post_templates.studio_id and s.owner_user_id = auth.uid())
    )
    -- the group and the template must both belong to that same studio
    and exists (select 1 from public.facebook_groups g where g.id = group_id and g.studio_id = group_post_templates.studio_id)
    and exists (select 1 from public.post_templates t where t.id = template_id and t.studio_id = group_post_templates.studio_id)
  );

-- ─── Migrate existing per-group copies ──────────────────────────────────────
-- trimws: strip leading/trailing whitespace including newlines (btrim only strips spaces).
-- norm:   the text used for "same copy": whitespace runs collapsed, then trimmed.
create or replace function pg_temp.trimws(t text) returns text
  language sql immutable as $$ select regexp_replace(coalesce(t, ''), '^\s+|\s+$', '', 'g') $$;
create or replace function pg_temp.norm(t text) returns text
  language sql immutable as $$ select btrim(regexp_replace(coalesce(t, ''), '\s+', ' ', 'g')) $$;

-- 1. One new template per distinct (studio, kind, text) that has no template yet.
--    Title = the variant's label, else the first line of the copy (60 chars).
with src as (
  select a.id, g.studio_id, a.type, a.label, a.content, a.created_at, pg_temp.norm(a.content) as n
  from public.group_post_assets a
  join public.facebook_groups g on g.id = a.group_id
  where a.template_id is null and pg_temp.norm(a.content) <> ''
),
firsts as (
  select distinct on (studio_id, type, n) *
  from src
  order by studio_id, type, n, created_at, id
)
insert into public.post_templates (studio_id, title, body, image_url, created_at, updated_at)
select
  f.studio_id,
  coalesce(
    nullif(btrim(f.label), ''),
    case when f.type = 'image' then 'Image post'
         else left(pg_temp.trimws(split_part(pg_temp.trimws(f.content), E'\n', 1)), 60) end
  ),
  case when f.type = 'image' then '' else pg_temp.trimws(f.content) end,
  case when f.type = 'image' then pg_temp.trimws(f.content) end,
  f.created_at,
  f.created_at
from firsts f
where not exists (
  select 1 from public.post_templates t
  where t.studio_id = f.studio_id
    and case when f.type = 'image'
             then t.image_url = pg_temp.trimws(f.content) and t.body = ''
             else t.image_url is null and pg_temp.norm(t.body) = f.n end
);

-- 2. Point every unmapped asset at its template (oldest match if several).
update public.group_post_assets a
set template_id = (
  select t.id
  from public.post_templates t
  where t.studio_id = g.studio_id
    and case when a.type = 'image'
             then t.image_url = pg_temp.trimws(a.content) and t.body = ''
             else t.image_url is null and pg_temp.norm(t.body) = pg_temp.norm(a.content) end
  order by t.created_at, t.id
  limit 1
)
from public.facebook_groups g
where g.id = a.group_id and a.template_id is null;

-- 3. Keep each group's link to the templates its copies became.
insert into public.group_post_templates (group_id, template_id, studio_id, created_at)
select a.group_id, a.template_id, g.studio_id, min(a.created_at)
from public.group_post_assets a
join public.facebook_groups g on g.id = a.group_id
where a.template_id is not null
group by a.group_id, a.template_id, g.studio_id
on conflict (group_id, template_id) do nothing;

-- 4. Logged posts that used an old copy now record its template.
update public.group_post_completions c
set template_id = a.template_id
from public.group_post_assets a
where c.last_used_asset_id = a.id and c.template_id is null and a.template_id is not null;

commit;

notify pgrst, 'reload schema';

-- Verification (returns rows, so "Success. No rows returned" cannot mislead).
-- "old copies not migrated" should be 0 (except copies that were blank).
select 'old copies (group_post_assets)'  as check, count(*)::text as value from public.group_post_assets
union all
select 'old copies not migrated',         count(*)::text from public.group_post_assets where template_id is null and btrim(regexp_replace(content, '\s+', ' ', 'g')) <> ''
union all
select 'templates in library',            count(*)::text from public.post_templates
union all
select 'group ↔ template links',          count(*)::text from public.group_post_templates
union all
select 'logged posts with a template',    count(*)::text from public.group_post_completions where template_id is not null
union all
select 'logged posts missing template',   count(*)::text from public.group_post_completions where last_used_asset_id is not null and template_id is null;
