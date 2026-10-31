import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Job } from '../types';

const state = vi.hoisted(() => ({ owner: 1 as number | null }));
vi.mock('../lib/supabase', () => ({ supabase: { from: vi.fn(), rpc: vi.fn() } }));
vi.mock('../store/authStore', () => ({ useAuthStore: { getState: () => ({ user: state.owner === null ? null : { id: state.owner } }) } }));
vi.mock('../store/reminderStore', () => ({ useReminderStore: { getState: () => ({ reminders: [] }) } }));
vi.mock('./notification.service', () => ({ scheduleReminder: vi.fn(), cancelReminder: vi.fn() }));
vi.mock('./settings.service', () => ({ settingsService: { get: vi.fn().mockResolvedValue({ keywords: 'GIS', locations: '' }) } }));
vi.mock('./feedHealth.service', () => ({ feedHealthService: { get: vi.fn() } }));

import { supabase } from '../lib/supabase';
import { jobsService } from './jobs.service';
import { invalidateJobSnapshot } from './jobSnapshot';
import { settingsService } from './settings.service';

function job(id: number, title: string, extra: Partial<Job> = {}): Job {
  return { id, title, external_id: 'corpus-' + id, company: 'Example', location: 'Köln', url: 'https://example.com/' + id, source: 'bundesagentur', description: 'Position: ' + title, posted_date: null, deadline: null, status: 'new', created_at: '2026-10-31', ...extra } as Job;
}
let base: Job[], tracked: Job[], overlays: Record<string, unknown>[];
type PageResult = { data: Job[] | null; error: { message: string } | null };
let pageLoader: ReturnType<typeof vi.fn<(from: number, to: number) => Promise<PageResult>>>;

beforeEach(() => {
  vi.clearAllMocks(); invalidateJobSnapshot(); state.owner = 1;
  vi.mocked(settingsService.get).mockResolvedValue({ keywords: 'GIS', locations: '' });
  base = []; tracked = []; overlays = [];
  pageLoader = vi.fn(async () => ({ data: [], error: null }));
  vi.mocked(supabase.from).mockImplementation((table: string) => {
    if (table === 'jobs') return { select: () => ({ order: () => ({ limit: async () => ({ data: base, error: null }) }), in: async (_column: string, ids: number[]) => ({ data: tracked.filter(row => ids.includes(row.id)), error: null }) }) } as never;
    return { select: () => { const chain = { eq: () => chain, order: () => chain, range: async () => ({ data: overlays, error: null }) }; return chain; } } as never;
  });
  vi.mocked(supabase.rpc).mockImplementation(() => ({ range: (from: number, to: number) => ({ abortSignal: () => pageLoader(from, to) }) }) as never);
});

describe('saved-preference recommendation coverage', () => {
  const detail = 'The data analyst role maintains QGIS maps and spatial datasets for infrastructure planning. Requirements include coordinate-reference systems, database experience and clear technical documentation for project teams. Our working language is English. Remote work is available.';

  it('ranks an older body-only match from the whole corpus using saved keyword alternatives', async () => {
    vi.mocked(settingsService.get).mockResolvedValue({ keywords: 'GIS, IT, data analyst', locations: 'Köln' });
    base = Array.from({ length: 1000 }, (_, i) => job(i + 1, 'Recent unrelated role ' + i));
    const old = job(2001, 'Infrastructure opportunity', { description: detail, description_quality: 'full', posted_date: new Date().toISOString().slice(0, 10), created_at: '2026-01-01' });
    pageLoader.mockResolvedValue({ data: [old, job(2002, 'Psychologischen Studienberatung')], error: null });
    const result = await jobsService.getRecommendations();
    expect(result.jobs[0].id).toBe(old.id);
    expect(result.jobs[0].match_score).toBeGreaterThanOrEqual(70);
    expect(result.jobs.some(row => row.id === 2002)).toBe(false);
    expect(result.browse_window_limited).toBe(false);
    expect(supabase.rpc).toHaveBeenCalledWith('search_job_candidates', { p_terms: expect.arrayContaining(['gis', 'qgis', 'it', 'data analyst']) });
    const terms = vi.mocked(supabase.rpc).mock.calls[0][1] as { p_terms: string[] };
    expect(terms.p_terms).not.toContain('gis it data analyst');
  });

  it('preserves private history and excludes saved or hidden older candidates', async () => {
    tracked = [job(2001, 'QGIS role', { description: detail }), job(2002, 'Saved QGIS role'), job(2003, 'Hidden QGIS role'), job(2004, 'Private QGIS role', { source: 'manual', is_manual: true, owner_user_id: 1 })];
    overlays = [{ job_id: 2001, status: 'new', notes: 'Private research', history: [{ label: 'Reviewed', type: 'note', at: '2026-10-31' }] }, { job_id: 2002, status: 'saved' }, { job_id: 2003, status: 'new', is_hidden: true }, { job_id: 2004, status: 'new', notes: 'Private manual record' }];
    pageLoader.mockResolvedValue({ data: tracked.slice(0, 3), error: null });
    const result = await jobsService.getRecommendations();
    expect(result.jobs.map(row => row.id).sort()).toEqual([2001, 2004]);
    expect(result.jobs.find(row => row.id === 2001)).toMatchObject({ notes: 'Private research', history: [{ label: 'Reviewed' }] });
    expect(result.jobs.find(row => row.id === 2004)).toMatchObject({ notes: 'Private manual record', owner_user_id: 1 });
  });

  it('rejects an incomplete recommendation load rather than claiming an exhausted queue', async () => {
    pageLoader.mockResolvedValue({ data: null, error: { message: 'unavailable' } });
    await expect(jobsService.getRecommendations()).rejects.toThrow('could not be completed');
    pageLoader.mockResolvedValue({ data: [job(2001, 'QGIS role')], error: null });
    expect((await jobsService.getRecommendations()).jobs.map(row => row.id)).toEqual([2001]);
    expect(supabase.rpc).toHaveBeenCalledTimes(2);
  });

  it('labels a keyword-free bounded queue and honors an explicitly enabled local filter', async () => {
    vi.mocked(settingsService.get).mockResolvedValue({ keywords: '', locations: '' });
    base = Array.from({ length: 1000 }, (_, i) => job(i + 1, 'Recent role ' + i));
    expect((await jobsService.getRecommendations()).browse_window_limited).toBe(true);
    expect(supabase.rpc).not.toHaveBeenCalled();
    pageLoader.mockResolvedValue({ data: [job(2001, 'QGIS role')], error: null });
    const filtered = await jobsService.getRecommendations(['GIS']);
    expect(filtered.jobs.some(row => row.id === 2001)).toBe(true);
    expect(filtered.browse_window_limited).toBe(false);
  });
});

