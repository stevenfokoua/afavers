import { supabase } from '../lib/supabase';
import { useAuthStore } from '../store/authStore';
import { useReminderStore, type ReminderType } from '../store/reminderStore';
import type { Job, JobsResponse, JobFilters, DashboardStats, FollowUpAlert, AnalyticsData, JobHistoryEvent } from '../types';
import { scheduleReminder } from './notification.service';
import { settingsService } from './settings.service';
import { escapeCsv, downloadBlob } from '../utils/exportFormat';

type UserJobOverlay = Partial<Pick<Job,
  'status' | 'notes' | 'cover_letter' | 'applied_date' | 'follow_up_date' | 'interview_date' | 'is_hidden' | 'checklist' | 'history'
>> & {
  job_id: number;
  updated_at?: string;
};

const TRACKED_STATUSES = ['saved', 'preparing', 'applied', 'followup', 'interviewing', 'offered', 'rejected', 'archived'];
export const APPLICATION_CHECKLIST = [
  'CV tailored',
  'Cover letter ready',
  'Portfolio attached',
  'Certificates attached',
  'Application submitted',
  'Follow-up sent',
];
const STUDENT_TERMS = ['werkstudent', 'working student', 'studentische', 'student assistant', 'praktikum', 'internship'];
const REMOTE_TERMS = ['remote', 'homeoffice', 'home office', 'hybrid', 'mobiles arbeiten'];
const SENIOR_TERMS = ['senior', 'lead', 'leiter', 'leitung', 'principal', 'head of'];

function getUserId(): number {
  const userId = useAuthStore.getState().user?.id;
  if (!userId) throw new Error('You need to sign in again.');
  return userId;
}

function defaultJob(job: any): Job {
  return {
    ...job,
    status: job.status ?? 'new',
    notes: job.notes ?? null,
    cover_letter: job.cover_letter ?? null,
    applied_date: job.applied_date ?? null,
    follow_up_date: job.follow_up_date ?? null,
    interview_date: job.interview_date ?? null,
    is_hidden: job.is_hidden ?? false,
    checklist: job.checklist ?? {},
    history: job.history ?? [],
  };
}

function mergeJob(job: any, overlay?: UserJobOverlay): Job {
  const base = defaultJob(job);
  if (!overlay) return base;
  return {
    ...base,
    status: (overlay.status ?? base.status) as Job['status'],
    notes: overlay.notes ?? base.notes,
    cover_letter: overlay.cover_letter ?? base.cover_letter,
    applied_date: overlay.applied_date ?? base.applied_date,
    follow_up_date: overlay.follow_up_date ?? base.follow_up_date,
    interview_date: overlay.interview_date ?? base.interview_date,
    is_hidden: overlay.is_hidden ?? base.is_hidden,
    checklist: overlay.checklist ?? base.checklist ?? {},
    history: overlay.history ?? base.history ?? [],
    updated_at: overlay.updated_at ?? base.updated_at,
  };
}

function splitTerms(value: string): string[] {
  return value
    .split(',')
    .map((term) => term.trim().toLowerCase())
    .filter(Boolean);
}

function containsAny(text: string, terms: string[]): boolean {
  return terms.some((term) => text.includes(term));
}

