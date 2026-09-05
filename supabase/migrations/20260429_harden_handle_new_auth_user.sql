CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.users
  SET auth_user_id = NEW.id
  WHERE lower(email) = lower(NEW.email)
    AND auth_user_id IS NULL;

  IF NOT EXISTS (SELECT 1 FROM public.users WHERE auth_user_id = NEW.id) THEN
    INSERT INTO public.users (email, password_hash, auth_user_id)
    VALUES (NEW.email, 'supabase-auth', NEW.id);
  END IF;

  INSERT INTO public.user_settings (user_id)
  SELECT id FROM public.users WHERE auth_user_id = NEW.id
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$$;
