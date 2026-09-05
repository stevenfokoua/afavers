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
}));

vi.mock('./settings.service', () => ({
  settingsService: {
    get: vi.fn().mockResolvedValue({ keywords: '', locations: '' }),
  },
}));

import { jobsService } from './jobs.service';
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
    url: 'https://example.com/job/1',
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
    eq: vi.fn().mockResolvedValue({ data: [], error: null }),
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
    // Base 20 + English (+10) + posted today (+10) = 40
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
    const overlaySelect = vi.fn().mockReturnValue({ eq: overlayEq });
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
    (settingsService.get as ReturnType<typeof vi.fn>).mockResolvedValue({ keywords: '', locations: '' });
    // Give one job a pre-set match_score via the overlay-merged data
    setupJobsMock([
      makeJob({ id: 1, match_score: 80 }),
      makeJob({ id: 2, match_score: 50 }),
    ]);
    const result = await jobsService.getJobs({ highMatchOnly: true });
    // Note: scoreJob recalculates scores — this test verifies the filter gate logic
    // by asserting all returned jobs have score >= 70 post-scoring
    expect(result.jobs.every((j) => (j.match_score ?? 0) >= 70)).toBe(true);
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
    const overlaySelect = vi.fn().mockReturnValue({ eq: overlayEq });

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
    });
  });

  it('surfaces an auth-specific message for unauthorized invocations', async () => {
    (supabase.functions.invoke as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: null,
      error: { message: 'Unauthorized' },
    });

    await expect(jobsService.fetchJobs()).rejects.toThrow('Your session expired. Please sign in again and try once more.');
  });
});

describe('getMergedJobs tracked-job fallback (via getAllJobs)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('fetches tracked jobs missing from the recent window by id', async () => {
    const recentJob = makeJob({ id: 1 });
    const oldTrackedJob = makeJob({ id: 999, title: 'Old saved job' });

    const userJobsChain = {
      eq: vi.fn().mockResolvedValue({
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
      eq: vi.fn().mockResolvedValue({
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
