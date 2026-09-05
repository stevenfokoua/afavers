import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import { handleOptions, jsonResponse } from '../_shared/cors.ts';
import { FETCH_BUDGET_MS, RUN_BUDGET_MS, cleanupStaleJobs, fetchAdzunaJobs, fetchBundesagenturJobs, getSearchConfig, saveJobs } from '../_shared/jobs.ts';

// Cleanup marks jobs unseen for days as stale, so it must only run after a
// healthy fetch — a broken upstream API must never look like "everything is
// stale".
const MIN_JOBS_FOR_CLEANUP = 200;

function env(name: string): string {
  return Deno.env.get(name) ?? '';
}

async function isAuthenticatedRequest(req: Request): Promise<boolean> {
  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) return false;

  const supabase = createClient(env('SUPABASE_URL'), env('SUPABASE_ANON_KEY'), {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await supabase.auth.getUser();
  if (error) return false;
  return Boolean(data.user);
}

Deno.serve(async (req) => {
  const options = handleOptions(req);
  if (options) return options;

  // Cron-only endpoint. Fail closed:
  //   * If CRON_SECRET is not configured, reject every request (never
  //     fall through to user-bearer auth).
  //   * If the x-cron-secret header does not match, reject.
  const cronSecret = Deno.env.get('CRON_SECRET');
  if (!cronSecret) {
    return jsonResponse({ error: 'CRON_SECRET is not configured' }, 401, req);
  }

  const isCronRequest = req.headers.get('x-cron-secret') === cronSecret;
  const isSignedInUser = isCronRequest ? false : await isAuthenticatedRequest(req);

  if (!isCronRequest && !isSignedInUser) {
    return jsonResponse({ error: 'Unauthorized' }, 401, req);
  }

  try {
    const startedAt = Date.now();
    const { keywords, locations } = await getSearchConfig();
    const [bundesagentur, adzuna] = await Promise.all([
      fetchBundesagenturJobs(keywords, locations, startedAt + FETCH_BUDGET_MS),
      fetchAdzunaJobs(startedAt + FETCH_BUDGET_MS),
    ]);
    const complete = bundesagentur.complete && adzuna.complete;
    const result = await saveJobs([...bundesagentur.jobs, ...adzuna.jobs]);

    let cleanup = { deleted: 0, deactivated: 0 };
    if (complete && result.total >= MIN_JOBS_FOR_CLEANUP) {
      try {
        cleanup = await cleanupStaleJobs(startedAt + RUN_BUDGET_MS);
      } catch (error) {
        console.error('cleanupStaleJobs failed:', error);
      }
    }

    return jsonResponse({
      success: true,
      ...result,
      ...cleanup,
      complete,
      sources: {
        bundesagentur: bundesagentur.jobs.length,
        adzuna: adzuna.jobs.length,
      },
    }, 200, req);
  } catch (error) {
    return jsonResponse({ success: false, error: error instanceof Error ? error.message : 'Fetch failed' }, 500, req);
  }
});
