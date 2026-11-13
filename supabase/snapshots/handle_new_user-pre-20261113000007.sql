-- Read-only snapshot of production's public.handle_new_user(), taken
-- 2026-11-13 before 20261113000007_handle_new_user_grant_auto_approve.
-- Restoring this definition is the rollback for that migration.
--
-- Owner:     postgres
-- proacl:    {postgres=X/postgres,service_role=X/postgres}
--            (anon, authenticated and PUBLIC revoked by 20261113000003)
-- proconfig: {"search_path=public, pg_temp"}   (set by 20261113000005)
-- Trigger:   CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
--            FOR EACH ROW EXECUTE FUNCTION handle_new_user()      (enabled)
--
-- Related state at snapshot time:
--   admin_access_grants columns: id, email, tier, granted_by, granted_at,
--     revoked_at, revoked_by (no expires_at); trigger normalize_grant_email_trg
--   6 active (non-revoked) grants; 8 pending profiles, 0 of them with an
--   active grant.

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
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
