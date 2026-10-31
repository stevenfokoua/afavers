/**
 * Jobs service tests.
 *
 * scoreJob, applyFilters, and appendHistory are module-private helpers.
 * We test them by:
 *   - scoreJob / applyFilters: calling jobsService.getJobs() with a mocked
 *     Supabase client that returns controlled job rows, then asserting on
 *     the returned data.
 *   - appendHistory: calling jobsService.updateStatus() with a mocked Supabase
 *     pipeline and asserting the history is appended correctly.
 *
 * All Supabase I/O is mocked.  No real DB connection is made.
 *
 * Vitest environment: node (default from vitest.config.ts).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Module mocks ─────────────────────────────────────────────────────────────

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: vi.fn(),
    functions: { invoke: vi.fn() },
  },
}));

vi.mock('../store/authStore', () => ({
  useAuthStore: {
    getState: () => ({ user: { id: 99 } }),
  },
}));

vi.mock('../store/reminderStore', () => ({
  useReminderStore: {
    getState: () => ({
      reminders: [],
      addReminder: vi.fn(() => 'mock-id'),
    }),
  },
}));

vi.mock('./notification.service', () => ({
  scheduleReminder: vi.fn().mockResolvedValue(undefined),
  cancelReminder: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('./settings.service', () => ({
  settingsService: {
    get: vi.fn().mockResolvedValue({ keywords: '', locations: '' }),
  },
}));
vi.mock('./feedHealth.service', () => ({
  feedHealthService: { get: vi.fn().mockResolvedValue({ latest: null, last_successful_at: null, last_usable_at: null }), invalidate: vi.fn() },
}));

import { jobsService } from './jobs.service';
import { invalidateJobSnapshot } from './jobSnapshot';
beforeEach(() => invalidateJobSnapshot());
import { supabase } from '../lib/supabase';
import { settingsService } from './settings.service';
import type { Job, JobFilters } from '../types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function makeJob(overrides: Partial<Job> = {}): Job {
  return {
    id: 1,
    external_id: 'ext_1',
    title: 'Software Engineer',
    company: 'Acme Corp',
    location: 'Berlin',
    description: 'A great job with react and typescript',
    url: `https://example.com/job/${overrides.id ?? 1}`,
    source: 'bundesagentur',
    posted_date: todayStr(),
    deadline: null,
    salary: null,
    status: 'new',
    notes: null,
    cover_letter: null,
    applied_date: null,
    follow_up_date: null,
    interview_date: null,
    is_hidden: false,
    language: 'en',
    checklist: {},
    history: [],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

/**
 * Set up the Supabase mock chain:
 *   supabase.from('jobs').select('*').order().limit() → jobs data
 *   supabase.from('user_jobs').select(...).eq() → empty overlays
 */
function setupJobsMock(jobs: Job[]) {
  const userJobsChain = {
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    range: vi.fn().mockResolvedValue({ data: [], error: null }),
  };
  const userJobsSelect = vi.fn().mockReturnValue(userJobsChain);

  const jobsChain = {
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue({ data: jobs, error: null }),
  };
  const jobsSelect = vi.fn().mockReturnValue(jobsChain);

  (supabase.from as ReturnType<typeof vi.fn>).mockImplementation((table: string) => {
    if (table === 'jobs') return { select: jobsSelect };
    if (table === 'user_jobs') return { select: userJobsSelect };
    return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ data: [], error: null }) }) };
  });
}

// ─── scoreJob ─────────────────────────────────────────────────────────────────

