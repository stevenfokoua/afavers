import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import { detectLanguage } from './language.ts';
import { BUNDESAGENTUR_URL, parseBundesagenturResponse } from './bundesagentur.ts';
import { filterBatches } from './filter-batches.ts';
import { fetchSearchPages, type SourceReport } from './source-fetch.ts';
import { enrichBundesagenturDetails, type DetailMetadata } from './bundesagentur-detail.ts';
import { buildImportRows } from './import-rows.ts';

export interface ExternalJob {
  id: string;
  title: string;
  company: string;
  location: string;
  description: string;
  url: string;
  postedDate?: string;
  deadline?: string;
  salary?: string;
  descriptionQuality?: 'summary' | 'full';
  detailsCheckedAt?: string;
}

export interface SourceFetchResult {
  jobs: ExternalJob[];
  /** False when the run stopped early (time budget) — cleanup must be skipped. */
  complete: boolean;
  report: SourceReport;
}

const ADZUNA_URL = 'https://api.adzuna.com/v1/api/jobs/de/search';
const DEFAULT_KEYWORDS = ['consulting', 'beratung', 'nachhaltigkeit', 'umwelt', 'gis', 'energy'];
const DEFAULT_LOCATIONS = ['Düsseldorf', 'Köln', 'Essen', 'Bochum', 'Dortmund'];

// Edge workers are killed at ~150s of wall clock. Budget the run so results are
// always saved before that: stop issuing search requests at FETCH_BUDGET_MS and
// stop cleanup deletes at RUN_BUDGET_MS.
export const FETCH_BUDGET_MS = 85_000;
export const RUN_BUDGET_MS = 135_000;
const BA_CONCURRENCY = 6;
const WRITE_CHUNK = 500;
const SELECT_PAGE = 1000;
// A job is stale when no fetch has refreshed its updated_at for this long.
// The cron runs every 2 hours, so 3 days ≈ 36 chances to be re-listed.
const STALE_AFTER_MS = 3 * 24 * 60 * 60 * 1000;
const MAX_DELETES_PER_RUN = 5000;

function env(name: string): string {
  return Deno.env.get(name) ?? '';
}