function scoreJob(job: Job, keywords: string[], locations: string[]): Job {
  const text = `${job.title} ${job.company} ${job.location} ${job.description}`.toLowerCase();
  const reasons: string[] = [];
  const gaps: string[] = [];
  let score = 20;

  const keywordHits = keywords.filter((term) => text.includes(term));
  if (keywordHits.length > 0) {
    score += Math.min(35, keywordHits.length * 12);
    reasons.push(`Keyword: ${keywordHits.slice(0, 2).join(', ')}`);
  } else if (keywords.length > 0) {
    gaps.push('No saved keyword hit');
  }

  const locationHits = locations.filter((term) => job.location?.toLowerCase().includes(term));
  if (locationHits.length > 0) {
    score += 20;
    reasons.push(`Location: ${locationHits[0]}`);
  } else if (locations.length > 0 && !containsAny(text, REMOTE_TERMS)) {
    gaps.push('Outside your saved cities');
  }

  if (job.language === 'en') {
    score += 10;
    reasons.push('Working language: English');
  } else if (keywords.some((term) => term.includes('english')) && job.language === 'de') {
    gaps.push('Likely German-language role');
  }

  if (containsAny(text, REMOTE_TERMS)) {
    score += 10;
    reasons.push('Remote-friendly');
  }

  if (containsAny(text, STUDENT_TERMS)) {
    score += 8;
    reasons.push('Werkstudent');
  }

  if (containsAny(text, SENIOR_TERMS) && keywords.some((term) => ['junior', 'entry', 'werkstudent', 'praktikum', 'internship'].includes(term))) {
    score -= 8;
    gaps.push('May be senior-level');
  }

  if (job.posted_date) {
    const ageDays = Math.floor((Date.now() - new Date(job.posted_date).getTime()) / 86400000);
    if (ageDays <= 7) {
      score += 10;
      reasons.push('Fresh');
    } else if (ageDays <= 30) {
      score += 5;
    }
  }

  return {
    ...job,
    match_score: Math.max(0, Math.min(100, score)),
    match_reasons: reasons.slice(0, 5),
    match_gaps: gaps.slice(0, 3),
  };
}

function dateInDays(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
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
  addJobReminder(job, 'followup', `Follow up: ${job.company}`, dateInDays(7), '7 days after applying');
  addJobReminder(job, 'followup', `Review response: ${job.company}`, dateInDays(14), 'If there is no answer, follow up or move it on the board.');
  if (job.deadline && job.deadline > appliedDate) {
    addJobReminder(job, 'deadline', `Deadline: ${job.company}`, job.deadline, job.title);
  }
}

async function getUserOverlays(userId: number): Promise<Map<number, UserJobOverlay>> {
  const { data, error } = await supabase
    .from('user_jobs')
    .select('job_id,status,notes,cover_letter,applied_date,follow_up_date,interview_date,is_hidden,checklist,history,updated_at')
    .eq('user_id', userId);

  if (error) throw new Error(error.message);
  return new Map((data ?? []).map((row) => [row.job_id, row as UserJobOverlay]));
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
  let rows = jobs.filter((job) => !job.is_hidden);

  if (filters?.status) {
    rows = rows.filter((job) => job.status === filters.status);
  }
  if (filters?.source) {
    rows = rows.filter((job) => job.source === filters.source);
  }
  if (filters?.language) {
    rows = rows.filter((job) => job.language === filters.language);
  }
  if (filters?.englishOnly) {
    rows = rows.filter((job) => job.language === 'en');
  }
  if (filters?.remoteOnly) {
    rows = rows.filter((job) => containsAny(`${job.location} ${job.title} ${job.description}`.toLowerCase(), REMOTE_TERMS));
  }
  if (filters?.studentOnly) {
    rows = rows.filter((job) => {
      const text = `${job.title} ${job.company} ${job.description}`.toLowerCase();
      return containsAny(text, STUDENT_TERMS);
    });
  }
  if (filters?.highMatchOnly) {
    rows = rows.filter((job) => (job.match_score ?? 0) >= 70);
  }
  if (filters?.location) {
    const locations = filters.location.split('|').map((value) => value.trim().toLowerCase()).filter(Boolean);
    rows = rows.filter((job) => locations.some((location) => job.location?.toLowerCase().includes(location)));
  }
  if (filters?.dateFrom) {
    const from = new Date(filters.dateFrom).getTime();
    rows = rows.filter((job) => job.posted_date ? new Date(job.posted_date).getTime() >= from : false);
  }
  if (filters?.search) {
    const q = filters.search.toLowerCase();
    rows = rows.filter((job) =>
      [job.title, job.company, job.location, job.description, job.source]
        .some((value) => value?.toLowerCase().includes(q))
    );
  }

  const sortBy = filters?.sortBy || 'created_at';
  const sortOrder = filters?.sortOrder || 'DESC';
  rows.sort((a, b) => {
    const av = (a as any)[sortBy] ?? '';
    const bv = (b as any)[sortBy] ?? '';
    if (typeof av === 'number' || typeof bv === 'number') {
      const result = Number(av) - Number(bv);
      return sortOrder === 'ASC' ? result : -result;
    }
    const result = String(av).localeCompare(String(bv));
    return sortOrder === 'ASC' ? result : -result;
  });

  return rows;
}

