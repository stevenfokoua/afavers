CREATE INDEX IF NOT EXISTS idx_job_alerts_enabled_last_sent_at
  ON public.job_alerts(enabled, last_sent_at)
  WHERE enabled = TRUE;
