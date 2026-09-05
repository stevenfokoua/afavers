import { useState, useEffect, useRef, type FormEvent } from 'react';
import { jobsService } from '../services/jobs.service';
import type { Job, JobFilters, DashboardStats } from '../types';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useLanguage } from '../store/languageStore';
import { useSwipeAction } from '../hooks/useSwipeAction';
import { useToastStore } from '../store/toastStore';

type Tab = 'new' | 'saved' | 'preparing' | 'applied' | 'followup' | 'interviewing' | 'all';

const STATUS_COLORS: Record<string, string> = {
  new:          'bg-blue-100 text-blue-700',
  saved:        'bg-yellow-100 text-yellow-700',
  preparing:    'bg-blue-100 text-blue-700',
  applied:      'bg-green-100 text-green-700',
  followup:     'bg-orange-100 text-orange-700',
  interviewing: 'bg-purple-100 text-purple-700',
  offered:      'bg-emerald-100 text-emerald-700',
  rejected:     'bg-red-100 text-red-600',
  archived:     'bg-gray-100 text-gray-600',
};

const SOURCE_BADGES: Record<string, { label: string; cls: string }> = {
  bundesagentur: { label: 'Bundesagentur', cls: 'bg-blue-50 text-blue-600 border-blue-200' },
  stepstone:     { label: 'StepStone',     cls: 'bg-orange-50 text-orange-600 border-orange-200' },
  adzuna:        { label: 'Adzuna',        cls: 'bg-purple-50 text-purple-600 border-purple-200' },
};

const SourceBadge = ({ source }: { source: string }) => {
  const badge = SOURCE_BADGES[source.toLowerCase()] ?? { label: source, cls: 'bg-gray-100 text-gray-500 border-gray-200' };
  return (
    <span className={`px-2 py-0.5 rounded-md text-xs font-medium border ${badge.cls}`}>
      {badge.label}
    </span>
  );
};

const MatchBadge = ({ score, reasons = [], gaps = [] }: { score?: number; reasons?: string[]; gaps?: string[] }) => {
  if (!score) return null;
  const strong = score >= 70;
  const good = score >= 50;
  const label = strong ? 'Strong match' : good ? 'Good match' : 'Possible match';
  const cls = strong
    ? 'bg-green-50 text-green-700 border-green-200'
    : good
      ? 'bg-blue-50 text-blue-700 border-blue-200'
      : 'bg-gray-50 text-gray-500 border-gray-200';

  return (
    <span
      className={`px-2 py-0.5 rounded-md text-xs font-bold border ${cls}`}
      title={[...reasons, ...gaps.map(gap => `Missing: ${gap}`)].join(' • ')}
    >
      {score}% {label}
    </span>
  );
};

const MatchInsights = ({ score, reasons = [], gaps = [] }: { score?: number; reasons?: string[]; gaps?: string[] }) => {
  if (!score || (!reasons.length && !gaps.length)) return null;
  return (
    <div className="mt-3 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <span className="text-xs font-bold text-gray-700">Why this job</span>
        <span className={`text-xs font-black ${score >= 70 ? 'text-green-700' : score >= 50 ? 'text-blue-700' : 'text-gray-500'}`}>
          {score}% match
        </span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {reasons.slice(0, 3).map(reason => (
          <span key={reason} className="px-2 py-0.5 rounded-full bg-white border border-green-100 text-[11px] font-semibold text-green-700">
            {reason}
          </span>
        ))}
        {gaps.slice(0, 2).map(gap => (
          <span key={gap} className="px-2 py-0.5 rounded-full bg-white border border-amber-100 text-[11px] font-semibold text-amber-700">
            Missing: {gap}
          </span>
        ))}
      </div>
    </div>
  );
};

const stripHtml = (html: string) => html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

function timeAgo(dateStr: string, locale = 'en'): string {
  const days = Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  if (days === 0)  return rtf.format(0, 'day');
  if (days < 7)   return rtf.format(-days, 'day');
  if (days < 30)  return rtf.format(-Math.floor(days / 7), 'week');
  if (days < 365) return rtf.format(-Math.floor(days / 30), 'month');
  return rtf.format(-Math.floor(days / 365), 'year');
}

const deadlineUrgency = (deadline: string | null): string => {
  if (!deadline) return '';
  const days = Math.ceil((new Date(deadline).getTime() - Date.now()) / 86400000);
  if (days < 0)  return 'border-red-400 bg-red-50';
  if (days <= 3) return 'border-red-300 bg-red-50';
  if (days <= 7) return 'border-orange-300 bg-orange-50';
  return '';
};

