-- Run only after the new migration inside an owned disposable restore DB.
-- All fixtures and temporary grants roll back. Never run against production.
BEGIN;
DO $$ BEGIN
  IF current_database() NOT LIKE 'afavers_restore_%' THEN
    RAISE EXCEPTION 'Candidate contracts require the owned disposable restore database';
  END IF;
END $$;

CREATE TEMP TABLE candidate_fixture_ids(kind text,id integer);
WITH old AS (
  INSERT INTO public.jobs(external_id,title,company,location,description,url,source,created_at,is_active,description_quality)
  VALUES('candidate-contract-old-'||txid_current(),'Old QGIS geospatial analyst','Synthetic contract employer','Düsseldorf',
    'An actual source description would contain qualifications. This is isolated disposable contract data for a QGIS role outside the recent window.',
    'https://example.invalid/old-gis','bundesagentur',now()-interval '1 year',true,'full')
  RETURNING id
) INSERT INTO candidate_fixture_ids SELECT 'old',id FROM old;

INSERT INTO public.jobs(external_id,title,company,location,description,url,source,created_at,is_active)
SELECT 'candidate-contract-padding-'||txid_current()||'-'||n,'Recent paddingneedle inventory item','Synthetic contract employer','Berlin',
  'Mitarbeit an digitalen Produkten. Unrelated recent inventory.',
  'https://example.invalid/padding/'||n,'bundesagentur',now(),true FROM generate_series(1,1001)n;

WITH technical AS (
  INSERT INTO public.jobs(external_id,title,company,location,description,url,source,is_active)
  VALUES('candidate-contract-technical-'||txid_current(),'C++ C# .NET IT engineer','Synthetic contract employer','Düsseldorf',
    'Contract-only technical terms. No personal data.', 'https://example.invalid/technical','bundesagentur',true)
  RETURNING id
) INSERT INTO candidate_fixture_ids SELECT 'technical',id FROM technical;

WITH dotnet AS (
  INSERT INTO public.jobs(external_id,title,description,url,source,is_active)
  VALUES
    ('candidate-contract-parenthesized-net-'||txid_current(),'Developer (.NET)','Parenthesized technical token contract.',
      'https://example.invalid/parenthesized-net','bundesagentur',true),
    ('candidate-contract-asp-net-'||txid_current(),'ASP.NET developer','Embedded literal technical token contract.',
      'https://example.invalid/asp-net','bundesagentur',true)
  RETURNING id
) INSERT INTO candidate_fixture_ids SELECT 'dotnet',id FROM dotnet;

INSERT INTO public.jobs(external_id,title,description,url,source,is_active,is_hidden,deadline)
VALUES
 ('candidate-contract-inactive-'||txid_current(),'eligibilityneedle','Inactive contract fixture','https://example.invalid/inactive','bundesagentur',false,false,NULL),
 ('candidate-contract-hidden-'||txid_current(),'eligibilityneedle','Hidden contract fixture','https://example.invalid/hidden','bundesagentur',true,true,NULL),
 ('candidate-contract-expired-'||txid_current(),'eligibilityneedle','Expired contract fixture','https://example.invalid/expired','bundesagentur',true,false,CURRENT_DATE-1);

INSERT INTO public.jobs(external_id,title,description,url,source,is_active,is_manual,owner_user_id)
SELECT 'candidate-contract-private-'||txid_current(),'privateneedle','Private contract fixture',
  'https://example.invalid/private','manual',true,true,id FROM public.users ORDER BY id LIMIT 1;

