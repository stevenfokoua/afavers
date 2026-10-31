import { supabase } from '../lib/supabase';
import { useAuthStore } from '../store/authStore';
import type { SourceReport } from '../../../supabase/functions/_shared/source-fetch';

export type RunStatus = 'running' | 'succeeded' | 'partial' | 'failed' | 'timed_out';
export interface FeedHealth {
  checked_at: string;
  expected_interval_minutes: number;
  last_successful_at: string | null;
  last_usable_at: string | null;
  latest: { id: string; status: RunStatus; started_at: string; finished_at: string | null; sources: SourceReport[]; counts: Record<string, number | boolean>; error_code: string | null } | null;
  alerts: { status: RunStatus; started_at: string; finished_at: string | null } | null;
}

let cached: { owner: number; at: number; request: Promise<FeedHealth> } | null = null;
export const feedHealthService = {
  invalidate(): void { cached = null; },
  get(force = false): Promise<FeedHealth> {
    const owner = useAuthStore.getState().user?.id;
    if (!owner) return Promise.reject(new Error('Sign in to view feed status.'));
    if (!force && cached?.owner === owner && Date.now() - cached.at < 30_000) return cached.request;
    const request = Promise.resolve(supabase.rpc('get_feed_health')).then(({ data, error }) => {
      if (error || !data || typeof data !== 'object') throw new Error('Feed status is currently unavailable.');
      return data as FeedHealth;
    });
    cached = { owner, at: Date.now(), request };
    void request.catch(() => { if (cached?.request === request) cached = null; });
    return request;
  },
};

export function describeFeedHealth(health: FeedHealth, de = false, now = Date.now()): { state: 'ok' | 'warning' | 'unknown'; message: string } {
  const usable = health.last_usable_at ? Date.parse(health.last_usable_at) : NaN;
  const staleAfter = Math.max(180, health.expected_interval_minutes * 3) * 60_000;
  if (!health.latest) return { state: 'unknown', message: de ? 'Der erste überwachte Job-Abruf steht noch aus.' : 'Waiting for the first monitored job refresh.' };
  if (Number.isFinite(usable) && now - usable > staleAfter) return { state: 'warning', message: de ? 'Der Job-Feed ist veraltet. Gespeicherte Bewerbungen bleiben verfügbar.' : 'The job feed is out of date. Your saved applications remain available.' };
  if (health.latest.status === 'running') return { state: 'ok', message: de ? 'Neue Stellen werden gerade abgerufen.' : 'New jobs are being fetched now.' };
  if (health.latest.status === 'failed' || health.latest.status === 'timed_out') return { state: 'warning', message: de ? 'Der letzte Abruf konnte nicht abgeschlossen werden. Vorhandene Stellen bleiben verfügbar.' : 'The latest refresh could not finish. Existing jobs remain available.' };
  if (health.latest.status === 'partial') return { state: 'warning', message: de ? 'Einige Suchanfragen waren unvollständig. Die verfügbaren Ergebnisse wurden aktualisiert.' : 'Some searches were incomplete. Available results have been updated.' };
  return { state: 'ok', message: de ? 'Job-Feed aktuell · automatische Aktualisierung alle 2 Stunden.' : 'Job feed updated · automatic refresh every 2 hours.' };
}
