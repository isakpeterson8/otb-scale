-- ═══════════════════════════════════════════════════════════════════════════
-- SNAPSHOT — NOT A MIGRATION. Do not run this file as a whole.
--
-- Production (otb-scale) state captured 2026-11-13 ~13:45 America/Chicago,
-- immediately BEFORE applying supabase/migrations/20261113000001..000006.
-- Taken with one read-only query in the Supabase SQL editor (Free plan: no
-- scheduled backups existed, so this stands in for one for these objects).
--
-- Covers every object those six migrations change:
--   * RLS flags and table/view ACLs for cadence_analyses, education_library_items,
--     the work_plan* tables and the three *_client views
--   * the three client view definitions (security_invoker=false)
--   * every RLS policy on those tables, plus the education-library storage policy
--   * full definition, ACL and config (search_path) of every function touched
--   * education-library bucket flag, auth.users triggers, whether `private` exists
--
-- To roll back a single object, copy its statement from here. ACL lines are
-- Postgres aclitem notation (role=privileges/grantor; "=X" means PUBLIC execute).
-- ═══════════════════════════════════════════════════════════════════════════
-- SNAPSHOT BODY BEGINS ON THE NEXT LINE
-- TABLE public.cadence_analyses  relkind=r  rls=false  force_rls=false

-- TABLE public.education_library_items  relkind=r  rls=false  force_rls=false

-- TABLE public.work_plan_task_items  relkind=r  rls=true  force_rls=false

-- TABLE public.work_plan_task_items_client  relkind=v  rls=false  force_rls=false

-- TABLE public.work_plan_tasks  relkind=r  rls=true  force_rls=false

-- TABLE public.work_plan_tasks_client  relkind=v  rls=false  force_rls=false

-- TABLE public.work_plan_template_task_items  relkind=r  rls=true  force_rls=false

-- TABLE public.work_plan_template_tasks  relkind=r  rls=true  force_rls=false

-- TABLE public.work_plan_templates  relkind=r  rls=true  force_rls=false

-- TABLE public.work_plans  relkind=r  rls=true  force_rls=false

-- TABLE public.work_plans_client  relkind=v  rls=false  force_rls=false

-- ACL public.cadence_analyses: {postgres=arwdDxtm/postgres,anon=arwdDxtm/postgres,authenticated=arwdDxtm/postgres,service_role=arwdDxtm/postgres}

-- ACL public.education_library_items: {postgres=arwdDxtm/postgres,anon=arwdDxtm/postgres,authenticated=arwdDxtm/postgres,service_role=arwdDxtm/postgres}

-- ACL public.work_plan_task_items: {postgres=arwdDxtm/postgres,authenticated=arwdDxtm/postgres,service_role=arwdDxtm/postgres}

-- ACL public.work_plan_task_items_client: {postgres=arwdDxtm/postgres,authenticated=arwdDxtm/postgres,service_role=arwdDxtm/postgres}

-- ACL public.work_plan_tasks: {postgres=arwdDxtm/postgres,anon=arwdDxtm/postgres,authenticated=arwdDxtm/postgres,service_role=arwdDxtm/postgres}

-- ACL public.work_plan_tasks_client: {postgres=arwdDxtm/postgres,authenticated=arwdDxtm/postgres,service_role=arwdDxtm/postgres}

-- ACL public.work_plan_template_task_items: {postgres=arwdDxtm/postgres,authenticated=arwdDxtm/postgres,service_role=arwdDxtm/postgres}

-- ACL public.work_plan_template_tasks: {postgres=arwdDxtm/postgres,anon=arwdDxtm/postgres,authenticated=arwdDxtm/postgres,service_role=arwdDxtm/postgres}

-- ACL public.work_plan_templates: {postgres=arwdDxtm/postgres,anon=arwdDxtm/postgres,authenticated=arwdDxtm/postgres,service_role=arwdDxtm/postgres}