export function adminClient() {
  return createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

function cleanText(value = ''): string {
  return value
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

export async function getSearchConfig(): Promise<{ keywords: string[]; locations: string[] }> {
  const supabase = adminClient();
  const { data, error } = await supabase.from('user_settings').select('keywords,locations');
  if (error) throw new Error('search_configuration_unavailable');
  if (!data?.length) return { keywords: DEFAULT_KEYWORDS, locations: DEFAULT_LOCATIONS };

  const keywords = new Set<string>();
  const locations = new Set<string>();
  for (const row of data) {
    String(row.keywords ?? '').split(',').map((item) => item.trim()).filter(Boolean).forEach((item) => keywords.add(item.toLowerCase()));
    String(row.locations ?? '').split(',').map((item) => item.trim()).filter(Boolean).forEach((item) => locations.add(item));
  }

  return {
    keywords: keywords.size ? [...keywords].slice(0, 80) : DEFAULT_KEYWORDS,
    locations: locations.size ? [...locations].slice(0, 32) : DEFAULT_LOCATIONS,
  };
}

export async function fetchBundesagenturJobs(
  keywords: string[],
  locations: string[],
  deadlineAt: number = Number.POSITIVE_INFINITY,
): Promise<SourceFetchResult> {
  const apiKey = env('BUNDESAGENTUR_API_KEY') || 'jobboerse-jobsuche';
  const pairs: Array<{ keyword: string; location: string }> = [];
  for (const keyword of keywords.slice(0, 40)) {
    for (const location of locations.slice(0, 20)) {
      pairs.push({ keyword, location });
    }
  }

  // Rotate the starting point per cron cycle so that when a run is cut off by
  // the time budget, it is not always the same tail of pairs that never runs.
  if (pairs.length > 1) {
    const offset = Math.floor(Date.now() / 7_200_000) % pairs.length;
    pairs.push(...pairs.splice(0, offset));
  }

  const headers = {
    'User-Agent': 'Jobsuche/2.9.2 (de.arbeitsagentur.jobboerse; build:1077; iOS 15.1.0) Alamofire/5.4.4',
    'X-API-Key': apiKey,
  };
  const detailDeadline = Math.min(deadlineAt, Date.now() + FETCH_BUDGET_MS);
  const detailReserve = Math.min(30_000, Math.max(0, detailDeadline - Date.now()) * .4);
  // Reserve 30 seconds inside the existing fetch budget for richer descriptions.
  const searched = await fetchSearchPages({
    source: 'bundesagentur', queries: pairs, concurrency: BA_CONCURRENCY, deadlineAt: Math.min(detailDeadline - detailReserve, Date.now() + 55_000),
    configurationCapped: keywords.length > 40 || locations.length > 20,
    makeUrl: ({ keyword, location }, page) => {
      const url = new URL(BUNDESAGENTUR_URL);
      url.searchParams.set('was', keyword);
      url.searchParams.set('wo', location);
      url.searchParams.set('size', '35');
      url.searchParams.set('page', String(page));
      url.searchParams.set('angebotsart', '1');
      url.searchParams.set('pav', 'false');
      url.searchParams.set('umkreis', '25');

      return url;
    },
    headers,
    parse: (payload, { location }, page) => {
      const parsed = parseBundesagenturResponse(payload, location);
      if (!parsed.recognized) throw new Error('unexpected_response');
      const data = payload as Record<string, unknown>;
      const items = data.ergebnisliste ?? data.stellenangebote;
      const total = typeof data.maxErgebnisse === 'number' || (typeof data.maxErgebnisse === 'string' && data.maxErgebnisse.trim()) ? Number(data.maxErgebnisse) : NaN;
      return { items: parsed.jobs, hasMore: Array.isArray(items) && (Number.isFinite(total) && total >= 0 ? page * 35 < total : items.length >= 35) };
    },
    key: job => job.id,
  });
  const metadata: DetailMetadata[] = [];
  let cacheAvailable = true;
  const cacheDeadline = Math.min(detailDeadline, Date.now() + 5000);
  const cacheClient = adminClient();
  const batches = filterBatches(searched.jobs.map(job => job.id));
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(4, batches.length) }, async () => {
    while (next < batches.length && cacheAvailable) {
      if (Date.now() >= cacheDeadline) { cacheAvailable = false; break; }
      const batch = batches[next++];
      try {
        const { data, error } = await cacheClient.from('jobs').select('external_id,description_quality,details_checked_at')
          .in('external_id', batch).abortSignal(AbortSignal.timeout(Math.max(1, cacheDeadline - Date.now())));
        if (error) { cacheAvailable = false; break; }
        metadata.push(...(data ?? []));
      } catch { cacheAvailable = false; }
    }
  }));
  const enriched = await enrichBundesagenturDetails(searched.jobs, metadata, {
    deadlineAt: detailDeadline, headers, maxJobs: cacheAvailable ? 60 : 0,
  });
  enriched.report.cache_unavailable = !cacheAvailable;
  if (!cacheAvailable) enriched.report.errors.push('detail_cache_unavailable');
  return { ...searched, jobs: enriched.jobs, report: { ...searched.report, details: enriched.report } };
}

export async function fetchAdzunaJobs(deadlineAt: number = Number.POSITIVE_INFINITY, keywords = DEFAULT_KEYWORDS, locations = DEFAULT_LOCATIONS): Promise<SourceFetchResult> {
  const appId = env('ADZUNA_APP_ID');
  const appKey = env('ADZUNA_APP_KEY');
  const pairs = keywords.slice(0, 40).flatMap(keyword => locations.slice(0, 20).map(location => ({ keyword, location })));
  return fetchSearchPages({
    source: 'adzuna', configured: Boolean(appId && appKey), queries: pairs,
    configurationCapped: keywords.length > 40 || locations.length > 20,
    concurrency: 2, deadlineAt,
    makeUrl: ({ keyword, location }, page) => {
      const url = new URL(`${ADZUNA_URL}/${page}`);
      url.searchParams.set('app_id', appId);
      url.searchParams.set('app_key', appKey);
      url.searchParams.set('results_per_page', '25');
      url.searchParams.set('what', keyword);
      url.searchParams.set('where', location);

      return url;
    },
    parse: (payload, { location }) => {
      const data = payload as { results?: Array<{ id: string; title: string; company?: { display_name?: string }; location?: { display_name?: string }; description?: string; redirect_url: string; created?: string; salary_min?: number; salary_max?: number; salary_is_predicted?: number }> } | null;
      if (!Array.isArray(data?.results)) throw new Error('unexpected_response');
      return { items: data.results.map(item => {
          const salary = item.salary_min && item.salary_max && !item.salary_is_predicted
            ? `€${Math.round(item.salary_min)} - €${Math.round(item.salary_max)}`
            : undefined;
          return {
            id: `adzuna_${item.id}`,
            title: item.title,
            company: item.company?.display_name || 'Not specified',
            location: item.location?.display_name || location,
            description: cleanText(item.description).slice(0, 1000),
            url: item.redirect_url,
            postedDate: item.created,
            salary,
          };
        }), hasMore: data.results.length >= 25 };
    },
    key: job => job.id,
  });
}

