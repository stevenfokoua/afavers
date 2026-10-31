-- A durable acceptance ledger closes the SMTP accepted / DB history-write gap.
-- Ambiguous handoffs are held for operator review, never blindly resent.
ALTER TABLE public.job_alerts ADD COLUMN IF NOT EXISTS last_checked_at timestamptz;
CREATE TABLE IF NOT EXISTS public.job_alert_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_id integer NOT NULL REFERENCES public.job_alerts(id) ON DELETE CASCADE,
  user_id integer NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  job_ids integer[] NOT NULL CHECK(cardinality(job_ids) BETWEEN 1 AND 10),
  to_email text NOT NULL,
  subject text NOT NULL CHECK(length(subject)<=1000),
  html text NOT NULL CHECK(length(html)<=65536),
  configuration_key text NOT NULL,
  status text NOT NULL DEFAULT 'sending' CHECK(status IN ('sending','accepted','recorded','retryable','failed','uncertain','cancelled')),
  attempts integer NOT NULL DEFAULT 1 CHECK(attempts BETWEEN 1 AND 3),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  next_attempt_at timestamptz,
  accepted_at timestamptz,
  error_code text CHECK(length(error_code)<=80)
);
CREATE INDEX IF NOT EXISTS job_alert_batches_alert_status_idx ON public.job_alert_batches(alert_id,status,created_at);
ALTER TABLE public.job_alert_batches ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.job_alert_batches FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.job_alert_batches TO service_role;

CREATE OR REPLACE FUNCTION public.claim_job_alert_batch(p_alert_id integer,p_user_id integer,p_job_ids integer[],p_to_email text,p_subject text,p_html text,p_configuration jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE batch public.job_alert_batches; current_email text; current_configuration jsonb;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('afavers:job-alert:'||p_alert_id::text));
  SELECT u.email,jsonb_build_object('keywords',a.keywords,'locations',a.locations,'min_score',a.min_score,'frequency',a.frequency) INTO current_email,current_configuration FROM public.job_alerts a JOIN public.users u ON u.id=a.user_id
    WHERE a.id=p_alert_id AND a.user_id=p_user_id AND a.enabled=true;
  IF current_email IS NULL OR current_email<>p_to_email THEN RETURN jsonb_build_object('blocked',true,'reason','alert_unavailable'); END IF;
  IF current_configuration IS DISTINCT FROM p_configuration THEN RETURN jsonb_build_object('blocked',true,'reason','configuration_changed'); END IF;
  SELECT * INTO batch FROM public.job_alert_batches WHERE alert_id=p_alert_id
    AND status IN ('sending','accepted','retryable','failed','uncertain') ORDER BY created_at LIMIT 1 FOR UPDATE;
  IF FOUND THEN
    IF batch.to_email<>current_email THEN
      UPDATE public.job_alert_batches SET status='cancelled',updated_at=now(),error_code='recipient_changed' WHERE id=batch.id;
      RETURN jsonb_build_object('blocked',true,'reason','recipient_changed');
    END IF;
    IF batch.status='accepted' THEN RETURN to_jsonb(batch); END IF;
    IF batch.configuration_key<>md5(current_configuration::text) THEN
      UPDATE public.job_alert_batches SET status='cancelled',updated_at=now(),error_code='configuration_changed' WHERE id=batch.id;
      RETURN jsonb_build_object('blocked',true,'reason','configuration_changed');
    END IF;
    IF batch.status='sending' AND batch.updated_at < now()-interval '3 minutes' THEN
      UPDATE public.job_alert_batches SET status='uncertain',updated_at=now(),error_code='worker_interrupted' WHERE id=batch.id;
      RETURN jsonb_build_object('blocked',true,'reason','delivery_uncertain');
    END IF;
    IF batch.status='retryable' AND batch.next_attempt_at<=now() AND batch.attempts<3 THEN
      UPDATE public.job_alert_batches SET status='sending',attempts=attempts+1,updated_at=now(),next_attempt_at=NULL
        WHERE id=batch.id RETURNING * INTO batch;
      RETURN to_jsonb(batch);
    END IF;
    RETURN jsonb_build_object('blocked',true,'reason',CASE WHEN batch.status='retryable' THEN 'retry_pending' WHEN batch.status='sending' THEN 'delivery_running' ELSE 'delivery_'||batch.status END);
  END IF;
  IF cardinality(p_job_ids) NOT BETWEEN 1 AND 10 THEN RETURN jsonb_build_object('blocked',true,'reason','no_candidates'); END IF;
  INSERT INTO public.job_alert_batches(alert_id,user_id,job_ids,to_email,subject,html,configuration_key)
    VALUES(p_alert_id,p_user_id,p_job_ids,p_to_email,p_subject,p_html,md5(current_configuration::text)) RETURNING * INTO batch;
  RETURN to_jsonb(batch);
END $$;

CREATE OR REPLACE FUNCTION public.finalize_job_alert_batch(p_batch_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE batch public.job_alert_batches;
BEGIN
  SELECT * INTO batch FROM public.job_alert_batches WHERE id=p_batch_id FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  IF batch.status='recorded' THEN RETURN true; END IF;
  IF batch.status<>'accepted' THEN RETURN false; END IF;
  INSERT INTO public.job_alert_deliveries(alert_id,user_id,job_id,sent_at)
    SELECT batch.alert_id,batch.user_id,j.id,coalesce(batch.accepted_at,now())
    FROM unnest(batch.job_ids) AS selected(id) JOIN public.jobs j ON j.id=selected.id
    ON CONFLICT(alert_id,job_id) DO NOTHING;
  UPDATE public.job_alerts SET last_sent_at=coalesce(batch.accepted_at,now()) WHERE id=batch.alert_id;
  UPDATE public.job_alert_batches SET status='recorded',updated_at=now(),error_code=NULL,html='',subject='',to_email='' WHERE id=batch.id;
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.claim_job_alert_batch(integer,integer,integer[],text,text,text,jsonb) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.finalize_job_alert_batch(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_job_alert_batch(integer,integer,integer[],text,text,text,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.finalize_job_alert_batch(uuid) TO service_role;
