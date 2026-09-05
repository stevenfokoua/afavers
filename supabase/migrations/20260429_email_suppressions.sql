-- Bounce/complaint suppression list written by supabase/functions/resend-webhook.
-- The rows are user email addresses, so the table must never be reachable
-- through PostgREST: Supabase grants anon and authenticated full privileges on
-- public by default, and a public table with RLS off is world-readable and
-- world-writable. Only the service-role client (which bypasses RLS) writes here.

CREATE TABLE IF NOT EXISTS public.email_suppressions (
  email TEXT PRIMARY KEY,
  reason TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.email_suppressions ENABLE ROW LEVEL SECURITY;

-- Same restrictive deny-all pattern as public.search_quota in
-- 20260429_search_quota_rpc.sql and public.activity_log in
-- 20260417_enable_rls_remaining_tables.sql.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'email_suppressions'
      AND policyname = 'email_suppressions_no_direct_access'
  ) THEN
    CREATE POLICY email_suppressions_no_direct_access
      ON public.email_suppressions
      AS RESTRICTIVE
      FOR ALL
      TO anon, authenticated
      USING (false)
      WITH CHECK (false);
  END IF;
END $$;

REVOKE ALL ON TABLE public.email_suppressions FROM anon, authenticated;