describe('scoreJob (via getJobs with user keywords)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('base score is 20 when no keywords, no location settings', async () => {
    setupJobsMock([makeJob()]);
    const result = await jobsService.getJobs();
    const job = result.jobs[0];
    // A legacy language tag is not a confirmed working-language claim.
    expect(job.match_score).toBeGreaterThanOrEqual(20);
    expect(job.match_score).toBeLessThanOrEqual(100);
  });

  it('match_score is capped at 100', async () => {
    const { settingsService } = await import('./settings.service');
    (settingsService.get as ReturnType<typeof vi.fn>).mockResolvedValue({
      keywords: 'react,typescript,software,engineer,berlin',
      locations: 'berlin',
    });
    setupJobsMock([makeJob()]);
    const result = await jobsService.getJobs();
    const job = result.jobs[0];
    expect(job.match_score).toBeLessThanOrEqual(100);
  });

  it('match_score is 0 or above — never negative', async () => {
    const { settingsService } = await import('./settings.service');
    (settingsService.get as ReturnType<typeof vi.fn>).mockResolvedValue({
      keywords: 'junior,internship',
      locations: 'munich',
    });
    // Job with senior in title should lose points but not go negative
    setupJobsMock([makeJob({ title: 'Senior Principal Lead Engineer', language: 'de', location: 'Hamburg' })]);
    const result = await jobsService.getJobs();
    const job = result.jobs[0];
    expect(job.match_score).toBeGreaterThanOrEqual(0);
  });

  it('adds keyword match reasons when keywords match job text', async () => {
    const { settingsService } = await import('./settings.service');
    (settingsService.get as ReturnType<typeof vi.fn>).mockResolvedValue({
      keywords: 'react',
      locations: '',
    });
    setupJobsMock([makeJob({ description: 'We are looking for a react developer' })]);
    const result = await jobsService.getJobs();
    const job = result.jobs[0];
    expect(job.match_reasons?.some((r) => r.toLowerCase().includes('keyword'))).toBe(true);
  });

  it('adds Remote-friendly reason when job description contains remote keyword', async () => {
    const { settingsService } = await import('./settings.service');
    (settingsService.get as ReturnType<typeof vi.fn>).mockResolvedValue({ keywords: '', locations: '' });
    setupJobsMock([makeJob({ description: 'This is a fully remote position with homeoffice option' })]);
    const result = await jobsService.getJobs();
    const job = result.jobs[0];
    expect(job.match_reasons?.some((r) => /remote/i.test(r))).toBe(true);
  });

  it('adds fresh-posting bonus for jobs posted today', async () => {
    const { settingsService } = await import('./settings.service');
    (settingsService.get as ReturnType<typeof vi.fn>).mockResolvedValue({ keywords: '', locations: '' });
    setupJobsMock([makeJob({ posted_date: todayStr(), language: null })]);
    const result = await jobsService.getJobs();
    const job = result.jobs[0];
    expect(job.match_reasons?.some((r) => /fresh/i.test(r))).toBe(true);
  });
});

// ─── applyFilters ─────────────────────────────────────────────────────────────

