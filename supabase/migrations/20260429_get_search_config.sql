CREATE OR REPLACE FUNCTION public.get_search_config()
RETURNS TABLE (keywords TEXT[], locations TEXT[])
LANGUAGE SQL
STABLE
AS $$
  WITH kw AS (
    SELECT DISTINCT lower(trim(value)) AS term
    FROM public.user_settings, unnest(string_to_array(keywords, ',')) AS value
    WHERE trim(value) <> ''
  ),
  loc AS (
    SELECT DISTINCT trim(value) AS term
    FROM public.user_settings, unnest(string_to_array(locations, ',')) AS value
    WHERE trim(value) <> ''
  )
  SELECT
    COALESCE((SELECT array_agg(term ORDER BY term)[:24] FROM kw), ARRAY['consulting','beratung','nachhaltigkeit','umwelt','gis','energy']::TEXT[]),
    COALESCE((SELECT array_agg(term ORDER BY term)[:16] FROM loc), ARRAY['Düsseldorf','Köln','Essen','Bochum','Dortmund']::TEXT[]);
$$;
