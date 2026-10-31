import { useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { settingsService } from '../services/settings.service';
import { useAuthStore } from '../store/authStore';

const DEFAULT_KEYWORDS = 'consulting,beratung,nachhaltigkeit,umwelt,gis,energy';
const DEFAULT_LOCATIONS = 'Düsseldorf,Köln,Essen,Bochum,Dortmund';
const seenInThisTab = new Set<number>();

function hasSeenSetup(userId: number): boolean {
  if (seenInThisTab.has(userId)) return true;
  try { return localStorage.getItem(`setup-seen:${userId}`) === 'true'; }
  catch { return false; }
}

export function markSetupSeen(userId: number | undefined): void {
  if (!userId) return;
  seenInThisTab.add(userId);
  try { localStorage.setItem(`setup-seen:${userId}`, 'true'); }
  catch { /* Setup still completes when device storage is blocked or full. */ }
}

export const OnboardingRedirect = ({ children }: { children: React.ReactNode }) => {
  const location = useLocation();
  const user = useAuthStore((state) => state.user);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function checkSetup() {
      if (!user?.id || location.pathname === '/setup') {
        setChecking(false);
        return;
      }

      if (hasSeenSetup(user.id)) {
        setChecking(false);
        return;
      }

      try {
        const settings = await settingsService.get();
        const isDefault =
          settings.keywords.trim() === DEFAULT_KEYWORDS &&
          settings.locations.trim() === DEFAULT_LOCATIONS;
        if (!cancelled) setNeedsSetup(isDefault);
      } catch {
        if (!cancelled) setNeedsSetup(true);
      } finally {
        if (!cancelled) setChecking(false);
      }
    }

    setChecking(true);
    setNeedsSetup(false);
    checkSetup();

    return () => { cancelled = true; };
  }, [user?.id, location.pathname]);

  if (checking) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="min-h-screen flex items-center justify-center bg-canvas"
      >
        <span className="sr-only">Loading…</span>
        <span aria-hidden="true">…</span>
      </div>
    );
  }
  if (needsSetup) return <Navigate to="/setup" replace state={{ from: location.pathname }} />;
  return <>{children}</>;
};
