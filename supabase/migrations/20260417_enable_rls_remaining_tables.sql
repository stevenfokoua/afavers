-- Enable RLS on tables that were missed by 011_supabase_auth_rls.sql
-- and add safe default policies. Review carefully before running in
-- the Supabase SQL editor -- this migration is NOT applied automatically.
--
-- Tables covered:
--   * activity_log           - no user_id column; lock to service_role
--   * password_reset_tokens  - highly sensitive; service_role only
--   * contact_messages       - admin-only reads via admin_list_messages RPC;
--                              service_role for direct access
--
-- Not covered (intentional):
--   * schema_migrations  - migration tooling internal
--
-- Helper functions expected to exist:
--   public.current_app_user_id()       - from 011_supabase_auth_rls.sql
--   public.current_app_user_is_admin() - from 20260415_admin_rpc.sql

---------------------------------------------------------------------
-- activity_log
---------------------------------------------------------------------
-- The activity_log table in 001_initial_schema.sql has no user_id column,
-- only job_id. There is no safe owner-scoped SELECT policy we can write
-- without a schema change, so deny everything for anon + authenticated and
-- let the service_role bypass handle server-side writes.

ALTER TABLE IF EXISTS public.activity_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS activity_log_deny_all ON public.activity_log;
CREATE POLICY activity_log_deny_all ON public.activity_log
  AS RESTRICTIVE
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);

---------------------------------------------------------------------
-- password_reset_tokens
---------------------------------------------------------------------
-- These tokens grant account takeover if leaked. Deny anon + authenticated
-- entirely. The server must use the service_role key for all reads/writes.

DO $$
BEGIN
  IF to_regclass('public.password_reset_tokens') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.password_reset_tokens ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS password_reset_tokens_deny_all ON public.password_reset_tokens';
    EXECUTE 'CREATE POLICY password_reset_tokens_deny_all ON public.password_reset_tokens AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false)';
  END IF;
END
$$;

---------------------------------------------------------------------
-- contact_messages
---------------------------------------------------------------------
-- contact_messages is created by 20250101000006_contact_messages.sql and
-- is read by the admin_list_messages / admin_mark_message_read /
-- admin_delete_message RPCs in 20260415_admin_rpc.sql (which are
-- SECURITY DEFINER and therefore bypass the RLS below). We still wrap the
-- policy in a DO block with IF EXISTS so that reordering or partial
-- application of the migration tree does not break this step.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'contact_messages'
  ) THEN
    EXECUTE 'ALTER TABLE public.contact_messages ENABLE ROW LEVEL SECURITY';

    EXECUTE 'DROP POLICY IF EXISTS contact_messages_deny_all ON public.contact_messages';
    EXECUTE $policy$
      CREATE POLICY contact_messages_deny_all ON public.contact_messages
        AS RESTRICTIVE
        FOR ALL
        TO anon, authenticated
        USING (false)
        WITH CHECK (false)
    $policy$;
  END IF;
END
$$;
