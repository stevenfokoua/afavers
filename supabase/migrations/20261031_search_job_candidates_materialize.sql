-- Preserve the applied candidate-search migration. Only fence the final
-- normalization projection so PostgreSQL evaluates it once per listing,
-- rather than once per alias in the EXISTS join. No index, ACL or RLS changes.
-- Read-only live comparison: 195 identical IDs, 1469-1631ms ->202-231ms.
CREATE OR REPLACE FUNCTION public.search_job_candidates(p_terms text[])
RETURNS SETOF public.jobs
LANGUAGE plpgsql STABLE SECURITY INVOKER
SET search_path=pg_catalog,public,extensions
AS $$
DECLARE terms text[];
BEGIN
  IF p_terms IS NULL OR cardinality(p_terms)>64 OR EXISTS (
    SELECT 1 FROM unnest(p_terms) term
    WHERE term IS NULL OR char_length(term)>100 OR term !~ '[^[:space:]]'
  ) THEN
    RAISE EXCEPTION 'Provide at most 64 nonblank search terms of at most 100 characters'
      USING ERRCODE='22023';
  END IF;
  IF cardinality(p_terms)=0 THEN RETURN; END IF;

  WITH raw AS (
    SELECT lower(extensions.unaccent('extensions.unaccent'::regdictionary,
      regexp_replace(regexp_replace(term,'<[^>]*>',' ','g'),
        '&(?:nbsp|amp|quot|apos|lt|gt);',' ','gi'))) value
    FROM unnest(p_terms) term
  ), technical AS (
    SELECT regexp_replace(regexp_replace(regexp_replace(value,
      '\mc\+\+',' cplusplus ','g'),'\mc#',' csharp ','g'),
      '\.net\M',' dotnet ','g') value
    FROM raw
  ), normalized AS (
    SELECT btrim(regexp_replace(value,'[^[:alnum:]]+',' ','g')) value FROM technical
  )
  SELECT array_agg(DISTINCT value) INTO terms FROM normalized WHERE value<>'';
  IF coalesce(cardinality(terms),0)=0 THEN RETURN; END IF;

  -- Coarse OR candidates are deliberately a superset. Synonym expansion and
  -- final exact/whole-word matching remain shared TypeScript behavior. Two-
  -- character concepts such as IT must not scan every Mitarbeit/Digitale row.
  RETURN QUERY
  SELECT j.*
  FROM public.jobs j
  CROSS JOIN LATERAL (
    SELECT lower(extensions.unaccent('extensions.unaccent'::regdictionary,
      regexp_replace(regexp_replace(concat_ws(' ',j.title,j.company,j.location,j.description,j.source),
        '<[^>]*>',' ','g'),'&(?:nbsp|amp|quot|apos|lt|gt);',' ','gi'))) value
  ) raw
  CROSS JOIN LATERAL (
    SELECT regexp_replace(regexp_replace(regexp_replace(raw.value,
      '\mc\+\+',' cplusplus ','g'),'\mc#',' csharp ','g'),
      '\.net\M',' dotnet ','g') value
  ) technical
  CROSS JOIN LATERAL (
    SELECT btrim(regexp_replace(technical.value,'[^[:alnum:]]+',' ','g')) value OFFSET 0
  ) normalized
  WHERE j.owner_user_id IS NULL AND NOT j.is_manual AND NOT j.is_hidden
    AND j.is_active AND j.url IS NOT NULL
    AND (j.deadline IS NULL OR j.deadline>=(CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date)
    AND EXISTS (
      SELECT 1 FROM unnest(terms) term
      WHERE CASE WHEN char_length(term)<=2
        THEN strpos(' '||normalized.value||' ',' '||term||' ')>0
        ELSE strpos(normalized.value,term)>0 END
    )
  ORDER BY j.created_at DESC,j.id DESC;
END $$;

-- CREATE OR REPLACE preserves the existing authenticated-only function ACL.
NOTIFY pgrst, 'reload schema';
