-- Account-owned collections with durable deletion history and compare-and-swap writes.
-- Existing browser data is imported by its known owner; no legacy unowned data is reassigned.
CREATE TABLE IF NOT EXISTS public.account_items (
  user_id bigint NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  collection text NOT NULL CHECK (collection IN ('reminders','calendar_events','saved_searches')),
  item_id text NOT NULL CHECK (length(item_id) BETWEEN 1 AND 100),
  data jsonb,
  deleted boolean NOT NULL DEFAULT false,
  revision bigint NOT NULL DEFAULT 1,
  last_operation uuid NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  email_due_at timestamptz,
  email_armed_at timestamptz,
  reminder_generation uuid,
  PRIMARY KEY (user_id,collection,item_id),
  CHECK (data IS NULL OR (jsonb_typeof(data)='object' AND octet_length(data::text)<=32768))
);
ALTER TABLE public.account_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS account_items_read_own ON public.account_items;
CREATE POLICY account_items_read_own ON public.account_items FOR SELECT TO authenticated
  USING (user_id=public.current_app_user_id());
GRANT SELECT ON public.account_items TO authenticated;
GRANT ALL ON public.account_items TO service_role;
REVOKE INSERT,UPDATE,DELETE ON public.account_items FROM anon,authenticated;

CREATE OR REPLACE FUNCTION public.write_account_item(
  p_user_id bigint,p_collection text,p_item_id text,p_expected_revision bigint,p_data jsonb,p_deleted boolean,p_operation uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE
  uid bigint:=public.current_app_user_id();
  old public.account_items; saved public.account_items;
  due timestamptz; wall timestamp; zone text; armed timestamptz; generation uuid;
BEGIN
  IF uid IS NULL OR uid IS DISTINCT FROM p_user_id THEN RAISE EXCEPTION 'Sign in to sync your account' USING ERRCODE='42501'; END IF;
  IF p_collection IS NULL OR p_collection NOT IN ('reminders','calendar_events','saved_searches') OR p_item_id IS NULL OR length(p_item_id) NOT BETWEEN 1 AND 100 OR p_operation IS NULL OR p_deleted IS NULL THEN RAISE EXCEPTION 'Invalid account item'; END IF;
  IF NOT p_deleted AND (p_data IS NULL OR jsonb_typeof(p_data)<>'object' OR p_data->>'id' IS DISTINCT FROM p_item_id OR octet_length(p_data::text)>32768) THEN RAISE EXCEPTION 'Invalid account item data'; END IF;
  -- The account-wide search quota must serialize distinct ids too. Acquire the
  -- collection lock before the item lock in every saved-search write/delete.
  IF p_collection='saved_searches' THEN PERFORM pg_advisory_xact_lock(hashtextextended(uid::text||':saved_searches',0)); END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(uid::text||':'||p_collection||':'||p_item_id,0));
  SELECT * INTO old FROM public.account_items WHERE user_id=uid AND collection=p_collection AND item_id=p_item_id FOR UPDATE;
  IF FOUND THEN
    IF old.last_operation=p_operation THEN RETURN jsonb_build_object('applied',true,'record',to_jsonb(old)); END IF;
    IF old.revision IS DISTINCT FROM p_expected_revision THEN RETURN jsonb_build_object('applied',false,'record',to_jsonb(old)); END IF;
  ELSIF p_expected_revision IS NOT NULL THEN
    RAISE EXCEPTION 'Account item no longer exists; refresh before retrying';
  END IF;
  IF NOT p_deleted AND p_collection='saved_searches' THEN
    IF nullif(trim(p_data->>'name'),'') IS NULL OR length(p_data->>'name')>60 OR jsonb_typeof(p_data->'filters') IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Invalid saved search'; END IF;
    IF (old.user_id IS NULL OR old.deleted) AND (SELECT count(*) FROM public.account_items WHERE user_id=uid AND collection='saved_searches' AND NOT deleted)>=12 THEN RAISE EXCEPTION 'Your account already has 12 saved searches'; END IF;
  END IF;
  IF NOT p_deleted AND p_collection IN ('reminders','calendar_events') THEN
    IF nullif(trim(p_data->>'title'),'') IS NULL OR length(p_data->>'title')>500 OR coalesce(p_data->>'date','') !~ '^\d{4}-\d{2}-\d{2}$' THEN RAISE EXCEPTION 'Enter a title and valid date'; END IF;
    PERFORM (p_data->>'date')::date;
  END IF;
  IF NOT p_deleted AND p_collection='reminders' THEN
    IF coalesce(p_data->>'time','') !~ '^([01]\d|2[0-3]):[0-5]\d$' OR coalesce(p_data->>'type','') NOT IN ('interview','followup','deadline','custom') THEN RAISE EXCEPTION 'Invalid reminder time or type'; END IF;
    zone:=coalesce(nullif(p_data->>'timezone',''),'UTC');
    IF NOT EXISTS (SELECT 1 FROM pg_timezone_names WHERE name=zone) THEN RAISE EXCEPTION 'Choose a valid IANA timezone'; END IF;
    wall:=((p_data->>'date')||' '||(p_data->>'time'))::timestamp;
    due:=wall AT TIME ZONE zone;
    IF (due AT TIME ZONE zone)<>wall THEN RAISE EXCEPTION 'This local time does not exist during the daylight-saving change'; END IF;
    p_data:=p_data||jsonb_build_object('timezone',zone,'emailEnabled',coalesce((p_data->>'emailEnabled')::boolean,false),'completed',coalesce((p_data->>'completed')::boolean,false));
    IF coalesce((p_data->>'emailEnabled')::boolean,false) AND NOT coalesce((p_data->>'completed')::boolean,false) THEN
      IF old.reminder_generation IS NULL OR old.email_due_at IS DISTINCT FROM due OR NOT coalesce((old.data->>'emailEnabled')::boolean,false) THEN
        generation:=gen_random_uuid();armed:=clock_timestamp();
      ELSE generation:=old.reminder_generation;armed:=old.email_armed_at;
      END IF;
    ELSE due:=NULL;generation:=old.reminder_generation;armed:=old.email_armed_at;
    END IF;
  END IF;
  INSERT INTO public.account_items(user_id,collection,item_id,data,deleted,revision,last_operation,email_due_at,email_armed_at,reminder_generation)
    VALUES(uid,p_collection,p_item_id,CASE WHEN p_deleted THEN NULL ELSE p_data END,p_deleted,coalesce(old.revision,0)+1,p_operation,due,armed,generation)
    ON CONFLICT(user_id,collection,item_id) DO UPDATE SET data=excluded.data,deleted=excluded.deleted,revision=excluded.revision,last_operation=excluded.last_operation,updated_at=clock_timestamp(),email_due_at=excluded.email_due_at,email_armed_at=excluded.email_armed_at,reminder_generation=excluded.reminder_generation
    RETURNING * INTO saved;
  RETURN jsonb_build_object('applied',true,'record',to_jsonb(saved));