-- The restore drill uses --no-privileges, so these two existing production
-- baseline privileges are absent in its disposable database. Reproduce them
-- only inside this rolled-back test transaction; production migration adds no
-- table/schema grant. The real CI backend separately verifies normal grants.
GRANT SELECT ON public.jobs TO authenticated;
GRANT USAGE ON SCHEMA extensions TO authenticated;
GRANT SELECT ON candidate_fixture_ids TO authenticated;
SET LOCAL ROLE authenticated;
DO $$
DECLARE old_id integer; technical_id integer; ids integer[]; term text; fixture_id integer;
BEGIN
  SELECT id INTO old_id FROM candidate_fixture_ids WHERE kind='old';
  SELECT id INTO technical_id FROM candidate_fixture_ids WHERE kind='technical';
  IF old_id IN (SELECT id FROM public.jobs ORDER BY created_at DESC LIMIT 1000) THEN
    RAISE EXCEPTION 'Fixture did not reproduce the recent-window omission';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.search_job_candidates(ARRAY['gis','qgis','arcgis']) WHERE id=old_id) THEN
    RAISE EXCEPTION 'Whole-corpus GIS alias candidate was omitted';
  END IF;
  IF (SELECT count(*) FROM public.search_job_candidates(ARRAY['paddingneedle']))<>1001 THEN
    RAISE EXCEPTION 'Candidate RPC silently imposed a global result cap';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.search_job_candidates(ARRAY['dusseldorf']) WHERE id=technical_id) THEN
    RAISE EXCEPTION 'Accent normalization failed';
  END IF;
  FOREACH term IN ARRAY ARRAY['C++','C#','.NET'] LOOP
    IF NOT EXISTS(SELECT 1 FROM public.search_job_candidates(ARRAY[term]) WHERE id=technical_id) THEN
      RAISE EXCEPTION 'Technical term normalization failed';
    END IF;
  END LOOP;
  FOR fixture_id IN SELECT id FROM candidate_fixture_ids WHERE kind='dotnet' LOOP
    IF NOT EXISTS(SELECT 1 FROM public.search_job_candidates(ARRAY['dotnet']) WHERE id=fixture_id)
      OR NOT EXISTS(SELECT 1 FROM public.search_job_candidates(ARRAY['.NET']) WHERE id=fixture_id) THEN
      RAISE EXCEPTION 'Parenthesized or ASP.NET source was omitted by the coarse candidate filter';
    END IF;
  END LOOP;
  IF EXISTS(SELECT 1 FROM public.search_job_candidates(ARRAY['it']) WHERE title='Recent paddingneedle inventory item') THEN
    RAISE EXCEPTION 'Short IT term matched Mitarbeit or digitalen';
  END IF;
  IF EXISTS(SELECT 1 FROM public.search_job_candidates(ARRAY['eligibilityneedle','privateneedle'])) THEN
    RAISE EXCEPTION 'Inactive/hidden/expired/private records escaped candidate filters';
  END IF;
  IF EXISTS(SELECT 1 FROM public.search_job_candidates(ARRAY[]::text[])) THEN
    RAISE EXCEPTION 'Empty candidate intent fetched the whole corpus';
  END IF;
  SELECT array_agg(id) INTO ids FROM public.search_job_candidates(ARRAY['paddingneedle']);
  IF ids<>(SELECT array_agg(value ORDER BY value DESC) FROM unnest(ids)value) THEN
    RAISE EXCEPTION 'Created-at ties did not use deterministic descending IDs';
  END IF;
  IF (SELECT prosecdef FROM pg_proc WHERE oid='public.search_job_candidates(text[])'::regprocedure) THEN
    RAISE EXCEPTION 'Candidate function must retain invoker RLS';
  END IF;
  IF has_function_privilege('anon','public.search_job_candidates(text[])','EXECUTE') THEN
    RAISE EXCEPTION 'Anonymous candidate execution must be revoked';
  END IF;
END $$;

DO $$ BEGIN
  PERFORM public.search_job_candidates(NULL); RAISE EXCEPTION 'Expected invalid NULL intent';
EXCEPTION WHEN SQLSTATE '22023' THEN NULL; END $$;
DO $$ BEGIN
  PERFORM public.search_job_candidates(ARRAY[' ']); RAISE EXCEPTION 'Expected invalid blank intent';
EXCEPTION WHEN SQLSTATE '22023' THEN NULL; END $$;
DO $$ BEGIN
  PERFORM public.search_job_candidates(ARRAY[repeat('x',101)]); RAISE EXCEPTION 'Expected invalid long term';
EXCEPTION WHEN SQLSTATE '22023' THEN NULL; END $$;
DO $$ BEGIN
  PERFORM public.search_job_candidates(ARRAY(SELECT 'term'||n FROM generate_series(1,65)n)); RAISE EXCEPTION 'Expected invalid excessive intent';
EXCEPTION WHEN SQLSTATE '22023' THEN NULL; END $$;

ROLLBACK;
