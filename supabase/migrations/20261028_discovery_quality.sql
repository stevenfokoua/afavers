-- Discovery must not advertise inactive/expired or private/manual vacancies.
-- Keep all underlying jobs and user_jobs rows, including application history.
CREATE OR REPLACE VIEW public.public_jobs AS
SELECT id, title, company, location, url, salary, source, posted_date, created_at,
       deadline, is_active, updated_at
FROM public.jobs
WHERE url IS NOT NULL
  AND owner_user_id IS NULL
  AND is_manual = FALSE
  AND is_hidden = FALSE
  AND is_active = TRUE
  AND (deadline IS NULL OR deadline >= (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date)
ORDER BY created_at DESC;

GRANT SELECT ON public.public_jobs TO anon, authenticated;

CREATE INDEX IF NOT EXISTS idx_job_alert_deliveries_alert_sent
  ON public.job_alert_deliveries(alert_id, sent_at);