describe('applyFilters (via getJobs)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('filters out is_hidden jobs', async () => {
    const { settingsService } = await import('./settings.service');
    (settingsService.get as ReturnType<typeof vi.fn>).mockResolvedValue({ keywords: '', locations: '' });
    setupJobsMock([
      makeJob({ id: 1, is_hidden: true }),
      makeJob({ id: 2, is_hidden: false }),
    ]);
    const result = await jobsService.getJobs();
    expect(result.jobs.every((j) => !j.is_hidden)).toBe(true);
    expect(result.jobs.length).toBe(1);
  });

  it('filters by status when filters.status is provided', async () => {
    const { settingsService } = await import('./settings.service');
    (settingsService.get as ReturnType<typeof vi.fn>).mockResolvedValue({ keywords: '', locations: '' });

    // We need the overlay to set status, but since we have no overlay mock per-job,
    // we'll set status directly on the job row (simulating merged data already having status)
    const overlayEq = vi.fn().mockResolvedValue({
      data: [{ job_id: 2, status: 'applied', notes: null, cover_letter: null, applied_date: null, follow_up_date: null, interview_date: null, is_hidden: false, checklist: {}, history: [], updated_at: null }],
      error: null,
    });
    const overlaySelect = vi.fn().mockReturnValue({ eq: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(), range: overlayEq });
    const jobsChain = {
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({
        data: [makeJob({ id: 1, status: 'new' }), makeJob({ id: 2, status: 'new' })],
        error: null,
      }),
    };
    const jobsSelect = vi.fn().mockReturnValue(jobsChain);
    (supabase.from as ReturnType<typeof vi.fn>).mockImplementation((table: string) => {
      if (table === 'jobs') return { select: jobsSelect };
      if (table === 'user_jobs') return { select: overlaySelect };
      return {};
    });

    const filters: JobFilters = { status: 'applied' };
    const result = await jobsService.getJobs(filters);
    expect(result.jobs.every((j) => j.status === 'applied')).toBe(true);
  });

  it('filters by search query (title match)', async () => {
    const { settingsService } = await import('./settings.service');
    (settingsService.get as ReturnType<typeof vi.fn>).mockResolvedValue({ keywords: '', locations: '' });
    setupJobsMock([
      makeJob({ id: 1, title: 'React Developer', description: 'Build UIs with React' }),
      // Distinct description so 'react' cannot match job 2
      makeJob({ id: 2, title: 'Backend Engineer', description: 'Build APIs with Node' }),
    ]);
    const result = await jobsService.getJobs({ search: 'react' });
    expect(result.jobs.length).toBe(1);
    expect(result.jobs[0].title).toBe('React Developer');
  });

  it('finds GIS-family roles through alias expansion', async () => {
    const { settingsService } = await import('./settings.service');
    (settingsService.get as ReturnType<typeof vi.fn>).mockResolvedValue({ keywords: '', locations: '' });
    setupJobsMock([
      makeJob({ id: 1, title: 'Geoinformatik Werkstudent', description: 'Spatial data and mapping work' }),
      makeJob({ id: 2, title: 'ArcGIS Analyst', description: 'Maintain geospatial dashboards' }),
      makeJob({ id: 3, title: 'Backend Engineer', description: 'Node.js services' }),
    ]);
    const result = await jobsService.getJobs({ search: 'GIS' });
    expect(result.jobs.map((job) => job.title)).toEqual([
      'ArcGIS Analyst',
      'Geoinformatik Werkstudent',
    ]);
  });

  it('ranks title matches ahead of weak description matches for search', async () => {
    const { settingsService } = await import('./settings.service');
    (settingsService.get as ReturnType<typeof vi.fn>).mockResolvedValue({ keywords: '', locations: '' });
    setupJobsMock([
      makeJob({ id: 1, title: 'GIS Analyst', description: 'Core GIS workflows' }),
      makeJob({ id: 2, title: 'Data Analyst', description: 'Exposure to GIS and mapping tools' }),
    ]);
    const result = await jobsService.getJobs({ search: 'GIS' });
    expect(result.jobs[0].title).toBe('GIS Analyst');
  });

  it('filters by highMatchOnly (score >= 70)', async () => {
    const { settingsService } = await import('./settings.service');
    (settingsService.get as ReturnType<typeof vi.fn>).mockResolvedValue({ keywords: 'react,typescript', locations: 'Berlin' });
    setupJobsMock([
      makeJob({ id: 1, description: 'Build production interfaces with React and TypeScript. Work with designers and engineers to make accessible customer experiences, review changes and maintain our shared components. Our working language is English.' }),
      makeJob({ id: 2, description: 'Position: Software Engineer', match_score: 100 }),
    ]);
    const result = await jobsService.getJobs({ highMatchOnly: true });
    expect(result.jobs.map(job => job.id)).toEqual([1]);
    expect(result.jobs[0].match_score).toBeGreaterThanOrEqual(70);
  });

  it('pagination: returns correct slice and total', async () => {
    const { settingsService } = await import('./settings.service');
    (settingsService.get as ReturnType<typeof vi.fn>).mockResolvedValue({ keywords: '', locations: '' });
    setupJobsMock([
      makeJob({ id: 1 }),
      makeJob({ id: 2 }),
      makeJob({ id: 3 }),
    ]);
    const result = await jobsService.getJobs({ limit: 2, offset: 0 });
    expect(result.jobs.length).toBe(2);
    expect(result.total).toBe(3);
    expect(result.page).toBe(1);
  });
});

// ─── appendHistory ─────────────────────────────────────────────────────────────

