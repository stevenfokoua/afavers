import type { ExternalJob } from './job-types.ts';
import type { DetailMetadata } from './bundesagentur-detail.ts';

/** Separate payload shapes: PostgREST must not NULL rich fields omitted by a summary refresh. */
export function buildImportRows(jobs: ExternalJob[], existing: DetailMetadata[], language: (title: string, description: string) => string | null, checkedAt: string): Array<Array<Record<string, unknown>>> {
  const metadata = new Map(existing.map(row => [row.external_id, row]));
  const withDescription: Array<Record<string, unknown>> = [], preservingDescription: Array<Record<string, unknown>> = [];
  const date = (value?: string) => value && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString().slice(0, 10) : null;
  for (const job of jobs) {
    const previous = metadata.get(job.id);
    const base = { external_id: job.id, title: job.title, company: job.company, location: job.location, url: job.url,
      source: job.id.split('_')[0], posted_date: date(job.postedDate), is_active: true, updated_at: checkedAt,
      details_checked_at: job.detailsCheckedAt ?? previous?.details_checked_at ?? null };
    if (job.descriptionQuality !== 'full' && previous?.description_quality === 'full') {
      preservingDescription.push(base);
    } else {
      withDescription.push({ ...base, description: job.description, deadline: date(job.deadline), salary: job.salary ?? null,
        language: language(job.title, job.description), description_quality: job.descriptionQuality ?? 'summary' });
    }
  }
  return [withDescription, preservingDescription].filter(group => group.length);
}