-- ACL public.work_plans: {postgres=arwdDxtm/postgres,anon=arwdDxtm/postgres,authenticated=arwdDxtm/postgres,service_role=arwdDxtm/postgres}

-- ACL public.work_plans_client: {postgres=arwdDxtm/postgres,authenticated=arwdDxtm/postgres,service_role=arwdDxtm/postgres}

create or replace view public.work_plan_task_items_client with (security_invoker=false) as
 SELECT i.id,
    i.task_id,
    i.title,
    i.sort_order,
    i.is_done,
    i.done_at,
    i.created_at,
    i.updated_at
   FROM work_plan_task_items i
     JOIN work_plan_tasks t ON t.id = i.task_id
     JOIN work_plans p ON p.id = t.work_plan_id
  WHERE p.is_published AND p.status = 'active'::text AND p.studio_id = current_studio_id();

create or replace view public.work_plan_tasks_client with (security_invoker=false) as
 SELECT t.id,
    t.work_plan_id,
    t.title,
    t.description,
    t.timeframe_group,
    t.week_number,
    t.is_recurring,
    t.starts_after_week,
    t.sort_order,
    t.milestone_tag,
    t.links,
    t.status,
    t.is_done,
    t.done_at,
    t.client_note,
    t.is_client_added,
    t.created_at,
    t.updated_at
   FROM work_plan_tasks t
     JOIN work_plans p ON p.id = t.work_plan_id
  WHERE p.is_published AND p.status = 'active'::text AND p.studio_id = current_studio_id();

create or replace view public.work_plans_client with (security_invoker=false) as
 SELECT id,
    title,
    status,
    is_published,
    created_at,
    updated_at
   FROM work_plans p
  WHERE is_published AND status = 'active'::text AND studio_id = current_studio_id();

create policy "Staff manage work plan task items" on public.work_plan_task_items as PERMISSIVE for ALL to authenticated
  using (is_staff(auth.uid()))
  with check (is_staff(auth.uid()));

create policy "Staff manage work plan tasks" on public.work_plan_tasks as PERMISSIVE for ALL to authenticated
  using (is_staff(auth.uid()))
  with check (is_staff(auth.uid()));

create policy "Staff manage work plan template task items" on public.work_plan_template_task_items as PERMISSIVE for ALL to authenticated
  using (is_staff(auth.uid()))
  with check (is_staff(auth.uid()));

create policy "Staff manage work plan template tasks" on public.work_plan_template_tasks as PERMISSIVE for ALL to authenticated
  using (is_staff(auth.uid()))
  with check (is_staff(auth.uid()));

create policy "Staff manage work plan templates" on public.work_plan_templates as PERMISSIVE for ALL to authenticated
  using (is_staff(auth.uid()))
  with check (is_staff(auth.uid()));

create policy "Staff manage work plans" on public.work_plans as PERMISSIVE for ALL to authenticated
  using (is_staff(auth.uid()))
  with check (is_staff(auth.uid()));

create policy "Public read for education library" on storage.objects as PERMISSIVE for SELECT to public
  using ((bucket_id = 'education-library'::text));

