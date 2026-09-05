import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import { handleOptions, jsonResponse } from '../_shared/cors.ts';

Deno.serve(async (req) => {
  const options = handleOptions(req);
  if (options) return options;

  const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) return jsonResponse({ error: 'Unauthorized' }, 401, req);

  const { data: appUser, error } = await supabase
    .from('users')
    .select('id,email,created_at')
    .eq('auth_user_id', authData.user.id)
    .single();
  // Throwing here escapes Deno.serve and returns a 500 with no CORS headers,
  // which the browser reports as a CORS failure instead of the real error.
  if (error || !appUser) return jsonResponse({ error: 'Profile not found' }, 404, req);

  const [settings, jobs, alerts] = await Promise.all([
    supabase.from('user_settings').select('*').eq('user_id', appUser.id).maybeSingle(),
    supabase.from('user_jobs').select('*, jobs(*)').eq('user_id', appUser.id),
    supabase.from('job_alerts').select('*').eq('user_id', appUser.id),
  ]);

  return jsonResponse({ profile: appUser, settings: settings.data, jobs: jobs.data ?? [], alerts: alerts.data ?? [] }, 200, req);
});