const STATE_CITIES: Record<string, string[]> = {
  'Nordrhein-Westfalen': ['Düsseldorf', 'Köln', 'Essen', 'Dortmund', 'Bochum', 'Wuppertal', 'Bielefeld', 'Bonn', 'Münster', 'Duisburg', 'Gelsenkirchen', 'Oberhausen', 'Aachen', 'NRW', 'Nordrhein-Westfalen'],
  'Bayern':              ['München', 'Nürnberg', 'Augsburg', 'Regensburg', 'Ingolstadt', 'Würzburg', 'Bayern', 'Bavaria'],
  'Baden-Württemberg':   ['Stuttgart', 'Mannheim', 'Karlsruhe', 'Freiburg', 'Heidelberg', 'Ulm', 'Baden-Württemberg'],
  'Hessen':              ['Frankfurt', 'Wiesbaden', 'Kassel', 'Darmstadt', 'Offenbach', 'Hessen'],
  'Hamburg':             ['Hamburg'],
  'Berlin':              ['Berlin'],
  'Sachsen':             ['Dresden', 'Leipzig', 'Chemnitz', 'Sachsen'],
  'Niedersachsen':       ['Hannover', 'Braunschweig', 'Osnabrück', 'Wolfsburg', 'Göttingen', 'Niedersachsen'],
  'Rheinland-Pfalz':     ['Mainz', 'Ludwigshafen', 'Koblenz', 'Trier', 'Rheinland-Pfalz'],
  'Brandenburg':         ['Potsdam', 'Cottbus', 'Brandenburg'],
  'Thüringen':           ['Erfurt', 'Jena', 'Gera', 'Thüringen'],
  'Sachsen-Anhalt':      ['Magdeburg', 'Halle', 'Sachsen-Anhalt'],
  'Schleswig-Holstein':  ['Kiel', 'Lübeck', 'Flensburg', 'Schleswig-Holstein'],
  'Bremen':              ['Bremen', 'Bremerhaven'],
  'Mecklenburg-Vorpommern': ['Rostock', 'Schwerin', 'Mecklenburg-Vorpommern'],
  'Saarland':            ['Saarbrücken', 'Saarland'],
};

const JobSkeleton = ({ delay = 0 }: { delay?: number }) => (
  <div
    className="bg-white rounded-xl border border-gray-200 p-4 sm:p-5 animate-pulse"
    style={{ animationDelay: `${delay}ms` }}
  >
    <div className="flex gap-3">
      <div className="w-9 h-9 sm:w-11 sm:h-11 rounded-xl bg-gray-200 shrink-0" />
      <div className="flex-1">
        <div className="h-4 bg-gray-200 rounded-full w-3/4 mb-2" />
        <div className="h-3 bg-gray-100 rounded-full w-1/2 mb-3" />
        <div className="h-3 bg-gray-100 rounded-full w-full mb-1.5" />
        <div className="h-3 bg-gray-100 rounded-full w-4/5 mb-3" />
        <div className="flex gap-2">
          <div className="h-5 w-20 bg-gray-100 rounded-md" />
          <div className="h-5 w-16 bg-gray-100 rounded-md" />
        </div>
      </div>
      <div className="hidden sm:flex flex-col gap-2 shrink-0">
        <div className="h-7 w-16 bg-gray-100 rounded-lg" />
        <div className="h-7 w-16 bg-gray-100 rounded-lg" />
      </div>
    </div>
  </div>
);

