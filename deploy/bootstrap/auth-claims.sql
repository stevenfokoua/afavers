-- PostgREST 14 passes one JSON claims setting. Keep legacy compatibility too.
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
 SELECT coalesce(nullif(current_setting('request.jwt.claim.sub',true),''),
   nullif(current_setting('request.jwt.claims',true),'')::jsonb ->> 'sub')::uuid
$$;
CREATE OR REPLACE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$
 SELECT coalesce(nullif(current_setting('request.jwt.claim.role',true),''),
   nullif(current_setting('request.jwt.claims',true),'')::jsonb ->> 'role')
$$;
CREATE OR REPLACE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$
 SELECT coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb
$$;
ALTER FUNCTION auth.uid() OWNER TO supabase_auth_admin;
ALTER FUNCTION auth.role() OWNER TO supabase_auth_admin;
ALTER FUNCTION auth.jwt() OWNER TO supabase_auth_admin;
