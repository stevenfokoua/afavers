import { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { jobsService } from '../services/jobs.service';
import type { Job } from '../types';
import { useLanguage } from '../store/languageStore';
import { useToastStore } from '../store/toastStore';
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  type DragEndEvent,
  type DragStartEvent,
  type Announcements,
} from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';

const COLUMNS: { status: Job['status']; labelKey: string; color: string; bg: string; headerBg: string }[] = [
  { status: 'saved',        labelKey: 'saved',        color: 'text-yellow-700', bg: 'bg-yellow-50/70',  headerBg: 'bg-yellow-50  border-yellow-200' },
  { status: 'preparing',    labelKey: 'preparing',    color: 'text-blue-700',   bg: 'bg-blue-50/70',    headerBg: 'bg-blue-50    border-blue-200' },
  { status: 'applied',      labelKey: 'applied',      color: 'text-green-700',  bg: 'bg-green-50/70',   headerBg: 'bg-green-50   border-green-200' },
  { status: 'followup',     labelKey: 'followup',     color: 'text-orange-700', bg: 'bg-orange-50/70',  headerBg: 'bg-orange-50  border-orange-200' },
  { status: 'interviewing', labelKey: 'interviewing', color: 'text-purple-700', bg: 'bg-purple-50/70',  headerBg: 'bg-purple-50  border-purple-200' },
  { status: 'offered',      labelKey: 'offered',      color: 'text-emerald-700',bg: 'bg-emerald-50/70', headerBg: 'bg-emerald-50 border-emerald-200' },
  { status: 'rejected',     labelKey: 'rejected',     color: 'text-red-700',    bg: 'bg-red-50/70',     headerBg: 'bg-red-50     border-red-200' },
  { status: 'archived',     labelKey: 'archived',     color: 'text-gray-700',   bg: 'bg-gray-50/70',    headerBg: 'bg-gray-50    border-gray-200' },
];

const ZOOM_LEVELS = [75, 90, 100, 115, 130] as const;
type ZoomLevel = typeof ZOOM_LEVELS[number];

