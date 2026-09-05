import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { jobsService } from '../services/jobs.service';
import type { Job } from '../types';
import { usePreferencesStore, jobMatchesFilter } from '../store/preferencesStore';
import { useToastStore } from '../store/toastStore';
import { useLanguage } from '../store/languageStore';

const BATCH_SIZE = 20;
const SWIPE_THRESHOLD = 80;
type SwipeDirection = 'left' | 'right' | 'up';

const stripHtml = (html: string) => html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

const IconFire = ({ size = 24 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
    <path d="M17.66 11.2c-.23-.3-.51-.56-.77-.82-.67-.6-1.43-1.03-2.07-1.66C13.33 7.26 13 4.85 13.95 3c-.95.23-1.78.75-2.49 1.32C8.87 6.4 7.85 10.07 9.07 13.22c.04.1.08.2.08.33 0 .22-.15.42-.35.5-.23.1-.47.04-.66-.12-.06-.05-.1-.1-.14-.17C6.87 12.33 6.69 10.28 7.45 8.64 5.78 10 4.87 12.3 5 14.47c.06.5.12 1 .29 1.5.14.6.41 1.2.71 1.73C7.08 19.43 8.95 20.67 10.96 20.92c2.14.27 4.43-.12 6.07-1.6 1.83-1.66 2.47-4.32 1.53-6.6l-.13-.26c-.21-.46-.77-1.26-.77-1.26z"/>
  </svg>
);

const IconRefresh = ({ size = 18 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M1 4v6h6M23 20v-6h-6"/>
    <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4-4.64 4.36A9 9 0 0 1 3.51 15"/>
  </svg>
);

const IconStar = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
  </svg>
);

const IconArrowUp = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 19V5" />
    <path d="m5 12 7-7 7 7" />
  </svg>
);

const IconCheck = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 6 9 17l-5-5" />
  </svg>
);

const IconX = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 6 6 18" />
    <path d="m6 6 12 12" />
  </svg>
);

const SOURCE_LABELS: Record<string, { label: string; cls: string }> = {
  bundesagentur: { label: 'Bundesagentur', cls: 'bg-blue-50 text-blue-600 border-blue-100' },
  adzuna: { label: 'Adzuna', cls: 'bg-purple-50 text-purple-600 border-purple-100' },
};

