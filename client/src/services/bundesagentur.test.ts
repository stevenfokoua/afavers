import { describe, expect, it } from 'vitest';
import { parseBundesagenturResponse } from '../../../supabase/functions/_shared/bundesagentur.ts';

describe('Bundesagentur search response compatibility', () => {
  it('maps the live v6 response shape into usable listings', () => {
    const result = parseBundesagenturResponse({ ergebnisliste: [{ referenznummer: 'real-ref', stellenangebotsTitel: 'Software Engineer', firma: 'Example GmbH', stellenlokationen: [{ adresse: { ort: 'Berlin', plz: '10115' } }], datumErsteVeroeffentlichung: '2026-10-13', homeofficemoeglich: true, verguetungsangabe: 'KEINE_ANGABEN' }] }, 'Germany');
    expect(result.recognized).toBe(true);
    expect(result.jobs[0]).toMatchObject({ id: 'bundesagentur_real-ref', title: 'Software Engineer', company: 'Example GmbH', location: 'Berlin (10115) · Remote', postedDate: '2026-10-13' });
    expect(result.jobs[0].salary).toBeUndefined();
  });
  it('retains support for legacy v4 responses', () => {
    const result = parseBundesagenturResponse({ stellenangebote: [{ refnr: 'old-ref', titel: 'Engineer', arbeitgeber: 'Example', arbeitsort: { ort: 'Köln', plz: '50667' } }] }, 'Germany');
    expect(result.jobs[0]).toMatchObject({ reference: 'old-ref', title: 'Engineer', location: 'Köln (50667)' });
  });
  it('distinguishes malformed responses from a valid empty search', () => {
    expect(parseBundesagenturResponse({ error: 'upstream failure' }, 'Berlin').recognized).toBe(false);
    expect(parseBundesagenturResponse({ ergebnisliste: [] }, 'Berlin')).toEqual({ jobs: [], recognized: true });
  });
  it('never creates an undefined reference or invalid date', () => {
    const result = parseBundesagenturResponse({ ergebnisliste: [{ stellenangebotsTitel: 'No reference' }, { referenznummer: 'valid', datumErsteVeroeffentlichung: 'invalid' }] }, 'Berlin');
    expect(result.jobs).toHaveLength(1);
    expect(result.jobs[0].postedDate).toBeUndefined();
  });
});
