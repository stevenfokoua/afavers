-- Preserve deployed private URLs/secrets. Change only pg_net's HTTP deadline.
-- A successful cron entry means dispatch, not that the Edge Function finished.
DO $$
DECLARE scheduled record;
BEGIN
  FOR scheduled IN SELECT jobid,command FROM cron.job
    WHERE jobname IN ('fetch-jobs-every-2-hours','job-alerts-every-2-hours')
  LOOP
    IF scheduled.command ~ 'timeout_milliseconds[[:space:]]*:=[[:space:]]*[0-9]+' THEN
      PERFORM cron.alter_job(scheduled.jobid, command := regexp_replace(scheduled.command,
        'timeout_milliseconds[[:space:]]*:=[[:space:]]*[0-9]+', 'timeout_milliseconds := 145000', 'g'));
    ELSE
      RAISE EXCEPTION 'Expected explicit HTTP timeout for managed automation %', scheduled.jobid;
    END IF;
  END LOOP;
END $$;