END $$;
REVOKE ALL ON FUNCTION public.write_account_item(bigint,text,text,bigint,jsonb,boolean,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.write_account_item(bigint,text,text,bigint,jsonb,boolean,uuid) TO authenticated;

CREATE TABLE IF NOT EXISTS public.reminder_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id bigint NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  item_id text NOT NULL,
  generation uuid NOT NULL,
  state text NOT NULL CHECK (state IN ('claimed','retry','sent','failed','uncertain','cancelled')),
  attempts integer NOT NULL DEFAULT 1,
  claimed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  next_attempt_at timestamptz,
  sent_at timestamptz,
  error_code text,
  UNIQUE(user_id,item_id,generation)
);
ALTER TABLE public.reminder_deliveries ENABLE ROW LEVEL SECURITY;
CREATE POLICY reminder_deliveries_read_own ON public.reminder_deliveries FOR SELECT TO authenticated USING(user_id=public.current_app_user_id());
GRANT SELECT ON public.reminder_deliveries TO authenticated;
GRANT ALL ON public.reminder_deliveries TO service_role;

CREATE OR REPLACE FUNCTION public.get_reminder_delivery_status(p_user_id bigint) RETURNS TABLE(item_id text,state text,due_at timestamptz,sent_at timestamptz,error_code text,attempts integer)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public,pg_temp AS $$
  SELECT a.item_id,coalesce(d.state,CASE WHEN a.email_due_at IS NULL OR a.email_due_at<a.email_armed_at THEN 'not_scheduled' WHEN a.email_due_at<clock_timestamp()-interval '24 hours' THEN 'missed' ELSE 'scheduled' END),a.email_due_at,d.sent_at,d.error_code,coalesce(d.attempts,0)
  FROM public.account_items a LEFT JOIN public.reminder_deliveries d ON d.user_id=a.user_id AND d.item_id=a.item_id AND d.generation=a.reminder_generation
  WHERE a.user_id=public.current_app_user_id() AND a.user_id=p_user_id AND a.collection='reminders' AND NOT a.deleted;