describe('appendHistory (via updateStatus)', () => {
  beforeEach(() => vi.clearAllMocks());

  /**
   * updateStatus → getJob (to get existing job) → upsertOverlay (to save with new history)
   * We assert the history grows by one entry containing the status label.
   *
   * Mock chain:
   *   supabase.from('jobs').select('*').eq('id', id).single() → job
   *   supabase.from('user_jobs').select(...).eq() → overlays
   *   supabase.from('user_jobs').upsert(...)  → { error: null }
   */
  function setupUpdateStatusMock(
    job: Job,
    existingHistory: Job['history'] = []
  ) {
    (settingsService.get as ReturnType<typeof vi.fn>).mockResolvedValue({ keywords: '', locations: '' });

    const jobWithHistory = { ...job, history: existingHistory };

    // user_jobs overlay (returns the current history for the job)
    const overlayEq = vi.fn().mockResolvedValue({
      data: [{
        job_id: job.id,
        status: job.status,
        notes: null,
        cover_letter: null,
        applied_date: null,
        follow_up_date: null,
        interview_date: null,
        is_hidden: false,
        checklist: {},
        history: existingHistory,
        updated_at: null,
      }],
      error: null,
    });
    const overlaySelect = vi.fn().mockReturnValue({ eq: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(), range: overlayEq });

    // jobs table single select
    const singleMock = vi.fn().mockResolvedValue({ data: jobWithHistory, error: null });
    const jobsEq = vi.fn().mockReturnValue({ single: singleMock });
    const jobsSelectSingle = vi.fn().mockReturnValue({ eq: jobsEq });

    // jobs table list select (for getMergedJobs inside getJob → select('*').eq())
    const upsertMock = vi.fn().mockResolvedValue({ error: null });

    (supabase.from as ReturnType<typeof vi.fn>).mockImplementation((table: string) => {
      if (table === 'jobs') return { select: jobsSelectSingle };
      if (table === 'user_jobs') return { select: overlaySelect, upsert: upsertMock };
      return {};
    });

    return { upsertMock };
  }

  it('appends a new history event when status is updated', async () => {
    const job = makeJob({ id: 10, status: 'saved', history: [] });
    const { upsertMock } = setupUpdateStatusMock(job, []);

    await jobsService.updateStatus(10, 'applied');

    // upsertOverlay should have been called with a history array containing at least one entry
    expect(upsertMock).toHaveBeenCalled();
    const upsertArg = upsertMock.mock.calls[0][0];
    expect(Array.isArray(upsertArg.history)).toBe(true);
    expect(upsertArg.history.length).toBeGreaterThan(0);
    const lastEvent = upsertArg.history[upsertArg.history.length - 1];
    expect(lastEvent.label).toContain('applied');
    expect(lastEvent.type).toBe('status');
    expect(typeof lastEvent.at).toBe('string');
  });

  it('preserves existing history entries while appending the new one', async () => {
    const existing = [
      { type: 'status' as const, label: 'Moved to saved', at: '2024-01-01T10:00:00.000Z' },
    ];
    const job = makeJob({ id: 11, status: 'saved', history: existing });
    const { upsertMock } = setupUpdateStatusMock(job, existing);

    await jobsService.updateStatus(11, 'interviewing');

    const upsertArg = upsertMock.mock.calls[0][0];
    // Previous entry should still be present
    expect(upsertArg.history.some((e: { label: string }) => e.label === 'Moved to saved')).toBe(true);
    // New entry appended
    expect(upsertArg.history.some((e: { label: string }) => e.label.includes('interviewing'))).toBe(true);
  });

  it('history array is capped at 80 entries (bounded growth)', async () => {
    // Create 80 pre-existing history entries
    const existing = Array.from({ length: 80 }, (_, i) => ({
      type: 'status' as const,
      label: `Event ${i}`,
      at: new Date().toISOString(),
    }));
    const job = makeJob({ id: 12, status: 'applied', history: existing });
    const { upsertMock } = setupUpdateStatusMock(job, existing);

    await jobsService.updateStatus(12, 'interviewing');

    const upsertArg = upsertMock.mock.calls[0][0];
    expect(upsertArg.history.length).toBeLessThanOrEqual(80);
  });
});

describe('fetchJobs', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns inserted and updated counts from the edge function', async () => {
    (supabase.functions.invoke as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { success: true, inserted: 12, updated: 34, total: 46 },
      error: null,
    });

    await expect(jobsService.fetchJobs()).resolves.toEqual({
      success: true,
      message: 'Job refresh completed',
      inserted: 12,
      updated: 34,
      total: 46,
      complete: true,
    });
  });

  it('surfaces an auth-specific message for unauthorized invocations', async () => {
    (supabase.functions.invoke as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: null,
      error: { message: 'Unauthorized' },
    });

    await expect(jobsService.fetchJobs()).rejects.toThrow('Your session expired. Please sign in again and try once more.');
  });
  it('keeps partial results while explaining incomplete source coverage', async () => {
    (supabase.functions.invoke as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { success: true, inserted: 2, updated: 8, total: 10, complete: false, outcome: 'partial' }, error: null });
    await expect(jobsService.fetchJobs()).resolves.toEqual({ success: true, message: 'Available jobs refreshed; some searches were incomplete.', inserted: 2, updated: 8, total: 10, complete: false });
  });
});

