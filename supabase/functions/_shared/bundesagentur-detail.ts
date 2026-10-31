import { BUNDESAGENTUR_DETAIL_URL, parseBundesagenturDetail, type BundesagenturJob } from './bundesagentur.ts';

export interface DetailMetadata { external_id: string; description_quality: string; details_checked_at: string | null }
export interface DetailReport {
  jobs: number; full_descriptions: number; cached: number; attempted: number; enriched: number; unavailable: number;
  failed: number; deferred: number; requests: number; retries: number; timed_out: number;
  budget_exhausted: boolean; cache_unavailable: boolean; errors: string[];
}

/** Detail failure never erases the useful search result or existing rich data. */
export async function enrichBundesagenturDetails(jobs: BundesagenturJob[], metadata: DetailMetadata[], options: {
  deadlineAt: number; headers: HeadersInit; fetcher?: typeof fetch; now?: () => number;
  pause?: (ms: number) => Promise<void>; maxJobs?: number; concurrency?: number;
}): Promise<{ jobs: BundesagenturJob[]; report: DetailReport }> {
  const now = options.now ?? Date.now, fetcher = options.fetcher ?? fetch;
  const pause = options.pause ?? (ms => new Promise(resolve => setTimeout(resolve, ms)));
  const full = new Set(metadata.filter(row => row.description_quality === 'full').map(row => row.external_id));
  const report: DetailReport = { jobs: jobs.length, full_descriptions: jobs.filter(job => full.has(job.id)).length, cached: 0, attempted: 0, enriched: 0, unavailable: 0, failed: 0, deferred: 0, requests: 0, retries: 0, timed_out: 0, budget_exhausted: false, cache_unavailable: false, errors: [] };
  const existing = new Map(metadata.map(row => [row.external_id, row]));
  const output = new Map(jobs.map(job => [job.id, job]));
  const due = jobs.filter(job => {
    const row = existing.get(job.id), checkedAt = Date.parse(row?.details_checked_at ?? '');
    const ttl = row?.description_quality === 'full' ? 3 * 86_400_000 : 12 * 3_600_000;
    if (Number.isFinite(checkedAt) && now() - checkedAt >= 0 && now() - checkedAt < ttl) {
      if (row?.description_quality === 'full') report.cached++;
      else report.unavailable++;
      return false;
    }
    return true;
  }).sort((a, b) => a.id.localeCompare(b.id));
  const maxJobs = options.maxJobs ?? 60;
  // Rotate unattempted/failed backlog instead of retrying the same first 60 jobs.
  if (due.length > maxJobs) due.push(...due.splice(0, (Math.floor(now() / 7_200_000) * maxJobs) % due.length));
  const queue = due.slice(0, maxJobs); report.deferred = due.length - queue.length;
  let index = 0, stopped = false;
  const note = (code: string) => { if (!report.errors.includes(code) && report.errors.length < 8) report.errors.push(code); };
  async function worker() {
    while (!stopped && index < queue.length) {
      if (now() >= options.deadlineAt) { report.budget_exhausted = true; break; }
      const job = queue[index++]; report.attempted++;
      let finished = false;
      for (let attempt = 0; attempt < 2 && !finished; attempt++) {
        const remaining = options.deadlineAt - now();
        if (remaining <= 0) { report.budget_exhausted = true; break; }
        report.requests++;
        let code = 'detail_network_error', retryable = true, wait = 250;
        try {
          // Reference numbers are ASCII; encode exactly the provider's detail key.
          const url = `${BUNDESAGENTUR_DETAIL_URL}/${encodeURIComponent(btoa(job.reference))}`;
          const response = await fetcher(url, { headers: options.headers, signal: AbortSignal.timeout(Math.max(1, Math.min(5000, remaining))) });
          if (response.ok) {
            let payload: unknown;
            try { payload = await response.json(); } catch { throw new Error('detail_invalid_json'); }
            const enriched = parseBundesagenturDetail(payload, job, new Date(now()).toISOString());
            output.set(job.id, enriched);
            if (enriched.descriptionQuality === 'full') { report.enriched++; full.add(job.id); }
            else report.unavailable++;
            finished = true; break;
          }
          if (response.status === 404 || response.status === 410) {
            output.set(job.id, { ...job, detailsCheckedAt: new Date(now()).toISOString() });
            report.unavailable++; finished = true; break;
          }
          code = 'detail_http_' + response.status;
          retryable = response.status === 429 || response.status >= 500;
          const raw = response.headers.get('retry-after'), seconds = Number(raw);
          const cooldown = Number.isFinite(seconds) ? seconds * 1000 : raw ? Date.parse(raw) - now() : 0;
          if (cooldown > 2500 || response.status === 401 || response.status === 403) { stopped = true; retryable = false; note('detail_provider_cooldown'); }
          else if (cooldown > 0) wait = cooldown;
        } catch (error) {
          if (error instanceof Error && ['AbortError', 'TimeoutError'].includes(error.name)) { code = 'detail_timeout'; report.timed_out++; }
          else if (error instanceof Error && ['detail_invalid_json', 'detail_reference_mismatch'].includes(error.message)) { code = error.message; retryable = false; }
        }
        note(code);
        if (!retryable || attempt === 1) break;
        if (now() + wait >= options.deadlineAt) { report.budget_exhausted = true; break; }
        report.retries++; await pause(wait);
      }
      if (!finished) report.failed++;
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, Math.min(4, options.concurrency ?? 4, queue.length || 1)) }, worker));
  report.deferred += queue.length - index;
  report.full_descriptions = jobs.filter(job => full.has(job.id)).length;
  return { jobs: jobs.map(job => output.get(job.id)!), report };
}
