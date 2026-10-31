import { useState, useEffect } from 'react';
import { useAuthStore } from '../../store/authStore';
import { gamificationService, type GamificationProfile } from '../../services/gamification.service';

export const GamificationWidget = () => {
  const { isAuthenticated, isDemo } = useAuthStore();
  const [profile, setProfile] = useState<GamificationProfile | null>(null);
  const [tab, setTab] = useState<'missions' | 'achievements'>('missions');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isDemo || !isAuthenticated) { setLoading(false); return; }
    gamificationService.getProfile()
      .then(data => { setProfile(data); setError(null); })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [isAuthenticated, isDemo]);

  if (isDemo) return null;

  if (loading) {
    return (
      <div className="bg-surface border border-line rounded-lg shadow-none overflow-hidden ">
        <div className="h-24 bg-subtle" />
        <div className="p-4 space-y-2">
          <div className="h-3 bg-subtle rounded-md w-3/4" />
          <div className="h-3 bg-subtle rounded-md w-1/2" />
        </div>
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="bg-surface border border-line rounded-lg shadow-none p-4 text-center">
        <p className="text-xs text-muted">XP & Missions unavailable</p>
        {error && <p className="text-[10px] text-danger mt-1">{error}</p>}
      </div>
    );
  }

  const { xp, streak, missions, achievements } = profile;
  const activeMissions = missions.filter(m => m.status === 'active');
  const completedMissions = missions.filter(m => m.status === 'completed');


  return (
    <div className="bg-surface border border-line rounded-lg shadow-none overflow-hidden">

      {/* ── Level header ── */}
      <div className={`bg-ink  px-5 py-4`}>
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-on-ink/80 text-[10px] font-semibold uppercase tracking-widest">Level {xp.level}</p>
            <p className="text-on-ink text-lg font-semibold leading-tight">{xp.title}</p>
          </div>
          <div className="text-right">
            {streak.current > 1 && (
              <div className="flex items-center gap-1 justify-end mb-1">
                
                <span className="text-on-ink font-semibold text-sm">{streak.current}d</span>
              </div>
            )}
            <p className="text-on-ink/70 text-[10px]">{xp.totalXp.toLocaleString()} XP total</p>
          </div>
        </div>

        {/* XP progress bar */}
        {!xp.maxLevel && (
          <div>
            <div className="h-1.5 bg-surface/25 rounded-md overflow-hidden">
              <div
                className="h-full bg-surface rounded-md transition-colors duration-150"
                style={{ width: `${xp.progressPct}%` }}
              />
            </div>
            <p className="text-on-ink/70 text-[10px] mt-1">{xp.xpToNext} XP to next level</p>
          </div>
        )}
        {xp.maxLevel && (
          <p className="text-on-ink/80 text-xs font-semibold">Max level reached </p>
        )}
      </div>

      {/* ── Tab switcher ── */}
      <div className="flex border-b border-line">
        {(['missions', 'achievements'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 py-2.5 text-[11px] font-semibold uppercase tracking-widest transition ${
              tab === t ? 'text-accent border-b-2 border-[#16a34a]' : 'text-muted hover:text-muted'
            }`}
          >
            {t === 'missions' ? `Missions ${completedMissions.length}/${missions.length}` : `Badges ${achievements.length}`}
          </button>
        ))}
      </div>

      {/* ── Missions ── */}
      {tab === 'missions' && (
        <div className="p-4 space-y-3">
          {activeMissions.length === 0 && completedMissions.length === 0 && (
            <p className="text-xs text-muted text-center py-4">No missions this week yet.</p>
          )}
          {activeMissions.map(m => {
            const pct = Math.round((m.progress / m.target) * 100);
            return (
              <div key={m.id} className="space-y-1.5">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-[12px] font-semibold text-ink leading-snug">{m.title}</p>
                  <span className="text-[10px] font-semibold text-accent bg-subtle border border-line px-1.5 py-0.5 rounded-md shrink-0">
                    +{m.xp_reward} XP
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-1.5 bg-subtle rounded-md overflow-hidden">
                    <div
                      className="h-full bg-ink rounded-md transition-colors duration-150"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="text-[10px] font-semibold text-muted shrink-0">
                    {m.progress}/{m.target}
                  </span>
                </div>
              </div>
            );
          })}
          {completedMissions.map(m => (
            <div key={m.id} className="flex items-center gap-2.5 opacity-60">
              <p className="text-[11px] font-semibold text-muted line-through">{m.title}</p>
              <span className="ml-auto text-[10px] font-semibold text-muted shrink-0">+{m.xp_reward} XP</span>
            </div>
          ))}
          {activeMissions.length > 0 && (
            <p className="text-[10px] text-muted text-center pt-1">
              Missions reset every Monday
            </p>
          )}
        </div>
      )}

      {/* ── Achievements ── */}
      {tab === 'achievements' && (
        <div className="p-4">
          {achievements.length === 0 && (
            <p className="text-xs text-muted text-center py-4">
              Apply to jobs to earn your first badge.
            </p>
          )}
          <div className="grid grid-cols-3 gap-2">
            {achievements.map(a => (
              <div
                key={a.type}
                className="flex flex-col items-center text-center gap-1 p-2 bg-canvas rounded-lg border border-line"
                title={a.description}
              >
                
                <p className="text-[9px] font-semibold text-ink leading-tight">{a.title}</p>
                {a.xp_bonus > 0 && (
                  <p className="text-[8px] text-accent font-semibold">+{a.xp_bonus} XP</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
