import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import { detectLanguage } from './language.ts';

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
}

export interface SourceFetchResult {
  jobs: ExternalJob[];
  /** False when the run stopped early (time budget) — cleanup must be skipped. */
  complete: boolean;
}

const BA_URL = 'https://rest.arbeitsagentur.de/jobboerse/jobsuche-service/pc/v4/app/jobs';
const ADZUNA_URL = 'https://api.adzuna.com/v1/api/jobs/de/search';
const DEFAULT_KEYWORDS = ['consulting', 'beratung', 'nachhaltigkeit', 'umwelt', 'gis', 'energy'];
const DEFAULT_LOCATIONS = ['Düsseldorf', 'Köln', 'Essen', 'Bochum', 'Dortmund'];

// Edge workers are killed at ~150s of wall clock. Budget the run so results are
// always saved before that: stop issuing search requests at FETCH_BUDGET_MS and
// stop cleanup deletes at RUN_BUDGET_MS.
export const FETCH_BUDGET_MS = 85_000;
export const RUN_BUDGET_MS = 135_000;
const BA_CONCURRENCY = 6;
const REQUEST_TIMEOUT_MS = 8_000;
const WRITE_CHUNK = 500;
// external_id in() filters travel in the URL; keep chunks small enough to
// stay under gateway URL-length limits (~30 chars per id).
const ID_FILTER_CHUNK = 150;
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
  if (error || !data?.length) return { keywords: DEFAULT_KEYWORDS, locations: DEFAULT_LOCATIONS };

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

  const jobs: ExternalJob[] = [];
  let complete = true;
  let next = 0;

  async function worker(): Promise<void> {
    while (true) {
      const index = next++;
      if (index >= pairs.length) return;
      if (Date.now() > deadlineAt) {
        complete = false;
        return;
      }

      const { keyword, location } = pairs[index];
      const url = new URL(BA_URL);
      url.searchParams.set('was', keyword);
      url.searchParams.set('wo', location);
      url.searchParams.set('size', '35');
      url.searchParams.set('page', '1');
      url.searchParams.set('angebotsart', '1');
      url.searchParams.set('pav', 'false');
      url.searchParams.set('umkreis', '25');

      try {
        const response = await fetch(url, {
          headers: {
            'User-Agent': 'Jobsuche/2.9.2 (de.arbeitsagentur.jobboerse; build:1077; iOS 15.1.0) Alamofire/5.4.4',
            'X-API-Key': apiKey,
          },
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
        if (!response.ok) continue;
        const data = await response.json();
        for (const item of data?.stellenangebote ?? []) {
          const city = item.arbeitsort?.ort || location || 'Germany';
          const plz = item.arbeitsort?.plz || '';
          jobs.push({
            id: `bundesagentur_${item.refnr}`,
            title: item.titel || item.beruf || 'No title',
            company: item.arbeitgeber || 'Not specified',
            location: plz ? `${city} (${plz})` : city,
            description: `Position: ${item.beruf || 'Not specified'}`,
            url: `https://www.arbeitsagentur.de/jobsuche/jobdetail/${item.refnr}`,
            postedDate: item.aktuelleVeroeffentlichungsdatum || item.modifikationsTimestamp,
          });
        }
      } catch {
        // Keep the batch resilient; one city/keyword failing should not stop the run.
      }
    }
  }

  await Promise.all(Array.from({ length: BA_CONCURRENCY }, () => worker()));
  return { jobs, complete };
}

export async function fetchAdzunaJobs(deadlineAt: number = Number.POSITIVE_INFINITY): Promise<SourceFetchResult> {
  const appId = env('ADZUNA_APP_ID');
  const appKey = env('ADZUNA_APP_KEY');
  if (!appId || !appKey) return { jobs: [], complete: true };

  const keywords = ['nachhaltigkeit', 'umwelt', 'energy', 'consulting'];
  const locations = ['Düsseldorf', 'Köln', 'Berlin'];
  const jobs: ExternalJob[] = [];
  let complete = true;

  for (const keyword of keywords) {
    for (const location of locations) {
      if (Date.now() > deadlineAt) {
        complete = false;
        return { jobs, complete };
      }

      const url = new URL(`${ADZUNA_URL}/1`);
      url.searchParams.set('app_id', appId);
      url.searchParams.set('app_key', appKey);
      url.searchParams.set('results_per_page', '25');
      url.searchParams.set('what', keyword);
      url.searchParams.set('where', location);

      try {
        const response = await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
        if (!response.ok) continue;
        const data = await response.json();
        for (const item of data?.results ?? []) {
          const salary = item.salary_min && item.salary_max && !item.salary_is_predicted
            ? `€${Math.round(item.salary_min)} - €${Math.round(item.salary_max)}`
            : undefined;
          jobs.push({
            id: `adzuna_${item.id}`,
            title: item.title,
            company: item.company?.display_name || 'Not specified',
            location: item.location?.display_name || location,
            description: cleanText(item.description).slice(0, 1000),
            url: item.redirect_url,
            postedDate: item.created,
            salary,
          });
        }
      } catch {
        // Continue with the next query.
      }
    }
  }

  return { jobs, complete };
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
  for (const ids of chunk(unique.map((job) => job.id), ID_FILTER_CHUNK)) {
    const { data, error } = await supabase.from('jobs').select('external_id').in('external_id', ids);
    if (error) throw error;
    for (const row of data ?? []) existingIds.add(row.external_id);
  }

  const rows = unique.map((job) => ({
    external_id: job.id,
    title: job.title,
    company: job.company,
    location: job.location,
    description: job.description,
    url: job.url,
    source: job.id.split('_')[0],
    posted_date: job.postedDate ? new Date(job.postedDate).toISOString().slice(0, 10) : null,
    deadline: job.deadline ? new Date(job.deadline).toISOString().slice(0, 10) : null,
    salary: job.salary ?? null,
    language: detectLanguage(job.title, job.description),
    // A job returned by a feed is listed again — revive it if it was stale.
    is_active: true,
    updated_at: new Date().toISOString(),
  }));

  for (const batch of chunk(rows, WRITE_CHUNK)) {
    const { error } = await supabase.from('jobs').upsert(batch, { onConflict: 'external_id' });
    if (error) throw error;
  }

  return {
    total: unique.length,
    inserted: unique.filter((job) => !existingIds.has(job.id)).length,
    updated: unique.filter((job) => existingIds.has(job.id)).length,
    failed: 0,
  };
}
