import { keywordMatches } from '../../../supabase/functions/_shared/matching';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type NewsTopic = 'energy' | 'wirtschaft' | 'inland' | 'ausland' | 'wissen';

export const ALL_NEWS_TOPICS: { key: NewsTopic; label: string; emoji: string; desc: string }[] = [
  { key: 'energy',     label: 'Energy & Climate', emoji: '⚡', desc: 'Solar, wind, Klimaschutz, Energiewende' },
  { key: 'wirtschaft', label: 'Economy',           emoji: '📈', desc: 'Business, markets, Unternehmen' },
  { key: 'inland',     label: 'Germany',           emoji: '🇩🇪', desc: 'Domestic politics and society' },
  { key: 'ausland',    label: 'World',             emoji: '🌍', desc: 'International news' },
  { key: 'wissen',     label: 'Science',           emoji: '🔬', desc: 'Research, technology, health' },
];

interface PreferencesState {
  /** Keywords used to filter story bubbles and Hot Picks. Empty = no filter. */
  filterKeywords: string[];
  /** When false, all jobs are shown regardless of keywords. */
  filterEnabled: boolean;
  setFilterKeywords: (kw: string[]) => void;
  setFilterEnabled: (v: boolean) => void;

  /** Show news carousel on dashboard */
  newsOnDashboard: boolean;
  /** Which news topics to show. Empty = all topics shown. */
  newsTopics: NewsTopic[];
  setNewsOnDashboard: (v: boolean) => void;
  setNewsTopics: (topics: NewsTopic[]) => void;
}

export const usePreferencesStore = create<PreferencesState>()(
  persist(
    (set) => ({
      filterKeywords: [],
      filterEnabled: false,
      setFilterKeywords: (kw) => set({ filterKeywords: kw }),
      setFilterEnabled: (v) => set({ filterEnabled: v }),

      newsOnDashboard: true,
      newsTopics: ['energy', 'wirtschaft'],
      setNewsOnDashboard: (v) => set({ newsOnDashboard: v }),
      setNewsTopics: (topics) => set({ newsTopics: topics }),
    }),
    { name: 'afavers-preferences' }
  )
);

/** Returns true if a job matches the active filter, or if filtering is off. */
export function jobMatchesFilter(
  job: { title?: string; company?: string; description?: string | null },
  filterKeywords: string[],
  filterEnabled: boolean
): boolean {
  if (!filterEnabled || filterKeywords.length === 0) return true;
  const text = `${job.title ?? ''} ${job.company ?? ''} ${job.description ?? ''}`.toLowerCase();
  return keywordMatches(text, filterKeywords).length > 0;
}