/** Swipe-left to reveal action buttons (mobile only) */
const SwipeRevealCard = ({
  actions,
  children,
}: {
  actions: { label: string; icon: React.ReactNode; color: string; onClick: () => void }[];
  children: React.ReactNode;
}) => {
  const [offset, setOffset] = useState(0);
  const [locked, setLocked] = useState(false);
  const startX = useRef(0);
  const startY = useRef(0);
  const lockDir = useRef<'h' | 'v' | null>(null);
  const revealWidth = actions.length * 72;
  const THRESHOLD = 50;

  const onTouchStart = (e: React.TouchEvent) => {
    startX.current = e.touches[0].clientX;
    startY.current = e.touches[0].clientY;
    lockDir.current = null;
  };

  const onTouchMove = (e: React.TouchEvent) => {
    const dx = e.touches[0].clientX - startX.current;
    const dy = e.touches[0].clientY - startY.current;
    if (!lockDir.current) {
      if (Math.abs(dx) < 4 && Math.abs(dy) < 4) return;
      lockDir.current = Math.abs(dx) > Math.abs(dy) ? 'h' : 'v';
    }
    if (lockDir.current === 'v') return;
    e.stopPropagation();
    if (locked) {
      const newOff = -revealWidth + dx;
      setOffset(Math.min(0, Math.max(-revealWidth, newOff)));
    } else {
      if (dx > 0) return;
      setOffset(Math.max(-revealWidth - 10, dx));
    }
  };

  const onTouchEnd = () => {
    if (lockDir.current !== 'h') return;
    if (!locked && offset < -THRESHOLD) {
      setOffset(-revealWidth);
      setLocked(true);
    } else {
      setOffset(0);
      setLocked(false);
    }
  };

  const close = () => { setOffset(0); setLocked(false); };

  return (
    <div className="relative overflow-hidden rounded-xl">
      {/* Action buttons */}
      <div className="absolute right-0 top-0 bottom-0 flex" style={{ width: revealWidth }}>
        {actions.map((a, i) => (
          <button
            key={i}
            onClick={() => { close(); a.onClick(); }}
            className={`flex-1 flex flex-col items-center justify-center gap-1 text-white text-[10px] font-bold transition active:opacity-80 ${a.color}`}
          >
            {a.icon}
            <span>{a.label}</span>
          </button>
        ))}
      </div>
      {/* Sliding card */}
      <div
        style={{
          transform: `translateX(${offset}px)`,
          transition: Math.abs(offset) === revealWidth || offset === 0 ? 'transform 0.2s ease' : 'none',
        }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        {children}
      </div>
    </div>
  );
};

/** Shared card content rendered in both mobile and desktop views */
const KanbanCard = ({ job, onClick, faded, t, locale, dragHandleProps, compact = false }: {
  job: Job;
  onClick: () => void;
  faded?: boolean;
  t: (key: string) => string;
  compact?: boolean;
  locale: string;
  dragHandleProps?: React.HTMLAttributes<HTMLDivElement>;
}) => (
  <div
    onClick={onClick}
    className={`bg-white rounded-xl ${compact ? 'p-3' : 'p-4'} border border-gray-200 hover:shadow-md transition-shadow select-none cursor-pointer ${
      dragHandleProps ? 'cursor-grab active:cursor-grabbing' : ''
    } ${faded ? 'opacity-50 scale-95' : ''}`}
    {...dragHandleProps}
  >
    <h3 className={`font-medium text-gray-900 ${compact ? 'text-xs' : 'text-sm'} mb-1 hover:text-blue-600 line-clamp-2 leading-snug`}>
      {job.title}
    </h3>
    <p className="text-xs font-medium text-gray-600 mb-1 line-clamp-1">{job.company}</p>
    <p className="text-xs text-gray-400 line-clamp-1">📍 {job.location}</p>
    {job.is_active === false && (
      <span className="inline-block mt-1 text-[10px] bg-gray-100 text-gray-500 rounded-full px-2 py-0.5 font-medium">
        {t('noLongerListed')}
      </span>
    )}
    {job.notes && !compact && (
      <p className="text-xs text-gray-500 mt-2 pt-2 border-t border-gray-100 line-clamp-2 italic">
        "{job.notes}"
      </p>
    )}
    {job.applied_date && (
      <div className="flex items-center gap-2 mt-1.5 flex-wrap">
        <p className="text-xs text-green-600 font-medium">
          ✓ {new Date(job.applied_date).toLocaleDateString(locale)}
        </p>
        {(['applied', 'followup', 'interviewing'] as Job['status'][]).includes(job.status) && (() => {
          const days = Math.floor((Date.now() - new Date(job.applied_date!).getTime()) / 86400000);
          return days > 0 ? (
            <span className="text-xs bg-green-100 text-green-700 rounded-full px-2 py-0.5">
              {days}{t('daysWaiting')}
            </span>
          ) : null;
        })()}
      </div>
    )}
    {job.interview_date && (
      <p className="text-xs text-purple-600 mt-1 font-medium">
        📞 {new Date(job.interview_date).toLocaleDateString(locale, { day: 'numeric', month: 'short' })}
      </p>
    )}
  </div>
);

/** Draggable wrapper that renders a KanbanCard hooked up to dnd-kit. */
const DraggableKanbanCard = ({
  job,
  onClick,
  t,
  locale,
  compact = false,
}: {
  job: Job;
  onClick: () => void;
  t: (key: string) => string;
  locale: string;
  compact?: boolean;
}) => {
  const { attributes, listeners, setNodeRef, isDragging, transform } = useDraggable({
    id: String(job.id),
  });
  const style: React.CSSProperties = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : {};
  return (
    <div ref={setNodeRef} style={style}>
      <KanbanCard
        job={job}
        onClick={onClick}
        t={t}
        locale={locale}
        compact={compact}
        faded={isDragging}
        dragHandleProps={{
          ...attributes,
          ...listeners,
          role: 'button',
          'aria-label': `${job.title} at ${job.company}. Press space or enter to pick up.`,
        } as React.HTMLAttributes<HTMLDivElement>}
      />
    </div>
  );
};

/** Droppable column wrapper. Wires dnd-kit's `isOver` to a stronger highlight. */
const DroppableColumn = ({
  status,
  children,
  className,
  style,
  activeHighlight,
}: {
  status: Job['status'];
  children: React.ReactNode;
  className: string;
  style?: React.CSSProperties;
  /** Stronger style applied when a draggable is currently over this column. */
  activeHighlight: string;
}) => {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  return (
    <div ref={setNodeRef} className={`${className} ${isOver ? activeHighlight : ''}`} style={style}>
      {children}
    </div>
  );
};

export const KanbanPage = () => {
  const navigate = useNavigate();
  const { t, lang } = useLanguage();
  const locale = lang === 'de' ? 'de-DE' : 'en-GB';
  const { show: showToast } = useToastStore();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [activeJob, setActiveJob] = useState<Job | null>(null);
  const [mobileTab, setMobileTab] = useState<Job['status']>('saved');
  const [zoom, setZoom] = useState<ZoomLevel>(() => {
    const stored = Number(localStorage.getItem('kanban-zoom'));
    return ZOOM_LEVELS.includes(stored as ZoomLevel) ? stored as ZoomLevel : 100;
  });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  useEffect(() => {
    fetchTrackedJobs();
  }, []);

  useEffect(() => {
    localStorage.setItem('kanban-zoom', String(zoom));
  }, [zoom]);

  const fetchTrackedJobs = async () => {
    try {
      setLoading(true);
      setError(null);
      if (import.meta.env.DEV) console.time('[Kanban] fetchTrackedJobs');
      const trackedStatuses = new Set(COLUMNS.map(col => col.status));
      const all = await jobsService.getAllJobs();
      setJobs(all.filter(job => !job.is_hidden && trackedStatuses.has(job.status)));
    } catch (e) {
      console.error('Failed to fetch jobs:', e);
      setError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      if (import.meta.env.DEV) console.timeEnd('[Kanban] fetchTrackedJobs');
      setLoading(false);
    }
  };

  const getJobsForStatus = (status: Job['status']) =>
    jobs.filter(j => j.status === status);

  const zoomIndex = ZOOM_LEVELS.indexOf(zoom);
  const zoomOut = () => setZoom(ZOOM_LEVELS[Math.max(0, zoomIndex - 1)]);
  const zoomIn = () => setZoom(ZOOM_LEVELS[Math.min(ZOOM_LEVELS.length - 1, zoomIndex + 1)]);
  const columnWidth = Math.round(288 * (zoom / 100));
  const compactCards = zoom <= 90;
  const boardGap = zoom <= 90 ? 12 : 16;

  const handleUnsave = async (job: Job) => {
    setJobs(prev => prev.filter(j => j.id !== job.id));
    try {
      await jobsService.updateStatus(job.id, 'new');
      showToast(t('toastJobUnsaved'), 'info');
    } catch { fetchTrackedJobs(); }
  };

  const handleRevertToSaved = async (job: Job) => {
    setJobs(prev => prev.map(j => j.id === job.id ? { ...j, status: 'saved' } : j));
    setMobileTab('saved');
    try {
      await jobsService.updateStatus(job.id, 'saved');
      showToast(t('toastJobReverted'), 'info');
    } catch { fetchTrackedJobs(); }
  };

  const handleRemove = async (job: Job) => {
    setJobs(prev => prev.filter(j => j.id !== job.id));
    try {
      await jobsService.toggleHidden(job.id, true);
      showToast(t('toastJobHidden'), 'info');
    } catch { fetchTrackedJobs(); }
  };

  const getSwipeActions = (job: Job) => {
    const removeAction = {
      label: t('hide'),
      color: 'bg-red-500',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"/>
        </svg>
      ),
      onClick: () => handleRemove(job),
    };
    if (job.status === 'saved') return [
      {
        label: t('unsave'),
        color: 'bg-yellow-500',
        icon: (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"/>
          </svg>
        ),
        onClick: () => handleUnsave(job),
      },
      removeAction,
    ];
    if (job.status === 'applied') return [
      {
        label: t('revertToSaved'),
        color: 'bg-gray-500',
        icon: (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6"/>
          </svg>
        ),
        onClick: () => handleRevertToSaved(job),
      },
      removeAction,
    ];
    return [removeAction];
  };

  const moveJobToStatus = async (job: Job, newStatus: Job['status']) => {
    if (job.status === newStatus) return;
    try {
      const today = new Date().toISOString().split('T')[0];
      const appliedDate = newStatus === 'applied' && !job.applied_date ? today : undefined;
      setJobs(prev => prev.map(j => j.id === job.id ? {
        ...j, status: newStatus,
        ...(appliedDate ? { applied_date: appliedDate } : {}),
      } : j));
      await jobsService.updateStatus(job.id, newStatus, appliedDate);
    } catch {
      fetchTrackedJobs();
    }
  };

  const onDragStart = (event: DragStartEvent) => {
    const job = jobs.find(j => String(j.id) === String(event.active.id));
    if (job) setActiveJob(job);
  };

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveJob(null);
    if (!over) return;
    const job = jobs.find(j => String(j.id) === String(active.id));
    if (!job) return;
    const newStatus = String(over.id) as Job['status'];
    if (!COLUMNS.some(col => col.status === newStatus)) return;
    moveJobToStatus(job, newStatus);
  };

  const onDragCancel = () => setActiveJob(null);

  // ARIA live announcements for screen readers
  const announcements = useMemo<Announcements>(() => ({
    onDragStart({ active }) {
      const job = jobs.find(j => String(j.id) === String(active.id));
      return job ? `Picked up job ${job.title} at ${job.company}. Use arrow keys to move between columns.` : 'Picked up card.';
    },
    onDragOver({ active, over }) {
      const job = jobs.find(j => String(j.id) === String(active.id));
      if (!over) return job ? `${job.title} is not over a column.` : 'Card is not over a column.';
      const col = COLUMNS.find(c => c.status === String(over.id));
      return job && col ? `${job.title} is over the ${t(col.labelKey)} column.` : 'Card is over a column.';
    },
    onDragEnd({ active, over }) {
      const job = jobs.find(j => String(j.id) === String(active.id));
      if (!over) return job ? `${job.title} was dropped without a target.` : 'Card was dropped.';
      const col = COLUMNS.find(c => c.status === String(over.id));
      return job && col ? `${job.title} was dropped into the ${t(col.labelKey)} column.` : 'Card was dropped.';
    },
    onDragCancel({ active }) {
      const job = jobs.find(j => String(j.id) === String(active.id));
      return job ? `${job.title} drag was cancelled.` : 'Card drag was cancelled.';
    },
  }), [jobs, t]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Page header */}
      <div className="bg-white border-b border-gray-200 px-6 py-5">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{t('kanban')}</h1>
            <p className="text-sm text-gray-500 mt-0.5">{jobs.length} {t('jobsTracked')}</p>
          </div>
          <button
            onClick={() => navigate('/jobs')}
            className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-semibold rounded-lg transition"
          >
            + {t('trackNewJobs')}
          </button>
        </div>
      </div>

      {error ? (
        <div className="max-w-lg mx-auto mt-16 px-6">
          <div
            role="alert"
            className="bg-white border border-red-200 rounded-2xl p-6 shadow-sm text-center"
          >
            <div className="text-4xl mb-3" aria-hidden="true">⚠️</div>
            <p className="text-gray-900 text-base font-semibold mb-1">Couldn't load your board</p>
            <p className="text-gray-500 text-sm mb-5 break-words">{error.message}</p>
            <button
              onClick={fetchTrackedJobs}
              className="px-5 py-2.5 bg-green-600 hover:bg-green-700 focus-visible:ring-2 focus-visible:ring-green-500 focus-visible:ring-offset-2 text-white font-semibold rounded-xl transition"
            >
              Retry
            </button>
          </div>
        </div>
      ) : jobs.length === 0 ? (
        <div className="text-center py-24 px-6">
          <div className="text-5xl mb-4">🗂️</div>
          <p className="text-gray-500 text-lg font-medium mb-1">{t('noJobsTracked')}</p>
          <p className="text-gray-400 text-sm mb-6">{t('noJobsTrackedHint')}</p>
          <button
            onClick={() => navigate('/jobs')}
            className="px-6 py-3 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-xl transition"
          >
            {t('browseJobs2')}
          </button>
        </div>
      ) : (
        <>
          {/* ── Mobile view: tabs + vertical list ── */}
          <div className="block lg:hidden">
            {/* Status tab bar */}
            <div className="flex bg-white border-b border-gray-200 sticky top-0 z-10">
              {COLUMNS.map(col => {
                const count = getJobsForStatus(col.status).length;
                const isActive = mobileTab === col.status;
                return (
                  <button
                    key={col.status}
                    onClick={() => setMobileTab(col.status)}
                    className={`flex-1 py-3 px-1 text-xs font-medium border-b-2 transition-colors ${
                      isActive
                        ? `${col.color} border-current`
                        : 'text-gray-400 border-transparent'
                    }`}
                  >
                    <span className="block truncate">{t(col.labelKey)}</span>
                    <span className={`inline-block rounded-full px-1.5 text-xs font-bold mt-0.5 ${
                      isActive ? 'bg-white/70' : 'bg-gray-100 text-gray-400'
                    }`}>
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Card list for active tab */}
            <div className="p-3 space-y-2.5">
              {getJobsForStatus(mobileTab).length === 0 ? (
                <div className="text-center py-16 text-gray-400">
                  <div className="text-4xl mb-3">📭</div>
                  <p className="text-sm font-medium">{t('noJobsTracked')}</p>
                  <button
                    onClick={() => navigate('/jobs')}
                    className="mt-4 px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm rounded-lg font-medium transition"
                  >
                    {t('browseJobs2')}
                  </button>
                </div>
              ) : (
                getJobsForStatus(mobileTab).map(job => (
                  <SwipeRevealCard key={job.id} actions={getSwipeActions(job)}>
                    <KanbanCard
                      job={job}
                      onClick={() => navigate(`/jobs/${job.id}`)}
                      t={t}
                      locale={locale}
                    />
                  </SwipeRevealCard>
                ))
              )}
            </div>
          </div>

          {/* ── Desktop view: drag-and-drop columns (dnd-kit) ── */}
          <div className="hidden lg:block p-6 overflow-x-auto">
            <div className="flex items-center justify-between gap-4 mb-4">
              <p className="text-xs text-gray-500">
                {t('kanbanHint')}
              </p>
              <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-2 py-1.5">
                <button
                  onClick={zoomOut}
                  disabled={zoomIndex === 0}
                  className="w-8 h-8 rounded-md border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                  aria-label="Zoom out"
                >
                  -
                </button>
                <button
                  onClick={() => setZoom(100)}
                  className="min-w-16 h-8 px-2 rounded-md text-xs font-semibold text-gray-700 hover:bg-gray-50"
                  title="Reset zoom"
                >
                  {zoom}%
                </button>
                <button
                  onClick={zoomIn}
                  disabled={zoomIndex === ZOOM_LEVELS.length - 1}
                  className="w-8 h-8 rounded-md border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                  aria-label="Zoom in"
                >
                  +
                </button>
              </div>
            </div>

            <DndContext
              sensors={sensors}
              onDragStart={onDragStart}
              onDragEnd={onDragEnd}
              onDragCancel={onDragCancel}
              accessibility={{ announcements }}
            >
              <div className="flex min-w-max" style={{ gap: boardGap }}>
                {COLUMNS.map(col => {
                  const colJobs = getJobsForStatus(col.status);
                  const isDragging = !!activeJob;
                  const isPotentialTarget = isDragging && activeJob?.status !== col.status;
                  return (
                    <DroppableColumn
                      key={col.status}
                      status={col.status}
                      className={`flex-shrink-0 rounded-2xl border-2 flex flex-col transition-all duration-150 ${
                        isPotentialTarget
                          ? 'border-blue-200 bg-blue-50/30'
                          : 'border-gray-200 bg-white'
                      }`}
                      style={{ width: columnWidth }}
                      activeHighlight="!border-blue-500 !bg-blue-100 shadow-lg"
                    >
                      {/* Column header */}
                      <div className={`px-4 py-3 border-b rounded-t-2xl ${col.headerBg}`}>
                        <div className="flex justify-between items-center">
                          <h2 className={`font-semibold text-sm ${col.color}`}>{t(col.labelKey)}</h2>
                          <span className={`text-xs font-bold px-2 py-0.5 rounded-full bg-white/80 ${col.color}`}>
                            {colJobs.length}
                          </span>
                        </div>
                      </div>

                      {/* Cards */}
                      <div className={`${compactCards ? 'p-2 space-y-2' : 'p-3 space-y-2.5'} min-h-36 flex-1`}>
                        {colJobs.length === 0 ? (
                          <div
                            className={`text-center py-8 text-sm rounded-xl border-2 border-dashed transition-colors ${
                              isPotentialTarget ? 'border-blue-300 text-blue-400' : 'border-gray-200 text-gray-300'
                            }`}
                          >
                            {isDragging ? t('kanbanDropHere') : t('kanbanEmpty')}
                          </div>
                        ) : (
                          colJobs.map(job => (
                            <DraggableKanbanCard
                              key={job.id}
                              job={job}
                              onClick={() => navigate(`/jobs/${job.id}`)}
                              t={t}
                              locale={locale}
                              compact={compactCards}
                            />
                          ))
                        )}
                      </div>
                    </DroppableColumn>
                  );
                })}
              </div>

              {/* Drag preview overlay */}
              <DragOverlay>
                {activeJob ? (
                  <div style={{ width: columnWidth }}>
                    <KanbanCard
                      job={activeJob}
                      onClick={() => {}}
                      t={t}
                      locale={locale}
                      compact={compactCards}
                    />
                  </div>
                ) : null}
              </DragOverlay>
            </DndContext>
          </div>
        </>
      )}
    </div>
  );
};
