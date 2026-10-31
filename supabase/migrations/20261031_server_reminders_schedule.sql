-- Opt-in account reminders run independently of an open browser.
-- Deployment substitutes the private cron token; source never contains it.
SELECT cron.schedule(
  'send-reminders-every-minute',
  '* * * * *',
  $$ SELECT net.http_post(
    url := 'https://YOUR-PROJECT-REF.supabase.co/functions/v1/send-reminders',
    headers := jsonb_build_object('Content-Type','application/json','x-cron-secret','YOUR_CRON_SECRET'),
    body := '{}'::jsonb,
    timeout_milliseconds := 145000
  ); $$
);
