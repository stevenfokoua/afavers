import { useState } from 'react';
import { NavLink, Link, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import { DemoBanner } from '../common/DemoBanner';
import { LanguageToggle } from '../common/LanguageToggle';
import { ToastContainer } from '../common/Toast';
import { useLanguage } from '../../store/languageStore';
import { useThemeStore } from '../../store/themeStore';
import { useIdleTimer } from '../../hooks/useIdleTimer';

const IconDashboard = () => (
  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
  </svg>
);
const IconJobs = () => (
  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
  </svg>
);
const IconKanban = () => (
  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
  </svg>
);
const IconAnalytics = () => (
  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
  </svg>
);
const IconSettings = () => (
  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
  </svg>
);
const IconVideo = () => (
  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);
const IconFire = () => (
  <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor">
    <path d="M17.66 11.2c-.23-.3-.51-.56-.77-.82-.67-.6-1.43-1.03-2.07-1.66C13.33 7.26 13 4.85 13.95 3c-.95.23-1.78.75-2.49 1.32C8.87 6.4 7.85 10.07 9.07 13.22c.04.1.08.2.08.33 0 .22-.15.42-.35.5-.23.1-.47.04-.66-.12-.06-.05-.1-.1-.14-.17C6.87 12.33 6.69 10.28 7.45 8.64 5.78 10 4.87 12.3 5 14.47c.06.5.12 1 .29 1.5.14.6.41 1.2.71 1.73C7.08 19.43 8.95 20.67 10.96 20.92c2.14.27 4.43-.12 6.07-1.6 1.83-1.66 2.47-4.32 1.53-6.6l-.13-.26c-.21-.46-.77-1.26-.77-1.26z"/>
  </svg>
);
const IconBell = () => (
  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
  </svg>
);
const IconLogout = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
  </svg>
);
const IconNews = () => (
  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 12h6" />
  </svg>
);
const IconSun = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <circle cx="12" cy="12" r="5" strokeWidth="1.75"/>
    <path strokeLinecap="round" strokeWidth="1.75" d="M12 2v2M12 20v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M2 12h2M20 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>
  </svg>
);

const IconMoon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.75" d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/>
  </svg>
);

// Logo component — switches color based on theme via CSS variable
const Logo = ({ size = 22 }: { size?: number }) => (
  <span style={{
    fontFamily: "'Figtree', system-ui, sans-serif",
    fontSize: size, fontWeight: 800, letterSpacing: -0.5,
    color: 'var(--logo-color)',
  }}>
    Afa<span style={{ color: '#f97316' }}>v</span>ers
  </span>
);

