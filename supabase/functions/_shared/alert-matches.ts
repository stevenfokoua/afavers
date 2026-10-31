import { isExpiredJob, jobIdentity, type Listing } from './job-quality.ts';

export interface DeliveredListing {
  job_id: number;
  jobs?: Pick<Listing, 'id' | 'title' | 'company' | 'location' | 'url'> | null;
}

/** Filter delivery history before taking ten: old top matches must not starve new ones. */
export function freshAlertMatches<T extends Listing>(ranked: T[], deliveries: DeliveredListing[], touched: Set<number>, limit = 10): T[] {
  const deliveredIds = new Set(deliveries.map((row) => row.job_id));
  const deliveredKeys = new Set(deliveries.filter((row) => row.jobs).map((row) => jobIdentity(row.jobs!)));
  const touchedKeys = new Set(ranked.filter((job) => touched.has(job.id)).map(jobIdentity));
  const selectedKeys = new Set<string>();
  const matches: T[] = [];
  for (const job of ranked) {
    const key = jobIdentity(job);
    if (job.is_active === false || isExpiredJob(job) || deliveredIds.has(job.id) || deliveredKeys.has(key) || selectedKeys.has(key) || touched.has(job.id) || touchedKeys.has(key)) continue;
    selectedKeys.add(key);
    matches.push(job);
    if (matches.length === limit) break;
  }
  return matches;
}
