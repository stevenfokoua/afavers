-- The image seeds these helpers as postgres; GoTrue's first migration must
-- own them to replace them. This changes no user records or credentials.
ALTER FUNCTION auth.uid() OWNER TO supabase_auth_admin;
ALTER FUNCTION auth.role() OWNER TO supabase_auth_admin;
ALTER FUNCTION auth.email() OWNER TO supabase_auth_admin;
