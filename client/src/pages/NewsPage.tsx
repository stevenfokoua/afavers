import { useEffect, useState } from 'react';
import { newsService, type NewsItem, isEnergyArticle, getImageUrl, timeAgo } from '../services/news.service';
import { usePreferencesStore, ALL_NEWS_TOPICS, type NewsTopic } from '../store/preferencesStore';
import { useLanguage } from '../store/languageStore';

type Tab = NewsTopic | 'all';

const RESSORT_COLORS: Record<string, string> = {
  wirtschaft: 'bg-subtle text-muted',
  inland:     'bg-subtle text-accent',
  ausland:    'bg-subtle text-muted',
  sport:      'bg-subtle text-muted',
  wissen:     'bg-subtle text-accent',
};

const NewsCardSkeleton = () => (
  <div className="bg-surface rounded-lg border border-line overflow-hidden ">
    <div className="h-40 bg-line" />
    <div className="p-4">
      <div className="h-3 bg-line rounded w-20 mb-2" />
      <div className="h-4 bg-line rounded w-full mb-1" />
      <div className="h-4 bg-line rounded w-3/4 mb-2" />
      <div className="h-3 bg-subtle rounded w-full mb-1" />
      <div className="h-3 bg-subtle rounded w-2/3" />
    </div>
  </div>
);

const NewsCard = ({ item }: { item: NewsItem }) => {
  const { t } = useLanguage();
  const img = getImageUrl(item);
  const isEnergy = isEnergyArticle(item);
  const badgeClass = isEnergy ? 'bg-subtle text-accent' : (RESSORT_COLORS[item.ressort ?? ''] ?? 'bg-subtle text-muted');
  const badgeLabel = isEnergy ? t('newsEnergyClimate') : (item.topline ?? item.ressort ?? t('news'));

  return (
    <a
      href={item.detailsweb}
      target="_blank"
      rel="noopener noreferrer"
      className="bg-surface rounded-lg border border-line overflow-hidden hover:border-line hover:shadow-none transition-colors duration-200  flex flex-col"
    >
      {img && (
        <div className="h-40 overflow-hidden bg-subtle shrink-0">
          <img
            src={img}
            alt={item.teaserImage?.alttext ?? item.title}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        </div>
      )}
      <div className="p-4 flex flex-col flex-1">
        <div className="flex items-center gap-2 mb-2 flex-wrap">
          <span className={`text-xs font-semibold px-2 py-0.5 rounded-md ${badgeClass}`}>
            {badgeLabel}
          </span>
          <span className="text-xs text-muted">{timeAgo(item.date)}</span>
        </div>
        <h3 className="text-sm font-semibold text-ink leading-snug mb-1.5 line-clamp-3">
          {item.title}
        </h3>
        {item.firstSentence && (
          <p className="text-xs text-muted line-clamp-3 flex-1">{item.firstSentence}</p>
        )}
        <div className="flex items-center gap-1 mt-3 text-xs text-muted font-medium">
          <span>{t('readOnTagesschau')}</span>
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
          </svg>
        </div>
      </div>
    </a>
  );
};

function filterByTopic(all: NewsItem[], wirtschaft: NewsItem[], topic: NewsTopic): NewsItem[] {
  const allMap = new Map(all.map(n => [n.sophoraId, n]));
  switch (topic) {
    case 'energy':
      return [...wirtschaft.filter(isEnergyArticle), ...all.filter(n => isEnergyArticle(n) && !wirtschaft.find(w => w.sophoraId === n.sophoraId))];
    case 'wirtschaft':
      return wirtschaft.filter(n => !isEnergyArticle(n));
    case 'inland':
      return all.filter(n => n.ressort === 'inland');
    case 'ausland':
      return all.filter(n => n.ressort === 'ausland');
    case 'wissen':
      return all.filter(n => n.ressort === 'wissen');
    default:
      return [...allMap.values()];
  }
}