const CompanyAvatar = ({ company }: { company: string }) => {
  const letter = company?.trim()?.[0]?.toUpperCase() ?? '?';
  const colors = [
    'bg-blue-100 text-blue-700',
    'bg-green-100 text-green-700',
    'bg-purple-100 text-purple-700',
    'bg-orange-100 text-orange-700',
    'bg-pink-100 text-pink-700',
    'bg-teal-100 text-teal-700',
    'bg-indigo-100 text-indigo-700',
  ];
  const idx = letter.charCodeAt(0) % colors.length;
  return (
    <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-base font-bold shrink-0 ${colors[idx]}`}>
      {letter}
    </div>
  );
};

type ManualJobForm = {
  title: string;
  company: string;
  location: string;
  url: string;
  description: string;
};

const EMPTY_MANUAL_JOB: ManualJobForm = {
  title: '',
  company: '',
  location: '',
  url: '',
  description: '',
};

/** Wraps a job card with swipe-to-save (right) and swipe-to-hide (left) gestures. */
const SwipeableCard = ({
  onSave,
  onHide,
  saveLabel,
  hideLabel,
  children,
}: {
  onSave?: () => void;   // undefined = save not applicable for this job
  onHide: () => void;
  saveLabel: string;
  hideLabel: string;
  children: React.ReactNode;
}) => {
  const { touchHandlers, cardStyle, bgOpacity, action } = useSwipeAction(
    onSave ?? (() => {}),
    onHide,
  );
  // Only show save hint if save is applicable for this job
  const visibleAction = action === 'save' && !onSave ? null : action;

  return (
    <div className="relative overflow-hidden rounded-xl">
      {visibleAction && (
        <div
          className={`absolute inset-0 flex items-center ${
            visibleAction === 'save' ? 'pl-5 bg-yellow-400' : 'justify-end pr-5 bg-gray-400'
          }`}
          style={{ opacity: bgOpacity }}
        >
          <span className="text-white text-sm font-bold select-none flex items-center gap-1.5">
            {visibleAction === 'save' ? (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"/></svg>
                {saveLabel}
              </>
            ) : (
              <>
                {hideLabel}
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
              </>
            )}
          </span>
        </div>
      )}
      <div {...touchHandlers} style={cardStyle}>
        {children}
      </div>
    </div>
  );
};

export const JobsPage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { t, lang } = useLanguage();
  const { show: showToast } = useToastStore();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<Error | null>(null);
  const [page, setPage] = useState(1);
  const initialTab    = (searchParams.get('tab') as Tab) || 'new';
  const initialSearch = searchParams.get('search') || '';
  const [activeTab, setActiveTab] = useState<Tab>(initialTab);
  const [searchInput, setSearchInput] = useState(initialSearch);
  const [search, setSearch] = useState(initialSearch);
  const [sortBy, setSortBy] = useState('posted_date');
  const [sourceFilter, setSourceFilter] = useState('');
  const [dateFilter, setDateFilter] = useState('');
  const [remoteOnly, setRemoteOnly] = useState(false);
  const [studentOnly, setStudentOnly] = useState(searchParams.get('type') === 'werkstudent' || searchParams.get('student') === '1');
  const [highMatchOnly, setHighMatchOnly] = useState(searchParams.get('type') === 'hot' || searchParams.get('match') === 'high');
  const [locationFilter, setLocationFilter] = useState('');
  const [actionLoading, setActionLoading] = useState<number | null>(null);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualSaving, setManualSaving] = useState(false);
  const [manualForm, setManualForm] = useState<ManualJobForm>(EMPTY_MANUAL_JOB);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const LIMIT = 50;

  useEffect(() => {
    loadStats();
  }, []);

  useEffect(() => {
    const type = searchParams.get('type');
    if (type === 'werkstudent') setStudentOnly(true);
    if (type === 'hot') setHighMatchOnly(true);
  }, [searchParams]);

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
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [activeTab, search, sortBy, sourceFilter, dateFilter, remoteOnly, studentOnly, highMatchOnly, locationFilter, page]);

  const loadStats = async () => {
    try {
      const s = await jobsService.getStats();
      setStats(s);
    } catch (error) {
      console.error('Failed to load job stats:', error);
    }
  };

  const fetchJobs = async () => {
    try {
      setLoading(true);
      setFetchError(null);
      const filters: JobFilters = {
        limit: LIMIT,
        offset: (page - 1) * LIMIT,
        sortBy,
        sortOrder: (sortBy === 'title' || sortBy === 'company' || sortBy === 'deadline') ? 'ASC' : 'DESC',
        search: search || undefined,
        status: activeTab !== 'all' ? activeTab : undefined,
        noFilter: activeTab === 'all' ? true : undefined,
        source: sourceFilter || undefined,
        dateFrom: dateFilter || undefined,
        remoteOnly: remoteOnly || undefined,
        studentOnly: studentOnly || undefined,
        highMatchOnly: highMatchOnly || undefined,
        location: locationFilter || undefined,
      };
      const response = await jobsService.getJobs(filters);
      setJobs(response.jobs);
      setTotal(response.total);
    } catch (error) {
      console.error('Failed to fetch jobs:', error);
      setFetchError(error instanceof Error ? error : new Error(String(error)));
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (job: Job) => {
    setActionLoading(job.id);
    try {
      await jobsService.updateStatus(job.id, 'saved');
      if (activeTab === 'new') {
        setJobs(prev => prev.filter(j => j.id !== job.id));
        setTotal(prev => prev - 1);
      } else {
        setJobs(prev => prev.map(j => j.id === job.id ? { ...j, status: 'saved' } : j));
      }
      setStats(prev => prev ? { ...prev, new: Math.max(0, prev.new - 1), saved: prev.saved + 1 } : prev);
      showToast(t('toastJobSaved'));
    } catch (error) {
      console.error('Job action failed:', error);
      showToast(t('toastActionFailed'), 'error');
    }
    setActionLoading(null);
  };

  const handleApply = async (job: Job) => {
    setActionLoading(job.id);
    try {
      const today = new Date().toISOString().split('T')[0];
      await jobsService.updateStatus(job.id, 'applied', today);
      setJobs(prev => prev.filter(j => j.id !== job.id));
      setTotal(prev => prev - 1);
      setStats(prev => prev ? {
        ...prev,
        ...(job.status === 'new' ? { new: Math.max(0, prev.new - 1) } : { saved: Math.max(0, prev.saved - 1) }),
        applied: prev.applied + 1,
      } : prev);
      showToast(t('toastJobApplied'));
      loadStats();
    } catch (error) {
      console.error('Job action failed:', error);
      showToast(t('toastActionFailed'), 'error');
    }
    setActionLoading(null);
  };

  const handlePrepare = async (job: Job) => {
    setActionLoading(job.id);
    try {
      await jobsService.updateStatus(job.id, 'preparing');
      setJobs(prev => activeTab === 'new' || activeTab === 'saved'
        ? prev.filter(j => j.id !== job.id)
        : prev.map(j => j.id === job.id ? { ...j, status: 'preparing' } : j)
      );
      setTotal(prev => activeTab === 'new' || activeTab === 'saved' ? Math.max(0, prev - 1) : prev);
      loadStats();
    } catch (error) {
      console.error('Job action failed:', error);
      showToast(t('toastActionFailed'), 'error');
    }
    setActionLoading(null);
  };

  const handleCreateManualJob = async (event: FormEvent) => {
    event.preventDefault();
    if (!manualForm.title.trim() || !manualForm.company.trim()) return;
    setManualSaving(true);
    try {
      const created = await jobsService.createManualJob(manualForm);
      setManualForm(EMPTY_MANUAL_JOB);
      setManualOpen(false);
      showToast(t('jobAdded'));
      loadStats();
      navigate(`/jobs/${created.id}`);
    } catch (error) {
      console.error('Failed to add manual job:', error);
    } finally {
      setManualSaving(false);
    }
  };

  const handleUnsave = async (job: Job) => {
    setActionLoading(job.id);
    try {
      await jobsService.updateStatus(job.id, 'new');
      setJobs(prev => prev.filter(j => j.id !== job.id));
      setTotal(prev => prev - 1);
      setStats(prev => prev ? { ...prev, saved: Math.max(0, prev.saved - 1), new: prev.new + 1 } : prev);
      showToast(t('toastJobUnsaved'), 'info');
    } catch (error) {
      console.error('Job action failed:', error);
      showToast(t('toastActionFailed'), 'error');
    }
    setActionLoading(null);
  };

  const handleRevertToSaved = async (job: Job) => {
    setActionLoading(job.id);
    try {
      await jobsService.updateStatus(job.id, 'saved');
      setJobs(prev => prev.filter(j => j.id !== job.id));
      setTotal(prev => prev - 1);
      setStats(prev => prev ? { ...prev, applied: Math.max(0, prev.applied - 1), saved: prev.saved + 1 } : prev);
      showToast(t('toastJobReverted'), 'info');
    } catch (error) {
      console.error('Job action failed:', error);
      showToast(t('toastActionFailed'), 'error');
    }
    setActionLoading(null);
  };

  const handleHide = async (job: Job) => {
    setActionLoading(job.id);
    try {
      await jobsService.toggleHidden(job.id, true);
      setJobs(prev => prev.filter(j => j.id !== job.id));
      setTotal(prev => prev - 1);
      if (job.status === 'new') {
        setStats(prev => prev ? { ...prev, new: Math.max(0, prev.new - 1), total: Math.max(0, prev.total - 1) } : prev);
      }
      showToast(t('toastJobHidden'), 'info');
    } catch (error) {
      console.error('Job action failed:', error);
      showToast(t('toastActionFailed'), 'error');
    }
    setActionLoading(null);
  };

  const handleTabChange = (tab: Tab) => {
    setActiveTab(tab);
    setSourceFilter('');
    setDateFilter('');
    setRemoteOnly(false);
    setStudentOnly(false);
    setHighMatchOnly(false);
    setLocationFilter('');
    setPage(1);
  };

  const clearAllFilters = () => {
    setSearchInput('');
    setSearch('');
    setSourceFilter('');
    setDateFilter('');
    setRemoteOnly(false);
    setStudentOnly(false);
    setHighMatchOnly(false);
    setLocationFilter('');
    setPage(1);
  };

  const filterCount = [
    search,
    sourceFilter,
    dateFilter,
    remoteOnly ? 'r' : '',
    studentOnly ? 's' : '',
    highMatchOnly ? 'h' : '',
    locationFilter,
  ].filter(Boolean).length;

  const totalPages = Math.ceil(total / LIMIT);

  const DATE_OPTIONS = [
    { value: '',   label: t('anyTime') },
    { value: '7',  label: t('last7Days') },
    { value: '30', label: t('last30Days') },
    { value: '90', label: t('last3Months') },
  ];

  const dateFromForDays = (days: string) => {
    if (!days) return '';
    const d = new Date();
    d.setDate(d.getDate() - parseInt(days));
    return d.toISOString().split('T')[0];
  };

  const tabs: { id: Tab; label: string; count?: number; color: string; activeColor: string }[] = [
    { id: 'new',          label: t('new'),          count: stats?.new,          color: 'hover:text-blue-600',   activeColor: 'border-blue-500 text-blue-600' },
    { id: 'saved',        label: t('saved'),        count: stats?.saved,        color: 'hover:text-yellow-600', activeColor: 'border-yellow-500 text-yellow-600' },
    { id: 'preparing',    label: t('preparing'),    count: stats?.preparing,    color: 'hover:text-blue-600',   activeColor: 'border-blue-500 text-blue-600' },
    { id: 'applied',      label: t('applied'),      count: stats?.applied,      color: 'hover:text-green-600',  activeColor: 'border-green-500 text-green-600' },
    { id: 'followup',     label: t('followup'),     count: stats?.followup,     color: 'hover:text-orange-600', activeColor: 'border-orange-500 text-orange-600' },
    { id: 'interviewing', label: t('interviewing'), count: stats?.interviewing, color: 'hover:text-purple-600', activeColor: 'border-purple-500 text-purple-600' },
    { id: 'all',          label: t('all'),          count: stats?.total,        color: 'hover:text-gray-700',   activeColor: 'border-gray-500 text-gray-700' },
  ];

  return (
    <div className="min-h-screen bg-gray-50 w-full">
      {/* Page header */}
      <div className="bg-white border-b border-gray-200 px-6 py-5">
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-3">
          <h1 className="text-2xl font-bold text-gray-900">{t('jobs')}</h1>
          <button
            onClick={() => setManualOpen(true)}
            className="px-4 py-2 bg-gray-900 hover:bg-gray-700 text-white text-sm font-semibold rounded-lg transition"
          >
            + {t('addManualJob')}
          </button>
        </div>
      </div>

      {manualOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-4">
          <form onSubmit={handleCreateManualJob} className="w-full max-w-lg bg-white rounded-xl border border-gray-200 p-5 shadow-xl">
            <div className="flex items-start justify-between gap-3 mb-4">
              <div>
                <h2 className="text-xl font-bold text-gray-900">{t('manualJobTitle')}</h2>
                <p className="text-sm text-gray-500 mt-1">{t('manualJobHint')}</p>
              </div>
              <button
                type="button"
                onClick={() => setManualOpen(false)}
                className="text-gray-400 hover:text-gray-700 text-2xl leading-none"
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              <label className="block">
                <span className="text-xs font-bold text-gray-500">{t('jobTitle')}</span>
                <input
                  required
                  value={manualForm.title}
                  onChange={e => setManualForm(form => ({ ...form, title: e.target.value }))}
                  className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                />
              </label>
              <label className="block">
                <span className="text-xs font-bold text-gray-500">{t('company')}</span>
                <input
                  required
                  value={manualForm.company}
                  onChange={e => setManualForm(form => ({ ...form, company: e.target.value }))}
                  className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                />
              </label>
              <label className="block">
                <span className="text-xs font-bold text-gray-500">{t('location')}</span>
                <input
                  value={manualForm.location}
                  onChange={e => setManualForm(form => ({ ...form, location: e.target.value }))}
                  className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                />
              </label>
              <label className="block">
                <span className="text-xs font-bold text-gray-500">{t('jobUrl')}</span>
                <input
                  type="url"
                  value={manualForm.url}
                  onChange={e => setManualForm(form => ({ ...form, url: e.target.value }))}
                  className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                />
              </label>
            </div>
            <label className="block mt-3">
              <span className="text-xs font-bold text-gray-500">{t('description')}</span>
              <textarea
                value={manualForm.description}
                onChange={e => setManualForm(form => ({ ...form, description: e.target.value }))}
                rows={4}
                className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none resize-none focus-visible:ring-2 focus-visible:ring-blue-500"
              />
            </label>
            <div className="flex justify-end gap-2 mt-4">
              <button
                type="button"
                onClick={() => setManualOpen(false)}
                className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-semibold text-gray-600 hover:bg-gray-50"
              >
                {t('cancel')}
              </button>
              <button
                type="submit"
                disabled={manualSaving}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-sm font-semibold"
              >
                {manualSaving ? t('adding') : t('addJob')}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Tabs */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10 overflow-hidden">
        <div className="max-w-5xl mx-auto px-6">
          <div className="flex overflow-x-auto scrollbar-none" style={{ scrollbarWidth: 'none' }}>
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => handleTabChange(tab.id)}
                className={`px-5 py-4 text-base font-medium border-b-2 whitespace-nowrap transition ${
                  activeTab === tab.id
                    ? tab.activeColor
                    : `border-transparent text-gray-400 ${tab.color}`
                }`}
              >
                {tab.label}
                {tab.count !== undefined && (
                  <span className={`ml-2 px-2 py-0.5 rounded-full text-sm font-bold bg-gray-100 ${
                    activeTab === tab.id ? 'text-gray-700' : 'text-gray-400'
                  }`}>
                    {tab.count.toLocaleString()}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Search + Sort bar */}
      <div className="max-w-5xl mx-auto px-6 py-4 space-y-3">
        {/* Row 1: State + Sort (mobile: side by side) */}
        <div className="flex gap-3">
          <select
            value={locationFilter}
            onChange={e => { setLocationFilter(e.target.value); setPage(1); }}
            className="flex-1 px-3 py-2.5 border border-gray-300 rounded-lg text-sm text-gray-700 focus-visible:ring-2 focus-visible:ring-blue-500 outline-none bg-white"
          >
            <option value="">{t('allStates')}</option>
            {Object.keys(STATE_CITIES).map(state => (
              <option key={state} value={STATE_CITIES[state].join('|')}>{state}</option>
            ))}
          </select>
          <select
            value={sortBy}
            onChange={e => { setSortBy(e.target.value); setPage(1); }}
            className="flex-1 px-3 py-2.5 border border-gray-300 rounded-lg text-sm text-gray-700 focus-visible:ring-2 focus-visible:ring-blue-500 outline-none bg-white"
          >
            <option value="posted_date">{t('newestFirst')}</option>
            <option value="match_score">{t('bestMatch')}</option>
            <option value="created_at">{t('recentlyAdded')}</option>
            <option value="deadline">{t('expiringSoon')}</option>
            <option value="title">{t('titleAZ')}</option>
            <option value="company">{t('companyAZ')}</option>
          </select>
        </div>
        {/* Row 2: Search (full width) */}
        <div className="flex">
          <div className="relative flex-1">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder={t('searchPlaceholder')}
              value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
              className="w-full pl-9 pr-9 py-2.5 border border-gray-300 rounded-lg text-sm outline-none bg-white focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:border-transparent"
            />
            {searchInput && (
              <button
                onClick={() => { setSearchInput(''); setPage(1); }}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition"
                aria-label="Clear search"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        </div>
        {/* Source filter pills */}
        <div className="flex items-center gap-2 mt-3 flex-wrap">
          {[
            { value: '',              label: t('allSources') },
            { value: 'bundesagentur', label: 'Bundesagentur' },
            { value: 'adzuna',        label: 'Adzuna' },
          ].map(opt => (
            <button
              key={opt.value}
              onClick={() => { setSourceFilter(opt.value); setPage(1); }}
              className={`px-3 py-1 rounded-full text-xs font-medium border transition ${
                sourceFilter === opt.value
                  ? 'bg-gray-800 text-white border-gray-800'
                  : 'bg-white text-gray-500 border-gray-300 hover:border-gray-400 hover:text-gray-700'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        {/* Date filter pills */}
        <div className="flex items-center gap-2 mt-2 flex-wrap">
          {DATE_OPTIONS.map(opt => (
            <button
              key={opt.value}
              onClick={() => { setDateFilter(dateFromForDays(opt.value)); setPage(1); }}
              className={`px-3 py-1 rounded-full text-xs font-medium border transition ${
                dateFilter === dateFromForDays(opt.value)
                  ? 'bg-green-700 text-white border-green-700'
                  : 'bg-white text-gray-500 border-gray-300 hover:border-gray-400 hover:text-gray-700'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        {/* Smart filter pills */}
        <div className="flex items-center gap-2 mt-2 flex-wrap">
          <button
            onClick={() => { setHighMatchOnly(value => !value); setPage(1); }}
            className={`px-3 py-1 rounded-full text-xs font-medium border transition ${
              highMatchOnly
                ? 'bg-green-700 text-white border-green-700'
                : 'bg-white text-gray-500 border-gray-300 hover:border-gray-400 hover:text-gray-700'
            }`}
          >
            {t('strongMatch')}
          </button>
          <button
            onClick={() => { setRemoteOnly(r => !r); setPage(1); }}
            className={`px-3 py-1 rounded-full text-xs font-medium border transition ${
              remoteOnly
                ? 'bg-teal-600 text-white border-teal-600'
                : 'bg-white text-gray-500 border-gray-300 hover:border-gray-400 hover:text-gray-700'
            }`}
          >
            {t('remote')}
          </button>
          <button
            onClick={() => { setStudentOnly(value => !value); setPage(1); }}
            className={`px-3 py-1 rounded-full text-xs font-medium border transition ${
              studentOnly
                ? 'bg-indigo-600 text-white border-indigo-600'
                : 'bg-white text-gray-500 border-gray-300 hover:border-gray-400 hover:text-gray-700'
            }`}
          >
            {t('werkstudentOnly')}
          </button>
        </div>
        {/* Active filter indicator */}
        {filterCount > 0 && (
          <div className="flex items-center gap-2 mt-3">
            <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
              {filterCount} {t('activeFilters')}
            </span>
            <button
              onClick={clearAllFilters}
              className="text-xs text-gray-400 hover:text-gray-700 transition font-medium underline underline-offset-2"
            >
              {t('clearAll')}
            </button>
          </div>
        )}
        <p className="text-xs text-gray-400 mt-2">{total.toLocaleString()} {t('jobs').toLowerCase()}</p>
      </div>

      {/* Jobs list */}
      <main className="max-w-5xl mx-auto px-6 pb-12">
        {loading ? (
          <div className="space-y-2.5">
            {[...Array(6)].map((_, i) => <JobSkeleton key={i} delay={i * 50} />)}
          </div>
        ) : fetchError ? (
          <div
            role="alert"
            className="bg-white rounded-2xl border border-red-200 p-10 text-center shadow-sm"
          >
            <div className="text-4xl mb-3" aria-hidden="true">⚠️</div>
            <p className="text-gray-900 text-base font-semibold">Couldn't load jobs</p>
            <p className="text-gray-500 text-sm mt-2 max-w-md mx-auto break-words">
              {fetchError.message}
            </p>
            <button
              onClick={fetchJobs}
              className="mt-5 px-5 py-2.5 rounded-lg bg-green-600 hover:bg-green-700 focus-visible:ring-2 focus-visible:ring-green-500 focus-visible:ring-offset-2 text-white text-sm font-semibold transition"
            >
              Retry
            </button>
          </div>
        ) : jobs.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-200 p-16 text-center">
            <div className="text-4xl mb-4">🔍</div>
            <p className="text-gray-500 text-base font-medium">{t('noJobsFound')}</p>
            <p className="text-gray-400 text-sm mt-2 max-w-md mx-auto">
              {t('noJobsHint')}
            </p>
            {filterCount > 0 && (
              <button
                onClick={clearAllFilters}
                className="mt-5 px-4 py-2 rounded-lg bg-gray-900 text-white text-sm font-semibold hover:bg-gray-700 focus-visible:ring-2 focus-visible:ring-gray-500 focus-visible:ring-offset-2 transition"
              >
                {t('clearFilters')}
              </button>
            )}
            {activeTab === 'new' && (
              <p className="text-gray-400 text-sm mt-1">{t('allCaughtUp')} 🎉</p>
            )}
          </div>
        ) : (
          <div className="space-y-2.5">
            {jobs.map((job, index) => (
              <div key={job.id} className="animate-fade-in" style={{ animationDelay: `${Math.min(index, 12) * 35}ms` }}>
              <SwipeableCard
                onSave={job.status === 'new' ? () => handleSave(job) : undefined}
                onHide={() => handleHide(job)}
                saveLabel={t('save')}
                hideLabel={t('hide')}
              >
                <div
                  onClick={() => navigate(`/jobs/${job.id}`)}
                  className={`bg-white rounded-xl border hover:shadow-md transition cursor-pointer group ${
                    deadlineUrgency(job.deadline) || 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="p-5 sm:p-6">
                    <div className="flex items-start gap-4">
                      {/* Company avatar */}
                      <div className="shrink-0">
                        <CompanyAvatar company={job.company} />
                      </div>

                      {/* Main content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <h3 className="font-bold text-gray-900 leading-snug group-hover:text-blue-700 transition-colors text-base sm:text-lg">
                              {job.title}
                            </h3>
                            <p className="text-sm text-gray-500 mt-0.5">
                              {job.company}
                              {job.location && <span className="text-gray-400"> · {job.location}</span>}
                            </p>
                          </div>
                          {job.status !== 'new' && (
                            <span className={`shrink-0 px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[job.status]}`}>
                              {t(job.status)}
                            </span>
                          )}
                        </div>

                        {job.description && (
                          <p className="text-sm text-gray-500 mt-2 line-clamp-2 leading-relaxed">
                            {stripHtml(job.description)}
                          </p>
                        )}

                        <div className="flex items-center gap-2 mt-2 text-xs text-gray-400 flex-wrap">
                          <MatchBadge score={job.match_score} reasons={job.match_reasons} gaps={job.match_gaps} />
                          <SourceBadge source={job.source} />
                          {job.is_active === false && (
                            <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 font-medium">
                              {t('noLongerListed')}
                            </span>
                          )}
                          {job.posted_date && (
                            <span>{timeAgo(job.posted_date, lang)}</span>
                          )}
                          {job.deadline && (
                            <span className="text-orange-500 font-medium">
                              ⏰ {new Date(job.deadline).toLocaleDateString(lang === 'de' ? 'de-DE' : 'en-GB')}
                            </span>
                          )}
                          {job.salary && (
                            <span className="text-green-600 font-medium">{job.salary}</span>
                          )}
                        </div>

                        <MatchInsights score={job.match_score} reasons={job.match_reasons} gaps={job.match_gaps} />

                        {/* Actions — icon buttons on mobile (language-agnostic) */}
                        <div
                          className="flex gap-2 mt-3 sm:hidden"
                          onClick={e => e.stopPropagation()}
                        >
                          {job.status === 'new' && (
                            <button
                              onClick={e => { e.stopPropagation(); handleSave(job); }}
                              disabled={actionLoading === job.id}
                              aria-label={t('save')}
                              title={t('save')}
                              className="flex-1 flex flex-col items-center gap-1 py-2.5 bg-yellow-50 hover:bg-yellow-100 text-yellow-700 border border-yellow-200 rounded-xl transition disabled:opacity-40 active:scale-95"
                            >
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"/>
                              </svg>
                              <span className="text-xs font-semibold leading-none">{t('save')}</span>
                            </button>
                          )}
                          {job.status === 'saved' && (
                            <button
                              onClick={e => { e.stopPropagation(); handleUnsave(job); }}
                              disabled={actionLoading === job.id}
                              aria-label={t('unsave')}
                              title={t('unsaveJob')}
                              className="flex-1 flex flex-col items-center gap-1 py-2.5 bg-yellow-50 hover:bg-red-50 text-yellow-600 hover:text-red-500 border border-yellow-200 hover:border-red-200 rounded-xl transition disabled:opacity-40 active:scale-95"
                            >
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5zM9 9l6 6M15 9l-6 6"/>
                              </svg>
                              <span className="text-xs font-semibold leading-none">{t('unsave')}</span>
                            </button>
                          )}
                          {job.status === 'applied' && (
                            <button
                              onClick={e => { e.stopPropagation(); handleRevertToSaved(job); }}
                              disabled={actionLoading === job.id}
                              aria-label={t('revertToSaved')}
                              title={t('revertToSavedJob')}
                              className="flex-1 flex flex-col items-center gap-1 py-2.5 bg-gray-50 hover:bg-yellow-50 text-gray-500 hover:text-yellow-700 border border-gray-200 hover:border-yellow-200 rounded-xl transition disabled:opacity-40 active:scale-95"
                            >
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6"/>
                              </svg>
                              <span className="text-xs font-semibold leading-none">{t('revertToSaved')}</span>
                            </button>
                          )}
                          {(job.status === 'new' || job.status === 'saved') && (
                            <button
                              onClick={e => { e.stopPropagation(); handlePrepare(job); }}
                              disabled={actionLoading === job.id}
                              aria-label={t('preparing')}
                              title={t('preparing')}
                              className="flex-1 flex flex-col items-center gap-1 py-2.5 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-xl transition disabled:opacity-40 active:scale-95"
                            >
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 4H7a2 2 0 01-2-2V6a2 2 0 012-2h5l5 5v9a2 2 0 01-2 2z"/>
                              </svg>
                              <span className="text-xs font-semibold leading-none truncate max-w-full px-1">{t('preparing')}</span>
                            </button>
                          )}
                          {(job.status === 'new' || job.status === 'saved' || job.status === 'preparing') && (
                            <button
                              onClick={e => { e.stopPropagation(); handleApply(job); }}
                              disabled={actionLoading === job.id}
                              aria-label={t('markApplied')}
                              title={t('markApplied')}
                              className="flex-1 flex flex-col items-center gap-1 py-2.5 bg-green-50 hover:bg-green-100 text-green-700 border border-green-200 rounded-xl transition disabled:opacity-40 active:scale-95"
                            >
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
                              </svg>
                              <span className="text-xs font-semibold leading-none truncate max-w-full px-1">{t('markApplied')}</span>
                            </button>
                          )}
                          {job.url && (
                            <a
                              href={job.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={e => e.stopPropagation()}
                              aria-label={t('apply')}
                              title={t('apply')}
                              className="flex-1 flex flex-col items-center gap-1 py-2.5 bg-teal-50 hover:bg-teal-100 text-teal-700 border border-teal-200 rounded-xl transition active:scale-95"
                            >
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/>
                              </svg>
                              <span className="text-xs font-semibold leading-none">Apply</span>
                            </a>
                          )}
                          <button
                            onClick={e => { e.stopPropagation(); handleHide(job); }}
                            disabled={actionLoading === job.id}
                            aria-label={t('hide')}
                            title={t('hide')}
                            className="flex flex-col items-center gap-1 py-2.5 px-3 bg-gray-50 hover:bg-red-50 text-gray-400 hover:text-red-500 border border-gray-200 hover:border-red-200 rounded-xl transition disabled:opacity-40 active:scale-95"
                          >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"/>
                            </svg>
                            <span className="text-xs font-semibold leading-none">Hide</span>
                          </button>
                        </div>
                      </div>

                      {/* Actions — right column on sm+ screens */}
                      <div
                        className="hidden sm:flex flex-col gap-2 shrink-0"
                        onClick={e => e.stopPropagation()}
                      >
                        {job.status === 'new' && (
                          <button
                            onClick={e => { e.stopPropagation(); handleSave(job); }}
                            disabled={actionLoading === job.id}
                            title={t('saveJob')}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-yellow-50 hover:bg-yellow-100 text-yellow-700 border border-yellow-200 rounded-lg transition disabled:opacity-40 whitespace-nowrap"
                          >
                            <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"/></svg>
                            {t('save')}
                          </button>
                        )}
                        {job.status === 'saved' && (
                          <button
                            onClick={e => { e.stopPropagation(); handleUnsave(job); }}
                            disabled={actionLoading === job.id}
                            title={t('unsaveJob')}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-yellow-50 hover:bg-red-50 text-yellow-600 hover:text-red-500 border border-yellow-200 hover:border-red-200 rounded-lg transition disabled:opacity-40 whitespace-nowrap"
                          >
                            <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5zM9 9l6 6M15 9l-6 6"/></svg>
                            {t('unsave')}
                          </button>
                        )}
                        {job.status === 'applied' && (
                          <button
                            onClick={e => { e.stopPropagation(); handleRevertToSaved(job); }}
                            disabled={actionLoading === job.id}
                            title={t('revertToSavedJob')}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-gray-50 hover:bg-yellow-50 text-gray-500 hover:text-yellow-700 border border-gray-200 hover:border-yellow-200 rounded-lg transition disabled:opacity-40 whitespace-nowrap"
                          >
                            <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6"/></svg>
                            {t('revertToSaved')}
                          </button>
                        )}
                        {(job.status === 'new' || job.status === 'saved') && (
                          <button
                            onClick={e => { e.stopPropagation(); handlePrepare(job); }}
                            disabled={actionLoading === job.id}
                            title={t('preparing')}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-lg transition disabled:opacity-40 whitespace-nowrap"
                          >
                            <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 4H7a2 2 0 01-2-2V6a2 2 0 012-2h5l5 5v9a2 2 0 01-2 2z"/></svg>
                            {t('preparing')}
                          </button>
                        )}
                        {(job.status === 'new' || job.status === 'saved' || job.status === 'preparing') && (
                          <button
                            onClick={e => { e.stopPropagation(); handleApply(job); }}
                            disabled={actionLoading === job.id}
                            title={t('markAsApplied')}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-green-50 hover:bg-green-100 text-green-700 border border-green-200 rounded-lg transition disabled:opacity-40 whitespace-nowrap"
                          >
                            <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                            {t('markApplied')}
                          </button>
                        )}
                        <button
                          onClick={e => { e.stopPropagation(); handleHide(job); }}
                          disabled={actionLoading === job.id}
                          title={t('hideJob')}
                          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-gray-400 hover:text-red-500 bg-gray-50 hover:bg-red-50 border border-gray-200 hover:border-red-200 rounded-lg transition disabled:opacity-40"
                        >
                          <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"/></svg>
                          {t('hide')}
                        </button>
                        {job.url && (
                          <a
                            href={job.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={e => e.stopPropagation()}
                            title={t('openJobPosting')}
                            className="px-3 py-1.5 text-xs font-semibold text-center bg-teal-50 hover:bg-teal-100 text-teal-700 border border-teal-200 rounded-lg transition whitespace-nowrap"
                          >
                            {t('apply')}
                          </a>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </SwipeableCard>
              </div>
            ))}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex justify-center items-center gap-3 mt-8">
            <button
              onClick={() => { setPage(p => p - 1); window.scrollTo(0, 0); }}
              disabled={page === 1}
              className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition"
            >
              ← {t('prev')}
            </button>
            <span className="text-sm text-gray-500 font-medium">
              {t('page')} {page} {t('of')} {totalPages}
            </span>
            <button
              onClick={() => { setPage(p => p + 1); window.scrollTo(0, 0); }}
              disabled={page === totalPages}
              className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition"
            >
              {t('next')} →
            </button>
          </div>
        )}
      </main>
    </div>
  );
};
