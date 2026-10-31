import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { jobsService } from '../services/jobs.service';
import type { Job } from '../types';
import { useLanguage } from '../store/languageStore';
import { useSwipeAction } from '../hooks/useSwipeAction';

const stripHtml = (html: string) => html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

const deadlineUrgency = (deadline: string | null): string => {
  if (!deadline) return '';
  const days = Math.ceil((new Date(deadline).getTime() - Date.now()) / 86400000);
  if (days < 0)  return 'border-line bg-danger-soft';
  if (days <= 3) return 'border-line bg-danger-soft';
  if (days <= 7) return 'border-line bg-subtle';
  return '';
};

const STATUS_COLORS: Record<string, string> = {
  new:          'bg-subtle text-muted',
  saved:        'bg-subtle text-muted',
  preparing:    'bg-subtle text-muted',
  applied:      'bg-subtle text-accent',
  followup:     'bg-subtle text-muted',
  interviewing: 'bg-subtle text-muted',
  offered:      'bg-subtle text-accent',
  rejected:     'bg-danger-soft text-danger',
  archived:     'bg-subtle text-muted',
};

const SOURCE_BADGES: Record<string, { label: string; cls: string }> = {
  bundesagentur: { label: 'Bundesagentur', cls: 'bg-subtle text-muted border-line' },
  stepstone:     { label: 'StepStone',     cls: 'bg-subtle text-muted border-line' },
  adzuna:        { label: 'Adzuna',        cls: 'bg-subtle text-muted border-line' },
};

