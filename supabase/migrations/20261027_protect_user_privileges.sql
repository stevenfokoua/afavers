-- App profiles are read through RLS and created by the auth trigger.
-- Profile changes must use a field-scoped RPC; authenticated users must never
-- write auth_user_id, email or is_admin directly. Admin RPCs remain available.
REVOKE UPDATE ON public.users FROM PUBLIC, anon, authenticated;
REVOKE UPDATE (id, email, password_hash, created_at, auth_user_id, is_admin)
  ON public.users FROM PUBLIC, anon, authenticated;

-- Resolve immutable auth identity rather than a mutable/case-sensitive email.
CREATE OR REPLACE FUNCTION public.current_app_user_id()
RETURNS INTEGER LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT id FROM public.users WHERE auth_user_id = auth.uid() LIMIT 1 $$;
