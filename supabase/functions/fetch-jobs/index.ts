import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import { handleOptions, jsonResponse } from '../_shared/cors.ts';
import { FETCH_BUDGET_MS, RUN_BUDGET_MS, cleanupStaleJobs, fetchAdzunaJobs, fetchBundesagenturJobs, getSearchConfig, saveJobs } from '../_shared/jobs.ts';
import { beginAutomationRun, finishAutomationRun } from '../_shared/automation-runs.ts';
import { importOutcome, type SourceReport } from '../_shared/source-fetch.ts';

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
  if (!data.user) return false;
  const { data: isAdmin, error: roleError } = await supabase.rpc('current_app_user_is_admin');
  return !roleError && isAdmin === true;
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

  let runId: string | null = null;
  let sources: SourceReport[] = [];
  try {
    runId = await beginAutomationRun('fetch-jobs', isCronRequest ? (req.headers.get('x-afavers-verification') === '1' ? 'verification' : 'cron') : 'manual');
    if (!runId) return jsonResponse({ success: false, error: 'An import is already running. Please wait.', code: 'import_running' }, 409, req);
    const startedAt = Date.now();
    const { keywords, locations } = await getSearchConfig();
    const [bundesagentur, adzuna] = await Promise.all([
      fetchBundesagenturJobs(keywords, locations, startedAt + FETCH_BUDGET_MS),
      fetchAdzunaJobs(startedAt + FETCH_BUDGET_MS, keywords, locations),
    ]);
    sources = [bundesagentur.report, adzuna.report];
    const complete = bundesagentur.complete && adzuna.complete;
    const result = await saveJobs([...bundesagentur.jobs, ...adzuna.jobs]);

    let cleanup = { deleted: 0, deactivated: 0 };
    let cleanupFailed = false;
    if (complete && result.total >= MIN_JOBS_FOR_CLEANUP) {
      try {
        cleanup = await cleanupStaleJobs(startedAt + RUN_BUDGET_MS);
      } catch {
        cleanupFailed = true;
        console.error('Stale-listing cleanup did not finish; existing listings were preserved.');
      }
    }

    const outcome = importOutcome(sources);
    await finishAutomationRun(runId, cleanupFailed && outcome === 'succeeded' ? 'partial' : outcome, sources, { ...result, ...cleanup, cleanup_skipped: !complete || result.total < MIN_JOBS_FOR_CLEANUP }, cleanupFailed ? 'cleanup_failed' : null);
    return jsonResponse({
      success: outcome !== 'failed',
      run_id: runId,
      outcome: cleanupFailed && outcome === 'succeeded' ? 'partial' : outcome,
      ...result,
      ...cleanup,
      complete,
      sources: {
        bundesagentur: bundesagentur.jobs.length,
        adzuna: adzuna.jobs.length,
      },
      source_reports: sources,
    }, outcome === 'failed' ? 502 : 200, req);
  } catch (error) {
    const code = error instanceof Error && error.message.startsWith('automation_') ? error.message : 'import_failed';
    if (runId) {
      try { await finishAutomationRun(runId, 'failed', sources, {}, code); }
      catch { console.error('Import outcome could not be recorded; the lease will expire.'); }
    }
    return jsonResponse({ success: false, error: 'Job import could not finish. Existing applications have been preserved.', code, run_id: runId }, 500, req);
  }
});