const SourceBadge = ({ source }: { source: string }) => {
  const badge = SOURCE_BADGES[source.toLowerCase()] ?? { label: source, cls: 'bg-subtle text-muted border-line' };
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-medium border ${badge.cls}`}>
      {badge.label}
    </span>
  );
};

/** Wraps a job card with swipe-to-save (right) and swipe-to-hide (left) gestures. */
const SwipeableCard = ({
  onSave,
  onHide,
  children,
}: {
  onSave?: () => void;
  onHide: () => void;
  children: React.ReactNode;
}) => {
  const { touchHandlers, cardStyle, bgOpacity, action } = useSwipeAction(
    onSave ?? (() => {}),
    onHide,
  );
  const visibleAction = action === 'save' && !onSave ? null : action;

  return (
    <div className="relative overflow-hidden rounded-lg">
      {visibleAction && (
        <div
          className={`absolute inset-0 flex items-center ${
            visibleAction === 'save' ? 'pl-5 bg-ink' : 'justify-end pr-5 bg-gray-400'
          }`}
          style={{ opacity: bgOpacity }}
        >
          <span className="text-on-ink text-sm font-semibold select-none">
            {visibleAction === 'save' ? ' Save' : 'Hide ✕'}
          </span>
        </div>
      )}
      <div {...touchHandlers} style={cardStyle}>
        {children}
      </div>
    </div>
  );
};

const LIMIT = 50;

export const EnglishJobsPage = () => {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [actionLoading, setActionLoading] = useState<number | null>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounce search
  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      setSearch(searchInput);
      setPage(1);
    }, 400);
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current); };
  }, [searchInput]);

  useEffect(() => {
    fetchJobs();
  }, [search, page]);

  const fetchJobs = async () => {
    try {
      setLoading(true);
      const response = await jobsService.getJobs({
        language: 'en',
        noFilter: true,
        limit: LIMIT,
        offset: (page - 1) * LIMIT,
        sortBy: 'created_at',
        sortOrder: 'DESC',
        search: search || undefined,
      });
      setJobs(response.jobs);
      setTotal(response.total);
    } catch (error) {
      console.error('Failed to fetch English jobs:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (job: Job) => {
    setActionLoading(job.id);
    try {
      await jobsService.updateStatus(job.id, 'saved');
      setJobs(prev => prev.map(j => j.id === job.id ? { ...j, status: 'saved' } : j));
    } catch {}
    setActionLoading(null);
  };

  const handleHide = async (job: Job) => {
    setActionLoading(job.id);
    try {
      await jobsService.toggleHidden(job.id, true);
      setJobs(prev => prev.filter(j => j.id !== job.id));
      setTotal(prev => prev - 1);
    } catch {}
    setActionLoading(null);
  };

  const totalPages = Math.ceil(total / LIMIT);

  return (
    <div className="min-h-screen bg-canvas">
      {/* Page header */}
      <div className="bg-surface border-b border-line px-6 py-5">
        <div className="flex items-center gap-3">
          <span className="text-2xl">🇬🇧</span>
          <div>
            <h1 className="text-xl font-semibold text-ink">{t('englishJobsTitle')}</h1>
            <p className="text-xs text-muted mt-0.5">{t('englishJobsDesc')}</p>
          </div>
        </div>
      </div>

      {/* Search bar */}
      <div className="max-w-5xl mx-auto px-6 py-4">
        <div className="relative">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder={t('searchPlaceholder')}
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 border border-line rounded-lg focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:border-transparent outline-none text-sm bg-surface"
          />
        </div>
        <p className="text-xs text-muted mt-2">{total.toLocaleString()} {t('jobs').toLowerCase()}</p>
      </div>

      {/* Jobs list */}
      <main className="max-w-5xl mx-auto px-6 pb-12">
        {loading ? (
          <div className="text-center py-16">
            <p role="status">{t('loading')}</p>
            <p className="text-muted mt-3 text-sm">{t('loadingJobs')}</p>
          </div>
        ) : jobs.length === 0 ? (
          <div className="bg-surface rounded-lg border border-line p-16 text-center">
            <p className="text-4xl mb-4">🇬🇧</p>
            <p className="text-muted text-lg font-medium">{t('noEnglishJobs')}</p>
            <p className="text-muted text-sm mt-2">{t('noEnglishJobsHint')}</p>
            <button
              onClick={() => navigate('/dashboard')}
              className="mt-6 px-5 py-2 bg-ink hover:bg-ink text-on-ink text-sm font-medium rounded-lg transition"
            >
              ← {t('dashboard')}
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            {jobs.map(job => (
              <SwipeableCard
                key={job.id}
                onSave={job.status === 'new' ? () => handleSave(job) : undefined}
                onHide={() => handleHide(job)}
              >
                <div
                  onClick={() => navigate(`/jobs/${job.id}`)}
                  className={`bg-surface rounded-lg border p-5 hover:shadow-none transition cursor-pointer ${deadlineUrgency(job.deadline) || 'border-line hover:border-line'}`}
                >
                  <div className="flex items-start gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <h3 className="font-semibold text-ink leading-snug">{job.title}</h3>
                          <p className="text-sm text-muted mt-0.5">{job.company} · {job.location}</p>
                        </div>
                        {job.status !== 'new' && (
                          <span className={`shrink-0 px-2.5 py-0.5 rounded-md text-xs font-medium ${STATUS_COLORS[job.status]}`}>
                            {t(job.status)}
                          </span>
                        )}
                      </div>

                      {job.description && (
                        <p className="text-sm text-muted mt-2 line-clamp-2 leading-relaxed">
                          {stripHtml(job.description)}
                        </p>
                      )}

                      <div className="flex items-center gap-3 mt-3 text-xs text-muted flex-wrap">
                        <SourceBadge source={job.source} />
                        {job.posted_date && (
                          <span>{t('posted')} {new Date(job.posted_date).toLocaleDateString('en-GB')}</span>
                        )}
                        {job.deadline && (
                          <span className="text-muted font-medium">
                            {t('deadline')} {new Date(job.deadline).toLocaleDateString('en-GB')}
                          </span>
                        )}
                        {job.salary && (
                          <span className="text-accent font-medium">{job.salary}</span>
                        )}
                      </div>
                    </div>

                    <div
                      className="flex flex-col gap-2 shrink-0"
                      onClick={e => e.stopPropagation()}
                    >
                      {job.status === 'new' && (
                        <button
                          onClick={e => { e.stopPropagation(); handleSave(job); }}
                          disabled={actionLoading === job.id}
                          className="px-3 py-1.5 text-sm font-medium bg-subtle hover:bg-subtle text-muted border border-line rounded-lg transition disabled:opacity-40"
                        >
                           {t('save')}
                        </button>
                      )}
                      <button
                        onClick={e => { e.stopPropagation(); handleHide(job); }}
                        disabled={actionLoading === job.id}
                        className="px-3 py-1.5 text-sm font-medium text-muted hover:text-danger bg-canvas hover:bg-danger-soft border border-line hover:border-line rounded-lg transition disabled:opacity-40"
                      >
                        ✕ {t('hide')}
                      </button>
                    </div>
                  </div>
                </div>
              </SwipeableCard>
            ))}
          </div>
        )}

        {totalPages > 1 && (
          <div className="flex justify-center items-center gap-3 mt-8">
            <button
              onClick={() => { setPage(p => p - 1); window.scrollTo(0, 0); }}
              disabled={page === 1}
              className="px-4 py-2 border border-line rounded-lg text-sm hover:bg-canvas disabled:opacity-40 disabled:cursor-not-allowed transition"
            >
              ← {t('prev')}
            </button>
            <span className="text-sm text-muted">
              {t('page')} {page} {t('of')} {totalPages}
            </span>
            <button
              onClick={() => { setPage(p => p + 1); window.scrollTo(0, 0); }}
              disabled={page === totalPages}
              className="px-4 py-2 border border-line rounded-lg text-sm hover:bg-canvas disabled:opacity-40 disabled:cursor-not-allowed transition"
            >
              {t('next')} →
            </button>
          </div>
        )}
      </main>
    </div>
  );
};