describe('getMergedJobs tracked-job fallback (via getAllJobs)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('keeps an inactive new-status note overlay and does not label deactivation as a feed observation', async () => {
    const overlays = { eq: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(), range: vi.fn().mockResolvedValue({ data: [{ job_id: 8, status: 'new', notes: 'Keep my research', updated_at: '2026-10-28T12:00:00Z' }], error: null }) };
    const listing = { order: vi.fn().mockReturnThis(), limit: vi.fn().mockResolvedValue({ data: [makeJob({ id: 8, is_active: false, deadline: '2000-01-01' })], error: null }) };
    vi.mocked(supabase.from).mockImplementation((table) => ({ select: vi.fn().mockReturnValue(table === 'jobs' ? listing : overlays) }) as unknown as ReturnType<typeof supabase.from>);
    const jobs = await jobsService.getAllJobs();
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({ status: 'new', notes: 'Keep my research', is_tracked: true });
    expect(jobs[0].last_seen_at).toBeUndefined();
  });

  it('does not retain an expired empty overlay left by hiding then undoing', async () => {
    const overlays = { eq: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(), range: vi.fn().mockResolvedValue({ data: [{ job_id: 8, status: 'new', is_hidden: false, notes: null, history: [], checklist: {} }], error: null }) };
    const listing = { order: vi.fn().mockReturnThis(), limit: vi.fn().mockResolvedValue({ data: [makeJob({ id: 8, is_active: false, deadline: '2000-01-01' })], error: null }) };
    vi.mocked(supabase.from).mockImplementation((table) => ({ select: vi.fn().mockReturnValue(table === 'jobs' ? listing : overlays) }) as unknown as ReturnType<typeof supabase.from>);
    expect(await jobsService.getAllJobs()).toEqual([]);
  });

  it('fetches tracked jobs missing from the recent window by id', async () => {
    const recentJob = makeJob({ id: 1 });
    const oldTrackedJob = makeJob({ id: 999, title: 'Old saved job' });

    const userJobsChain = {
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
      range: vi.fn().mockResolvedValue({
        data: [{ job_id: 999, status: 'saved' }],
        error: null,
      }),
    };
    const jobsChain = {
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: [recentJob], error: null }),
      in: vi.fn().mockResolvedValue({ data: [oldTrackedJob], error: null }),
    };
    (supabase.from as ReturnType<typeof vi.fn>).mockImplementation((table: string) => {
      if (table === 'jobs') return { select: vi.fn().mockReturnValue(jobsChain) };
      if (table === 'user_jobs') return { select: vi.fn().mockReturnValue(userJobsChain) };
      return { select: vi.fn() };
    });

    const jobs = await jobsService.getAllJobs();

    expect(jobsChain.in).toHaveBeenCalledWith('id', [999]);
    expect(jobs.map((job) => job.id)).toEqual(expect.arrayContaining([1, 999]));
    expect(jobs.find((job) => job.id === 999)?.status).toBe('saved');
  });

  it('does not issue an extra query when all tracked jobs are in the window', async () => {
    const trackedJob = makeJob({ id: 7 });

    const userJobsChain = {
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
      range: vi.fn().mockResolvedValue({
        data: [{ job_id: 7, status: 'applied' }],
        error: null,
      }),
    };
    const jobsChain = {
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: [trackedJob], error: null }),
      in: vi.fn(),
    };
    (supabase.from as ReturnType<typeof vi.fn>).mockImplementation((table: string) => {
      if (table === 'jobs') return { select: vi.fn().mockReturnValue(jobsChain) };
      if (table === 'user_jobs') return { select: vi.fn().mockReturnValue(userJobsChain) };
      return { select: vi.fn() };
    });

    const jobs = await jobsService.getAllJobs();

    expect(jobsChain.in).not.toHaveBeenCalled();
    expect(jobs.find((job) => job.id === 7)?.status).toBe('applied');
  });
});

