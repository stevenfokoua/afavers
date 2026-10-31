import type { DetailReport } from './bundesagentur-detail.ts';

/** Source telemetry never contains URLs, query terms, credentials or raw errors. */
export interface SourceReport {
  source: string;
  configured: boolean;
  status: 'disabled' | 'succeeded' | 'partial' | 'failed';
  queries_planned: number;
  queries_attempted: number;
  queries_completed: number;
  failed_queries: number;
  capped_queries: number;
  requests_attempted: number;
  retries: number;
  timed_out_requests: number;
  pages_fetched: number;
  jobs_returned: number;
  budget_exhausted: boolean;
  configuration_capped: boolean;
  errors: string[];
  details?: DetailReport;
}

export interface FetchResult<T> { jobs: T[]; complete: boolean; report: SourceReport }

export function sourceComplete(report: SourceReport): boolean {
  return !report.configured || (report.queries_planned > 0 && !report.budget_exhausted && !report.configuration_capped && report.failed_queries === 0 && report.capped_queries === 0 && report.queries_completed === report.queries_planned);
}

export function summarizeSource(report: SourceReport): SourceReport {
  const status = !report.configured ? 'disabled' : sourceComplete(report) ? 'succeeded' : report.pages_fetched > 0 ? 'partial' : 'failed';
  return { ...report, status, errors: [...new Set(report.errors)].slice(0, 8) };
}

export function importOutcome(reports: SourceReport[], persistenceFailed = false): 'succeeded' | 'partial' | 'failed' {
  if (persistenceFailed) return 'failed';
  const enabled = reports.filter(report => report.configured);
  if (!enabled.length) return 'failed';
  if (enabled.every(sourceComplete)) return 'succeeded';
  return enabled.some(report => report.pages_fetched > 0) ? 'partial' : 'failed';
}

type SearchOptions<Q, T> = {
  source: string; configured?: boolean; configurationCapped?: boolean;
  queries: Q[]; concurrency: number; deadlineAt: number;
  makeUrl: (query: Q, page: number) => string | URL;
  parse: (payload: unknown, query: Q, page: number) => { items: T[]; hasMore: boolean };
  key: (job: T) => string;
  headers?: HeadersInit;
  maxPages?: number; maxJobs?: number; requestTimeoutMs?: number;
  fetcher?: typeof fetch; now?: () => number; pause?: (ms: number) => Promise<void>;
};

/** Fair first-page coverage, bounded pagination/retries and one shared deadline. */
export async function fetchSearchPages<Q, T>(options: SearchOptions<Q, T>): Promise<FetchResult<T>> {
  const report: SourceReport = { source: options.source, configured: options.configured !== false, status: 'succeeded', queries_planned: options.queries.length, queries_attempted: 0, queries_completed: 0, failed_queries: 0, capped_queries: 0, requests_attempted: 0, retries: 0, timed_out_requests: 0, pages_fetched: 0, jobs_returned: 0, budget_exhausted: false, configuration_capped: options.configurationCapped === true, errors: [] };
  if (!report.configured) return { jobs: [], complete: true, report: summarizeSource(report) };
  const jobs = new Map<string, T>();
  const queue = options.queries.map(query => ({ query, page: 1 }));
  const fetcher = options.fetcher ?? fetch, now = options.now ?? Date.now;
  const pause = options.pause ?? (ms => new Promise(resolve => setTimeout(resolve, ms)));
  const maxPages = options.maxPages ?? 5, maxJobs = options.maxJobs ?? 5000;
  let next = 0, stopped = false;
  const note = (code: string) => { if (report.errors.length < 24 && !report.errors.includes(code)) report.errors.push(code); };
  async function load(query: Q, page: number): Promise<unknown> {
    for (let attempt = 0; attempt < 2; attempt++) {
      const remaining = options.deadlineAt - now();
      if (remaining <= 0) { report.budget_exhausted = true; throw new Error('budget_exhausted'); }
      const timeout = Math.min(options.requestTimeoutMs ?? 8000, remaining);
      report.requests_attempted++;
      let code = 'network_error', retryable = true, wait = 250;
      try {
        const response = await fetcher(options.makeUrl(query, page), { headers: options.headers, signal: AbortSignal.timeout(Math.max(1, timeout)) });
        if (response.ok) {
          try { return await response.json(); } catch { throw new Error('invalid_json'); }
        }
        code = 'http_' + response.status;
        retryable = response.status === 429 || response.status >= 500;
        const rawRetryAfter = response.headers.get('retry-after');
        const seconds = Number(rawRetryAfter);
        const retryAfter = Number.isFinite(seconds) ? seconds * 1000 : rawRetryAfter ? Date.parse(rawRetryAfter) - now() : 0;
        if (retryAfter > 2500) { retryable = false; stopped = true; note('provider_cooldown'); }
        else if (retryAfter > 0) wait = retryAfter;
        if (response.status === 401 || response.status === 403) stopped = true;
      } catch (error) {
        const name = error instanceof Error ? error.name : '';
        if (name === 'TimeoutError' || name === 'AbortError') { code = 'request_timeout'; report.timed_out_requests++; }
        else if (error instanceof Error && error.message === 'invalid_json') { code = 'invalid_json'; retryable = false; }
      }
      note(code);
      if (!retryable || attempt === 1) throw new Error(code);
      if (now() + wait >= options.deadlineAt) { report.budget_exhausted = true; throw new Error('budget_exhausted'); }
      report.retries++;
      await pause(wait);
    }
    throw new Error('network_error');
  }
  async function worker(): Promise<void> {
    while (!stopped && next < queue.length) {
      if (now() >= options.deadlineAt) { report.budget_exhausted = true; note('budget_exhausted'); return; }
      const { query, page } = queue[next++];
      if (page === 1) report.queries_attempted++;
      try {
        const payload = await load(query, page);
        const parsed = options.parse(payload, query, page);
        report.pages_fetched++;
        for (const job of parsed.items) {
          const key = options.key(job);
          if (key && (jobs.has(key) || jobs.size < maxJobs)) jobs.set(key, job);
        }
        if (jobs.size >= maxJobs) { report.capped_queries++; note('job_limit'); stopped = true; }
        else if (parsed.hasMore && page < maxPages) queue.push({ query, page: page + 1 });
        else if (parsed.hasMore) { report.capped_queries++; note('page_limit'); }
        else report.queries_completed++;
      } catch (error) {
        if (error instanceof Error && error.message === 'budget_exhausted') { report.budget_exhausted = true; note('budget_exhausted'); }
        else { report.failed_queries++; note(error instanceof Error && /^(http_\d{3}|request_timeout|network_error|invalid_json)$/.test(error.message) ? error.message : 'unexpected_response'); }
      }
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, Math.min(8, options.concurrency, options.queries.length || 1)) }, worker));
  report.jobs_returned = jobs.size;
  const result = summarizeSource(report);
  return { jobs: [...jobs.values()], complete: sourceComplete(result), report: result };
}
