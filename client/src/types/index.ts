export interface User {
  id: number;
  email: string;
}

export interface Job {
  id: number;
  external_id: string;
  title: string;
  company: string;
  location: string;
  description: string;
  url: string;
  source: string;
  posted_date: string | null;
  deadline: string | null;
  salary: string | null;
  status: 'new' | 'saved' | 'preparing' | 'applied' | 'followup' | 'interviewing' | 'offered' | 'rejected' | 'archived';
  notes: string | null;
  cover_letter: string | null;
  applied_date: string | null;
  follow_up_date: string | null;
  interview_date: string | null;
  is_hidden: boolean;
  language: 'en' | 'de' | null;
  owner_user_id?: number | null;
  is_manual?: boolean;
  /** False when the upstream feed stopped listing this job (soft-deleted). */
  is_active?: boolean;
  checklist?: Record<string, boolean>;
  history?: JobHistoryEvent[];
  created_at: string;
  updated_at: string;
  match_score?: number;
  match_reasons?: string[];
  match_gaps?: string[];
}

export interface JobHistoryEvent {
  type: 'created' | 'status' | 'note' | 'checklist' | 'interview' | 'manual';
  label: string;
  at: string;
}

export interface DashboardStats {
  total: number;
  new: number;
  saved: number;
  preparing: number;
  applied: number;
  followup: number;
  interviewing: number;
  offered: number;
  rejected: number;
  archived: number;
  new_today: number;
  applied_today: number;
  last_fetch_at: string | null;
}

export interface FollowUpAlert {
  id: number;
  title: string;
  company: string;
  follow_up_date: string;
  status: string;
}

export interface AnalyticsData {
  bySource:   { source: string;   count: number }[];
  byWeek:     { week: string;     count: number }[];
  byStatus:   { status: string;   count: number }[];
  byLocation: { location: string; count: number }[];
  jobs: Job[];
}

export interface JobsResponse {
  jobs: Job[];
  total: number;
  page: number;
  limit: number;
}

export interface JobFilters {
  status?: string;
  source?: string;
  search?: string;
  sortBy?: string;
  sortOrder?: 'ASC' | 'DESC';
  limit?: number;
  offset?: number;
  language?: 'en' | 'de';
  noFilter?: boolean;
  dateFrom?: string;
  remoteOnly?: boolean;
  location?: string;
  studentOnly?: boolean;
  highMatchOnly?: boolean;
}