export const HotpicksPage = () => {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const { filterKeywords, filterEnabled } = usePreferencesStore();
  const { show: showToast } = useToastStore();
  const [queue, setQueue] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [exhausted, setExhausted] = useState(false);
  const [lastAction, setLastAction] = useState<'saved' | 'passed' | 'soon' | null>(null);
  const [lastSwiped, setLastSwiped] = useState<{ job: Job; direction: SwipeDirection } | null>(null);
  const [sessionStats, setSessionStats] = useState({ saved: 0, passed: 0, soon: 0 });
  const [dragOffset, setDragOffset] = useState(0);
  const [isSwiping, setIsSwiping] = useState(false);
  const [flying, setFlying] = useState<SwipeDirection | null>(null);
  const startX = useRef(0);
  const startY = useRef(0);
  const lockedDir = useRef<'h' | 'v' | null>(null);
  const dragOffsetRef = useRef(0);
  const dragYRef = useRef(0);
  const fetchingRef = useRef(false);
  const fetchOffsetRef = useRef(0);

  useEffect(() => {
    fetchMore();
  }, []);

  useEffect(() => {
    if (!loading && queue.length < 5 && !exhausted) {
      fetchMore();
    }
  }, [queue.length, exhausted, loading]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (flying || queue.length === 0) return;
      if (e.key === 'ArrowRight' || e.key === 'd') triggerAction('right');
      if (e.key === 'ArrowLeft' || e.key === 'a') triggerAction('left');
      if (e.key === 'ArrowUp' || e.key === 'w') triggerAction('up');
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') handleUndo();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [flying, queue.length]);

  const fetchMore = async () => {
    if (fetchingRef.current || exhausted) return;
    fetchingRef.current = true;
    try {
      const response = await jobsService.getJobs({
        status: 'new',
        limit: BATCH_SIZE,
        offset: fetchOffsetRef.current,
        sortBy: 'match_score',
        sortOrder: 'DESC',
      });
      if (response.jobs.length === 0) {
        setExhausted(true);
      } else {
        const filtered = response.jobs.filter((job) => jobMatchesFilter(job, filterKeywords, filterEnabled));
        setQueue((prev) => [...prev, ...filtered]);
        fetchOffsetRef.current += response.jobs.length;
      }
    } catch (err) {
      console.error('Hotpicks fetch error:', err);
    } finally {
      fetchingRef.current = false;
      setLoading(false);
    }
  };

  const handleRefresh = () => {
    setQueue([]);
    setExhausted(false);
    setLoading(true);
    fetchOffsetRef.current = 0;
    fetchingRef.current = false;
    setLastSwiped(null);
    setSessionStats({ saved: 0, passed: 0, soon: 0 });
    fetchMore();
  };

  const triggerAction = (direction: SwipeDirection) => {
    if (flying || queue.length === 0) return;
    setFlying(direction);
    const job = queue[0];
    setTimeout(async () => {
      setQueue((prev) => prev.slice(1));
      setDragOffset(0);
      dragOffsetRef.current = 0;
      dragYRef.current = 0;
      setFlying(null);
      setIsSwiping(false);
      lockedDir.current = null;
      setLastSwiped({ job, direction });
      setSessionStats((prev) => ({
        saved: prev.saved + (direction === 'right' ? 1 : 0),
        passed: prev.passed + (direction === 'left' ? 1 : 0),
        soon: prev.soon + (direction === 'up' ? 1 : 0),
      }));
      setLastAction(direction === 'right' ? 'saved' : direction === 'up' ? 'soon' : 'passed');
      setTimeout(() => setLastAction(null), 1500);
      try {
        if (direction === 'right') {
          await jobsService.updateStatus(job.id, 'saved');
        } else if (direction === 'up') {
          await jobsService.markApplySoon(job.id);
        } else {
          await jobsService.toggleHidden(job.id, true);
        }
      } catch (error) {
        console.error('Swipe action failed:', error);
        showToast(t('toastActionFailed'), 'error');
      }
    }, 320);
  };

  const handleUndo = async () => {
    if (!lastSwiped || flying) return;
    const { job, direction } = lastSwiped;
    setQueue((prev) => [job, ...prev.filter((item) => item.id !== job.id)]);
    setLastSwiped(null);
    setSessionStats((prev) => ({
      saved: Math.max(0, prev.saved - (direction === 'right' ? 1 : 0)),
      passed: Math.max(0, prev.passed - (direction === 'left' ? 1 : 0)),
      soon: Math.max(0, prev.soon - (direction === 'up' ? 1 : 0)),
    }));
    try {
      if (direction === 'left') {
        await jobsService.toggleHidden(job.id, false);
      } else {
        await jobsService.updateStatus(job.id, 'new');
      }
    } catch (error) {
      console.error('Undo failed:', error);
      showToast(t('toastActionFailed'), 'error');
    }
  };

  const onTouchStart = (e: React.TouchEvent) => {
    if (flying) return;
    startX.current = e.touches[0].clientX;
    startY.current = e.touches[0].clientY;
    lockedDir.current = null;
    dragYRef.current = 0;
  };

  const onTouchMove = (e: React.TouchEvent) => {
    if (flying) return;
    const dx = e.touches[0].clientX - startX.current;
    const dy = e.touches[0].clientY - startY.current;

    if (!lockedDir.current) {
      if (Math.abs(dx) < 5 && Math.abs(dy) < 5) return;
      lockedDir.current = Math.abs(dx) > Math.abs(dy) ? 'h' : 'v';
    }
    if (lockedDir.current === 'v') {
      dragYRef.current = dy;
      return;
    }

    setIsSwiping(true);
    dragOffsetRef.current = dx;
    setDragOffset(dx);
  };

  const onTouchEnd = () => {
    if (flying) return;
    if (lockedDir.current === 'h') {
      if (dragOffsetRef.current > SWIPE_THRESHOLD) {
        triggerAction('right');
        return;
      }
      if (dragOffsetRef.current < -SWIPE_THRESHOLD) {
        triggerAction('left');
        return;
      }
    }
    if (lockedDir.current === 'v' && dragYRef.current < -SWIPE_THRESHOLD) {
      triggerAction('up');
      return;
    }
    setDragOffset(0);
    dragOffsetRef.current = 0;
    dragYRef.current = 0;
    setIsSwiping(false);
    lockedDir.current = null;
  };

  const rotation = dragOffset * 0.05;
  const cardStyle = flying
    ? {
        transform: flying === 'up'
          ? 'translateY(-520px) scale(0.98)'
          : `translateX(${flying === 'right' ? 520 : -520}px) rotate(${flying === 'right' ? 16 : -16}deg)`,
        transition: 'transform 0.32s ease',
      }
    : {
        transform: `translateX(${dragOffset}px) rotate(${rotation}deg)`,
        transition: isSwiping ? 'none' : 'transform 0.25s ease',
        touchAction: 'pan-y' as const,
      };

  if (loading) {
    return (
      <div className="flex items-center justify-center bg-gray-50" style={{ height: 'calc(100dvh - 5rem)' }}>
        <div className="text-center">
          <div className="mb-4 text-green-600"><IconFire size={42} /></div>
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-b-2 border-green-600" />
        </div>
      </div>
    );
  }

  if (!loading && queue.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center bg-gray-50 px-6 text-center" style={{ height: 'calc(100dvh - 5rem)' }}>
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
          <IconCheck size={32} />
        </div>
        <h2 className="mb-2 text-xl font-bold text-gray-900">{t('allCaughtUp')}</h2>
        <p className="mb-8 text-sm text-gray-500">{t('freshPicksHint')}</p>
        <button
          onClick={handleRefresh}
          className="rounded-lg bg-green-600 px-6 py-3 font-semibold text-white shadow-sm transition hover:bg-green-700 active:scale-95"
        >
          <span className="flex items-center gap-2"><IconRefresh size={16} /> {t('startOver')}</span>
        </button>
        <button
          onClick={() => navigate('/jobs')}
          className="mt-4 text-sm text-gray-500 transition hover:text-gray-700"
        >
          {t('browseAllJobs')}
        </button>
      </div>
    );
  }

  const currentJob = queue[0];
  const nextJob = queue[1];
  const afterJob = queue[2];
  const src = SOURCE_LABELS[currentJob?.source?.toLowerCase()] ?? { label: currentJob?.source || 'Source', cls: 'bg-gray-100 text-gray-500 border-gray-200' };

  return (
    <div className="min-h-[calc(100dvh-5rem)] bg-gray-50 pb-24 sm:pb-0">
      <div className="border-b border-gray-200 bg-white">
        <div className="mx-auto max-w-6xl px-4 py-4 sm:px-6 sm:py-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h1 className="flex items-center gap-2 text-xl font-bold text-gray-900 sm:text-2xl">
                <span className="text-green-600"><IconFire size={20} /></span>
                {t('hotPicks')}
              </h1>
              <p className="mt-1 max-w-2xl text-xs text-gray-500 sm:text-sm">{t('hotPicksSubtitle')}</p>
            </div>
            <div className="flex items-center gap-2 self-start">
              {lastAction && (
                <span className={`rounded-md border px-2.5 py-1.5 text-xs font-semibold sm:px-3 sm:py-2 sm:text-sm ${
                  lastAction === 'saved'
                    ? 'border-yellow-200 bg-yellow-50 text-yellow-800'
                    : lastAction === 'soon'
                      ? 'border-blue-200 bg-blue-50 text-blue-800'
                      : 'border-gray-200 bg-gray-100 text-gray-700'
                }`}>
                  {lastAction === 'saved' ? t('savedBang') : lastAction === 'soon' ? t('applySoon') : t('passed')}
                </span>
              )}
              <button
                onClick={handleUndo}
                disabled={!lastSwiped || !!flying}
                className="rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-gray-600 transition hover:border-gray-400 hover:text-gray-900 disabled:opacity-40 sm:px-3 sm:py-2 sm:text-sm"
              >
                {t('undo')}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto grid max-w-6xl gap-4 px-4 py-4 sm:gap-6 sm:px-6 sm:py-6 lg:grid-cols-[18rem_minmax(0,1fr)]">
        <aside className="order-2 space-y-4 lg:order-1">
          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">{t('reviewQueue')}</p>
            <p className="mt-2 text-3xl font-bold text-gray-900">{queue.length}</p>
            <p className="mt-1 text-sm text-gray-500">{t('hotPicksDeck')}</p>
            <div className="mt-4 grid grid-cols-3 gap-2">
              <div className="rounded-md bg-yellow-50 px-3 py-2 text-center">
                <p className="text-lg font-bold text-yellow-700">{sessionStats.saved}</p>
                <p className="text-[11px] font-semibold text-yellow-800">{t('saved')}</p>
              </div>
              <div className="rounded-md bg-gray-100 px-3 py-2 text-center">
                <p className="text-lg font-bold text-gray-700">{sessionStats.passed}</p>
                <p className="text-[11px] font-semibold text-gray-700">{t('passed')}</p>
              </div>
              <div className="rounded-md bg-blue-50 px-3 py-2 text-center">
                <p className="text-lg font-bold text-blue-700">{sessionStats.soon}</p>
                <p className="text-[11px] font-semibold text-blue-800">{t('soon')}</p>
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">{t('upNext')}</p>
            <p className="mt-2 line-clamp-2 text-sm font-semibold text-gray-900">
              {nextJob?.title || t('allCaughtUp')}
            </p>
            {nextJob && (
              <p className="mt-1 line-clamp-2 text-xs text-gray-500">
                {nextJob.company} · {nextJob.location}
              </p>
            )}
            <p className="mt-4 text-xs text-gray-500">{t('swipeStillWorks')}</p>
          </div>

          <div className="flex gap-2">
            <button
              onClick={handleRefresh}
              className="flex-1 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-700 transition hover:border-gray-400 hover:text-gray-900"
            >
              <span className="flex items-center justify-center gap-2"><IconRefresh size={16} /> {t('startOver')}</span>
            </button>
            <button
              onClick={() => navigate('/jobs')}
              className="flex-1 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-700 transition hover:border-gray-400 hover:text-gray-900"
            >
              {t('browseAllJobs')}
            </button>
          </div>
        </aside>

        <section className="order-1 min-w-0 lg:order-2">
          <div className="mb-3 flex items-center justify-between gap-3 rounded-lg border border-green-100 bg-green-50 px-3 py-2.5 sm:mb-4 sm:px-4 sm:py-3">
            <p className="text-xs font-medium text-green-800 sm:text-sm">{t('hotPicksHint')}</p>
            <span className="hidden rounded-md bg-white px-3 py-1.5 text-xs font-semibold text-green-800 sm:inline-block">
              {t('reviewQueue')}
            </span>
          </div>

          <div className="relative min-h-[28rem] sm:min-h-[34rem]">
            {afterJob && (
              <div
                className="absolute inset-x-5 top-4 h-[calc(100%-1rem)] rounded-lg border border-gray-200 bg-white/70 sm:inset-x-8"
                style={{ transform: 'scale(0.98)', zIndex: 1 }}
              />
            )}
            {nextJob && (
              <div
                className="absolute inset-x-2 top-2 h-[calc(100%-0.5rem)] rounded-lg border border-gray-200 bg-white/85 sm:inset-x-4"
                style={{ transform: 'scale(0.99)', zIndex: 2 }}
              />
            )}

            {currentJob && (
              <div
                className="relative z-10 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm"
                style={cardStyle}
                onTouchStart={onTouchStart}
                onTouchMove={onTouchMove}
                onTouchEnd={onTouchEnd}
              >
                <div className="border-b border-gray-100 px-4 py-4 sm:px-6 sm:py-5">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2 sm:mb-4 sm:gap-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${src.cls}`}>
                        {src.label}
                      </span>
                      <span className="rounded-full border border-green-200 bg-green-50 px-2.5 py-1 text-xs font-semibold text-green-800">
                        {currentJob.match_score ?? 0}% {t('match')}
                      </span>
                    </div>
                    <span className="text-xs font-medium text-gray-400">
                      {queue.length} {t('hotPicksDeck')}
                    </span>
                  </div>

                  <h2 className="text-xl font-bold leading-tight text-gray-900 sm:text-2xl">{currentJob.title}</h2>
                  <p className="mt-3 text-sm font-semibold text-gray-700 sm:text-base">{currentJob.company}</p>
                  <p className="mt-1 text-sm text-gray-500">{currentJob.location}</p>
                  {currentJob.salary && (
                    <p className="mt-3 text-sm font-semibold text-green-700">{currentJob.salary}</p>
                  )}
                </div>

                <div className="space-y-4 px-4 py-4 sm:space-y-5 sm:px-6 sm:py-5">
                  <div className="rounded-lg border border-green-100 bg-green-50 px-4 py-3">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-green-800">{t('whyThisPick')}</p>
                    <div className="flex flex-wrap gap-2">
                      {(currentJob.match_reasons ?? []).slice(0, 4).map((reason) => (
                        <span key={reason} className="rounded-full border border-green-200 bg-white px-2.5 py-1 text-xs font-semibold text-green-800">
                          {reason}
                        </span>
                      ))}
                      {(currentJob.match_gaps ?? []).slice(0, 2).map((gap) => (
                        <span key={gap} className="rounded-full border border-amber-200 bg-white px-2.5 py-1 text-xs font-semibold text-amber-800">
                          {t('missing')}: {gap}
                        </span>
                      ))}
                    </div>
                  </div>

                  {currentJob.description && (
                    <div>
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">{t('jobSummary')}</p>
                      <p className="line-clamp-5 text-sm leading-6 text-gray-600 sm:line-clamp-6 sm:leading-7">
                        {stripHtml(currentJob.description)}
                      </p>
                    </div>
                  )}

                  <div className="grid gap-3 sm:grid-cols-2">
                    <button
                      onClick={() => navigate(`/jobs/${currentJob.id}`)}
                      className="rounded-md border border-gray-300 bg-white px-4 py-3 text-sm font-semibold text-gray-700 transition hover:border-gray-400 hover:text-gray-900"
                    >
                      {t('viewFullListing')}
                    </button>
                    <button
                      onClick={() => navigate('/kanban')}
                      className="rounded-md border border-gray-300 bg-white px-4 py-3 text-sm font-semibold text-gray-700 transition hover:border-gray-400 hover:text-gray-900"
                    >
                      {t('applicationsBoard')}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="mt-4 hidden gap-3 sm:grid sm:grid-cols-3">
            <button
              onClick={() => triggerAction('left')}
              disabled={!!flying}
              className="flex items-center justify-center gap-2 rounded-md border border-gray-300 bg-white px-4 py-3 text-sm font-semibold text-gray-700 transition hover:border-gray-400 hover:text-gray-900 disabled:opacity-50"
            >
              <IconX size={16} />
              {t('passForNow')}
            </button>
            <button
              onClick={() => triggerAction('right')}
              disabled={!!flying}
              className="flex items-center justify-center gap-2 rounded-md border border-yellow-300 bg-yellow-50 px-4 py-3 text-sm font-semibold text-yellow-800 transition hover:bg-yellow-100 disabled:opacity-50"
            >
              <IconStar size={16} />
              {t('saveToBoard')}
            </button>
            <button
              onClick={() => triggerAction('up')}
              disabled={!!flying}
              className="flex items-center justify-center gap-2 rounded-md border border-blue-300 bg-blue-50 px-4 py-3 text-sm font-semibold text-blue-800 transition hover:bg-blue-100 disabled:opacity-50"
            >
              <IconArrowUp size={16} />
              {t('applySoon')}
            </button>
          </div>

          <div className="fixed inset-x-0 bottom-0 z-20 border-t border-gray-200 bg-white/95 px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3 shadow-[0_-8px_24px_rgba(15,23,42,0.08)] backdrop-blur sm:hidden">
            <div className="grid grid-cols-3 gap-2">
              <button
                onClick={() => triggerAction('left')}
                disabled={!!flying}
                className="flex min-h-[3.25rem] flex-col items-center justify-center gap-1 rounded-md border border-gray-300 bg-white px-2 py-2 text-xs font-semibold text-gray-700 transition hover:border-gray-400 disabled:opacity-50"
              >
                <IconX size={16} />
                {t('passed')}
              </button>
              <button
                onClick={() => triggerAction('right')}
                disabled={!!flying}
                className="flex min-h-[3.25rem] flex-col items-center justify-center gap-1 rounded-md border border-yellow-300 bg-yellow-50 px-2 py-2 text-xs font-semibold text-yellow-800 transition hover:bg-yellow-100 disabled:opacity-50"
              >
                <IconStar size={16} />
                {t('saved')}
              </button>
              <button
                onClick={() => triggerAction('up')}
                disabled={!!flying}
                className="flex min-h-[3.25rem] flex-col items-center justify-center gap-1 rounded-md border border-blue-300 bg-blue-50 px-2 py-2 text-xs font-semibold text-blue-800 transition hover:bg-blue-100 disabled:opacity-50"
              >
                <IconArrowUp size={16} />
                {t('applySoon')}
              </button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};
