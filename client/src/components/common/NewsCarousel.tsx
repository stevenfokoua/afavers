import { useEffect, useRef, useState } from 'react';
import { newsService, type NewsItem, isEnergyArticle, timeAgo } from '../../services/news.service';
import { usePreferencesStore, type NewsTopic } from '../../store/preferencesStore';
import { useLanguage } from '../../store/languageStore';

const RESSORT_COLORS: Record<string, string> = {
  wirtschaft: 'bg-blue-100 text-blue-700',
  inland:     'bg-green-100 text-green-700',
  ausland:    'bg-purple-100 text-purple-700',
  sport:      'bg-orange-100 text-orange-700',
  wissen:     'bg-teal-100 text-teal-700',
};

const ENERGY_BADGE = 'bg-emerald-100 text-emerald-700';

async function fetchForTopics(topics: NewsTopic[]): Promise<NewsItem[]> {
  const useAll = topics.length === 0;
  const needsWirtschaft = useAll || topics.includes('wirtschaft') || topics.includes('energy');
  const needsAll = useAll || topics.includes('inland') || topics.includes('ausland') || topics.includes('wissen');

  const [wirtschaft, all] = await Promise.all([
    needsWirtschaft ? newsService.getWirtschaft() : Promise.resolve([]),
    needsAll        ? newsService.getAll()        : Promise.resolve([]),
  ]);

  const seen = new Set<string>();
  const combined: NewsItem[] = [];
  for (const item of [...wirtschaft, ...all]) {
    if (!seen.has(item.sophoraId)) { seen.add(item.sophoraId); combined.push(item); }
  }

  if (useAll) return combined.slice(0, 8);

  return combined.filter(item => {
    if (topics.includes('energy') && isEnergyArticle(item)) return true;
    if (topics.includes('wirtschaft') && item.ressort === 'wirtschaft' && !isEnergyArticle(item)) return true;
    if (topics.includes('inland')     && item.ressort === 'inland')     return true;
    if (topics.includes('ausland')    && item.ressort === 'ausland')    return true;
    if (topics.includes('wissen')     && item.ressort === 'wissen')     return true;
    return false;
  }).slice(0, 8);
}

export const NewsCarousel = () => {
  const { t } = useLanguage();
  const { newsTopics } = usePreferencesStore();
  const [items, setItems] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [current, setCurrent] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchForTopics(newsTopics)
      .then(news => { if (!cancelled) { setItems(news); setCurrent(0); } })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [newsTopics]);

  // Auto-advance every 5s
  useEffect(() => {
    if (items.length < 2) return;
    timerRef.current = setInterval(() => {
      setCurrent(c => (c + 1) % items.length);
    }, 5000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [items.length]);

  const goTo = (idx: number) => {
    setCurrent(idx);
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setCurrent(c => (c + 1) % items.length);
    }, 5000);
  };

  if (loading) {
    return (
      <div className="mb-5 rounded-xl bg-white border border-gray-200 p-4 animate-pulse">
        <div className="h-3 bg-gray-200 rounded w-24 mb-2" />
        <div className="h-4 bg-gray-200 rounded w-3/4 mb-1" />
        <div className="h-3 bg-gray-100 rounded w-1/2" />
      </div>
    );
  }

  if (items.length === 0) return null;

  const item = items[current];
  const isEnergy = isEnergyArticle(item);
  const badgeClass = isEnergy ? ENERGY_BADGE : (RESSORT_COLORS[item.ressort ?? ''] ?? 'bg-gray-100 text-gray-600');
  const badgeLabel = isEnergy ? t('newsEnergyClimate') : (item.topline ?? item.ressort ?? t('news'));

  return (
    <div className="mb-5 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-gray-400 uppercase tracking-widest flex items-center gap-1.5">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 12h6m0 0H7m6 0v4" />
          </svg>
          {t('newsLatest')}
        </span>
        <a
          href="https://www.tagesschau.de"
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-gray-400 hover:text-gray-600 transition"
        >
          Tagesschau ↗
        </a>
      </div>

      {/* Card */}
      <a
        href={item.detailsweb}
        target="_blank"
        rel="noopener noreferrer"
        className="block bg-white border border-gray-200 rounded-xl p-4 hover:border-gray-300 hover:shadow-sm transition-all duration-200 active:scale-[0.99]"
      >
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1.5 flex-wrap">
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${badgeClass}`}>
                {badgeLabel}
              </span>
              <span className="text-xs text-gray-400">{timeAgo(item.date)}</span>
            </div>
            <p className="text-sm font-semibold text-gray-900 leading-snug line-clamp-2">
              {item.title}
            </p>
            {item.firstSentence && (
              <p className="text-xs text-gray-500 mt-1 line-clamp-2">{item.firstSentence}</p>
            )}
          </div>
          <svg className="w-4 h-4 text-gray-300 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
          </svg>
        </div>
      </a>

      {/* Dot indicators */}
      {items.length > 1 && (
        <div className="flex items-center justify-center gap-1.5 mt-2.5">
          {items.map((_, idx) => (
            <button
              key={idx}
              onClick={() => goTo(idx)}
              className={`rounded-full transition-all duration-300 ${
                idx === current ? 'w-4 h-1.5 bg-gray-700' : 'w-1.5 h-1.5 bg-gray-300 hover:bg-gray-400'
              }`}
              aria-label={`Go to news ${idx + 1}`}
            />
          ))}
        </div>
      )}
    </div>
  );
};
