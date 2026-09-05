CREATE OR REPLACE FUNCTION public.current_app_user_id()
RETURNS INTEGER
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id
  FROM public.users
  WHERE auth_user_id = auth.uid()
  LIMIT 1
$$;

GRANT EXECUTE ON FUNCTION public.current_app_user_id() TO authenticated;
