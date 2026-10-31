import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { FeaturedOpportunity } from '../components/jobs/FeaturedOpportunity';
import { LabourMarketContext } from '../components/jobs/LabourMarketContext';
import { jobsService } from '../services/jobs.service';
import type { Job } from '../types';
import { usePreferencesStore, jobMatchesFilter } from '../store/preferencesStore';
import { useLanguage } from '../store/languageStore';
import { useToastStore } from '../store/toastStore';

const SWIPE_THRESHOLD = 80;
type SwipeDirection = 'left' | 'right' | 'up';


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
  bundesagentur: { label: 'Bundesagentur', cls: 'bg-subtle text-muted border-line' },
  adzuna: { label: 'Adzuna', cls: 'bg-subtle text-muted border-line' },
};

export const HotpicksPage = () => {
  const navigate = useNavigate();
  const { t, lang } = useLanguage();
  const { filterKeywords, filterEnabled } = usePreferencesStore();
  const [queue, setQueue] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [browseWindowLimited, setBrowseWindowLimited] = useState(false);
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
  const actionPendingRef = useRef(false);

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

  const fetchMore = async (force = false) => {
    if (fetchingRef.current || (!force && exhausted)) return;
    fetchingRef.current = true;
    setLoadError('');
    try {
      const response = await jobsService.getRecommendations(filterEnabled ? filterKeywords : []);
      const filtered = response.jobs.filter((job) => jobMatchesFilter(job, filterKeywords, filterEnabled));
      setQueue(filtered);
      setBrowseWindowLimited(Boolean(response.browse_window_limited));
      setExhausted(true);
    } catch (err) {
      console.error('Hotpicks fetch error:', err);
      setQueue([]);
      setLoadError(lang === 'de' ? 'Die Empfehlungen konnten nicht vollständig geladen werden. Passe gegebenenfalls deine Suchbegriffe an und versuche es erneut.' : 'Recommendations could not be fully loaded. Refine your keywords if needed, then retry.');
      setExhausted(true);
      useToastStore.getState().show('Jobs could not be loaded. Use Start over to retry.', 'error');
    } finally {
      fetchingRef.current = false;
      setLoading(false);
    }
  };

  const handleRefresh = () => {
    if (actionPendingRef.current || fetchingRef.current) return;
    setQueue([]);
    setExhausted(false);
    setLoading(true);
    fetchingRef.current = false;
    setLastSwiped(null);
    setSessionStats({ saved: 0, passed: 0, soon: 0 });
    void fetchMore(true);
  };

  const triggerAction = async (direction: SwipeDirection) => {
    if (actionPendingRef.current || flying || queue.length === 0) return;
    actionPendingRef.current = true;
    setFlying(direction);
    const job = queue[0];
    try {
      if (direction === 'right') await jobsService.updateStatus(job.id, 'saved');
      else if (direction === 'up') await jobsService.markApplySoon(job.id);
      else await jobsService.toggleHidden(job.id, true);
      setQueue((prev) => prev.slice(1));
      setDragOffset(0);
      dragOffsetRef.current = 0;
      dragYRef.current = 0;
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
    } catch {
      useToastStore.getState().show('This job was not saved. Please try again.', 'error');
    } finally {
      setFlying(null);
      actionPendingRef.current = false;
    }
  };

  const handleUndo = async () => {
    if (!lastSwiped || flying || actionPendingRef.current) return;
    const { job, direction } = lastSwiped;
    actionPendingRef.current = true;
    try {
      if (direction === 'left') await jobsService.toggleHidden(job.id, false);
      else await jobsService.updateStatus(job.id, 'new');
      setQueue((prev) => [job, ...prev.filter((item) => item.id !== job.id)]);
      setLastSwiped(null);
      setSessionStats((prev) => ({
        saved: Math.max(0, prev.saved - (direction === 'right' ? 1 : 0)),
        passed: Math.max(0, prev.passed - (direction === 'left' ? 1 : 0)),
        soon: Math.max(0, prev.soon - (direction === 'up' ? 1 : 0)),
      }));
    } catch {
      useToastStore.getState().show('Undo failed. Your tracker was not changed.', 'error');
    } finally {
      actionPendingRef.current = false;
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
      <div className="flex items-center justify-center bg-canvas" style={{ height: 'calc(100dvh - 5rem)' }}>
        <div className="text-center">
          <div className="mb-4 text-accent"><IconFire size={42} /></div>
          <p role="status">{t('loading')}</p>
        </div>
      </div>
    );
  }

  if (!loading && queue.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center bg-canvas px-6 text-center" style={{ height: 'calc(100dvh - 5rem)' }}>
        {!loadError && <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-md bg-subtle">
          <IconCheck size={32} />
        </div>}
        <h2 className="mb-2 text-xl font-semibold text-ink">{loadError ? lang === 'de' ? 'Empfehlungen nicht verfügbar' : 'Recommendations unavailable' : t('allCaughtUp')}</h2>
        <p role={loadError ? 'alert' : undefined} className="mb-8 text-sm text-muted">{loadError || (browseWindowLimited ? lang === 'de' ? 'Diese Auswahl umfasst die neuesten 1.000 Stellen. Hinterlege Suchbegriffe in den Einstellungen, um den gesamten Feed zu berücksichtigen.' : 'This queue covers the latest 1,000 vacancies. Add keywords in Settings to include matching jobs from the full feed.' : t('freshPicksHint'))}</p>
        <button
          onClick={handleRefresh}
          className="rounded-lg bg-ink px-6 py-3 font-semibold text-on-ink shadow-none transition hover:bg-ink "
        >
          <span className="flex items-center gap-2"><IconRefresh size={16} /> {t('startOver')}</span>
        </button>
        <button
          onClick={() => navigate('/jobs')}
          className="mt-4 text-sm text-muted transition hover:text-ink"
        >
          {t('browseAllJobs')}
        </button>
      </div>
    );
  }

  const currentJob = queue[0];
  const nextJob = queue[1];
  const src = SOURCE_LABELS[currentJob?.source?.toLowerCase()] ?? { label: currentJob?.source || 'Source', cls: 'bg-subtle text-muted border-line' };

  return (
    <div className="min-h-[calc(100dvh-5rem)] bg-canvas pb-24 sm:pb-0">
      <div className="border-b border-line bg-surface">
        <div className="mx-auto max-w-6xl px-4 py-4 sm:px-6 sm:py-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h1 className="flex items-center gap-2 text-xl font-semibold text-ink sm:text-2xl">
                <span className="text-accent"><IconFire size={20} /></span>
                {t('hotPicks')}
              </h1>
              <p className="mt-1 max-w-2xl text-xs text-muted sm:text-sm">{t('hotPicksSubtitle')}</p>
              {browseWindowLimited && <p className="mt-1 max-w-2xl text-xs text-muted sm:text-sm">{lang === 'de' ? 'Neueste 1.000 Stellen. Suchbegriffe in den Einstellungen erweitern die Empfehlungen auf den gesamten Feed.' : 'Latest 1,000 vacancies. Add keywords in Settings for recommendations across the full feed.'}</p>}
            </div>
            <div className="flex items-center gap-2 self-start">
              {lastAction && (
                <span className={`rounded-md border px-2.5 py-1.5 text-xs font-semibold sm:px-3 sm:py-2 sm:text-sm ${
                  lastAction === 'saved'
                    ? 'border-line bg-subtle text-muted'
                    : lastAction === 'soon'
                      ? 'border-line bg-subtle text-muted'
                      : 'border-line bg-subtle text-ink'
                }`}>
                  {lastAction === 'saved' ? t('savedBang') : lastAction === 'soon' ? t('applySoon') : t('passed')}
                </span>
              )}
              <button
                onClick={handleUndo}
                disabled={!lastSwiped || !!flying}
                className="rounded-md border border-line bg-surface px-2.5 py-1.5 text-xs font-semibold text-muted transition hover:border-line hover:text-ink disabled:opacity-40 sm:px-3 sm:py-2 sm:text-sm"
              >
                {t('undo')}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto grid max-w-6xl gap-4 px-4 py-4 sm:gap-6 sm:px-6 sm:py-6 lg:grid-cols-[18rem_minmax(0,1fr)]">
        <aside className="order-2 lg:order-1 min-w-0">
          <div className="review-summary"><strong>{queue.length}</strong><span>{t('reviewQueue')}</span></div>
          <div className="review-session"><span><strong>{sessionStats.saved}</strong>{t('saved')}</span><span><strong>{sessionStats.passed}</strong>{t('passed')}</span><span><strong>{sessionStats.soon}</strong>{t('soon')}</span></div>
          <section className="review-next"><h2>{t('upNext')}</h2><p>{nextJob?.title || t('allCaughtUp')}</p>{nextJob && <small>{nextJob.company} · {nextJob.location}</small>}<small className="mt-4">{t('swipeStillWorks')}</small></section>
          <div className="ui-actions"><button type="button" className="ui-button" onClick={handleRefresh}><IconRefresh size={16} />{t('startOver')}</button><button type="button" className="ui-button" onClick={() => navigate('/jobs')}>{t('browseAllJobs')}</button></div>
          <LabourMarketContext />
        </aside>

        <section className="order-1 min-w-0 lg:order-2">
          <div className="mb-3 flex items-center justify-between gap-3 rounded-lg border border-line bg-subtle px-3 py-2.5 sm:mb-4 sm:px-4 sm:py-3">
            <p className="text-xs font-medium text-accent sm:text-sm">{t('hotPicksHint')}</p>
            <span className="hidden rounded-md bg-surface px-3 py-1.5 text-xs font-semibold text-accent sm:inline-block">
              {t('reviewQueue')}
            </span>
          </div>

          <div className="relative">
            {currentJob && (
              <div
                className="opportunity-card relative z-10"
                style={cardStyle}
                onTouchStart={onTouchStart}
                onTouchMove={onTouchMove}
                onTouchEnd={onTouchEnd}
              >
                <FeaturedOpportunity job={currentJob} source={src.label} t={t}>
                  <button type="button" onClick={() => navigate(`/jobs/${currentJob.id}`)}>{t('viewFullListing')}</button>
                  <button type="button" onClick={() => navigate('/kanban')}>{t('applicationsBoard')}</button>
                </FeaturedOpportunity>
              </div>
            )}
          </div>

          <div className="mt-4 hidden gap-3 sm:grid sm:grid-cols-3">
            <button
              onClick={() => triggerAction('left')}
              disabled={!!flying}
              className="flex items-center justify-center gap-2 rounded-md border border-line bg-surface px-4 py-3 text-sm font-semibold text-ink transition hover:border-line hover:text-ink disabled:opacity-50"
            >
              <IconX size={16} />
              {t('passForNow')}
            </button>
            <button
              onClick={() => triggerAction('right')}
              disabled={!!flying}
              className="flex items-center justify-center gap-2 rounded-md border border-line bg-subtle px-4 py-3 text-sm font-semibold text-muted transition hover:bg-subtle disabled:opacity-50"
            >
              <IconStar size={16} />
              {t('saveToBoard')}
            </button>
            <button
              onClick={() => triggerAction('up')}
              disabled={!!flying}
              className="flex items-center justify-center gap-2 rounded-md border border-line bg-subtle px-4 py-3 text-sm font-semibold text-muted transition hover:bg-subtle disabled:opacity-50"
            >
              <IconArrowUp size={16} />
              {t('applySoon')}
            </button>
          </div>

          <div className="fixed inset-x-0 bottom-[var(--mobile-nav-height)] z-20 border-t border-line bg-surface px-4 pb-3 pt-3 shadow-none  sm:hidden">
            <div className="grid grid-cols-3 gap-2">
              <button
                onClick={() => triggerAction('left')}
                disabled={!!flying}
                className="flex min-h-[3.25rem] flex-col items-center justify-center gap-1 rounded-md border border-line bg-surface px-2 py-2 text-xs font-semibold text-ink transition hover:border-line disabled:opacity-50"
              >
                <IconX size={16} />
                {t('passed')}
              </button>
              <button
                onClick={() => triggerAction('right')}
                disabled={!!flying}
                className="flex min-h-[3.25rem] flex-col items-center justify-center gap-1 rounded-md border border-line bg-subtle px-2 py-2 text-xs font-semibold text-muted transition hover:bg-subtle disabled:opacity-50"
              >
                <IconStar size={16} />
                {t('saved')}
              </button>
              <button
                onClick={() => triggerAction('up')}
                disabled={!!flying}
                className="flex min-h-[3.25rem] flex-col items-center justify-center gap-1 rounded-md border border-line bg-subtle px-2 py-2 text-xs font-semibold text-muted transition hover:bg-subtle disabled:opacity-50"
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