function dedupe(jobs: ExternalJob[]): ExternalJob[] {
  const byId = new Map<string, ExternalJob>();
  for (const job of jobs) {
    if (!job.id || byId.has(job.id)) continue;
    byId.set(job.id, job);
  }
  return [...byId.values()];
}

/**
 * Handle fetched jobs that no upstream feed has returned recently (their
 * updated_at was last bumped by a fetch more than STALE_AFTER_MS ago).
 *
 * Deleting a jobs row CASCADEs into user_jobs, which destroys saved statuses,
 * notes, cover letters and history — so:
 *   - stale jobs ANY user has tracked are soft-deleted (is_active = false and
 *     shown as "no longer listed" in the client; re-listing revives them),
 *   - only completely untracked stale jobs are hard-deleted.
 * Manual jobs are never touched (the cron never refreshes them). All reads are
 * paginated (a single PostgREST request is capped at 1000 rows, which
 * previously hid most of the table from this cleanup), and deletes stop at the
 * run deadline and are capped per run.
 */
export async function cleanupStaleJobs(
  deadlineAt: number = Number.POSITIVE_INFINITY,
): Promise<{ deleted: number; deactivated: number }> {
  const supabase = adminClient();
  const cutoff = new Date(Date.now() - STALE_AFTER_MS).toISOString();

  const staleIds: number[] = [];
  for (let from = 0; ; from += SELECT_PAGE) {
    const { data, error } = await supabase
      .from('jobs')
      .select('id')
      .neq('source', 'manual')
      .lt('updated_at', cutoff)
      .order('id', { ascending: true })
      .range(from, from + SELECT_PAGE - 1);
    if (error) throw error;
    for (const row of data ?? []) staleIds.push(row.id);
    if ((data ?? []).length < SELECT_PAGE) break;
  }
  if (!staleIds.length) return { deleted: 0, deactivated: 0 };

  const trackedJobIds = new Set<number>();
  for (let from = 0; ; from += SELECT_PAGE) {
    const { data, error } = await supabase
      .from('user_jobs')
      .select('job_id')
      .order('job_id', { ascending: true })
      .range(from, from + SELECT_PAGE - 1);
    if (error) throw error;
    for (const row of data ?? []) trackedJobIds.add(row.job_id);
    if ((data ?? []).length < SELECT_PAGE) break;
  }

  const toDeactivate = staleIds.filter((id) => trackedJobIds.has(id));
  const toDelete = staleIds
    .filter((id) => !trackedJobIds.has(id))
    .slice(0, MAX_DELETES_PER_RUN);

  let deactivated = 0;
  for (const batch of chunk(toDeactivate, WRITE_CHUNK)) {
    if (Date.now() > deadlineAt) break;
    const { error, count } = await supabase
      .from('jobs')
      .update({ is_active: false }, { count: 'exact' })
      .eq('is_active', true)
      .in('id', batch);
    if (error) throw error;
    deactivated += count ?? 0;
  }

  let deleted = 0;
  for (const batch of chunk(toDelete, WRITE_CHUNK)) {
    if (Date.now() > deadlineAt) break;
    const { error, count } = await supabase.from('jobs').delete({ count: 'exact' }).in('id', batch);
    if (error) throw error;
    deleted += count ?? 0;
  }
  return { deleted, deactivated };
}

export async function saveJobs(
  jobs: ExternalJob[],
): Promise<{ total: number; inserted: number; updated: number; failed: number }> {
  const supabase = adminClient();
  const unique = dedupe(jobs);

  if (!unique.length) {
    return { total: 0, inserted: 0, updated: 0, failed: 0 };
  }

  const existingIds = new Set<string>();
  const existingDetails: DetailMetadata[] = [];
  for (const ids of filterBatches(unique.map((job) => job.id))) {
    const { data, error } = await supabase.from('jobs').select('external_id,description_quality,details_checked_at').in('external_id', ids);
    if (error) throw error;
    for (const row of data ?? []) { existingIds.add(row.external_id); existingDetails.push(row); }
  }

  for (const rows of buildImportRows(unique, existingDetails, detectLanguage, new Date().toISOString())) {
    for (const batch of chunk(rows, WRITE_CHUNK)) {
      const { error } = await supabase.from('jobs').upsert(batch, { onConflict: 'external_id' });
      if (error) throw error;
    }
  }

  return {
    total: unique.length,
    inserted: unique.filter((job) => !existingIds.has(job.id)).length,
    updated: unique.filter((job) => existingIds.has(job.id)).length,
    failed: 0,
  };
}
