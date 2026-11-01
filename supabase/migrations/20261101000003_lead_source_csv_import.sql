-- Adds 'csv_import' as a lead source, for leads created by the CSV importer
-- with a blank or unrecognised source.
--
-- contacts is created by no migration in this repo, so whether
-- contacts.lead_source carries a CHECK constraint is unknown. If one exists it
-- is replaced with the same list plus 'csv_import' (existing rows already
-- satisfy the old list, so they satisfy the new one). If none exists, nothing
-- changes. Keep in sync with LEAD_SOURCES in src/types/database.ts.

do $$
declare
  con record;
  had_check boolean := false;
begin
  for con in
    select c.conname
    from pg_constraint c
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
    where c.conrelid = 'public.contacts'::regclass
      and c.contype = 'c'
      and a.attname = 'lead_source'
  loop
    had_check := true;
    execute format('alter table public.contacts drop constraint %I', con.conname);
  end loop;

  if had_check then
    alter table public.contacts
      add constraint contacts_lead_source_check
      check (lead_source is null or lead_source in (
        'facebook_group',
        'school_visit',
        'inbound_online',
        'referral',
        'organic_outreach',
        'csv_import'
      ));
  end if;
end $$;
