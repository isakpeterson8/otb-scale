-- Squarespace Concierge: site registry + request pipeline

-- ── Enums ────────────────────────────────────────────────────────────────────

create type public.site_status as enum (
  'active_paid',
  'active_trial',
  'trial_expired',
  'expired_paid'
);

create type public.site_date_type as enum (
  'renewal',
  'expiry',
  'trial_expiry',
  'none'
);

create type public.request_type as enum (
  'new_build',
  'refresh',
  'support',
  'billing_transfer'
);

create type public.request_status as enum (
  'requested',
  'intake_complete',
  'in_build',
  'contributor_sent',
  'client_editing',
  'billing_transferred',
  'live',
  'closed'
);

-- ── Registry: all ~90 Squarespace sites we manage ────────────────────────────

create table public.squarespace_sites (
  id               uuid              primary key default gen_random_uuid(),
  site_name        text              not null,
  primary_url      text,
  is_custom_domain boolean           not null default false,
  status           public.site_status not null default 'active_trial',
  key_date         date,
  date_type        public.site_date_type not null default 'none',
  circle_tags      text,
  plan_tier        text,
  scheduling_stack text,
  template_version text,
  member_name      text,
  -- links to auth user when a site is associated with a platform member
  user_id          uuid              references auth.users(id) on delete set null,
  notes            text,
  created_at       timestamptz       not null default now(),
  updated_at       timestamptz       not null default now()
);

-- ── Concierge requests (one per submitted form) ───────────────────────────────

create table public.squarespace_requests (
  id               uuid              primary key default gen_random_uuid(),
  -- linked after admin creates the site record (null for new_build until then)
  site_id          uuid              references public.squarespace_sites(id) on delete set null,
  -- requesting member
  studio_id        uuid              references public.studios(id) on delete set null,
  user_id          uuid              not null references auth.users(id) on delete cascade,
  request_type     public.request_type not null,
  status           public.request_status not null default 'requested',
  -- ── Intake: new_build ────────────────────────────────────────────────────
  studio_name      text,
  owner_name       text,
  city_state       text,
  instruments      text,
  ages_served      text,
  teaching_format  text,
  booking_platform text,
  booking_url      text,
  existing_domain  text,
  current_site_url text,
  gbp_url          text,
  logo_asset_link  text,
  brand_colors     text,
  example_sites    text,
  bio              text,
  testimonials_link text,
  show_pricing     boolean,
  primary_cta      text,
  -- ── Intake: refresh/support/billing_transfer ──────────────────────────────
  -- free-text site reference when no linked squarespace_sites row exists
  site_reference   text,
  details          text,
  -- ── Copy pack (admin-generated) ──────────────────────────────────────────
  copy_pack        jsonb,
  created_at       timestamptz       not null default now(),
  updated_at       timestamptz       not null default now()
);

-- ── Sync log: one row per Circle paste-and-confirm cycle ─────────────────────

create table public.squarespace_sync_log (
  id              uuid        primary key default gen_random_uuid(),
  synced_at       timestamptz not null default now(),
  new_sites       int         not null default 0,
  updated_sites   int         not null default 0,
  raw_input_chars int,
  notes           text
);

-- ── Indexes ───────────────────────────────────────────────────────────────────

create index on public.squarespace_sites (status);
create index on public.squarespace_sites (key_date);
create index on public.squarespace_requests (status);
create index on public.squarespace_requests (site_id);

-- ── RLS ───────────────────────────────────────────────────────────────────────

alter table public.squarespace_sites    enable row level security;
alter table public.squarespace_requests enable row level security;
alter table public.squarespace_sync_log enable row level security;

-- Sites: admins only (the registry is not member-visible)
create policy "Admins manage squarespace_sites"
  on public.squarespace_sites for all to authenticated
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid()
        and role in ('otb_admin', 'otb_staff')
    )
  )
  with check (
    exists (
      select 1 from public.profiles
      where id = auth.uid()
        and role in ('otb_admin', 'otb_staff')
    )
  );

-- Requests: members can insert + view their own; admins can do everything
create policy "Members can insert their own requests"
  on public.squarespace_requests for insert to authenticated
  with check (user_id = auth.uid());

create policy "Members can view their own requests"
  on public.squarespace_requests for select to authenticated
  using (user_id = auth.uid());

create policy "Admins manage all requests"
  on public.squarespace_requests for all to authenticated
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid()
        and role in ('otb_admin', 'otb_staff')
    )
  )
  with check (
    exists (
      select 1 from public.profiles
      where id = auth.uid()
        and role in ('otb_admin', 'otb_staff')
    )
  );

-- Sync log: admins only
create policy "Admins manage sync log"
  on public.squarespace_sync_log for all to authenticated
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid()
        and role in ('otb_admin', 'otb_staff')
    )
  )
  with check (
    exists (
      select 1 from public.profiles
      where id = auth.uid()
        and role in ('otb_admin', 'otb_staff')
    )
  );
