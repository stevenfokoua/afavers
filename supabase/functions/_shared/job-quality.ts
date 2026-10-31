export interface Listing {
  id: number;
  title: string;
  company?: string | null;
  location?: string | null;
  url?: string | null;
  deadline?: string | null;
  is_active?: boolean;
  is_manual?: boolean;
  is_hidden?: boolean;
  is_tracked?: boolean;
  source?: string | null;
  status?: string;
  updated_at?: string;
}

/** Remove known advertising parameters, preserving job identifiers and query values. */
export function canonicalJobUrl(value?: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    url.hash = '';
    for (const key of [...url.searchParams.keys()]) {
      if (/^utm_|^(gclid|fbclid|msclkid)$/i.test(key)) url.searchParams.delete(key);
    }
    url.searchParams.sort();
    return `${url.host.toLowerCase().replace(/^www\./, '')}${url.pathname.replace(/\/$/, '')}${url.search}`;
  } catch {
    return null;
  }
}

export function jobIdentity(job: Listing): string {
  const url = canonicalJobUrl(job.url);
  // A shared careers page can host the same role in several cities. Prefer
  // separate listings over hiding a valid location before location filtering.
  const normalize = (value?: string | null) => (value ?? '').normalize('NFKC').trim().toLowerCase().replace(/\s+/g, ' ');
  return url ? JSON.stringify([url, normalize(job.title), normalize(job.company), normalize(job.location)]) : `id:${job.id}`;
}

export function isExpiredJob(job: Pick<Listing, 'deadline'>, now = Date.now()): boolean {
  if (!job.deadline) return false;
  const deadline = Date.parse(job.deadline);
  if (!Number.isFinite(deadline)) return false;
  return new Date(deadline).toISOString().slice(0, 10) < new Date(now).toISOString().slice(0, 10);
}

/** Discovery cleanup only. Every tracked/manual row survives, including its history. */
export function discoveryJobs<T extends Listing>(jobs: T[], now = Date.now()): T[] {
  const retained = (job: T) => job.is_tracked || job.is_manual || job.source === 'manual' || job.is_hidden || (job.status && job.status !== 'new');
  const trackedKeys = new Set(jobs.filter(retained).map(jobIdentity));
  const choices = new Map<string, T>();
  const observedAt = (row: T) => { const value = Date.parse(row.updated_at ?? ''); return Number.isFinite(value) ? value : 0; };
  for (const job of jobs) {
    if (retained(job) || job.is_active === false || isExpiredJob(job, now)) continue;
    const key = jobIdentity(job);
    if (trackedKeys.has(key)) continue;
    const previous = choices.get(key);
    if (!previous || observedAt(job) > observedAt(previous)) choices.set(key, job);
  }
  return jobs.filter((job) => retained(job) || choices.get(jobIdentity(job)) === job);
}
