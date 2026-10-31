export const BUNDESAGENTUR_URL = 'https://rest.arbeitsagentur.de/jobboerse/jobsuche-service/pc/v6/jobs';

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
      description: `Position: ${text(item.beruf) || text(object(item.hauptberuf).bezeichnung) || title}${remote ? '\nHome office / remote available' : ''}`,
      url: text(item.externeUrl) || `https://www.arbeitsagentur.de/jobsuche/jobdetail/${encodeURIComponent(reference)}`,
      postedDate: /^\d{4}-\d{2}-\d{2}/.test(date) && Number.isFinite(Date.parse(date)) ? date.slice(0, 10) : undefined,
      // v6 also returns enums such as KEINE_ANGABEN, not a salary amount.
      salary: salary && !/^[A-Z_]+$/.test(salary) ? salary : undefined,
    });
  }
  return { jobs, recognized: true };
}