describe('whole-corpus lexical search', () => {
  it('finds an older QGIS vacancy beyond the latest thousand and excludes acronym substrings', async () => {
    base = Array.from({ length: 1000 }, (_, i) => job(i + 1, 'Unrelated recent role ' + i));
    const old = job(2001, 'QGIS Specialist', { created_at: '2026-01-01' });
    pageLoader.mockResolvedValue({ data: [old, job(2002, 'Psychologischen Studienberatung')], error: null });
    const browse = await jobsService.getJobs({ limit: 1 });
    expect(browse.browse_window_limited).toBe(true);
    expect(supabase.rpc).not.toHaveBeenCalled();
    const result = await jobsService.getJobs({ search: 'GIS' });
    expect(result.jobs.map(row => row.id)).toEqual([old.id]);
    expect(result.total).toBe(1);
    expect(result.browse_window_limited).toBe(false);
    expect(supabase.rpc).toHaveBeenCalledWith('search_job_candidates', { p_terms: expect.arrayContaining(['gis', 'qgis', 'arcgis', 'geospatial']) });
  });

  it('reads subsequent candidate pages before reporting a complete result count', async () => {
    const broadPage = Array.from({ length: 1000 }, (_, i) => job(i + 1, 'Psychologischen Studienberatung ' + i));
    pageLoader.mockImplementation(async from => ({ data: from === 0 ? broadPage : [job(2001, 'ArcGIS Analyst')], error: null }));
    const result = await jobsService.getJobs({ search: 'GIS' });
    expect(pageLoader.mock.calls).toEqual([[0, 999], [1000, 1999]]);
    expect(result.jobs.map(row => row.id)).toEqual([2001]);
  });

  it('keeps tracked/private overlays when a public supplemental row has the same id', async () => {
    tracked = [job(2001, 'QGIS Analyst'), job(2002, 'Private QGIS application', { source: 'manual', is_manual: true, owner_user_id: 1 })];
    overlays = [{ job_id: 2001, status: 'saved', notes: 'My private note', checklist: { 'CV tailored': true } }, { job_id: 2002, status: 'applied', notes: 'Private manual record' }];
    pageLoader.mockResolvedValue({ data: [job(2001, 'QGIS Analyst')], error: null });
    const result = await jobsService.getJobs({ search: 'GIS' });
    expect(result.jobs.find(row => row.id === 2001)).toMatchObject({ status: 'saved', notes: 'My private note', checklist: { 'CV tailored': true } });
    expect(result.jobs.find(row => row.id === 2002)).toMatchObject({ status: 'applied', notes: 'Private manual record' });
  });

  it('does not reuse another account’s candidate cache or an account-switch response', async () => {
    let finish!: (result: PageResult) => void;
    pageLoader.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const pending = jobsService.getJobs({ search: 'GIS' });
    await vi.waitFor(() => expect(pageLoader).toHaveBeenCalledTimes(1));
    state.owner = 2;
    finish({ data: [job(2001, 'QGIS Analyst')], error: null });
    await expect(pending).rejects.toThrow('account changed');
    pageLoader.mockResolvedValue({ data: [job(2002, 'QGIS cartographer')], error: null });
    expect((await jobsService.getJobs({ search: 'GIS' })).jobs.map(row => row.id)).toEqual([2002]);
    expect(supabase.rpc).toHaveBeenCalledTimes(2);
  });

  it('reports failed pagination as failure and permits a fresh retry instead of a false empty result', async () => {
    const page = Array.from({ length: 1000 }, (_, i) => job(i + 1, 'Unrelated role ' + i));
    pageLoader.mockResolvedValueOnce({ data: page, error: null }).mockResolvedValueOnce({ data: null, error: { message: 'offline' } });
    await expect(jobsService.getJobs({ search: 'GIS' })).rejects.toThrow('could not be completed');
    pageLoader.mockResolvedValue({ data: [job(2001, 'QGIS Analyst')], error: null });
    expect((await jobsService.getJobs({ search: 'GIS' })).total).toBe(1);
    expect(supabase.rpc).toHaveBeenCalledTimes(3);
  });

  it('stops an overly broad search at its explicit page budget without returning truncated success', async () => {
    pageLoader.mockResolvedValue({ data: Array.from({ length: 1000 }, (_, i) => job(i + 1, 'GIS role ' + i)), error: null });
    await expect(jobsService.getJobs({ search: 'GIS' })).rejects.toThrow('too many candidates');
    expect(pageLoader).toHaveBeenCalledTimes(8);
  });
});
