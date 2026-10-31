-- Tracker-first improvements:
-- - private manual jobs owned by one app user
-- - per-user checklist and timeline/history on tracked jobs

ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS owner_user_id INTEGER REFERENCES public.users(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS is_manual BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_jobs_owner_user_id ON public.jobs(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_jobs_is_manual ON public.jobs(is_manual);

ALTER TABLE public.user_jobs
  ADD COLUMN IF NOT EXISTS checklist JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS history JSONB NOT NULL DEFAULT '[]'::jsonb;

CREATE OR REPLACE FUNCTION public.current_app_user_id()
RETURNS INTEGER
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id
  FROM public.users
  WHERE auth_user_id = auth.uid()
  LIMIT 1
$$;

GRANT EXECUTE ON FUNCTION public.current_app_user_id() TO authenticated;

DROP POLICY IF EXISTS jobs_select_authenticated ON public.jobs;
CREATE POLICY jobs_select_authenticated ON public.jobs
  FOR SELECT TO authenticated
  USING (owner_user_id IS NULL OR owner_user_id = public.current_app_user_id());

DROP POLICY IF EXISTS jobs_insert_manual_own ON public.jobs;
CREATE POLICY jobs_insert_manual_own ON public.jobs
  FOR INSERT TO authenticated
  WITH CHECK (is_manual = TRUE AND owner_user_id = public.current_app_user_id() AND source = 'manual');

DROP POLICY IF EXISTS jobs_update_manual_own ON public.jobs;
CREATE POLICY jobs_update_manual_own ON public.jobs
  FOR UPDATE TO authenticated
  USING (is_manual = TRUE AND owner_user_id = public.current_app_user_id())
  WITH CHECK (is_manual = TRUE AND owner_user_id = public.current_app_user_id());

CREATE OR REPLACE VIEW public.public_jobs AS
SELECT id, title, company, location, url, salary, source, posted_date, created_at
FROM public.jobs
WHERE url IS NOT NULL
  AND owner_user_id IS NULL
ORDER BY created_at DESC;

GRANT SELECT ON public.public_jobs TO anon, authenticated;
