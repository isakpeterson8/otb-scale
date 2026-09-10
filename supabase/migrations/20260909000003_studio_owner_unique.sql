-- Remove the 78 orphaned studio rows and stop the race that creates them.
--
-- Applied by hand in the Supabase SQL editor. `supabase db push` is unusable in
-- this repo (remote migration history is out of sync).
--
-- Background: studios are created on demand by getStudioId() with
-- check-then-insert and nothing serialising it. On a user's first authenticated
-- load several server components call it at once, all see no studio, and all
-- insert one. Result: 78 duplicate studios across 68 owners, every group
-- sharing one owner_user_id and written within two seconds of itself. In all 68
-- groups exactly one row is the one profiles.studio_id points at; the losers
-- were never written to and hold zero references.
--
-- Order matters and both steps share one transaction: if the unique constraint
-- in (b) cannot be created because a duplicate owner survives, the delete in
-- (a) is rolled back too. Nothing is half-applied.
--
-- Prerequisite, already merged: the 23505 re-select in getStudioId()
-- (PR #20, 193d657). Without it the constraint turns a silent duplicate into a
-- hard signup failure — the losing insert raises 23505, getStudioId() returns
-- null, and that user is bounced to /auth/login on their first load.
--
-- One-shot by design. Re-running aborts at the first guard, because the 78 rows
-- will no longer be present. That is the intended failure mode.

begin;

-- ─── (a) Delete the 78 reviewed orphans ──────────────────────────────────────
-- The id list is pinned as a literal array, declared exactly once and used for
-- both the guards and the delete, so what runs is what was reviewed. Nothing
-- here recomputes which studios count as orphans at apply time.
do $$
declare
  v_ids uuid[] := array[
      '0016bb33-6bad-435a-b172-fae2d113e536',
      '0712c847-9f31-4dff-8901-facb8dee7f83',
      '0817f455-d4e3-4c5b-a27d-ee45284c8496',
      '0841a687-c542-497c-a98b-3094c08f83c2',
      '0dc62b74-6f9b-48d4-a14d-ead557066f29',
      '10087742-8aa0-4a99-af39-e8e2c9b522bb',
      '1647adf3-9dbc-46f1-a0d3-c16fa9a9c769',
      '17784f77-070e-446d-9b18-7e69b30cf276',
      '17b930ac-3e0d-4258-8f8a-2f566165e350',
      '18a3ee3f-7e70-442c-bfbe-fd28879a0a36',
      '1e872a29-1e14-4305-ae84-1245cf6835bc',
      '1f666617-b706-4461-a092-1d75566e9bba',
      '22795206-8882-4614-9673-a8fdc5025dfc',
      '268fd0a0-3004-4406-a930-78f34cee3a1e',
      '28ca754a-d4ac-483c-8291-b13ab2bd19ac',
      '2942c655-8780-4ad3-aad8-6126a5b9561d',
      '33638551-8735-4a3d-b1b4-8bb1352d5adb',
      '36fa703e-68a4-48f1-ab3c-77e0f1fc2c3a',
      '3921e0b2-c4d8-4958-b3b6-1d375d62b605',
      '3b0364cb-3732-4c33-97b2-fc935e526662',
      '45848b91-1fc8-49b7-b56d-b644103d7789',
      '47fc90aa-9261-47b1-b847-3343d7963505',
      '492cf8cc-9fee-4914-a737-16e10b708e49',
      '49cd464c-8a6e-46bb-a2e9-0c9662447293',
      '4e62cc96-ee26-4b08-87e9-65f21dc4ba49',
      '4f93e4fe-286b-42fc-85f0-da9f47a8e6d9',
      '5147a338-5373-4deb-8687-27a202a15c67',
      '540f7220-e5b3-4a1a-8ac2-b9e96caade01',
      '5598bc39-dceb-4274-accb-30fa9b7209b6',
      '593c1135-b1a3-46cc-b66d-0971813ceb7e',
      '59a47f38-63ef-42fd-b7eb-718be3c33c91',
      '5a061517-9336-438f-b69e-12261ea9af90',
      '5a3ef399-b5cd-40db-97f0-c38b26e0d19c',
      '5fe42dda-a7e8-468a-b573-ed0e6b02c9a9',
      '634cb89f-169c-4d31-b395-f4cdb24e4d57',
      '639828cf-3e82-4ed1-87be-6f8f0ab1b61b',
      '67c0db68-10b5-491f-8114-8ef80f0b9bdb',
      '68e61f38-1fc0-4984-8180-f5bf4a9f8d4a',
      '6aceb5aa-f06e-4a13-9c8c-13aef49643a8',
      '6c3d51ae-907d-4a2e-a33a-52b82007d3a4',
      '6c5cb615-2511-49f3-9376-cdf3ce74c053',
      '6cb98369-9089-4fd5-8f2a-9bff9772f324',
      '6f79cca4-f905-4ce7-add9-71316b5d612d',
      '71b0908b-81e4-4fea-8413-21a0f688dc43',
      '72d62b27-b8ca-4162-82f2-8797f7eedc55',
      '735b537e-8f09-4e7b-973d-05d872fdba81',
      '73d5167f-6bbe-453a-ae38-ed29b9d2a91d',
      '7b638d35-ea94-4eea-8c9d-132837712182',
      '7d3c8b91-61e2-4978-9627-be6836050dfd',
      '806d0edd-d89c-4750-8ade-32bcb113f65f',
      '82afcde7-7b77-4a2a-b506-ab4aa2d4c801',
      '84f7623c-925d-4c82-b3b1-1b570ac2ea32',
      '939e8c7d-0975-435f-80f8-faca0d157b71',
      '94c95635-5121-4262-8e3d-de08f767e155',
      '94cb8231-2c81-4fc9-81b3-8e31614a0af1',
      '9d1bc063-434e-4e39-b13e-ef75f1278c74',
      'a6913084-b554-4e02-8443-181c00744655',
      'a784e902-4180-4916-be85-2ea96be713dc',
      'a9ed45e1-3620-4483-8601-675a9059f74e',
      'ad7f71be-ddbc-4092-b3bd-69e62d2ed927',
      'afec0dc8-18e6-4d67-bc2c-0c8296130f00',
      'b5070a65-9ac1-4f5f-9979-afb6a7e1139a',
      'bb00ec58-66b8-4448-bcea-f001bb5f29e0',
      'bb2c87d3-b0b0-49ee-b137-c76566f67d7f',
      'c367103c-ceae-4eb5-bcc9-16b70382bcb6',
      'c70dd2ca-194a-4434-9b98-b6b428c4ea63',
      'c770b508-8898-4680-b242-70e3402f4a35',
      'cd0949c5-2bdd-44a9-a67b-df791c9244fd',
      'cd553676-2d42-4a1a-b95b-07d6224c6e8f',
      'cf47d68d-adb5-42f4-ae0f-65c0151f96ad',
      'db0941dd-ba91-4be4-a295-77bbb7dcf737',
      'ddc4c8ab-9115-47ce-bc6a-b522ea335e2a',
      'e34bfe5f-185b-443d-88f8-a6b9941afd09',
      'eada865b-1899-4c65-a0fd-4ae89547c6c2',
      'f096f956-9d30-4cf7-b2a8-7ab2ff4f6d90',
      'f6300f73-e1c3-4026-a97f-c8f3a72d73c0',
      'f76038a5-e1fe-4dae-a6b3-eb854b80ce95',
      'fe249432-dbef-4229-977a-365f41e9983e'
  ]::uuid[];
  v_present  bigint;
  v_refs     bigint;
  v_deleted  bigint;
begin
  if array_length(v_ids, 1) <> 78 then
    raise exception 'pinned id list has % entries, expected 78', array_length(v_ids, 1);
  end if;

  -- Guard 1: every reviewed id must still exist. Fails closed if the data moved.
  select count(*) into v_present from public.studios where id = any (v_ids);
  if v_present <> 78 then
    raise exception 'expected to delete exactly 78 studios, found % — data changed since review, aborting', v_present;
  end if;

  -- Guard 2: every reviewed id must still be unreferenced, across all 16 tables
  -- with an FK to studios.id PLUS studio_snapshots and custom_templates, which
  -- carry studio_id with NO foreign key. Nine of the sixteen cascade on delete,
  -- so a single missed reference would silently delete real child rows.
  select
      (select count(*) from public.canva_requests          where studio_id = any (v_ids))
    + (select count(*) from public.education_watch_progress where studio_id = any (v_ids))
    + (select count(*) from public.facebook_groups         where studio_id = any (v_ids))
    + (select count(*) from public.group_post_completions  where studio_id = any (v_ids))
    + (select count(*) from public.organic_outreach        where studio_id = any (v_ids))
    + (select count(*) from public.reminders               where studio_id = any (v_ids))
    + (select count(*) from public.school_contacts         where studio_id = any (v_ids))
    + (select count(*) from public.school_outreach         where studio_id = any (v_ids))
    + (select count(*) from public.work_plans              where studio_id = any (v_ids))
    + (select count(*) from public.cadence_queue           where studio_id = any (v_ids))
    + (select count(*) from public.contacts                where studio_id = any (v_ids))
    + (select count(*) from public.email_sends             where studio_id = any (v_ids))
    + (select count(*) from public.email_templates         where studio_id = any (v_ids))
    + (select count(*) from public.pipeline_events         where studio_id = any (v_ids))
    + (select count(*) from public.profiles                where studio_id = any (v_ids))
    + (select count(*) from public.squarespace_requests    where studio_id = any (v_ids))
    + (select count(*) from public.studio_snapshots        where studio_id = any (v_ids))
    + (select count(*) from public.custom_templates        where studio_id = any (v_ids))
    into v_refs;
  if v_refs <> 0 then
    raise exception 'reviewed orphans now hold % references — aborting rather than cascade-deleting real data', v_refs;
  end if;

  delete from public.studios where id = any (v_ids);
  get diagnostics v_deleted = row_count;
  if v_deleted <> 78 then
    raise exception 'deleted % rows, expected 78', v_deleted;
  end if;

  raise notice 'deleted % orphaned studios', v_deleted;
end $$;

-- ─── (b) Make the race impossible ────────────────────────────────────────────
-- The safety net: if any owner still has more than one studio, this fails and
-- the transaction rolls back, undoing the delete above as well.
alter table public.studios
  add constraint studios_owner_user_id_key unique (owner_user_id);

-- owner_user_id is nullable and Postgres allows multiple NULLs under a unique
-- constraint, so studios without an owner are unaffected. There are none today.

commit;

-- Verification (returns rows, so "Success. No rows returned" cannot mislead).
select 'studios remaining'            as check, count(*)::text as value from public.studios
union all
select 'owners with >1 studio',        count(*)::text from (
  select owner_user_id from public.studios group by owner_user_id having count(*) > 1
) d
union all
select 'unique constraint present',    coalesce(string_agg(conname, ', '), 'MISSING')
  from pg_constraint
 where conrelid = 'public.studios'::regclass and contype = 'u';
