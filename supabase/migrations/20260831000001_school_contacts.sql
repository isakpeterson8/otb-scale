-- school_contacts: many contacts per school.
--
-- Phase A of the multiple-contacts-per-school work. This migration only ADDS.
-- school_outreach.contact_name / .email / .phone stay exactly as they are and
-- are dropped in a later, separate step once this is confirmed stable.
--
-- Named school_contacts, not contacts: public.contacts already exists and is a
-- different concept (the studio's lead/CRM pipeline, see /leads).
--
-- studio_id is denormalized from the parent school so RLS can be evaluated
-- without a join, the same way school_outreach evaluates its own. The data
-- migration sets it from school_outreach.studio_id.

create table public.school_contacts (
  id            uuid        primary key default gen_random_uuid(),
  studio_id     uuid        not null references public.studios(id) on delete cascade,
  school_id     uuid        not null references public.school_outreach(id) on delete cascade,
  name          text        not null,
  title         text,
  subject_area  text,
  email         text,
  phone         text,
  is_primary    boolean     not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index school_contacts_school_id_idx on public.school_contacts (school_id);
create index school_contacts_studio_id_idx on public.school_contacts (studio_id);

alter table public.school_contacts enable row level security;

-- These two policies mirror school_outreach's own (otb_admin_school_outreach /
-- studio_owner_school_outreach) clause for clause, so a contact is visible under
-- exactly the same conditions as its parent school: cross-studio SELECT for
-- otb_admin, full access for a profile belonging to the owning studio.

create policy "otb_admin_school_contacts"
  on public.school_contacts
  for select
  to public
  using (
    (select profiles.role from public.profiles where profiles.id = auth.uid()) = 'otb_admin'::text
  );

create policy "studio_owner_school_contacts"
  on public.school_contacts
  for all
  to public
  using (
    studio_id = (select profiles.studio_id from public.profiles where profiles.id = auth.uid())
  )
  with check (
    studio_id = (select profiles.studio_id from public.profiles where profiles.id = auth.uid())
  );
