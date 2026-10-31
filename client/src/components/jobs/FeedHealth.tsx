import { useEffect, useState } from 'react';
import { useAuthStore } from '../../store/authStore';
import { useLanguage } from '../../store/languageStore';
import { describeFeedHealth, feedHealthService, type FeedHealth as Health } from '../../services/feedHealth.service';
import '../../styles/feed-health.css';

export function FeedHealth({ refreshKey = 0 }: { refreshKey?: number }) {
  const owner = useAuthStore(state => state.user?.id), { lang } = useLanguage(), de = lang === 'de';
  const [health, setHealth] = useState<Health | null>(null), [unavailable, setUnavailable] = useState(false);
  useEffect(() => {
    let live = true;
    const load = (force: boolean) => void feedHealthService.get(force).then(value => { if (live) { setHealth(value); setUnavailable(false); } }).catch(() => { if (live) setUnavailable(true); });
    setHealth(null); setUnavailable(false); load(refreshKey > 0);
    const timer = window.setInterval(() => load(true), 60_000);
    return () => { live = false; window.clearInterval(timer); };
  }, [owner, refreshKey]);
  if (!health && !unavailable) return null;
  const description = health && !unavailable ? describeFeedHealth(health, de) : { state: 'unknown', message: de ? 'Der Feed-Status ist gerade nicht verfügbar. Vorhandene Stellen bleiben sichtbar.' : 'Feed status is currently unavailable. Existing jobs remain visible.' };
  const format = (date: string | null) => date && Number.isFinite(Date.parse(date)) ? new Date(date).toLocaleString(de ? 'de-DE' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short' }) : '—';
  return <div className="feed-health" data-state={description.state}>
    <p role="status">{description.message}</p>
    {health && <details><summary>{de ? 'Feed-Details' : 'Feed details'}</summary><dl><div><dt>{de ? 'Letzter vollständiger Abruf' : 'Last complete refresh'}</dt><dd>{format(health.last_successful_at)}</dd></div><div><dt>{de ? 'Letzte verfügbaren Ergebnisse' : 'Last available results'}</dt><dd>{format(health.last_usable_at)}</dd></div></dl><ul>{health.latest?.sources.map(source => <li key={source.source}><strong>{source.source === 'bundesagentur' ? 'Bundesagentur' : source.source === 'adzuna' ? 'Adzuna' : source.source}</strong><span>{!source.configured ? (de ? 'Nicht eingerichtet' : 'Not configured') : `${source.queries_completed}/${source.queries_planned} ${de ? 'Suchen vollständig' : 'searches complete'} · ${source.jobs_returned} ${de ? 'Stellen' : 'jobs'}`}</span>{source.configured && source.capped_queries > 0 && <span>{de ? 'Suchlimit erreicht' : 'Search limit reached'}</span>}{source.failed_queries > 0 && <span>{source.failed_queries} {de ? 'Suchen fehlgeschlagen' : 'searches failed'}</span>}</li>)}</ul></details>}
  </div>;
}