export const AppLayout = ({ children }: { children: React.ReactNode }) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const { user, logout } = useAuthStore();
  const { t } = useLanguage();
  const { theme, toggleTheme } = useThemeStore();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  // Auto-logout (idle timeout) → landing page; user sees they were logged out
  const handleAutoLogout = () => {
    logout();
    navigate('/');
  };

  const { showWarning, secondsLeft, stayLoggedIn } = useIdleTimer(handleAutoLogout);

  const isAdmin = user?.isAdmin ?? false;
  const isDark = theme === 'dark';

  const navItems = [
    { to: '/dashboard',    icon: <IconDashboard />,  label: t('dashboard') },
    { to: '/jobs',         icon: <IconJobs />,        label: t('browseJobs') },
    { to: '/hotpicks',     icon: <IconFire />,        label: t('hotPicks') },
    { to: '/kanban',       icon: <IconKanban />,      label: t('applicationsBoard') },
    { to: '/analytics',    icon: <IconAnalytics />,   label: t('analytics') },
    { to: '/reminders',    icon: <IconBell />,        label: t('reminders') },
    { to: '/news',         icon: <IconNews />,        label: t('news') },
    { to: '/interview-prep', icon: <IconVideo />,     label: t('interviewPrep') },
    { to: '/settings',     icon: <IconSettings />,    label: t('settings') },
  ];

  const initials = user?.email?.slice(0, 2).toUpperCase() ?? 'ME';

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex">

      {/* Skip link for keyboard / screen-reader users */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-[60] focus:px-4 focus:py-2 focus:rounded-lg focus:bg-white dark:focus:bg-gray-900 focus:text-gray-900 dark:focus:text-gray-100 focus:shadow-lg focus:ring-2 focus:ring-green-500"
      >
        {t('skipToContent')}
      </a>

      {/* ── Sidebar ── */}
      <aside
        className={`
          fixed inset-y-0 left-0 z-50 w-60
          bg-white dark:bg-gray-800
          border-r border-gray-200 dark:border-gray-700
          flex flex-col shadow-sm
          transition-transform duration-200 ease-in-out
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
          lg:translate-x-0
        `}
      >
        {/* Brand header */}
        <div className="h-14 flex items-center justify-between px-5 border-b border-gray-100 dark:border-gray-700 shrink-0">
          <Logo />
          <div className="flex items-center gap-2">
            {showWarning && (
              <button
                onClick={stayLoggedIn}
                title="Session expiring — click to continue"
                className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs font-bold tabular-nums transition-all
                  ${secondsLeft <= 5
                    ? 'bg-red-500 text-white animate-pulse'
                    : 'bg-amber-400 text-amber-900'
                  }`}
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <circle cx="12" cy="12" r="10" strokeWidth="2"/>
                  <path strokeLinecap="round" strokeWidth="2" d="M12 7v5l3 3"/>
                </svg>
                {secondsLeft}s
              </button>
            )}
            <button
              onClick={() => setSidebarOpen(false)}
              className="lg:hidden p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded transition"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
              </svg>
            </button>
          </div>
        </div>

        {/* Nav items */}
        <nav className="flex-1 py-5 px-3 space-y-0.5 overflow-y-auto">
          {navItems.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={() => setSidebarOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-sm transition-all duration-150 active:scale-95 ${
                  isActive
                    ? 'bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400 font-semibold shadow-sm ring-1 ring-green-100 dark:ring-green-800'
                    : 'font-medium text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-gray-100 hover:translate-x-0.5'
                }`
              }
            >
              {item.icon}
              <span>{item.label}</span>
            </NavLink>
          ))}

          {isAdmin && (
            <>
              <div className="my-2 border-t border-gray-100 dark:border-gray-700" />
              <NavLink
                to="/admin"
                onClick={() => setSidebarOpen(false)}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-sm transition-all duration-150 active:scale-95 ${
                    isActive
                      ? 'bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-400 font-semibold shadow-sm ring-1 ring-red-100 dark:ring-red-800'
                      : 'font-medium text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-700 dark:hover:text-red-400 hover:translate-x-0.5'
                  }`
                }
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
                <span>Admin Panel</span>
              </NavLink>
            </>
          )}
        </nav>

        {/* Bottom: language + theme + user */}
        <div
          className="border-t border-gray-100 dark:border-gray-700 p-4 space-y-3 shrink-0"
          style={{ paddingBottom: 'calc(16px + env(safe-area-inset-bottom))' }}
        >
          <LanguageToggle />
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-green-400 to-blue-500 flex items-center justify-center text-white text-xs font-bold shrink-0">
              {initials}
            </div>
            <span className="text-xs text-gray-500 dark:text-gray-400 truncate flex-1 min-w-0">{user?.email}</span>
            <button
              onClick={toggleTheme}
              title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
              className="p-1.5 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
            >
              {isDark ? <IconSun /> : <IconMoon />}
            </button>
            <button
              onClick={handleLogout}
              title={t('logout')}
              className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
            >
              <IconLogout />
            </button>
          </div>
        </div>
      </aside>

      {/* ── Mobile overlay ── */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/30 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* ── Main content ── */}
      <div className="flex-1 lg:ml-60 flex flex-col min-h-screen w-full overflow-x-hidden">
        {/* Mobile topbar */}
        <div className="lg:hidden bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 sticky top-0 z-30 shadow-sm">
          <div className="h-14 flex items-center px-4">
            <button
              onClick={() => setSidebarOpen(true)}
              className="p-2 -ml-1 text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition shrink-0"
              aria-label="Menu"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16"/>
              </svg>
            </button>

            {/* Brand centred */}
            <Link to="/dashboard" className="absolute left-1/2 -translate-x-1/2">
              <Logo />
            </Link>

            {/* Right: session timer + theme toggle + avatar */}
            <div className="ml-auto flex items-center gap-2 shrink-0">
              {showWarning && (
                <button
                  onClick={stayLoggedIn}
                  title="Session expiring — click to continue"
                  className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs font-bold tabular-nums transition-all
                    ${secondsLeft <= 5
                      ? 'bg-red-500 text-white animate-pulse'
                      : 'bg-amber-400 text-amber-900'
                    }`}
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <circle cx="12" cy="12" r="10" strokeWidth="2"/>
                    <path strokeLinecap="round" strokeWidth="2" d="M12 7v5l3 3"/>
                  </svg>
                  {secondsLeft}s
                </button>
              )}
              <button
                onClick={toggleTheme}
                title={isDark ? 'Light mode' : 'Dark mode'}
                className="p-1.5 text-gray-400 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition"
              >
                {isDark ? <IconSun /> : <IconMoon />}
              </button>
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-green-400 to-blue-500 flex items-center justify-center text-white text-xs font-bold">
                {initials}
              </div>
            </div>
          </div>
        </div>

        <DemoBanner />

        <main id="main-content" tabIndex={-1} className="flex-1 focus:outline-none">
          {children}
          <div className="lg:hidden" style={{ height: 'calc(64px + env(safe-area-inset-bottom))' }} />
        </main>
      </div>

      {/* ── Mobile bottom navigation ── */}
      <nav
        aria-label="Primary"
        className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 flex items-stretch"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        {[
          { to: '/dashboard',  icon: <IconDashboard />, label: t('home') },
          { to: '/jobs',       icon: <IconJobs />,      label: t('browse') },
          { to: '/kanban',     icon: <IconKanban />,    label: t('board') },
          { to: '/reminders',  icon: <IconBell />,      label: t('reminders') },
        ].map(item => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `flex-1 flex flex-col items-center justify-center gap-0.5 py-2 text-xs font-medium transition-colors ${
                isActive ? 'text-green-600 dark:text-green-400' : 'text-gray-400 dark:text-gray-500'
              }`
            }
          >
            {item.icon}
            <span>{item.label}</span>
          </NavLink>
        ))}
        <button
          type="button"
          onClick={() => setMoreOpen(true)}
          aria-haspopup="dialog"
          aria-expanded={moreOpen}
          aria-controls="mobile-more-sheet"
          className="flex-1 flex flex-col items-center justify-center gap-0.5 py-2 text-xs font-medium text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-4px] focus-visible:outline-green-500 transition-colors"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
          <span>{t('moreMenu')}</span>
        </button>
      </nav>

      {/* ── Mobile "More" bottom sheet ── */}
      {moreOpen && (
        <div
          className="lg:hidden fixed inset-0 z-50"
          role="dialog"
          aria-modal="true"
          aria-labelledby="mobile-more-title"
          id="mobile-more-sheet"
        >
          {/* Backdrop */}
          <button
            type="button"
            aria-label={t('closeMenu')}
            onClick={() => setMoreOpen(false)}
            className="absolute inset-0 bg-black/40 animate-fade-in"
          />
          {/* Sheet */}
          <div
            className="absolute bottom-0 inset-x-0 bg-white dark:bg-gray-800 rounded-t-2xl shadow-xl border-t border-gray-200 dark:border-gray-700 animate-slide-up"
            style={{ paddingBottom: 'calc(16px + env(safe-area-inset-bottom))' }}
          >
            <div className="flex items-center justify-center pt-2 pb-1">
              <span className="block w-10 h-1 rounded-full bg-gray-300 dark:bg-gray-600" aria-hidden="true" />
            </div>
            <div className="flex items-center justify-between px-5 pt-2 pb-3">
              <h2 id="mobile-more-title" className="text-base font-bold text-gray-900 dark:text-gray-100">
                {t('moreMenu')}
              </h2>
              <button
                type="button"
                onClick={() => setMoreOpen(false)}
                aria-label={t('closeMenu')}
                className="p-1.5 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded focus-visible:ring-2 focus-visible:ring-green-500 transition"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="px-3 pb-3 grid grid-cols-2 gap-2">
              {[
                { to: '/hotpicks',       icon: <IconFire />,       label: t('hotPicks') },
                { to: '/analytics',      icon: <IconAnalytics />,  label: t('analytics') },
                { to: '/news',           icon: <IconNews />,       label: t('news') },
                { to: '/interview-prep', icon: <IconVideo />,      label: t('interviewPrep') },
                { to: '/settings',       icon: <IconSettings />,   label: t('settings') },
              ].map(item => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  onClick={() => setMoreOpen(false)}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-green-500 focus-visible:ring-offset-1 ${
                      isActive
                        ? 'bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                        : 'bg-gray-50 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-600'
                    }`
                  }
                >
                  <span className="text-gray-500 dark:text-gray-400">{item.icon}</span>
                  <span className="truncate">{item.label}</span>
                </NavLink>
              ))}
              {isAdmin && (
                <NavLink
                  to="/admin"
                  onClick={() => setMoreOpen(false)}
                  className="col-span-2 flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-1"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                  <span className="truncate">Admin Panel</span>
                </NavLink>
              )}
            </div>
          </div>
        </div>
      )}

      <ToastContainer />

      {/* ── Idle timeout modal ── */}
      {showWarning && (
        <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-8 max-w-sm w-full text-center">
            <div className="w-14 h-14 bg-amber-100 dark:bg-amber-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-7 h-7 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
              </svg>
            </div>
            <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-1">
              {secondsLeft === 0 ? 'Session Expired' : 'Session Expiring'}
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">
              {secondsLeft === 0
                ? 'Would you like to extend your session?'
                : 'Your session will end in'}
            </p>
            {secondsLeft > 0 && (
              <>
                <p className={`text-5xl font-bold mb-1 tabular-nums transition-colors ${secondsLeft <= 5 ? 'text-red-500 animate-pulse' : 'text-amber-500'}`}>
                  {secondsLeft}
                </p>
                <p className="text-xs text-gray-400 dark:text-gray-500 mb-6">seconds</p>
              </>
            )}
            {secondsLeft === 0 && <div className="mb-6" />}
            <div className="flex gap-3">
              <button
                onClick={handleLogout}
                className="flex-1 px-4 py-2.5 border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 text-sm font-medium rounded-xl transition"
              >
                {t('signOut')}
              </button>
              <button
                onClick={stayLoggedIn}
                className="flex-1 px-4 py-2.5 bg-green-600 hover:bg-green-700 focus-visible:ring-2 focus-visible:ring-green-500 focus-visible:ring-offset-2 text-white text-sm font-semibold rounded-xl transition"
              >
                {t('stayLoggedIn')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