-- FUNCTION public.assert_client_plan_access(uuid)
-- acl: {postgres=X/postgres,service_role=X/postgres}
-- config: {search_path=public}
-- security_definer: true
CREATE OR REPLACE FUNCTION public.assert_client_plan_access(p_plan_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_studio_id    uuid;
  v_is_published boolean;
  v_plan_status  text;
begin
  select studio_id, is_published, status
    into v_studio_id, v_is_published, v_plan_status
    from public.work_plans where id = p_plan_id;

  if not found then
    raise exception 'plan not found' using errcode = 'P0002';
  end if;
  if public.is_staff(auth.uid()) then return; end if;
  if v_studio_id is distinct from public.current_studio_id() then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if not v_is_published or v_plan_status <> 'active' then
    raise exception 'plan is not available' using errcode = '42501';
  end if;
end $function$
;

-- FUNCTION public.assert_client_task_access(uuid,boolean)
-- acl: {postgres=X/postgres,service_role=X/postgres}
-- config: {search_path=public}
-- security_definer: true
CREATE OR REPLACE FUNCTION public.assert_client_task_access(p_task_id uuid, p_require_client_added boolean)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_plan_id      uuid;
  v_studio_id    uuid;
  v_is_published boolean;
  v_plan_status  text;
  v_client_added boolean;
begin
  select p.id, p.studio_id, p.is_published, p.status, t.is_client_added
    into v_plan_id, v_studio_id, v_is_published, v_plan_status, v_client_added
    from public.work_plan_tasks t
    join public.work_plans p on p.id = t.work_plan_id
   where t.id = p_task_id;

  if not found then
    raise exception 'task not found' using errcode = 'P0002';
  end if;

  -- Staff are unrestricted: the admin editor calls these same RPCs.
  if public.is_staff(auth.uid()) then
    return v_plan_id;
  end if;

  if v_studio_id is distinct from public.current_studio_id() then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if not v_is_published or v_plan_status <> 'active' then
    raise exception 'plan is not available' using errcode = '42501';
  end if;
  if p_require_client_added and not v_client_added then
    raise exception 'that step was set by your OTB coach' using errcode = '42501';
  end if;

  return v_plan_id;
end $function$
;

-- FUNCTION public.create_client_work_plan_task(uuid,text,text,text)
-- acl: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
-- config: {search_path=public}
-- security_definer: true
CREATE OR REPLACE FUNCTION public.create_client_work_plan_task(p_plan_id uuid, p_title text, p_description text, p_timeframe_group text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  -- Ceiling on client-added tasks per plan, so the board cannot be flooded.
  c_max_client_tasks constant int := 200;
  v_title text := btrim(p_title);
  v_group text := btrim(p_timeframe_group);
  v_desc  text := nullif(btrim(p_description), '');
  v_count int;
  v_next  int;
  v_id    uuid;
begin
  if v_title is null or length(v_title) = 0 or length(v_title) > 200 then
    raise exception 'title must be 1-200 characters' using errcode = '22023';
  end if;
  if v_group is null or length(v_group) = 0 or length(v_group) > 60 then
    raise exception 'timeframe group must be 1-60 characters' using errcode = '22023';
  end if;
  if v_desc is not null and length(v_desc) > 5000 then
    raise exception 'description must be 5000 characters or fewer' using errcode = '22001';
  end if;

  perform public.assert_client_plan_access(p_plan_id);

  select count(*) into v_count
    from public.work_plan_tasks
   where work_plan_id = p_plan_id and is_client_added;
  if v_count >= c_max_client_tasks then
    raise exception 'this plan already has the maximum of % client-added steps', c_max_client_tasks
      using errcode = '54000';
  end if;

  select coalesce(max(sort_order), 0) + 1 into v_next
    from public.work_plan_tasks
   where work_plan_id = p_plan_id and timeframe_group = v_group;

  insert into public.work_plan_tasks (
    work_plan_id, title, description, internal_note, timeframe_group,
    sort_order, status, is_client_added, created_by
  ) values (
    p_plan_id, v_title, v_desc, null, v_group,
    v_next, 'todo', true, auth.uid()
  )
  returning id into v_id;

  return v_id;
end $function$
;

-- FUNCTION public.create_work_plan_from_template(uuid,uuid)
-- acl: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
-- config: {search_path=public}
-- security_definer: true
CREATE OR REPLACE FUNCTION public.create_work_plan_from_template(p_template_id uuid, p_studio_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_plan_id uuid;
  v_title   text;
begin
  if not public.is_staff(auth.uid()) then
    raise exception 'not authorized';
  end if;

  select name into v_title from public.work_plan_templates where id = p_template_id;
  if v_title is null then
    raise exception 'template % not found', p_template_id;
  end if;

  insert into public.work_plans (studio_id, template_id, title, created_by)
  values (p_studio_id, p_template_id, v_title, auth.uid())
  returning id into v_plan_id;

  insert into public.work_plan_tasks (
    work_plan_id, title, description, internal_note, timeframe_group,
    week_number, is_recurring, starts_after_week, sort_order, milestone_tag, links,
    template_task_id, created_by
  )
  select v_plan_id, t.title, t.description, t.internal_note, t.timeframe_group,
         t.week_number, t.is_recurring, t.starts_after_week, t.sort_order,
         t.milestone_tag, t.links,
         t.id, auth.uid()
  from public.work_plan_template_tasks t
  where t.template_id = p_template_id;

  insert into public.work_plan_task_items (task_id, title, sort_order)
  select nt.id, ti.title, ti.sort_order
  from public.work_plan_tasks nt
  join public.work_plan_template_task_items ti on ti.template_task_id = nt.template_task_id
  where nt.work_plan_id = v_plan_id;

  return v_plan_id;
end $function$
;

-- FUNCTION public.current_studio_id()
-- acl: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
-- config: {search_path=public}
-- security_definer: true
CREATE OR REPLACE FUNCTION public.current_studio_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select studio_id from public.profiles where id = auth.uid();
$function$
;

-- FUNCTION public.delete_client_work_plan_task(uuid)
-- acl: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
-- config: {search_path=public}
-- security_definer: true
CREATE OR REPLACE FUNCTION public.delete_client_work_plan_task(p_task_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  perform public.assert_client_task_access(p_task_id, true);
  delete from public.work_plan_tasks where id = p_task_id;
end $function$
;

-- FUNCTION public.get_user_role()
-- acl: {=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}
-- config: (none)
-- security_definer: true
CREATE OR REPLACE FUNCTION public.get_user_role()
 RETURNS text
 LANGUAGE sql
 SECURITY DEFINER
AS $function$
  select role from profiles where id = auth.uid();
$function$
;

-- FUNCTION public.get_user_studio_id()
-- acl: {=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}
-- config: (none)
-- security_definer: true
CREATE OR REPLACE FUNCTION public.get_user_studio_id()
 RETURNS uuid
 LANGUAGE sql
 SECURITY DEFINER
AS $function$
  select studio_id from profiles where id = auth.uid();
$function$
;

-- FUNCTION public.handle_new_user()
-- acl: {=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}
-- config: (none)
-- security_definer: true
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  INSERT INTO public.profiles (id, email, role, status)
  VALUES (
    NEW.id,
    NEW.email,
    'studio_owner',
    'pending'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$function$
;

-- FUNCTION public.is_staff(uuid)
-- acl: {postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}
-- config: {search_path=public}
-- security_definer: true
CREATE OR REPLACE FUNCTION public.is_staff(uid uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1
    from public.profiles
    where id = uid
      and role in ('otb_admin', 'otb_staff')
  );
$function$
;

-- FUNCTION public.move_client_work_plan_task(uuid,text)
-- acl: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
-- config: {search_path=public}
-- security_definer: true
CREATE OR REPLACE FUNCTION public.move_client_work_plan_task(p_task_id uuid, p_target_group text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_target    text := btrim(p_target_group);
  v_current   text;
  v_recurring boolean;
begin
  if v_target is null or v_target !~ '^Week [1-6]$' then
    raise exception 'steps can only be moved to Week 1 through Week 6' using errcode = '22023';
  end if;

  perform public.assert_client_task_access(p_task_id, false);

  select timeframe_group, is_recurring
    into v_current, v_recurring
    from public.work_plan_tasks
   where id = p_task_id
     for update;

  if v_recurring or v_current in ('Weekly', 'Monthly', 'Semester') then
    raise exception 'recurring steps (weekly, monthly, semester) can''t be moved to a week'
      using errcode = '22023';
  end if;

  if v_current = v_target then
    return;
  end if;

  update public.work_plan_tasks
     set original_timeframe_group = coalesce(original_timeframe_group, timeframe_group),
         timeframe_group          = v_target,
         week_number              = substring(v_target from '^Week ([1-6])$')::int
   where id = p_task_id;
end $function$
;

-- FUNCTION public.normalize_grant_email()
-- acl: {=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}
-- config: (none)
-- security_definer: false
CREATE OR REPLACE FUNCTION public.normalize_grant_email()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.email := lower(new.email);
  return new;
end;
$function$
;

-- FUNCTION public.school_contacts_default_primary()
-- acl: {=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}
-- config: (none)
-- security_definer: false
CREATE OR REPLACE FUNCTION public.school_contacts_default_primary()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  if not exists (select 1 from public.school_contacts where school_id = new.school_id) then
    new.is_primary := true;
  end if;
  return new;
end;
$function$
;

-- FUNCTION public.school_contacts_promote_on_delete()
-- acl: {=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}
-- config: (none)
-- security_definer: false
CREATE OR REPLACE FUNCTION public.school_contacts_promote_on_delete()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  if old.is_primary then
    update public.school_contacts
    set is_primary = true
    where id = (
      select id from public.school_contacts
      where school_id = old.school_id
      order by created_at, id
      limit 1
    );
  end if;
  return old;
end;
$function$
;

-- FUNCTION public.set_updated_at()
-- acl: {=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}
-- config: (none)
-- security_definer: false
CREATE OR REPLACE FUNCTION public.set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$
;

-- FUNCTION public.set_work_plan_task_client_note(uuid,text)
-- acl: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
-- config: {search_path=public}
-- security_definer: true
CREATE OR REPLACE FUNCTION public.set_work_plan_task_client_note(p_task_id uuid, p_note text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if p_note is not null and length(p_note) > 10000 then
    raise exception 'note must be 10000 characters or fewer' using errcode = '22001';
  end if;

  perform public.assert_client_task_access(p_task_id, false);

  update public.work_plan_tasks
     set client_note = nullif(btrim(p_note), '')
   where id = p_task_id;
end $function$
;

-- FUNCTION public.set_work_plan_task_item_done(uuid,boolean)
-- acl: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
-- config: {search_path=public}
-- security_definer: true
CREATE OR REPLACE FUNCTION public.set_work_plan_task_item_done(p_item_id uuid, p_is_done boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_task_id uuid;
begin
  select task_id into v_task_id from public.work_plan_task_items where id = p_item_id;
  if not found then raise exception 'item not found' using errcode = 'P0002'; end if;

  perform public.assert_client_task_access(v_task_id, false);

  update public.work_plan_task_items
     set is_done = p_is_done
   where id = p_item_id;
end $function$
;

-- FUNCTION public.set_work_plan_task_status(uuid,text)
-- acl: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
-- config: {search_path=public}
-- security_definer: true
CREATE OR REPLACE FUNCTION public.set_work_plan_task_status(p_task_id uuid, p_status text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_studio_id    uuid;
  v_is_published boolean;
  v_plan_status  text;
begin
  if p_status not in ('todo', 'doing', 'done') then
    raise exception 'invalid status %', p_status using errcode = '22023';
  end if;

  select p.studio_id, p.is_published, p.status
    into v_studio_id, v_is_published, v_plan_status
    from public.work_plan_tasks t
    join public.work_plans p on p.id = t.work_plan_id
   where t.id = p_task_id;

  if not found then
    raise exception 'task not found' using errcode = 'P0002';
  end if;

  -- Staff act on any plan. Members are held to their own published active plan.
  if not public.is_staff(auth.uid()) then
    if v_studio_id is distinct from public.current_studio_id() then
      raise exception 'not authorized' using errcode = '42501';
    end if;
    if not v_is_published or v_plan_status <> 'active' then
      raise exception 'plan is not available' using errcode = '42501';
    end if;
  end if;

  update public.work_plan_tasks set status = p_status where id = p_task_id;
end;
$function$
;

-- FUNCTION public.sync_work_plan_task_done()
-- acl: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
-- config: (none)
-- security_definer: false
CREATE OR REPLACE FUNCTION public.sync_work_plan_task_done()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
declare
  v_status_moved  boolean;
  v_is_done_moved boolean;
  v_was_done      boolean;
begin
  if tg_op = 'INSERT' then
    if new.status = 'done' and not new.is_done then
      new.is_done := true;
    elsif new.is_done and new.status <> 'done' then
      new.status := 'done';
    end if;
    v_was_done := false;
  else
    v_status_moved  := new.status  is distinct from old.status;
    v_is_done_moved := new.is_done is distinct from old.is_done;

    -- status is the richer representation, so it wins whenever it moved. When
    -- only is_done moved (today's deployed admin editor), status follows it.
    if v_status_moved then
      new.is_done := (new.status = 'done');
    elsif v_is_done_moved then
      new.status := case when new.is_done then 'done' else 'todo' end;
    end if;

    v_was_done := old.is_done;
  end if;

  -- Stamp completion metadata only on a real transition, and never clobber a
  -- value the caller set deliberately in the same statement.
  if new.is_done and not v_was_done then
    new.done_at := coalesce(new.done_at, now());
    new.done_by := coalesce(new.done_by, auth.uid());
  elsif not new.is_done then
    new.done_at := null;
    new.done_by := null;
  end if;

  return new;
end;
$function$
;

-- FUNCTION public.sync_work_plan_task_item_done()
-- acl: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
-- config: (none)
-- security_definer: false
CREATE OR REPLACE FUNCTION public.sync_work_plan_task_item_done()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  if tg_op = 'INSERT' then
    if new.is_done then
      new.done_at := coalesce(new.done_at, now());
      new.done_by := coalesce(new.done_by, auth.uid());
    else
      new.done_at := null;
      new.done_by := null;
    end if;
    return new;
  end if;

  if new.is_done and not old.is_done then
    new.done_at := coalesce(new.done_at, now());
    new.done_by := coalesce(new.done_by, auth.uid());
  elsif not new.is_done then
    new.done_at := null;
    new.done_by := null;
  end if;
  return new;
end $function$
;

-- FUNCTION public.update_client_work_plan_task(uuid,text,text,text)
-- acl: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
-- config: {search_path=public}
-- security_definer: true
CREATE OR REPLACE FUNCTION public.update_client_work_plan_task(p_task_id uuid, p_title text, p_description text, p_timeframe_group text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_title text := btrim(p_title);
  v_group text := btrim(p_timeframe_group);
  v_desc  text := nullif(btrim(p_description), '');
begin
  if v_title is null or length(v_title) = 0 or length(v_title) > 200 then
    raise exception 'title must be 1-200 characters' using errcode = '22023';
  end if;
  if v_group is null or length(v_group) = 0 or length(v_group) > 60 then
    raise exception 'timeframe group must be 1-60 characters' using errcode = '22023';
  end if;
  if v_desc is not null and length(v_desc) > 5000 then
    raise exception 'description must be 5000 characters or fewer' using errcode = '22001';
  end if;

  perform public.assert_client_task_access(p_task_id, true);

  update public.work_plan_tasks
     set title           = v_title,
         description     = v_desc,
         timeframe_group = v_group,
         week_number     = case
           when v_group ~ '^Week [0-9]{1,9}$'
             then substring(v_group from '^Week ([0-9]{1,9})$')::int
           when v_group in ('Weekly', 'Monthly', 'Semester', 'Brain dump')
             then null
           else week_number
         end
   where id = p_task_id;
end $function$
;

-- storage.buckets education-library public=true

-- auth.users triggers: on_auth_user_created -> handle_new_user() enabled=O

-- schema private exists: false