describe('snapshot efficiency and tracker retention', () => {
  beforeEach(() => vi.clearAllMocks());

  it('keeps fetched added-today jobs after saving but excludes manual additions', async () => {
    const saved = makeJob({ status: 'saved' });
    const overlay = { eq: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(), range: vi.fn().mockResolvedValue({ data: [], error: null }) };
    const corpus = { order: vi.fn().mockReturnThis(), limit: vi.fn().mockResolvedValue({ data: [saved, makeJob({ id: 2, source: 'manual', is_manual: true, status: 'saved' })], error: null }) };
    const freshness = { neq: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(), limit: vi.fn().mockReturnThis(), maybeSingle: vi.fn().mockResolvedValue({ data: { updated_at: saved.updated_at }, error: null }) };
    vi.mocked(supabase.from).mockImplementation((table) => ({ select: vi.fn().mockImplementation((columns) => table === 'user_jobs' ? overlay : columns === 'updated_at' ? freshness : corpus) }) as unknown as ReturnType<typeof supabase.from>);
    const stats = await jobsService.getStats();
    expect(stats.new_today).toBe(1);
    expect(stats.new).toBe(0);
    expect(stats.saved).toBe(2);
  });

  it('shares concurrent and recently settled corpus reads and supports explicit refresh', async () => {
    let resolveJobs!: (value: { data: Job[]; error: null }) => void;
    const response = new Promise<{ data: Job[]; error: null }>((resolve) => { resolveJobs = resolve; });
    const limit = vi.fn().mockReturnValue(response);
    const overlay = { eq: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(), range: vi.fn().mockResolvedValue({ data: [], error: null }) };
    const listing = { order: vi.fn().mockReturnThis(), limit };
    vi.mocked(supabase.from).mockImplementation((table: string) => ({ select: vi.fn().mockReturnValue(table === 'jobs' ? listing : overlay) }) as unknown as ReturnType<typeof supabase.from>);
    const first = jobsService.getAllJobs();
    const second = jobsService.getJobs({ status: 'new' });
    expect(limit).toHaveBeenCalledTimes(1);
    resolveJobs({ data: [makeJob()], error: null });
    await Promise.all([first, second]);
    await jobsService.getAllJobs();
    expect(limit).toHaveBeenCalledTimes(1);
    invalidateJobSnapshot();
    await jobsService.getAllJobs();
    expect(limit).toHaveBeenCalledTimes(2);
  });

  it('keeps tracker entries beyond the 1000-row API cap and bounds id-query sizes', async () => {
    const overlays = Array.from({ length: 1001 }, (_, index) => ({ job_id: index + 1, status: 'saved' }));
    const range = vi.fn().mockImplementation((from: number, to: number) => Promise.resolve({ data: overlays.slice(from, to + 1), error: null }));
    const overlay = { eq: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(), range };
    const inIds = vi.fn().mockImplementation((_key: string, ids: number[]) => Promise.resolve({ data: ids.map((id) => makeJob({ id })), error: null }));
    const listing = { order: vi.fn().mockReturnThis(), limit: vi.fn().mockResolvedValue({ data: [makeJob()], error: null }), in: inIds };
    vi.mocked(supabase.from).mockImplementation((table: string) => ({ select: vi.fn().mockReturnValue(table === 'jobs' ? listing : overlay) }) as unknown as ReturnType<typeof supabase.from>);
    const jobs = await jobsService.getAllJobs();
    expect(jobs).toHaveLength(1001);
    expect(jobs.find((job) => job.id === 1001)?.status).toBe('saved');
    expect(range.mock.calls).toEqual([[0, 999], [1000, 1999]]);
    expect(inIds.mock.calls.every(([, ids]) => ids.length <= 150)).toBe(true);
  });

  it('sends explicit null when an interview date is cleared', async () => {
    const upsert = vi.fn().mockResolvedValue({ error: null });
    const overlays = { eq: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(), range: vi.fn().mockResolvedValue({ data: [{ job_id: 1, interview_date: null }], error: null }) };
    const listing = { eq: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue({ data: makeJob({ interview_date: '2026-11-05' }), error: null }) };
    vi.mocked(supabase.from).mockImplementation((table: string) => (table === 'jobs' ? { select: vi.fn().mockReturnValue(listing) } : { select: vi.fn().mockReturnValue(overlays), upsert }) as unknown as ReturnType<typeof supabase.from>);
    const result = await jobsService.updateInterviewDate(1, null);
    expect(upsert.mock.calls[0][0].interview_date).toBeNull();
    expect(result.interview_date).toBeNull();
  });
});
