-- Add subscription_tier to studios
alter table public.studios
  add column if not exists subscription_tier text not null default 'free';

-- Create education_library_items table
create table public.education_library_items (
  id          uuid        primary key default gen_random_uuid(),
  title       text        not null,
  description text,
  type        text        not null check (type in ('video', 'pdf')),
  cf_uid      text,                       -- Cloudflare Stream video UID
  pdf_url     text,                       -- Supabase storage URL for PDFs
  category    text,
  position    int         not null default 0,
  created_at  timestamptz default now()
);

-- Only OTB admins can manage library items (enforced in application layer via service role)
-- Studio owners read items if their tier permits (enforced in application layer)
-- No RLS needed — all access is via adminClient or explicit tier checks

-- Create cadence_analyses table for cached AI analysis results
create table public.cadence_analyses (
  id          uuid        primary key default gen_random_uuid(),
  analysis    text        not null,
  row_count   int,
  created_at  timestamptz default now()
);

-- Create Supabase storage bucket for education library PDFs
insert into storage.buckets (id, name, public)
values ('education-library', 'education-library', true)
on conflict (id) do nothing;

-- Allow authenticated users to read PDFs (tier check in application layer)
create policy "Public read for education library"
  on storage.objects for select
  using (bucket_id = 'education-library');

-- Only allow uploads via service role (admin uploads go through API route with adminClient)
