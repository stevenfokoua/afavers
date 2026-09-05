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

const BA_URL = 'https://rest.arbeitsagentur.de/jobboerse/jobsuche-service/pc/v4/app/jobs';
const ADZUNA_URL = 'https://api.adzuna.com/v1/api/jobs/de/search';
const DEFAULT_KEYWORDS = ['consulting', 'beratung', 'nachhaltigkeit', 'umwelt', 'gis', 'energy'];
const DEFAULT_LOCATIONS = ['Düsseldorf', 'Köln', 'Essen', 'Bochum', 'Dortmund'];

function env(name: string): string {
  return Deno.env.get(name) ?? '';
}

export function adminClient() {
  return createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function cleanText(value = ''): string {
  return value
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

function toIsoDateOrNull(value?: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

export async function getSearchConfig(): Promise<{ keywords: string[]; locations: string[] }> {
  const supabase = adminClient();
  const { data, error } = await supabase.rpc('get_search_config').single();
  if (error || !data) return { keywords: DEFAULT_KEYWORDS, locations: DEFAULT_LOCATIONS };
  return {
    keywords: data.keywords ?? DEFAULT_KEYWORDS,
    locations: data.locations ?? DEFAULT_LOCATIONS,
  };
}

export async function fetchBundesagenturJobs(keywords: string[], locations: string[]): Promise<ExternalJob[]> {
  const jobs: ExternalJob[] = [];
  const apiKey = env('BUNDESAGENTUR_API_KEY');
  if (!apiKey) throw new Error('BUNDESAGENTUR_API_KEY is not configured');

  for (const keyword of keywords.slice(0, 20)) {
    for (const location of locations.slice(0, 12)) {
      const url = new URL(BA_URL);
      url.searchParams.set('was', keyword);
      url.searchParams.set('wo', location);
      url.searchParams.set('size', '35');
      url.searchParams.set('angebotsart', '1');
      url.searchParams.set('pav', 'false');
      url.searchParams.set('umkreis', '25');

      for (let page = 1; page <= 5; page++) {
        url.searchParams.set('page', String(page));
        try {
          const response = await fetch(url, {
            headers: {
              'User-Agent': 'afavers-job-fetch/1.0 (+ops@afavers.online)',
              'X-API-Key': apiKey,
            },
          });
          if (!response.ok) break;
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
          if ((data?.stellenangebote?.length ?? 0) < 35) break;
        } catch (error) {
          console.error('fetchBundesagenturJobs failed', { keyword, location, error });
          break;
        }
      }

      await sleep(250);
    }
  }

  return jobs;
}

export async function fetchAdzunaJobs(keywords: string[], locations: string[]): Promise<ExternalJob[]> {
  const appId = env('ADZUNA_APP_ID');
  const appKey = env('ADZUNA_APP_KEY');
  if (!appId || !appKey) return [];

  const keywordsToQuery = keywords.slice(0, 12);
  const locationsToQuery = locations.slice(0, 8);
  const jobs: ExternalJob[] = [];

  for (const keyword of keywordsToQuery) {
    for (const location of locationsToQuery) {
      const url = new URL(`${ADZUNA_URL}/1`);
      url.searchParams.set('app_id', appId);
      url.searchParams.set('app_key', appKey);
      url.searchParams.set('results_per_page', '25');
      url.searchParams.set('what', keyword);
      url.searchParams.set('where', location);

      try {
        const response = await fetch(url);
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
      } catch (error) {
        console.error('fetchAdzunaJobs failed', { keyword, location, error });
      }

      await sleep(250);
    }
  }

  return jobs;
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
 * Remove jobs from a given source that are no longer returned by the latest fetch,
 * as long as no user has interacted with them (status still 'new' or missing).
 * Safety: if the latest fetch returned no IDs for the source we keep everything
 * (prevents wiping the table when an upstream API is temporarily failing).
 */
export async function deleteStaleJobs(source: string, activeExternalIds: string[]): Promise<number> {
  if (!activeExternalIds.length) return 0;
  const supabase = adminClient();

  // Find candidate stale rows for this source (not in the active id list).
  const chunks: string[][] = [];
  const chunkSize = 500;
  for (let i = 0; i < activeExternalIds.length; i += chunkSize) {
    chunks.push(activeExternalIds.slice(i, i + chunkSize));
  }

  // Pull all ids for this source, then filter client-side for any not in the active set.
  const { data: currentRows, error: selectError } = await supabase
    .from('jobs')
    .select('id, external_id')
    .eq('source', source);
  if (selectError) throw selectError;

  const activeSet = new Set(activeExternalIds);
  const candidateIds = (currentRows ?? [])
    .filter((row) => row.external_id && !activeSet.has(row.external_id))
    .map((row) => row.id);
  if (!candidateIds.length) return 0;

  // Only delete rows that no user has touched (all user_jobs rows for that job are either absent or status='new').
  const { data: touched, error: touchedError } = await supabase
    .from('user_jobs')
    .select('job_id,status')
    .in('job_id', candidateIds);
  if (touchedError) throw touchedError;
  const touchedIds = new Set((touched ?? []).filter((row) => row.status && row.status !== 'new').map((row) => row.job_id));
  const deletable = candidateIds.filter((id) => !touchedIds.has(id));
  if (!deletable.length) return 0;

  let deleted = 0;
  for (let i = 0; i < deletable.length; i += chunkSize) {
    const batch = deletable.slice(i, i + chunkSize);
    const { error, count } = await supabase.from('jobs').delete({ count: 'exact' }).in('id', batch);
    if (error) throw error;
    deleted += count ?? 0;
  }
  return deleted;
}

export async function saveJobs(jobs: ExternalJob[]): Promise<{ total: number; inserted: number; updated: number; failed: number; deleted: number }> {
  const supabase = adminClient();
  const unique = dedupe(jobs);
  const ids = unique.map((job) => job.id);
  const { data: existing } = ids.length
    ? await supabase.from('jobs').select('external_id').in('external_id', ids)
    : { data: [] as { external_id: string }[] };
  const existingIds = new Set((existing ?? []).map((row) => row.external_id));

  const rows = unique.map((job) => ({
    external_id: job.id,
    title: job.title,
    company: job.company,
    location: job.location,
    description: job.description,
    url: job.url,
    source: job.id.split('_')[0],
    posted_date: toIsoDateOrNull(job.postedDate),
    deadline: toIsoDateOrNull(job.deadline),
    salary: job.salary ?? null,
    language: detectLanguage(job.title, job.description),
    updated_at: new Date().toISOString(),
  }));

  if (!rows.length) {
    return { total: 0, inserted: 0, updated: 0, failed: 0, deleted: 0 };
  }

  const { error } = await supabase.from('jobs').upsert(rows, { onConflict: 'external_id' });
  if (error) throw error;

  // Clean up stale jobs per source (only ones no user has tracked).
  const bySource = new Map<string, string[]>();
  for (const job of unique) {
    const source = job.id.split('_')[0];
    if (!bySource.has(source)) bySource.set(source, []);
    bySource.get(source)!.push(job.id);
  }
  let deleted = 0;
  for (const [source, activeIds] of bySource) {
    try {
      deleted += await deleteStaleJobs(source, activeIds);
    } catch (error) {
      console.error(`deleteStaleJobs(${source}) failed:`, error);
    }
  }

  return {
    total: unique.length,
    inserted: unique.filter((job) => !existingIds.has(job.id)).length,
    updated: unique.filter((job) => existingIds.has(job.id)).length,
    failed: 0,
    deleted,
  };
}
