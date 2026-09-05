DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'password_reset_tokens'
  ) THEN
    DROP TABLE public.password_reset_tokens;
  END IF;
END $$;
