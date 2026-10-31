import type { JobFilters } from '../../types';
import type { SavedSearchFilters } from '../../store/savedSearchStore';
export const JOB_TABS = ['new', 'saved', 'preparing', 'applied', 'followup', 'interviewing', 'all'] as const;
export const JOB_SORTS = ['posted_date', 'match_score', 'created_at', 'deadline', 'title', 'company'] as const;
export type JobSearch = SavedSearchFilters & {
  page: number;
};
export function readJobSearch(params: URLSearchParams): JobSearch {
  const tab = params.get('tab') ?? 'new',
    sort = params.get('sort') ?? 'posted_date',
    days = params.get('days') ?? '';
  return {
    tab: JOB_TABS.includes(tab as typeof JOB_TABS[number]) ? tab : 'new',
    search: (params.get('search') ?? '').slice(0, 250),
    sortBy: JOB_SORTS.includes(sort as typeof JOB_SORTS[number]) ? sort : 'posted_date',
    source: params.get('source') ?? '',
    dateDays: ['', '7', '30', '90'].includes(days) ? days : '',
    remoteOnly: params.get('remote') === '1',
    studentOnly: params.get('student') === '1' || params.get('type') === 'werkstudent',
    highMatchOnly: params.get('match') === 'high' || params.get('type') === 'hot',
    location: params.get('location') ?? '',
    page: Math.max(1, Math.min(100000, Math.floor(Number(params.get('page'))) || 1))
  };
}
export function writeJobSearch(search: JobSearch, previous: URLSearchParams) {
  const params = new URLSearchParams(previous);
  params.delete('type');
  const values = {
    tab: search.tab,
    search: search.search,
    sort: search.sortBy,
    source: search.source,
    days: search.dateDays,
    remote: search.remoteOnly ? '1' : '',
    student: search.studentOnly ? '1' : '',
    match: search.highMatchOnly ? 'high' : '',
    location: search.location,
    page: search.page > 1 ? String(search.page) : ''
  };
  Object.entries(values).forEach(([key, value]) => {
    if (value) params.set(key, value);else params.delete(key);
  });
  return params;
}
export function jobFilters(search: JobSearch): JobFilters {
  const date = new Date();
  if (search.dateDays) date.setDate(date.getDate() - Number(search.dateDays));
  return {
    limit: 50,
    offset: (search.page - 1) * 50,
    search: search.search || undefined,
    status: search.tab === 'all' ? undefined : search.tab,
    noFilter: search.tab === 'all' || undefined,
    sortBy: search.sortBy,
    sortOrder: ['title', 'company', 'deadline'].includes(search.sortBy) ? 'ASC' : 'DESC',
    source: search.source || undefined,
    dateFrom: search.dateDays ? date.toISOString().slice(0, 10) : undefined,
    remoteOnly: search.remoteOnly || undefined,
    studentOnly: search.studentOnly || undefined,
    highMatchOnly: search.highMatchOnly || undefined,
    location: search.location || undefined
  };
}
let owner: number | null = null;
const anchors = new Map<string, {
  id: number;
  y: number;
}>();
export function rememberJobReturn(account: number | null, url: string, id: number) {
  if (owner !== account) {
    anchors.clear();
    owner = account;
  }
  anchors.set(url, {
    id,
    y: window.scrollY
  });
  if (anchors.size > 12) anchors.delete(anchors.keys().next().value!);
}
export function consumeJobReturn(account: number | null, url: string) {
  if (owner !== account) {
    anchors.clear();
    owner = account;
  }
  const value = anchors.get(url);
  anchors.delete(url);
  return value;
}