async function getMergedJobs(): Promise<Job[]> {
  const userId = getUserId();
  const [{ data: jobs, error }, overlays, settings] = await Promise.all([
    supabase.from('jobs').select('*').order('created_at', { ascending: false }).limit(1000),
    getUserOverlays(userId),
    settingsService.get().catch(() => ({ keywords: '', locations: '' })),
  ]);

  if (error) throw new Error(error.message);
  const keywords = splitTerms(settings.keywords);
  const locations = splitTerms(settings.locations);
  return (jobs ?? []).map((job) => scoreJob(mergeJob(job, overlays.get(job.id)), keywords, locations));
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
  return jobsService.getJob(id);
}

export const jobsService = {
  async getStats(): Promise<DashboardStats> {
    const jobs = await getMergedJobs();
    const today = new Date().toISOString().slice(0, 10);
    return {
      total: jobs.filter((job) => !job.is_hidden).length,
      new: jobs.filter((job) => job.status === 'new').length,
      saved: jobs.filter((job) => job.status === 'saved').length,
      preparing: jobs.filter((job) => job.status === 'preparing').length,
      applied: jobs.filter((job) => job.status === 'applied').length,
      followup: jobs.filter((job) => job.status === 'followup').length,
      interviewing: jobs.filter((job) => job.status === 'interviewing').length,
      offered: jobs.filter((job) => job.status === 'offered').length,
      rejected: jobs.filter((job) => job.status === 'rejected').length,
      archived: jobs.filter((job) => job.status === 'archived').length,
      new_today: jobs.filter((job) => job.created_at?.slice(0, 10) === today).length,
      applied_today: jobs.filter((job) => job.applied_date?.slice(0, 10) === today).length,
    };
  },

  async getJobs(filters?: JobFilters): Promise<JobsResponse> {
    const filtered = applyFilters(await getMergedJobs(), filters);
    const offset = filters?.offset ?? 0;
    const limit = filters?.limit ?? 50;
    const jobs = filtered.slice(offset, offset + limit);
    return {
      jobs,
      total: filtered.length,
      page: Math.floor(offset / limit) + 1,
      limit,
    };
  },

  /**
   * Return every merged job for the current user in a single round-trip.
   * Used by views that need all columns/statuses at once (e.g. Kanban board)
   * instead of issuing N status-filtered calls that each refetch everything.
   */
  async getAllJobs(): Promise<Job[]> {
    return getMergedJobs();
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
  },

  async updateCoverLetter(id: number, coverLetter: string): Promise<Job> {
    return upsertOverlay(id, { cover_letter: coverLetter });
  },

  async updateInterviewDate(id: number, interviewDate: string | null): Promise<Job> {
    const updated = await upsertOverlay(id, { interview_date: interviewDate ?? undefined });
    if (interviewDate) {
      const reminderDate = new Date(`${interviewDate}T00:00:00`);
      reminderDate.setDate(reminderDate.getDate() - 1);
      addJobReminder(updated, 'interview', `Prepare interview: ${updated.company}`, reminderDate.toISOString().slice(0, 10), updated.title);
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
      jobs,
    };
  },

  async exportCsv(): Promise<void> {
    const jobs = (await getMergedJobs()).filter((job) => TRACKED_STATUSES.includes(job.status));
    const headers = ['Title','Company','Location','Source','Status','Applied Date','URL','Posted Date','Salary','Deadline'];
    const csv = [
      headers.join(','),
      ...jobs.map((job) => [
        job.title, job.company, job.location, job.source, job.status,
        job.applied_date, job.url, job.posted_date, job.salary, job.deadline,
      ].map(escapeCsv).join(',')),
    ].join('\n');

    downloadBlob(csv, 'text/csv;charset=utf-8', 'afavers-applications.csv');
  },
};
