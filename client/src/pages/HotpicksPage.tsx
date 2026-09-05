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

const IconRefresh = ({ size = 20 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M1 4v6h6M23 20v-6h-6"/>
    <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4-4.64 4.36A9 9 0 0 1 3.51 15"/>
  </svg>
);

const IconStar = ({ size = 18 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
  </svg>
);

const SOURCE_LABELS: Record<string, { label: string; cls: string }> = {
  bundesagentur: { label: 'Bundesagentur', cls: 'bg-blue-50 text-blue-600 border-blue-100' },
  adzuna:        { label: 'Adzuna',        cls: 'bg-purple-50 text-purple-600 border-purple-100' },
};

export const HotpicksPage = () => {
  const navigate = useNavigate();
  const { filterKeywords, filterEnabled } = usePreferencesStore();
  const { show: showToast } = useToastStore();
  const { t } = useLanguage();
  const [queue, setQueue] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [exhausted, setExhausted] = useState(false);
  const [lastAction, setLastAction] = useState<'saved' | 'passed' | 'soon' | null>(null);
  const [lastSwiped, setLastSwiped] = useState<{ job: Job; direction: SwipeDirection } | null>(null);
  const [sessionStats, setSessionStats] = useState({ saved: 0, passed: 0, soon: 0 });

  // Swipe state
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

  // Pre-fetch next batch when queue runs low
  useEffect(() => {
    if (!loading && queue.length < 5 && !exhausted) {
      fetchMore();
    }
  }, [queue.length, exhausted]);

  // Keyboard navigation (desktop)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (flying || queue.length === 0) return;
      if (e.key === 'ArrowRight' || e.key === 'd') triggerAction('right');
      if (e.key === 'ArrowLeft'  || e.key === 'a') triggerAction('left');
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
        const filtered = response.jobs.filter(j => jobMatchesFilter(j, filterKeywords, filterEnabled));
        setQueue(prev => [...prev, ...filtered]);
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
      setQueue(prev => prev.slice(1));
      setDragOffset(0);
      dragOffsetRef.current = 0;
      dragYRef.current = 0;
      setFlying(null);
      setIsSwiping(false);
      lockedDir.current = null;
      setLastSwiped({ job, direction });
      setSessionStats(prev => ({
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
    setQueue(prev => [job, ...prev.filter(item => item.id !== job.id)]);
    setLastSwiped(null);
    setSessionStats(prev => ({
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

  // Touch handlers
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
      } else if (dragOffsetRef.current < -SWIPE_THRESHOLD) {
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

  const rotation = dragOffset * 0.07;
  const saveOpacity = Math.min(Math.max(dragOffset / SWIPE_THRESHOLD, 0), 1);
  const passOpacity = Math.min(Math.max(-dragOffset / SWIPE_THRESHOLD, 0), 1);

  const cardStyle = flying
    ? {
        transform: flying === 'up'
          ? 'translateY(-760px) scale(0.96)'
          : `translateX(${flying === 'right' ? 700 : -700}px) rotate(${flying === 'right' ? 30 : -30}deg)`,
        transition: 'transform 0.32s ease',
        zIndex: 10,
      }
    : {
        transform: `translateX(${dragOffset}px) rotate(${rotation}deg)`,
        transition: isSwiping ? 'none' : 'transform 0.25s ease',
        touchAction: 'pan-y' as const,
        zIndex: 10,
      };

  // ── Loading ──
  if (loading) {
    return (
      <div className="flex items-center justify-center bg-gradient-to-b from-orange-50 to-rose-50" style={{ height: 'calc(100dvh - 5rem)' }}>
        <div className="text-center">
          <div className="text-rose-500 mb-4"><IconFire size={48} /></div>
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-rose-500"></div>
        </div>
      </div>
    );
  }

  // ── Empty ──
  if (!loading && queue.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center bg-gradient-to-b from-orange-50 to-rose-50 px-6 text-center" style={{ height: 'calc(100dvh - 5rem)' }}>
        <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mb-4 mx-auto">
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
            <polyline points="22 4 12 14.01 9 11.01"/>
          </svg>
        </div>
        <h2 className="text-xl font-bold text-gray-900 mb-2">All caught up!</h2>
        <p className="text-gray-500 text-sm mb-8">
          You've seen all the latest jobs.<br />Check back later for fresh picks.
        </p>
        <button
          onClick={handleRefresh}
          className="px-6 py-3 bg-rose-500 hover:bg-rose-600 text-white font-semibold rounded-2xl shadow-lg transition active:scale-95"
        >
          <span className="flex items-center gap-2"><IconRefresh size={16} /> Start over</span>
        </button>
        <button
          onClick={() => navigate('/jobs')}
          className="mt-4 text-sm text-gray-400 hover:text-gray-600 transition"
        >
          Browse all jobs →
        </button>
      </div>
    );
  }

  const currentJob = queue[0];
  const nextJob = queue[1];
  const afterJob = queue[2];
  const src = SOURCE_LABELS[currentJob?.source?.toLowerCase()] ?? { label: currentJob?.source, cls: 'bg-gray-100 text-gray-500 border-gray-200' };

  return (
    <div
      className="flex flex-col bg-gradient-to-b from-orange-50 to-rose-50 overflow-hidden"
      style={{ height: 'calc(100dvh - 5rem)' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-4 pb-2 shrink-0">
        <div>
          <h1 className="text-lg font-bold text-gray-900 flex items-center gap-1.5"><span className="text-rose-500"><IconFire size={20} /></span> Hot Picks</h1>
          <p className="text-xs text-gray-400">{queue.length} in today's deck</p>
        </div>
        <button
          onClick={handleUndo}
          disabled={!lastSwiped || !!flying}
          className="text-xs font-bold px-3 py-1.5 rounded-full bg-white border border-gray-200 text-gray-500 disabled:opacity-30 hover:text-gray-900 transition"
        >
          Undo
        </button>
        {lastAction && (
          <span className={`text-base font-bold px-4 py-1.5 rounded-full animate-pulse ${
            lastAction === 'saved' ? 'bg-yellow-100 text-yellow-700' : lastAction === 'soon' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'
          }`}>
            {lastAction === 'saved'
              ? <span className="flex items-center gap-1"><IconStar size={14} /> Saved!</span>
              : lastAction === 'soon'
                ? 'Apply soon'
                : '✕ Passed'}
          </span>
        )}
      </div>

      {/* Swipe hint (shows briefly at first) */}
      <p className="text-center text-xs text-gray-400 mb-1 shrink-0">← Pass · Save ⭐ → · ↑ Apply soon</p>

      {/* Card stack */}
      <div className="flex-1 flex items-center justify-center px-5 relative min-h-0">

        {/* Card 3 (furthest back) */}
        {afterJob && (
          <div
            className="absolute w-full max-w-sm rounded-3xl bg-white border border-gray-100 shadow-sm"
            style={{ transform: 'scale(0.92) translateY(18px)', zIndex: 2 }}
          />
        )}

        {/* Card 2 (middle) */}
        {nextJob && (
          <div
            className="absolute w-full max-w-sm rounded-3xl bg-white border border-gray-100 shadow-md"
            style={{ transform: 'scale(0.96) translateY(9px)', zIndex: 3 }}
          />
        )}

        {/* Card 1 — active, swipeable */}
        {currentJob && (
          <div
            className="absolute w-full max-w-sm bg-white rounded-3xl shadow-xl border border-gray-100 overflow-hidden cursor-grab active:cursor-grabbing"
            style={cardStyle}
            onTouchStart={onTouchStart}
            onTouchMove={onTouchMove}
            onTouchEnd={onTouchEnd}
          >
            {/* SAVE label */}
            {saveOpacity > 0.05 && (
              <div
                className="absolute top-6 left-5 pointer-events-none z-20"
                style={{ opacity: saveOpacity }}
              >
                <span className="text-xl font-black text-yellow-500 border-[3px] border-yellow-400 rounded-xl px-3 py-1.5"
                  style={{ transform: 'rotate(-12deg)', display: 'inline-block' }}>
                  SAVE ⭐
                </span>
              </div>
            )}

            {/* PASS label */}
            {passOpacity > 0.05 && (
              <div
                className="absolute top-6 right-5 pointer-events-none z-20"
                style={{ opacity: passOpacity }}
              >
                <span className="text-xl font-black text-red-500 border-[3px] border-red-400 rounded-xl px-3 py-1.5"
                  style={{ transform: 'rotate(12deg)', display: 'inline-block' }}>
                  PASS ✕
                </span>
              </div>
            )}

            <div className="p-6">
              {/* Source + date */}
              <div className="flex items-center justify-between mb-5">
                <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${src.cls}`}>
                  {src.label}
                </span>
                <span className="text-xs font-black text-green-700">{currentJob.match_score ?? 0}% match</span>
              </div>

              {/* Title */}
              <h2 className="text-xl font-bold text-gray-900 leading-snug mb-2 line-clamp-3">
                {currentJob.title}
              </h2>

              {/* Company & location */}
              <p className="text-sm font-semibold text-gray-600 mb-0.5">{currentJob.company}</p>
              <p className="text-sm text-gray-400 mb-5">📍 {currentJob.location}</p>

              {currentJob.salary && (
                <p className="text-sm font-bold text-green-600 mb-4">{currentJob.salary}</p>
              )}

              <div className="mb-4 rounded-xl bg-green-50 border border-green-100 px-3 py-2">
                <p className="text-xs font-black text-green-800 mb-1">Why this pick</p>
                <div className="flex flex-wrap gap-1.5">
                  {(currentJob.match_reasons ?? []).slice(0, 3).map(reason => (
                    <span key={reason} className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-white text-green-700 border border-green-100">
                      {reason}
                    </span>
                  ))}
                  {(currentJob.match_gaps ?? []).slice(0, 1).map(gap => (
                    <span key={gap} className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-white text-amber-700 border border-amber-100">
                      Missing: {gap}
                    </span>
                  ))}
                </div>
              </div>

              <div className="h-px bg-gray-100 mb-4" />

              {/* Description */}
              {currentJob.description && (
                <p className="text-sm text-gray-500 leading-relaxed line-clamp-4">
                  {stripHtml(currentJob.description)}
                </p>
              )}
            </div>

            {/* View full job */}
            <div className="px-6 pb-6">
              <button
                onClick={() => navigate(`/jobs/${currentJob.id}`)}
                className="w-full py-2.5 text-sm text-blue-600 bg-blue-50 border border-blue-100 rounded-2xl font-medium hover:bg-blue-100 active:scale-95 transition"
              >
                View full listing →
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Action buttons */}
      <div className="shrink-0 pb-safe px-6 py-5 flex items-center justify-center gap-12">
        {/* Pass */}
        <button
          onClick={() => triggerAction('left')}
          disabled={!!flying}
          className="w-16 h-16 bg-white rounded-full border-2 border-gray-200 shadow-md flex items-center justify-center text-2xl hover:border-red-300 hover:bg-red-50 active:scale-90 transition disabled:opacity-50"
        >
          ✕
        </button>

        <div className="text-center">
          <p className="text-xl font-bold text-gray-500 tabular-nums">{queue.length}</p>
          <p className="text-sm text-gray-300 font-medium">{sessionStats.saved} saved · {sessionStats.soon} soon</p>
        </div>

        {/* Save */}
        <button
          onClick={() => triggerAction('right')}
          disabled={!!flying}
          className="w-16 h-16 bg-yellow-400 rounded-full border-2 border-yellow-400 shadow-md flex items-center justify-center text-2xl hover:bg-yellow-500 active:scale-90 transition disabled:opacity-50"
        >
          ⭐
        </button>
      </div>

      <div className="shrink-0 px-6 pb-3 -mt-3 flex justify-center">
        <button
          onClick={() => triggerAction('up')}
          disabled={!!flying}
          className="px-4 py-2 rounded-full bg-blue-50 border border-blue-100 text-blue-700 text-xs font-black hover:bg-blue-100 active:scale-95 transition disabled:opacity-50"
        >
          Apply soon tomorrow
        </button>
      </div>
    </div>
  );
};
