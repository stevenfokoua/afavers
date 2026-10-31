export const BUNDESAGENTUR_URL = 'https://rest.arbeitsagentur.de/jobboerse/jobsuche-service/pc/v6/jobs';
// Verified against the provider: search uses v6, full descriptions use v4.
export const BUNDESAGENTUR_DETAIL_URL = 'https://rest.arbeitsagentur.de/jobboerse/jobsuche-service/pc/v4/jobdetails';

export interface BundesagenturJob {
  id: string;
  reference: string;
  title: string;
  company: string;
  location: string;
  description: string;
  url: string;
  postedDate?: string;
  salary?: string;
  deadline?: string;
  descriptionQuality?: 'summary' | 'full';
  detailsCheckedAt?: string;
}

const object = (value: unknown): Record<string, unknown> => value && typeof value === 'object' ? value as Record<string, unknown> : {};
const text = (value: unknown): string => typeof value === 'string' ? value : '';

export function parseBundesagenturResponse(payload: unknown, fallbackLocation: string): { jobs: BundesagenturJob[]; recognized: boolean } {
  const response = object(payload);
  const items = response.ergebnisliste ?? response.stellenangebote;
  if (!Array.isArray(items)) return { jobs: [], recognized: false };
  const jobs: BundesagenturJob[] = [];
  for (const raw of items) {
    const item = object(raw);
    const reference = text(item.referenznummer) || text(item.refnr);
    if (!reference) continue;
    const address = object(Array.isArray(item.stellenlokationen) ? object(item.stellenlokationen[0]).adresse : item.arbeitsort);
    const city = text(address.ort) || fallbackLocation || 'Germany';
    const postcode = text(address.plz) || (typeof address.plz === 'number' ? String(address.plz) : '');
    const remote = item.homeofficemoeglich === true;
    const title = text(item.stellenangebotsTitel) || text(item.titel) || text(item.beruf) || 'No title';
    const date = text(item.datumErsteVeroeffentlichung) || text(item.aktuelleVeroeffentlichungsdatum) || text(item.aenderungsdatum) || text(item.modifikationsTimestamp);
    const salary = text(item.verguetungsangabe);
    jobs.push({
      id: `bundesagentur_${reference}`,
      reference,
      title: title.slice(0, 500),
      company: (text(item.firma) || text(item.arbeitgeber) || 'Not specified').slice(0, 255),
      location: `${postcode ? `${city} (${postcode})` : city}${remote ? ' · Remote' : ''}`.slice(0, 255),
      description: `Position: ${text(item.beruf) || text(item.hauptberuf) || text(object(item.hauptberuf).bezeichnung) || title}${remote ? '\nHome office / remote available' : ''}`,
      descriptionQuality: 'summary',
      url: text(item.externeUrl) || `https://www.arbeitsagentur.de/jobsuche/jobdetail/${encodeURIComponent(reference)}`,
      postedDate: /^\d{4}-\d{2}-\d{2}/.test(date) && Number.isFinite(Date.parse(date)) ? date.slice(0, 10) : undefined,
      // v6 also returns enums such as KEINE_ANGABEN, not a salary amount.
      salary: salary && !/^[A-Z_]+$/.test(salary) ? salary : undefined,
    });
  }
  return { jobs, recognized: true };
}

/** An explicit application closing date, never the start/publication date. */
export function applicationDeadline(description: string): string | undefined {
  for (const paragraph of description.split(/\n\s*\n/)) {
    const plain = paragraph.replace(/<[^>]*>/g, ' ').replace(/[*_]/g, '').replace(/\s+/g, ' ');
    const direct = plain.match(/\b(?:Bewerbungsfrist|Bewerbungsschluss|Bewerbungsende)\s*(?:(?:ist|endet|am|bis|zum|der)\s+|:\s*){0,4}(\d{1,2})\.(\d{1,2})\.(\d{4})\b/i);
    const contextual = plain.match(/\bbewerb\w*\b.{0,600}?\bbis\s+(?:zum\s+|spätestens\s+)?(\d{1,2})\.(\d{1,2})\.(\d{4})\b/i);
    const match = direct ?? contextual;
    if (!match) continue;
    const day = Number(match[1]), month = Number(match[2]), year = Number(match[3]);
    const date = new Date(Date.UTC(year, month - 1, day));
    if (year >= 2000 && year <= 2100 && date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day) return date.toISOString().slice(0, 10);
  }
  return undefined;
}

export function parseBundesagenturDetail(payload: unknown, job: BundesagenturJob, checkedAt: string): BundesagenturJob {
  const detail = object(payload);
  if (text(detail.referenznummer) !== job.reference) throw new Error('detail_reference_mismatch');
  const description = text(detail.stellenangebotsBeschreibung)
    .replace(/<\s*(?:br\s*\/?|\/p|\/li)\s*>/gi, '\n')
    .replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
    .replace(/\r/g, '').trim().slice(0, 20_000);
  if (!description) return { ...job, detailsCheckedAt: checkedAt };
  const mapped = parseBundesagenturResponse({ ergebnisliste: [detail] }, job.location).jobs[0];
  return { ...job,
    title: text(detail.stellenangebotsTitel) ? mapped.title : job.title,
    company: text(detail.firma) ? mapped.company : job.company,
    postedDate: mapped.postedDate ?? job.postedDate,
    salary: mapped.salary ?? job.salary,
    description, descriptionQuality: 'full', detailsCheckedAt: checkedAt, deadline: applicationDeadline(description) };
}
