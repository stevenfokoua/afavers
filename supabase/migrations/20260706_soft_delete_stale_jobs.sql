-- Soft-delete support for fetched jobs.
--
-- Jobs that disappear from the upstream feeds are no longer hard-deleted when
-- a user tracks them (hard deletes CASCADE into user_jobs and destroy saved
-- statuses, notes and history). Instead the fetch-jobs function marks them
-- inactive; the client shows tracked-but-inactive jobs with a
-- "no longer listed" badge. Untracked stale jobs are still hard-deleted to
-- keep the table small.

ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;

-- Cleanup scans by staleness; the client window sorts by created_at.
CREATE INDEX IF NOT EXISTS idx_jobs_updated_at ON public.jobs(updated_at);
