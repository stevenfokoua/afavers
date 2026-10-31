import { describe, expect, it, vi } from 'vitest';
import { applicationDeadline, parseBundesagenturDetail, type BundesagenturJob } from '../../../supabase/functions/_shared/bundesagentur';
import { enrichBundesagenturDetails } from '../../../supabase/functions/_shared/bundesagentur-detail';
import { buildImportRows } from '../../../supabase/functions/_shared/import-rows';

const now = Date.parse('2026-10-31T12:00:00Z');
const job = (reference = '10000-123-S'): BundesagenturJob => ({ id: 'bundesagentur_' + reference, reference, title: 'GIS Engineer', company: 'Synthetic employer', location: 'Duisburg', description: 'Position: Geoinformatiker/in', descriptionQuality: 'summary', url: 'https://www.arbeitsagentur.de/jobsuche/jobdetail/' + reference });
const options = () => ({ deadlineAt: now + 30_000, now: () => now, headers: {}, pause: async () => {} });
const json = (value: unknown) => new Response(JSON.stringify(value));

describe('verified Bundesagentur full details and preservation', () => {
  it('maps a reference-checked full description without inventing structured requirements', () => {
    const enriched = parseBundesagenturDetail({ referenznummer: job().reference, stellenangebotsBeschreibung: 'Ihre Aufgaben: GIS und QGIS.\n\nBitte senden Sie Ihre Bewerbung als PDF **bis zum 04.11.2026**.\n\nSehr gute deutsche Sprachkenntnisse (mindestens C1-Niveau).' }, job(), new Date(now).toISOString());
    expect(enriched).toMatchObject({ title: 'GIS Engineer', descriptionQuality: 'full', deadline: '2026-11-04' });
    expect(enriched.description).toContain('C1-Niveau');
    expect(enriched.description).not.toMatch(/^Position:/);
    expect(() => parseBundesagenturDetail({ referenznummer: 'someone-else', stellenangebotsBeschreibung: 'Wrong vacancy' }, job(), 'now')).toThrow('detail_reference_mismatch');
  });
  it('extracts only explicit valid application dates, not employment/publication dates', () => {
    expect(applicationDeadline('Einstellung ab 04.11.2026. Veröffentlicht am 01.10.2026.')).toBeUndefined();
    expect(applicationDeadline('Bewerbungsfrist ist der 04.11.2026')).toBe('2026-11-04');
    expect(applicationDeadline('Bewerbungsschluss: 31.02.2026')).toBeUndefined();
    expect(applicationDeadline('Ihre Bewerbung senden Sie bitte bis zum 04.11.2026.')).toBe('2026-11-04');
  });
  it('uses the verified v4 endpoint and reuses fresh full detail metadata', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(json({ referenznummer: job().reference, stellenangebotsBeschreibung: 'Full source description and qualification requirements.' }));
    const fetched = await enrichBundesagenturDetails([job()], [], { ...options(), fetcher });
    expect(String(fetcher.mock.calls[0][0])).toBe('https://rest.arbeitsagentur.de/jobboerse/jobsuche-service/pc/v4/jobdetails/' + encodeURIComponent(btoa(job().reference)));
    expect(fetched.report).toMatchObject({ attempted: 1, enriched: 1, full_descriptions: 1, failed: 0 });
    fetcher.mockClear();
    const cached = await enrichBundesagenturDetails([job()], [{ external_id: job().id, description_quality: 'full', details_checked_at: new Date(now - 1000).toISOString() }], { ...options(), fetcher });
    expect(fetcher).not.toHaveBeenCalled(); expect(cached.report).toMatchObject({ cached: 1, full_descriptions: 1 });
  });
  it('bounds detail concurrency/work and reports deferred enrichment honestly', async () => {
    let active = 0, peak = 0;
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async url => {
      active++; peak = Math.max(peak, active); await new Promise(resolve => setTimeout(resolve, 1)); active--;
      const reference = atob(decodeURIComponent(String(url).split('/').pop()!));
      return json({ referenznummer: reference, stellenangebotsBeschreibung: 'Real provider description.' });
    });
    const result = await enrichBundesagenturDetails(Array.from({ length: 10 }, (_, index) => job(String(index))), [], { ...options(), maxJobs: 6, concurrency: 8, fetcher });
    expect(peak).toBeLessThanOrEqual(4); expect(fetcher).toHaveBeenCalledTimes(6);
    expect(result.report).toMatchObject({ enriched: 6, deferred: 4, full_descriptions: 6 });
  });
  it('keeps listing summaries on unavailable details and honors provider cooldown', async () => {
    const missing = await enrichBundesagenturDetails([job()], [], { ...options(), fetcher: vi.fn<typeof fetch>().mockResolvedValue(new Response('', { status: 404 })) });
    expect(missing.jobs[0].description).toBe(job().description); expect(missing.jobs[0].detailsCheckedAt).toBeTruthy();
    expect(missing.report).toMatchObject({ unavailable: 1, failed: 0, full_descriptions: 0 });
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response('never log provider body', { status: 429, headers: { 'retry-after': '600' } }));
    const cooldown = await enrichBundesagenturDetails([job('a'), job('b')], [], { ...options(), concurrency: 1, fetcher });
    expect(fetcher).toHaveBeenCalledOnce(); expect(cooldown.report).toMatchObject({ failed: 1, deferred: 1, retries: 0 });
    expect(cooldown.report.errors).toContain('detail_provider_cooldown'); expect(JSON.stringify(cooldown.report)).not.toContain('provider body');
  });
  it('reports time-budget exhaustion without starting later detail requests', async () => {
    let clock = now;
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => { clock += 31_000; throw new DOMException('private network detail', 'TimeoutError'); });
    const result = await enrichBundesagenturDetails([job('a'), job('b')], [], { ...options(), now: () => clock, concurrency: 1, fetcher });
    expect(fetcher).toHaveBeenCalledOnce(); expect(result.report).toMatchObject({ budget_exhausted: true, timed_out: 1, failed: 1, deferred: 1 });
  });
  it('never overwrites stored full text, deadline, language or salary with a search summary', () => {
    const old = { external_id: job().id, description_quality: 'full', details_checked_at: '2026-10-30T00:00:00Z' };
    const detect = vi.fn(() => null);
    const rows = buildImportRows([job()], [old], detect, new Date(now).toISOString());
    expect(rows).toHaveLength(1); expect(rows[0][0]).toMatchObject({ external_id: job().id, details_checked_at: old.details_checked_at, is_active: true });
    for (const key of ['description', 'language', 'deadline', 'salary', 'description_quality']) expect(rows[0][0]).not.toHaveProperty(key);
    expect(detect).not.toHaveBeenCalled();
    const full = parseBundesagenturDetail({ referenznummer: job().reference, stellenangebotsBeschreibung: 'Full source description.' }, job(), new Date(now).toISOString());
    expect(buildImportRows([full], [old], detect, new Date(now).toISOString())[0][0]).toMatchObject({ description: full.description, description_quality: 'full' });
  });
});
