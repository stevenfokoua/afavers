-- Actual worker outcomes, independent of pg_cron's successful HTTP dispatch.
CREATE TABLE IF NOT EXISTS public.automation_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task text NOT NULL CHECK (task IN ('fetch-jobs','job-alerts','send-reminders')),
  trigger text NOT NULL CHECK (trigger IN ('cron','manual','verification')),
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running','succeeded','partial','failed','timed_out')),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  lease_expires_at timestamptz NOT NULL,
  sources jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(sources) = 'array'),
  counts jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(counts) = 'object'),
  error_code text CHECK (length(error_code) <= 80)
);
CREATE INDEX IF NOT EXISTS automation_runs_task_started_idx ON public.automation_runs(task, started_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS automation_runs_one_running_idx ON public.automation_runs(task) WHERE status = 'running';
ALTER TABLE public.automation_runs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.automation_runs FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.automation_runs TO service_role;

CREATE OR REPLACE FUNCTION public.begin_automation_run(p_task text, p_trigger text DEFAULT 'cron', p_lease_seconds integer DEFAULT 180)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE new_id uuid; started timestamptz := clock_timestamp();
BEGIN
  IF p_task NOT IN ('fetch-jobs','job-alerts','send-reminders') OR p_trigger NOT IN ('cron','manual','verification') THEN RAISE EXCEPTION 'Unsupported automation'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('afavers:automation:' || p_task));
  UPDATE public.automation_runs SET status='timed_out', finished_at=started, error_code='lease_expired'
    WHERE task=p_task AND status='running' AND lease_expires_at <= started;
  IF EXISTS(SELECT 1 FROM public.automation_runs WHERE task=p_task AND status='running') THEN RETURN jsonb_build_object('acquired',false); END IF;
  INSERT INTO public.automation_runs(task, trigger, started_at, lease_expires_at)
    VALUES(p_task,p_trigger,started,started + make_interval(secs => greatest(30,least(600,p_lease_seconds)))) RETURNING id INTO new_id;
  -- Keep a bounded operational history, not a growing copy of listings.
  DELETE FROM public.automation_runs WHERE task=p_task AND status<>'running' AND id IN (
    SELECT id FROM public.automation_runs WHERE task=p_task AND status<>'running' ORDER BY started_at DESC OFFSET 500
  );
  RETURN jsonb_build_object('acquired',true,'run_id',new_id,'started_at',started);
END $$;

CREATE OR REPLACE FUNCTION public.finish_automation_run(p_run_id uuid, p_status text, p_sources jsonb DEFAULT '[]'::jsonb, p_counts jsonb DEFAULT '{}'::jsonb, p_error_code text DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE changed integer;
BEGIN
  IF p_status NOT IN ('succeeded','partial','failed') OR jsonb_typeof(p_sources)<>'array' OR jsonb_typeof(p_counts)<>'object' THEN RAISE EXCEPTION 'Invalid automation outcome'; END IF;
  UPDATE public.automation_runs SET status=p_status, finished_at=clock_timestamp(), sources=p_sources, counts=p_counts,
    error_code=left(p_error_code,80) WHERE id=p_run_id AND status='running' AND lease_expires_at>clock_timestamp();
  GET DIAGNOSTICS changed=ROW_COUNT;
  RETURN changed=1;
END $$;

CREATE OR REPLACE FUNCTION public.get_feed_health()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  WITH latest AS (SELECT * FROM public.automation_runs WHERE task='fetch-jobs' ORDER BY started_at DESC LIMIT 1),
  successful AS (SELECT max(finished_at) AS at FROM public.automation_runs WHERE task='fetch-jobs' AND status='succeeded'),
  usable AS (SELECT max(finished_at) AS at FROM public.automation_runs WHERE task='fetch-jobs' AND (status='succeeded' OR (status='partial' AND coalesce((counts->>'total')::int,0)>0))),
  alerts AS (SELECT status,started_at,finished_at,lease_expires_at FROM public.automation_runs WHERE task='job-alerts' ORDER BY started_at DESC LIMIT 1)
  SELECT jsonb_build_object('checked_at',now(),'expected_interval_minutes',120,
    'last_successful_at',(SELECT at FROM successful),'last_usable_at',(SELECT at FROM usable),
    'latest', (SELECT jsonb_build_object('id',id,'status',CASE WHEN status='running' AND lease_expires_at<now() THEN 'timed_out' ELSE status END,'started_at',started_at,'finished_at',finished_at,'sources',sources,'counts',counts,'error_code',error_code) FROM latest),
    'alerts', (SELECT jsonb_build_object('status',CASE WHEN status='running' AND lease_expires_at<now() THEN 'timed_out' ELSE status END,'started_at',started_at,'finished_at',finished_at) FROM alerts))
$$;
REVOKE ALL ON FUNCTION public.begin_automation_run(text,text,integer) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.finish_automation_run(uuid,text,jsonb,jsonb,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.begin_automation_run(text,text,integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.finish_automation_run(uuid,text,jsonb,jsonb,text) TO service_role;
REVOKE ALL ON FUNCTION public.get_feed_health() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_feed_health() TO authenticated,service_role;
