-- Executable only against the owned disposable local-restore target.
DO $$ BEGIN
  IF current_database() !~ '^afavers_restore_[a-f0-9]{12}$' THEN
    RAISE EXCEPTION 'Readiness contracts must never run against the production database';
  END IF;
END $$;

DO $$
DECLARE
  app_user bigint; auth_id uuid; result jsonb; second jsonb; operation uuid;
  lease jsonb; other jsonb; completed boolean; due timestamptz; conflict_revision bigint;
  fixture_alert_id integer; fixture_job_id integer; batch jsonb; configuration jsonb; batch_id uuid;
BEGIN
  auth_id:=gen_random_uuid();
  INSERT INTO auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
    VALUES(auth_id,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','readiness-'||auth_id::text||'@example.invalid','',now(),'{}','{"purpose":"disposable restore contract"}',now(),now());
  INSERT INTO public.users(auth_user_id,email,password_hash) VALUES(auth_id,'readiness-'||auth_id::text||'@example.invalid','supabase-auth') ON CONFLICT DO NOTHING;
  SELECT id INTO app_user FROM public.users WHERE auth_user_id=auth_id;
  ASSERT app_user IS NOT NULL,'Disposable authenticated profile required';
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',auth_id,'role','authenticated')::text,true);
  PERFORM set_config('request.jwt.claim.sub',auth_id::text,true);
  operation:=gen_random_uuid();
  result:=public.write_account_item(app_user,'saved_searches','readiness-search',NULL,
    '{"id":"readiness-search","name":"Readiness search","filters":{"search":"GIS"}}',false,operation);
  ASSERT (result->>'applied')::boolean,'Initial account write failed';
  second:=public.write_account_item(app_user,'saved_searches','readiness-search',NULL,
    '{"id":"readiness-search","name":"Readiness search","filters":{"search":"GIS"}}',false,operation);
  ASSERT second->'record'->>'revision'=result->'record'->>'revision','Lost-response retry is not idempotent';
  second:=public.write_account_item(app_user,'saved_searches','readiness-search',NULL,
    '{"id":"readiness-search","name":"Conflicting edit","filters":{"search":"IT"}}',false,gen_random_uuid());
  ASSERT (second->>'applied')::boolean=false,'Stale device unexpectedly overwrote account data';
  conflict_revision:=(result->'record'->>'revision')::bigint;
  second:=public.write_account_item(app_user,'saved_searches','readiness-search',conflict_revision,NULL,true,gen_random_uuid());
  ASSERT (second->'record'->>'deleted')::boolean,'Deletion tombstone was not stored';
  BEGIN
    PERFORM public.write_account_item(app_user+9999,'saved_searches','wrong-owner',NULL,
      '{"id":"wrong-owner","name":"Wrong owner","filters":{}}',false,gen_random_uuid());
    RAISE EXCEPTION 'Expected-owner guard did not reject a switched account';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  result:=public.write_account_item(app_user,'calendar_events','readiness-calendar',NULL,
    '{"id":"readiness-calendar","title":"Contract interview","date":"2026-11-05","type":"interview","time":"10:00"}',false,gen_random_uuid());
  ASSERT (result->>'applied')::boolean,'Calendar write failed';
  result:=public.write_account_item(app_user,'reminders','readiness-dst',NULL,
    '{"id":"readiness-dst","title":"Contract reminder","date":"2026-10-25","time":"02:30","type":"custom","timezone":"Europe/Berlin","emailEnabled":true,"completed":false}',false,gen_random_uuid());
  due:=(result->'record'->>'email_due_at')::timestamptz;
  ASSERT due='2026-10-25T01:30:00Z'::timestamptz,'DST fold must use the later/standard occurrence';
  BEGIN
    PERFORM public.write_account_item(app_user,'reminders','readiness-dst-gap',NULL,
      '{"id":"readiness-dst-gap","title":"Gap reminder","date":"2027-03-28","time":"02:30","type":"custom","timezone":"Europe/Berlin","emailEnabled":true,"completed":false}',false,gen_random_uuid());
    RAISE EXCEPTION 'Expected nonexistent wall-time rejection';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM='Expected nonexistent wall-time rejection' THEN RAISE; END IF;
  END;
  ASSERT (SELECT count(*) FROM public.get_reminder_delivery_status(app_user))=1,'Own reminder delivery status missing';
  ASSERT (SELECT count(*) FROM public.get_reminder_delivery_status(app_user+9999))=0,'Wrong expected owner saw delivery status';
  UPDATE public.automation_runs SET status='timed_out',finished_at=clock_timestamp() WHERE task='fetch-jobs' AND status='running';
  lease:=public.begin_automation_run('fetch-jobs','verification',180);
  ASSERT (lease->>'acquired')::boolean,'Import lease not acquired';
  other:=public.begin_automation_run('fetch-jobs','verification',180);
  ASSERT (other->>'acquired')::boolean=false,'Overlapping import was not excluded';
  completed:=public.finish_automation_run((lease->>'run_id')::uuid,'succeeded','[]','{"total":20}',NULL);
  ASSERT completed,'Import completion was not recorded';
  ASSERT public.get_feed_health()->>'last_successful_at' IS NOT NULL,'Actual import success missing from feed health';
  INSERT INTO public.job_alerts(user_id,enabled,keywords,locations,min_score,frequency)
    VALUES(app_user,true,'GIS','Remote',50,'daily') RETURNING id INTO fixture_alert_id;
  SELECT id INTO fixture_job_id FROM public.jobs WHERE owner_user_id IS NULL LIMIT 1;
  configuration:=jsonb_build_object('keywords','GIS','locations','Remote','min_score',50,'frequency','daily');
  batch:=public.claim_job_alert_batch(fixture_alert_id,app_user::integer,ARRAY[fixture_job_id],
    'readiness-'||auth_id::text||'@example.invalid','Contract alert','<p>Disposable test</p>',configuration);
  ASSERT batch->>'status'='sending','Alert acceptance batch was not claimed: '||coalesce(batch::text,'null');
  batch_id:=(batch->>'id')::uuid;
  other:=public.claim_job_alert_batch(fixture_alert_id,app_user::integer,ARRAY[fixture_job_id],
    'readiness-'||auth_id::text||'@example.invalid','Contract alert','<p>Disposable test</p>',configuration);
  ASSERT other->>'reason'='delivery_running','Concurrent alert dispatch was not excluded';
  ASSERT NOT public.finalize_job_alert_batch(batch_id),'Unaccepted mail must not enter delivery history';
  UPDATE public.job_alert_batches SET status='accepted',accepted_at=now() WHERE id=batch_id;
  ASSERT public.finalize_job_alert_batch(batch_id),'Accepted mail was not recorded';
  ASSERT public.finalize_job_alert_batch(batch_id),'Accepted mail recovery was not idempotent';
  ASSERT (SELECT count(*) FROM public.job_alert_deliveries WHERE job_alert_deliveries.alert_id=fixture_alert_id AND job_alert_deliveries.job_id=fixture_job_id)=1,'Alert delivery history duplicated';
  ASSERT (SELECT html='' AND to_email='' AND subject='' FROM public.job_alert_batches WHERE id=batch_id),'Finalized batch retained transient mail content';
END $$;