$$;
REVOKE ALL ON FUNCTION public.get_reminder_delivery_status(bigint) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_reminder_delivery_status(bigint) TO authenticated;
CREATE INDEX IF NOT EXISTS account_items_due_reminders ON public.account_items(email_due_at) WHERE collection='reminders' AND NOT deleted AND email_due_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS reminder_delivery_retries ON public.reminder_deliveries(next_attempt_at) WHERE state='retry';

CREATE OR REPLACE FUNCTION public.claim_due_reminders(p_limit integer DEFAULT 5) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE item record; delivery public.reminder_deliveries; result jsonb:='[]'::jsonb;
BEGIN
  -- A killed worker may already have submitted DATA. Never silently retry that
  -- uncertain delivery: a stable message id cannot guarantee SMTP deduplication.
  UPDATE public.reminder_deliveries SET state='uncertain',error_code='worker_lease_expired'
    WHERE state='claimed' AND claimed_at<clock_timestamp()-interval '5 minutes';
  FOR item IN
    SELECT a.*,u.email FROM public.account_items a JOIN public.users u ON u.id=a.user_id
    JOIN auth.users auth_user ON auth_user.id=u.auth_user_id AND auth_user.email_confirmed_at IS NOT NULL
    LEFT JOIN public.reminder_deliveries d ON d.user_id=a.user_id AND d.item_id=a.item_id AND d.generation=a.reminder_generation
    WHERE a.collection='reminders' AND NOT a.deleted AND a.email_due_at<=clock_timestamp()
      AND a.email_due_at>=a.email_armed_at AND a.email_due_at>clock_timestamp()-interval '24 hours'
      AND coalesce((a.data->>'emailEnabled')::boolean,false) AND NOT coalesce((a.data->>'completed')::boolean,false)
      AND (d.id IS NULL OR (d.state='retry' AND d.next_attempt_at<=clock_timestamp() AND d.attempts<5))
    ORDER BY a.email_due_at LIMIT greatest(1,least(coalesce(p_limit,5),10)) FOR UPDATE OF a SKIP LOCKED
  LOOP
    INSERT INTO public.reminder_deliveries(user_id,item_id,generation,state)
      VALUES(item.user_id,item.item_id,item.reminder_generation,'claimed')
      ON CONFLICT(user_id,item_id,generation) DO UPDATE SET state='claimed',attempts=reminder_deliveries.attempts+1,claimed_at=clock_timestamp(),next_attempt_at=NULL
        WHERE reminder_deliveries.state='retry' AND reminder_deliveries.attempts<5 AND reminder_deliveries.next_attempt_at<=clock_timestamp()
      RETURNING * INTO delivery;
    IF FOUND THEN result:=result||jsonb_build_array(jsonb_build_object('delivery_id',delivery.id,'user_id',item.user_id,'item_id',item.item_id,'generation',item.reminder_generation,'email',item.email)); END IF;
  END LOOP;
  RETURN result;
END $$;

CREATE OR REPLACE FUNCTION public.finish_reminder_delivery(p_delivery_id uuid,p_state text,p_error_code text DEFAULT NULL) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  IF p_state NOT IN ('sent','retry','failed','uncertain','cancelled') THEN RAISE EXCEPTION 'Invalid delivery outcome'; END IF;
  UPDATE public.reminder_deliveries SET state=CASE WHEN p_state='retry' AND attempts>=5 THEN 'failed' ELSE p_state END,
    sent_at=CASE WHEN p_state='sent' THEN clock_timestamp() ELSE sent_at END,
    next_attempt_at=CASE WHEN p_state='retry' AND attempts<5 THEN clock_timestamp()+make_interval(mins=>least(60,power(2,attempts)::integer)) ELSE NULL END,
    error_code=left(p_error_code,100)
    WHERE id=p_delivery_id AND state='claimed';
  RETURN FOUND;
END $$;
REVOKE ALL ON FUNCTION public.claim_due_reminders(integer) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.finish_reminder_delivery(uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_due_reminders(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.finish_reminder_delivery(uuid,text,text) TO service_role;
NOTIFY pgrst, 'reload schema';
