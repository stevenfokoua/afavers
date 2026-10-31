import { supabase } from '../lib/supabase';
import { useAuthStore } from '../store/authStore';
import { useReminderStore, type ReminderType } from '../store/reminderStore';
import type { Job, JobsResponse, JobFilters, DashboardStats, FollowUpAlert, AnalyticsData, JobHistoryEvent } from '../types';
import { scheduleReminder, cancelReminder } from './notification.service';
import { settingsService } from './settings.service';
import { feedHealthService } from './feedHealth.service';
import { invalidateJobSnapshot, readJobSearchSnapshot, readJobSnapshot } from './jobSnapshot';
import { discoveryJobs } from '../../../supabase/functions/_shared/job-quality';
import { expandedPreferenceTerms, expandedSearchTerms, HIGH_MATCH_SCORE, isRemoteListing, isStudentListing, keywordMatches, listingSearchScore as searchScore, matchesJobLocation, normalizeMatchText, scoreListing, splitMatchTerms as splitTerms } from '../../../supabase/functions/_shared/matching';
import { confirmedWorkingLanguage } from '../../../supabase/functions/_shared/language';

type UserJobOverlay = Partial<Pick<Job,
  'status' | 'notes' | 'cover_letter' | 'applied_date' | 'follow_up_date' | 'interview_date' | 'is_hidden' | 'checklist' | 'history'
>> & {
  job_id: number;
  updated_at?: string;
};

const TRACKED_STATUSES = ['saved', 'preparing', 'applied', 'followup', 'interviewing', 'offered', 'rejected', 'archived'];
// PostgREST caps a single request at 1000 rows, so asking for more is a no-op.
// Jobs the user has tracked are fetched separately by id in getMergedJobs, so
// they stay visible however large the jobs table grows.
const JOB_FETCH_LIMIT = 1000;
const fullBrowseWindows = new WeakSet<Job[]>();
const SEARCH_MAX_PAGES = 8;
export const APPLICATION_CHECKLIST = [
  'CV tailored',
  'Cover letter ready',
  'Portfolio attached',
  'Certificates attached',
  'Application submitted',
  'Follow-up sent',
];
function getUserId(): number {
  const userId = useAuthStore.getState().user?.id;
  if (!userId) throw new Error('You need to sign in again.');
  return userId;
}

function defaultJob(job: Job): Job {
  return {
    ...job,
    status: job.status ?? 'new',
    notes: job.notes ?? null,
    cover_letter: job.cover_letter ?? null,
    applied_date: job.applied_date ?? null,
    follow_up_date: job.follow_up_date ?? null,
    interview_date: job.interview_date ?? null,
    is_hidden: job.is_hidden ?? false,
    is_active: job.is_active ?? true,
    checklist: job.checklist ?? {},
    history: job.history ?? [],
    language: confirmedWorkingLanguage(job.description ?? ''),
  };
}

function mergeJob(job: Job, overlay?: UserJobOverlay): Job {
  const base = defaultJob(job);
  // Deactivation also updates jobs.updated_at; it is not a feed observation.
  base.last_seen_at = job.source !== 'manual' && !job.is_manual && job.is_active !== false ? job.updated_at : undefined;
  // Retain personal research before a status change, but not the empty row
  // left by hide/undo. Otherwise an expired vacancy would stay "new" forever.
  base.is_tracked = Boolean(overlay && (
    (overlay.status && overlay.status !== 'new') || overlay.is_hidden ||
    overlay.notes?.trim() || overlay.cover_letter?.trim() ||
    overlay.applied_date || overlay.follow_up_date || overlay.interview_date ||
    Object.keys(overlay.checklist ?? {}).length || overlay.history?.length
  ));
  if (!overlay) return base;
  return {
    ...base,
    status: (overlay.status ?? base.status) as Job['status'],
    notes: overlay.notes ?? base.notes,
    cover_letter: overlay.cover_letter ?? base.cover_letter,
    applied_date: overlay.applied_date === undefined ? base.applied_date : overlay.applied_date,
    follow_up_date: overlay.follow_up_date === undefined ? base.follow_up_date : overlay.follow_up_date,
    interview_date: overlay.interview_date === undefined ? base.interview_date : overlay.interview_date,
    is_hidden: overlay.is_hidden ?? base.is_hidden,
    checklist: overlay.checklist ?? base.checklist ?? {},
    history: overlay.history ?? base.history ?? [],
    updated_at: overlay.updated_at ?? base.updated_at,
  };
}

