-- Resources: a simple link library pointing to Drive (or any) URLs
create table resources (
  id          uuid        primary key default gen_random_uuid(),
  title       text        not null,
  description text,
  url         text        not null,
  icon_type   text        not null default 'link',   -- doc | sheet | slides | folder | form | pdf | link
  category    text,
  position    integer     not null default 0,
  created_at  timestamptz not null default now()
);

alter table resources enable row level security;

-- Any authenticated user can read resources
create policy "Authenticated users can read resources"
  on resources for select to authenticated using (true);
