-- Run manually after deploying the fetch-jobs Edge Function.
-- Replace YOUR-PROJECT-REF and YOUR_CRON_SECRET before running in the
-- Supabase SQL editor. Do not place this file under supabase/migrations
-- while it contains placeholders.

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

SELECT cron.unschedule('fetch-jobs-every-2-hours')
WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'fetch-jobs-every-2-hours'
);

SELECT cron.schedule(
  'fetch-jobs-every-2-hours',
  '0 */2 * * *',
  $$
  SELECT
    net.http_post(
      url := 'https://YOUR-PROJECT-REF.supabase.co/functions/v1/fetch-jobs',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', 'YOUR_CRON_SECRET'
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 30000
    );
  $$
);
