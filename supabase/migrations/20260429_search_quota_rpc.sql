-- Per-user rolling-window rate limiter referenced by supabase/functions/werkstudent-search/index.ts.
-- Codex's werkstudent-search hardening (claim #3 of audit 2026-04-29) calls
-- supabase.rpc('consume_search_quota', {p_bucket, p_subject}) and returns 429
-- if the function returns false. The function and backing table did not exist;
-- this migration creates both.

CREATE TABLE IF NOT EXISTS public.search_quota (
  bucket       TEXT        NOT NULL,
  subject      UUID        NOT NULL,
  window_start TIMESTAMPTZ NOT NULL,
  count        INTEGER     NOT NULL DEFAULT 0,
  PRIMARY KEY (bucket, subject, window_start)
);

CREATE INDEX IF NOT EXISTS idx_search_quota_window_start
  ON public.search_quota(window_start);

ALTER TABLE public.search_quota ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'search_quota'
      AND policyname = 'search_quota_no_direct_access'
  ) THEN
    CREATE POLICY search_quota_no_direct_access
      ON public.search_quota
      AS RESTRICTIVE
      FOR ALL
      TO authenticated
      USING (false)
      WITH CHECK (false);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.consume_search_quota(
  p_bucket TEXT,
  p_subject UUID,
  p_limit INTEGER DEFAULT 60
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_window TIMESTAMPTZ := date_trunc('hour', now());
  v_count  INTEGER;
BEGIN
  IF p_bucket IS NULL OR length(p_bucket) = 0 THEN
    RAISE EXCEPTION 'consume_search_quota: bucket is required';
  END IF;
  IF p_subject IS NULL THEN
    RAISE EXCEPTION 'consume_search_quota: subject is required';
  END IF;
  IF p_limit IS NULL OR p_limit < 1 THEN
    p_limit := 60;
  END IF;

  INSERT INTO public.search_quota AS sq (bucket, subject, window_start, count)
  VALUES (p_bucket, p_subject, v_window, 1)
  ON CONFLICT (bucket, subject, window_start)
  DO UPDATE SET count = sq.count + 1
  RETURNING count INTO v_count;

  RETURN v_count <= p_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION public.consume_search_quota(TEXT, UUID, INTEGER) TO authenticated;

-- Cleanup helper for pg_cron or manual invocation. Drops rows older than 24h.
CREATE OR REPLACE FUNCTION public.purge_search_quota(p_older_than INTERVAL DEFAULT INTERVAL '24 hours')
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted INTEGER;
BEGIN
  DELETE FROM public.search_quota
  WHERE window_start < now() - p_older_than;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

REVOKE ALL ON FUNCTION public.purge_search_quota(INTERVAL) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.purge_search_quota(INTERVAL) TO service_role;
