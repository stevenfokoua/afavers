-- A user may track public feed jobs or their own manual jobs, never attach
-- tracking state to somebody else's private listing through a guessed id.
DROP POLICY IF EXISTS user_jobs_own_all ON public.user_jobs;
CREATE POLICY user_jobs_own_all ON public.user_jobs
  FOR ALL TO authenticated
  USING (user_id = public.current_app_user_id())
  WITH CHECK (
    user_id = public.current_app_user_id()
    AND EXISTS (SELECT 1 FROM public.jobs WHERE jobs.id = user_jobs.job_id)
  );