function scoreJob(job: Job, keywords: string[], locations: string[]): Job {
  const match = scoreListing(job, keywords, locations);
  return { ...job, match_score: match.score, match_reasons: match.reasons, match_gaps: match.gaps, match_limitations: match.limitations };
}

function dateInDays(days: number, from?: string): string {
  const date = from ? new Date(`${from}T12:00:00`) : new Date();
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function addJobReminder(job: Pick<Job, 'id' | 'title' | 'company'>, type: ReminderType, title: string, date: string, notes?: string): void {
  const store = useReminderStore.getState();
  const existing = store.reminders.find((reminder) =>
    reminder.linkedJobId === job.id &&
    reminder.type === type &&
    reminder.title === title &&
    !reminder.completed
  );
  if (existing) return;

  const id = store.addReminder({
    title,
    date,
    time: type === 'interview' ? '09:00' : '10:00',
    type,
    linkedJobId: job.id,
    notes: notes || `${job.company} · ${job.title}`,
  });
  scheduleReminder({ id, title, date, time: type === 'interview' ? '09:00' : '10:00', type, completed: false, linkedJobId: job.id, notes }).catch(() => {});
}

function scheduleApplicationReminders(job: Job, appliedDate: string): void {
  addJobReminder(job, 'followup', `Follow up: ${job.company}`, dateInDays(7, appliedDate), '7 days after applying');
  addJobReminder(job, 'followup', `Review response: ${job.company}`, dateInDays(14, appliedDate), 'If there is no answer, follow up or move it on the board.');
  if (job.deadline && job.deadline > appliedDate) {
    addJobReminder(job, 'deadline', `Deadline: ${job.company}`, job.deadline, job.title);
  }
}

async function getUserOverlays(userId: number): Promise<Map<number, UserJobOverlay>> {
  const overlays = new Map<number, UserJobOverlay>();
  for (let from = 0; ; from += JOB_FETCH_LIMIT) {
    const { data, error } = await supabase
      .from('user_jobs')
      .select('job_id,status,notes,cover_letter,applied_date,follow_up_date,interview_date,is_hidden,checklist,history,updated_at')
      .eq('user_id', userId)
      .order('job_id', { ascending: true })
      .range(from, from + JOB_FETCH_LIMIT - 1);
    if (error) throw new Error(error.message);
    for (const row of data ?? []) overlays.set(row.job_id, row as UserJobOverlay);
    if ((data ?? []).length < JOB_FETCH_LIMIT) return overlays;
  }
}

function appendHistory(job: Job, label: string, type: JobHistoryEvent['type'] = 'status'): JobHistoryEvent[] {
  const history = Array.isArray(job.history) ? job.history : [];
  return [
    ...history,
    {
      type,
      label,
      at: new Date().toISOString(),
    },
  ].slice(-80);
}

function applyFilters(jobs: Job[], filters?: JobFilters): Job[] {
  let rows = discoveryJobs(jobs).filter((job) => !job.is_hidden);
  const searchScores = new Map<number, number>();

  if (filters?.status) {
    rows = rows.filter((job) => job.status === filters.status);
  }
  if (filters?.source) {
    rows = rows.filter((job) => job.source === filters.source);
  }
  if (filters?.language) {
    rows = rows.filter((job) => job.language === filters.language);
  }
  if (filters?.remoteOnly) {
    rows = rows.filter(isRemoteListing);
  }
  if (filters?.studentOnly) {
    rows = rows.filter(isStudentListing);
  }
  if (filters?.highMatchOnly) {
    rows = rows.filter((job) => (job.match_score ?? 0) >= HIGH_MATCH_SCORE);
  }
  if (filters?.location) {
    const locations = filters.location.split('|').map((value) => value.trim().toLowerCase()).filter(Boolean);
    rows = rows.filter((job) => locations.some((location) => matchesJobLocation(job.location, location)));
  }
  if (filters?.dateFrom) {
    const from = new Date(filters.dateFrom).getTime();
    rows = rows.filter((job) => job.posted_date ? new Date(job.posted_date).getTime() >= from : false);
  }
  if (filters?.search) {
    rows = rows.filter((job) => {
      const score = searchScore(job, filters.search as string);
      if (score > 0) {
        searchScores.set(job.id, score);
        return true;
      }
      return false;
    });
  }

  const sortBy = filters?.sortBy || 'created_at';
  const sortOrder = filters?.sortOrder || 'DESC';
  rows.sort((a, b) => {
    if (filters?.search) {
      const scoreDiff = (searchScores.get(b.id) ?? 0) - (searchScores.get(a.id) ?? 0);
      if (scoreDiff !== 0) return scoreDiff;
    }

    const av = a[sortBy as keyof Job] ?? '';
    const bv = b[sortBy as keyof Job] ?? '';
    if (typeof av === 'number' || typeof bv === 'number') {
      const result = Number(av) - Number(bv);
      return sortOrder === 'ASC' ? result : -result;
    }
    const result = String(av).localeCompare(String(bv));
    return sortOrder === 'ASC' ? result : -result;
  });

  return rows;
}

function getMergedJobs(): Promise<Job[]> {
  const userId = getUserId();
  return readJobSnapshot(userId, () => loadMergedJobs(userId));
}

async function loadMergedJobs(userId: number): Promise<Job[]> {
  const [{ data: jobs, error }, overlays, settings] = await Promise.all([
    supabase.from('jobs').select('*').order('created_at', { ascending: false }).limit(JOB_FETCH_LIMIT),
    getUserOverlays(userId),
    settingsService.get().catch(() => ({ keywords: '', locations: '' })),
  ]);

  if (error) throw new Error(error.message);

  // The recent-jobs window above only covers the newest rows. Jobs the user
  // has saved/tracked can be older than that window, so fetch them by id —
  // otherwise they silently disappear from every view once the table grows.
  const rows = [...(jobs ?? [])];
  const loadedIds = new Set(rows.map((job) => job.id));
  const missingIds = [...overlays.keys()].filter((id) => !loadedIds.has(id));
  for (let from = 0; from < missingIds.length; from += 150) {
    const { data: tracked, error: trackedError } = await supabase
      .from('jobs')
      .select('*')
      .in('id', missingIds.slice(from, from + 150));
    if (trackedError) throw new Error(trackedError.message);
    rows.push(...(tracked ?? []));
  }

  const keywords = splitTerms(settings.keywords);
  const locations = splitTerms(settings.locations);
  if (getUserId() !== userId) throw new Error('Your account changed. Please reload this page.');
  const merged = rows.map((job) => scoreJob(mergeJob(job, overlays.get(job.id)), keywords, locations));
  if ((jobs ?? []).length === JOB_FETCH_LIMIT) fullBrowseWindows.add(merged);
  return merged;
}

function assertSearchOwner(userId: number): void {
  if (useAuthStore.getState().user?.id !== userId) throw new Error('Your account changed. Please retry your search.');
}

function searchCandidates(userId: number, query: string): Promise<Job[]> {
  return loadCandidates(userId, expandedSearchTerms(query), 'text:' + normalizeMatchText(query));
}

function loadCandidates(userId: number, terms: string[], cacheKey: string): Promise<Job[]> {
  if (!terms.length) return Promise.resolve([]);
  return readJobSearchSnapshot(userId, cacheKey, async () => {
    const deadline = Date.now() + 15_000;
    const candidates: Job[] = [];
    for (let page = 0; page < SEARCH_MAX_PAGES; page++) {
      assertSearchOwner(userId);
      const remaining = deadline - Date.now();
      if (remaining <= 0) throw new Error('Search could not be completed. Refine your search or retry.');
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), Math.min(8_000, remaining));
      try {
        const { data, error } = await supabase.rpc('search_job_candidates', { p_terms: terms })
          .range(page * JOB_FETCH_LIMIT, (page + 1) * JOB_FETCH_LIMIT - 1).abortSignal(controller.signal);
        assertSearchOwner(userId);
        if (error || !Array.isArray(data)) throw new Error('Search could not be completed. Refine your search or retry.');
        candidates.push(...data as Job[]);
        if (data.length < JOB_FETCH_LIMIT) return candidates;
      } finally { clearTimeout(timer); }
    }
    // Never present a truncated candidate window as an exhaustive zero/result count.
    throw new Error('Search has too many candidates. Use a more specific role or keyword.');
  });
}