export const NewsPage = () => {
  const { t } = useLanguage();
  const { newsTopics } = usePreferencesStore();

  // Tabs = selected topics + 'all'. If nothing selected, show all topics.
  const activeTabs: { key: Tab; label: string; emoji: string }[] = [
    ...(newsTopics.length > 0 ? ALL_NEWS_TOPICS.filter(topic => newsTopics.includes(topic.key)) : ALL_NEWS_TOPICS)
      .map((topic) => ({
        ...topic,
        label: topic.key === 'energy' ? t('newsEnergyClimate') : topic.key === 'wirtschaft' ? t('newsEconomy') : topic.label,
      })),
    { key: 'all', label: t('all'), emoji: '' },
  ];

  const [tab, setTab] = useState<Tab>(activeTabs[0]?.key ?? 'all');
  const [allNews, setAllNews]     = useState<NewsItem[]>([]);
  const [wirtschaft, setWirtschaft] = useState<NewsItem[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState(false);
  const [lastFetched, setLastFetched] = useState<Date | null>(null);

  const fetchNews = async () => {
    setLoading(true);
    setError(false);
    try {
      const [allData, wData] = await Promise.all([newsService.getAll(), newsService.getWirtschaft()]);
      setAllNews(allData);
      setWirtschaft(wData);
      setLastFetched(new Date());
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchNews(); }, []);

  // Reset tab if it's no longer in activeTabs
  useEffect(() => {
    if (!activeTabs.find(t => t.key === tab)) setTab(activeTabs[0]?.key ?? 'all');
  }, [newsTopics]);

  const displayed = tab === 'all'
    ? [...new Map([...wirtschaft, ...allNews].map(n => [n.sophoraId, n])).values()]
    : filterByTopic(allNews, wirtschaft, tab as NewsTopic);

  return (
    <div className="px-4 py-6 max-w-5xl mx-auto w-full">

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-ink">{t('news')}</h1>
          <p className="text-sm text-muted mt-0.5">
            {t('germanNews')} · <a href="https://www.tagesschau.de" target="_blank" rel="noopener noreferrer" className="underline hover:text-muted transition">Tagesschau</a>
            {lastFetched && <span className="ml-2">· {timeAgo(lastFetched.toISOString())}</span>}
            {newsTopics.length === 0 && <span className="ml-2 text-muted">· {t('customizeTopics')}</span>}
          </p>
        </div>
        <button
          onClick={fetchNews}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-muted border border-line rounded-lg hover:bg-canvas transition disabled:opacity-40"
        >
          <svg className={`w-3.5 h-3.5 ${loading ? '' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          {t('refresh')}
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-subtle rounded-lg p-1 overflow-x-auto">
        {activeTabs.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
              tab === t.key ? 'bg-surface text-ink shadow-none' : 'text-muted hover:text-ink'
            }`}
          >
            <span>{t.emoji}</span>{t.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="text-center py-16 text-muted">
          <p className="font-medium">{t('newsLoadFailed')}</p>
          <button onClick={fetchNews} className="text-sm mt-2 text-accent hover:underline">{t('tryAgain')}</button>
        </div>
      )}

      {!error && !loading && displayed.length === 0 && (
        <div className="text-center py-16 text-muted">
          <p className="font-medium">{t('noArticlesTopic')}</p>
          <p className="text-sm mt-1">{t('newsRefreshHint')}</p>
        </div>
      )}

      {/* Grid */}
      {!error && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {loading
            ? Array.from({ length: 6 }, (_, i) => <NewsCardSkeleton key={i} />)
            : displayed.map(item => <NewsCard key={item.sophoraId} item={item} />)
          }
        </div>
      )}

      {!loading && displayed.length > 0 && (
        <p className="text-center text-xs text-muted mt-8">
          {t('articlesGermanSource')}
        </p>
      )}
    </div>
  );
};
