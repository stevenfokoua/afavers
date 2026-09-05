-- Run after deploying the job-alerts Edge Function.
-- Replace YOUR-PROJECT-REF and YOUR_CRON_SECRET before running in Supabase SQL Editor.

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

SELECT cron.unschedule('job-alerts-every-2-hours')
WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'job-alerts-every-2-hours'
);

SELECT cron.schedule(
  'job-alerts-every-2-hours',
  '15 */2 * * *',
  $$
  SELECT
    net.http_post(
      url := 'https://YOUR-PROJECT-REF.supabase.co/functions/v1/job-alerts',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', 'YOUR_CRON_SECRET'
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 30000
    );
  $$
);