async function upsertOverlay(id: number, values: Partial<UserJobOverlay>): Promise<Job> {
  const userId = getUserId();
  const { error } = await supabase
    .from('user_jobs')
    .upsert({
      user_id: userId,
      job_id: id,
      ...values,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,job_id' });

  if (error) throw new Error(error.message);
  invalidateJobSnapshot();
  return jobsService.getJob(id);
}

export const jobsService = {
  async getStats(): Promise<DashboardStats> {
    // Listing updates (including deactivation) cannot prove an import finished.
    // Use the feed run ledger rather than labelling jobs.updated_at a success.
    const [jobs, lastFetch] = await Promise.all([
      getMergedJobs(),
      feedHealthService.get().catch(() => null),
    ]);
    const visibleJobs = discoveryJobs(jobs);
    const today = new Date().toISOString().slice(0, 10);
    const lastFetchAt = lastFetch?.last_successful_at ?? null;

    return {
      total: visibleJobs.filter((job) => !job.is_hidden).length,
      new: visibleJobs.filter((job) => !job.is_hidden && job.status === 'new').length,
      saved: jobs.filter((job) => job.status === 'saved').length,
      preparing: jobs.filter((job) => job.status === 'preparing').length,
      applied: jobs.filter((job) => job.status === 'applied').length,
      followup: jobs.filter((job) => job.status === 'followup').length,
      interviewing: jobs.filter((job) => job.status === 'interviewing').length,
      offered: jobs.filter((job) => job.status === 'offered').length,
      rejected: jobs.filter((job) => job.status === 'rejected').length,
      archived: jobs.filter((job) => job.status === 'archived').length,
      new_today: visibleJobs.filter((job) => !job.is_hidden && !job.is_manual && job.source !== 'manual' && job.created_at?.slice(0, 10) === today).length,
      applied_today: jobs.filter((job) => job.applied_date?.slice(0, 10) === today).length,
      last_fetch_at: lastFetchAt,
    };
  },

  async getJobs(filters?: JobFilters): Promise<JobsResponse> {
    const userId = getUserId();
    const query = filters?.search?.trim() ?? '';
    const [base, candidates] = await Promise.all([getMergedJobs(), query ? searchCandidates(userId, query) : Promise.resolve([])]);
    assertSearchOwner(userId);
    const merged = new Map(base.map(job => [job.id, job]));
    if (candidates.length) {
      const settings = await settingsService.get();
      assertSearchOwner(userId);
      const keywords = splitTerms(settings.keywords), locations = splitTerms(settings.locations);
      // Base includes every personal overlay/tracked row, even outside its recent
      // public window. It wins ID collisions so notes/status/private data survive.
      for (const job of candidates) if (!merged.has(job.id)) merged.set(job.id, scoreJob(mergeJob(job), keywords, locations));
    }
    const filtered = applyFilters([...merged.values()], { ...filters, search: query || undefined });
    const offset = filters?.offset ?? 0;
    const limit = filters?.limit ?? 50;
    const jobs = filtered.slice(offset, offset + limit);
    return {
      jobs,
      total: filtered.length,
      page: Math.floor(offset / limit) + 1,
      limit,
      browse_window_limited: !query && fullBrowseWindows.has(base),
    };
  },

  async getRecommendations(filterKeywords: readonly string[] = []): Promise<JobsResponse> {
    const userId = getUserId();
    const [base, settings] = await Promise.all([getMergedJobs(), settingsService.get()]);
    assertSearchOwner(userId);
    const keywords = splitTerms(settings.keywords), locations = splitTerms(settings.locations);
    const alternatives = splitTerms([...keywords, ...filterKeywords].join(','));
    const candidates = alternatives.length
      ? await loadCandidates(userId, expandedPreferenceTerms(alternatives), 'preferences:' + JSON.stringify(alternatives)) : [];
    assertSearchOwner(userId);
    // Rescore against the explicitly loaded preferences, and let every existing
    // personal row win its ID. Older saved/hidden/history rows remain excluded
    // by the same discovery/status rules as the recent review queue.
    const merged = new Map(base.map(job => [job.id, scoreJob(job, keywords, locations)]));
    for (const job of candidates) {
      if (!merged.has(job.id) && keywordMatches(`${job.title} ${job.company ?? ''} ${job.location ?? ''} ${job.description ?? ''}`, alternatives).length) {
        merged.set(job.id, scoreJob(mergeJob(job), keywords, locations));
      }
    }
    const jobs = applyFilters([...merged.values()], { status: 'new', sortBy: 'match_score', sortOrder: 'DESC' });
    return { jobs, total: jobs.length, page: 1, limit: jobs.length, browse_window_limited: !alternatives.length && fullBrowseWindows.has(base) };
  },

  /**
   * Return every merged job for the current user in a single round-trip.
   * Used by views that need all columns/statuses at once (e.g. Kanban board)
   * instead of issuing N status-filtered calls that each refetch everything.
   */
  async getAllJobs(): Promise<Job[]> {
    return discoveryJobs(await getMergedJobs());
  },

  async getJob(id: number): Promise<Job> {
    const userId = getUserId();
    const [{ data: job, error }, overlays, settings] = await Promise.all([
      supabase.from('jobs').select('*').eq('id', id).single(),
      getUserOverlays(userId),
      settingsService.get().catch(() => ({ keywords: '', locations: '' })),
    ]);

    if (error) throw new Error(error.message);
    return scoreJob(mergeJob(job, overlays.get(id)), splitTerms(settings.keywords), splitTerms(settings.locations));
  },

  async updateStatus(
    id: number,
    status: Job['status'],
    appliedDate?: string,
    followUpDate?: string
  ): Promise<Job> {
    const existing = await jobsService.getJob(id);
    const resolvedAppliedDate = status === 'applied' ? (appliedDate ?? existing.applied_date ?? new Date().toISOString().slice(0, 10)) : appliedDate;
    const resolvedFollowUpDate = (status === 'applied' || status === 'followup')
      ? (followUpDate ?? existing.follow_up_date ?? dateInDays(7))
      : followUpDate;
    const label = `Moved to ${status}`;
    const updated = await upsertOverlay(id, {
      status,
      applied_date: resolvedAppliedDate,
      follow_up_date: resolvedFollowUpDate,
      history: appendHistory(existing, label, 'status'),
    });
    if (status === 'applied' && resolvedAppliedDate) scheduleApplicationReminders(updated, resolvedAppliedDate);
    return updated;
  },

  async updateChecklist(id: number, checklist: Record<string, boolean>): Promise<Job> {
    const existing = await jobsService.getJob(id);
    return upsertOverlay(id, {
      checklist,
      history: appendHistory(existing, 'Updated application checklist', 'checklist'),
    });
  },

  async createManualJob(input: {
    title: string;
    company: string;
    location?: string;
    url?: string;
    description?: string;
    salary?: string;
  }): Promise<Job> {
    const userId = getUserId();
    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from('jobs')
      .insert({
        external_id: `manual_${userId}_${Date.now()}`,
        title: input.title.trim(),
        company: input.company.trim(),
        location: input.location?.trim() || 'Not specified',
        description: input.description?.trim() || '',
        url: input.url?.trim() || '',
        source: 'manual',
        posted_date: now.slice(0, 10),
        salary: input.salary?.trim() || null,
        owner_user_id: userId,
        is_manual: true,
      })
      .select('*')
      .single();

    if (error) throw new Error(error.message);
    const { error: overlayError } = await supabase.from('user_jobs').upsert({
      user_id: userId,
      job_id: data.id,
      status: 'saved',
      history: [{ type: 'manual', label: 'Added manually', at: now }],
      updated_at: now,
    }, { onConflict: 'user_id,job_id' });
    if (overlayError) throw new Error(overlayError.message);
    invalidateJobSnapshot();
    return jobsService.getJob(data.id);
  },

  async markApplySoon(id: number): Promise<Job> {
    const updated = await jobsService.updateStatus(id, 'saved');
    addJobReminder(updated, 'custom', `Apply soon: ${updated.company}`, dateInDays(1), updated.title);
    return updated;
  },

  async updateNotes(id: number, notes: string): Promise<Job> {
    const existing = await jobsService.getJob(id);
    return upsertOverlay(id, { notes, history: appendHistory(existing, 'Updated notes', 'note') });
  },

  async toggleHidden(id: number, isHidden: boolean): Promise<Job> {
    return upsertOverlay(id, { is_hidden: isHidden });
  },

  async deleteJob(id: number): Promise<void> {
    const userId = getUserId();
    const { error } = await supabase
      .from('user_jobs')
      .delete()
      .eq('user_id', userId)
      .eq('job_id', id);
    if (error) throw new Error(error.message);
    invalidateJobSnapshot();
  },

  async fetchJobs(): Promise<{ success: boolean; message: string; inserted: number; updated: number; total: number; complete: boolean }> {
    const { data, error } = await supabase.functions.invoke<{
      success: boolean;
      inserted: number;
      updated?: number;
      total?: number;
      complete?: boolean;
      outcome?: string;
      error?: string;
    }>('fetch-jobs', { body: {} });

    if (error) {
      const message = /unauthorized/i.test(error.message)
        ? 'Your session expired. Please sign in again and try once more.'
        : error.message;
      throw new Error(message);
    }
    if (!data) throw new Error('We could not refresh jobs right now. Please try again in a moment.');
    if (!data.success) {
      const message = data.error === 'Unauthorized'
        ? 'Your session expired. Please sign in again and try once more.'
        : data.error || 'We could not refresh jobs right now. Please try again in a moment.';
      throw new Error(message);
    }
    invalidateJobSnapshot();
    feedHealthService.invalidate();
    const complete = data.complete !== false && data.outcome !== 'partial';
    return {
      success: true,
      message: complete ? 'Job refresh completed' : 'Available jobs refreshed; some searches were incomplete.',
      inserted: data.inserted ?? 0,
      updated: data.updated ?? 0,
      total: data.total ?? 0,
      complete,
    };
  },

  async updateCoverLetter(id: number, coverLetter: string): Promise<Job> {
    return upsertOverlay(id, { cover_letter: coverLetter });
  },

  async updateInterviewDate(id: number, interviewDate: string | null): Promise<Job> {
    const updated = await upsertOverlay(id, { interview_date: interviewDate });
    const reminderStore = useReminderStore.getState();
    for (const reminder of reminderStore.reminders.filter((item) => item.linkedJobId === id && item.type === 'interview' && !item.completed)) {
      await cancelReminder(reminder.id);
      reminderStore.removeReminder(reminder.id);
    }
    if (interviewDate) {
      addJobReminder(updated, 'interview', `Prepare interview: ${updated.company}`, dateInDays(-1, interviewDate), updated.title);
    }
    return updated;
  },

  async getFollowUps(): Promise<FollowUpAlert[]> {
    const today = new Date().toISOString().slice(0, 10);
    return (await getMergedJobs())
      .filter((job) => job.follow_up_date && job.follow_up_date <= today && TRACKED_STATUSES.includes(job.status))
      .map((job) => ({
        id: job.id,
        title: job.title,
        company: job.company,
        follow_up_date: job.follow_up_date!,
        status: job.status,
      }));
  },

  async getAnalytics(): Promise<AnalyticsData> {
    const jobs = (await getMergedJobs()).filter((job) => TRACKED_STATUSES.includes(job.status));
    const countBy = (key: keyof Job) => Object.entries(jobs.reduce<Record<string, number>>((acc, job) => {
      const value = String(job[key] ?? 'Unknown');
      acc[value] = (acc[value] ?? 0) + 1;
      return acc;
    }, {}));

    return {
      bySource: countBy('source').map(([source, count]) => ({ source, count })),
      byStatus: countBy('status').map(([status, count]) => ({ status, count })),
      byLocation: countBy('location').map(([location, count]) => ({ location, count })),
      byWeek: Object.entries(jobs.reduce<Record<string, number>>((acc, job) => {
        const date = job.applied_date ?? job.created_at;
        const week = date ? date.slice(0, 10) : 'Unknown';
        acc[week] = (acc[week] ?? 0) + 1;
        return acc;
      }, {})).map(([week, count]) => ({ week, count })),
      jobs: jobs.sort((a, b) => {
        const aDate = a.applied_date ?? a.updated_at ?? a.created_at;
        const bDate = b.applied_date ?? b.updated_at ?? b.created_at;
        return String(bDate).localeCompare(String(aDate));
      }),
    };
  },

  async exportCsv(): Promise<void> {
    const jobs = (await getMergedJobs()).filter((job) => TRACKED_STATUSES.includes(job.status));
    const escape = (value: unknown) => {
      if (value == null) return '';
      const text = String(value);
      return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
    };
    const headers = ['Title','Company','Location','Source','Status','Applied Date','URL','Posted Date','Salary','Deadline'];
    const csv = [
      headers.join(','),
      ...jobs.map((job) => [
        job.title, job.company, job.location, job.source, job.status,
        job.applied_date, job.url, job.posted_date, job.salary, job.deadline,
      ].map(escape).join(',')),
    ].join('\n');

    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'afavers-applications.csv';
    a.click();
    URL.revokeObjectURL(url);
  },
};
