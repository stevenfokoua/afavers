The function router and shared import map were adapted from Supabase's
Apache-2.0-licensed docker/volumes/functions/main/index.ts and deno.jsonc at commit
080b888e6be68f8c2646119a3059d89c8fac8d80:
https://github.com/supabase/supabase/tree/080b888e6be68f8c2646119a3059d89c8fac8d80/docker/volumes/functions

Local changes bound active workers and their queue, restrict function names,
reduce worker heap and retries, and retain function-specific authorization.
The backend boots from /opt/afavers/functions/main/index.ts; copy these files
there when installing. The root deno.jsonc also belongs in functions/deno.jsonc.
