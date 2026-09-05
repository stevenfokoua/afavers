import { handleOptions, jsonResponse } from '../_shared/cors.ts';
import { fetchAdzunaJobs, fetchBundesagenturJobs, getSearchConfig, saveJobs } from '../_shared/jobs.ts';

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
  if (req.headers.get('x-cron-secret') !== cronSecret) {
    return jsonResponse({ error: 'Unauthorized' }, 401, req);
  }

  try {
    const { keywords, locations } = await getSearchConfig();
    const settled = await Promise.allSettled([
      fetchBundesagenturJobs(keywords, locations),
      fetchAdzunaJobs(keywords, locations),
    ]);
    const bundesagentur = settled[0].status === 'fulfilled' ? settled[0].value : [];
    const adzuna = settled[1].status === 'fulfilled' ? settled[1].value : [];
    const result = await saveJobs([...bundesagentur, ...adzuna]);

    return jsonResponse({
      success: true,
      ...result,
      sources: {
        bundesagentur: bundesagentur.length,
        adzuna: adzuna.length,
      },
    }, 200, req);
  } catch (error) {
    return jsonResponse({ success: false, error: error instanceof Error ? error.message : 'Fetch failed' }, 500, req);
  }
});
