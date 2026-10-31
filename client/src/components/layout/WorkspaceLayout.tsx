import { useState, type ReactNode } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import { useLanguage } from '../../store/languageStore';
import { useThemeStore } from '../../store/themeStore';
import { useIdleTimer } from '../../hooks/useIdleTimer';
import { DemoBanner } from '../common/DemoBanner';
import { ToastContainer } from '../common/Toast';
import { Button, Dialog, Icon } from '../ui';
import type { IconName } from '../ui/Icon';
export function Wordmark() {
  return <span className="app-logo" aria-label="Afavers">Afa<span>v</span>ers</span>;
}
export function WorkspaceLayout({
  children
}: {
  children: ReactNode;
}) {
  const {
      user,
      logout
    } = useAuthStore(),
    {
      lang,
      setLang,
      t
    } = useLanguage(),
    {
      theme,
      toggleTheme
    } = useThemeStore();
  const de = lang === 'de',
    navigate = useNavigate();
  const [more, setMore] = useState(false), [railOpen,setRailOpen]=useState(false);
  const signOut = async () => {
    await logout();
    navigate('/login');
  };
  const idle = useIdleTimer(() => {
    void logout();
    navigate('/');
  });
  const groups: {
    label: string;
    items: [string, IconName, string][];
  }[] = [{
    label: de ? 'Suchen' : 'Search',
    items: [['/dashboard', 'home', de ? 'Übersicht' : 'Overview'], ['/jobs', 'search', de ? 'Jobs finden' : 'Find jobs'], ['/hotpicks', 'fire', t('hotPicks')]]
  }, {
    label: de ? 'Verwalten' : 'Track',
    items: [['/kanban', 'board', de ? 'Bewerbungen' : 'Applications'], ['/reminders', 'calendar', t('reminders')], ['/analytics', 'chart', t('analytics')]]
  }, {
    label: de ? 'Wissen' : 'Resources',
    items: [['/news', 'news', t('news')], ['/interview-prep', 'jobs', t('interviewPrep')], ['/career-guides', 'book', de ? 'Karriereratgeber' : 'Career guides']]
  }];
  const nav = ([path, icon, label]: [string, IconName, string]) => <NavLink key={path} to={path} title={label} aria-label={label} className="app-nav-link" onClick={() => setMore(false)}><Icon name={icon} /><span>{label}</span></NavLink>;
  const tools = <><Button variant="quiet" onClick={toggleTheme} aria-label={theme === 'dark' ? de ? 'Helles Design' : 'Light theme' : de ? 'Dunkles Design' : 'Dark theme'}><Icon name={theme === 'dark' ? 'sun' : 'moon'} /></Button><Button variant="quiet" onClick={() => setLang(de ? 'en' : 'de')} aria-label={de ? 'Switch to English' : 'Auf Deutsch wechseln'}>{de ? 'EN' : 'DE'}</Button><Button variant="quiet" onClick={() => void signOut()} aria-label={t('logout')}><Icon name="logout" /></Button></>;
  return <div className={`app-shell${railOpen?' app-shell--nav-open':''}`}>
    <a className="app-skip" href="#main-content">{t('skipToContent')}</a>
    <aside className="app-sidebar" aria-label={de ? 'Hauptnavigation' : 'Main navigation'}><div className="app-sidebar-brand"><Link to="/dashboard"><Wordmark /></Link><Button className="app-rail-toggle" variant="quiet" aria-expanded={railOpen} aria-label={railOpen?(de?'Navigation einklappen':'Collapse navigation'):(de?'Navigation ausklappen':'Expand navigation')} onClick={()=>setRailOpen(value=>!value)}><Icon name="menu"/></Button></div>{groups.map(group => <nav className="app-nav-group" key={group.label} aria-label={group.label}><p className="app-nav-heading">{group.label}</p>{group.items.map(nav)}</nav>)}<div className="app-account">{nav(['/settings', 'settings', t('settings')])}{user?.isAdmin && nav(['/admin', 'settings', de ? 'Administration' : 'Administration'])}<p className="app-account-email" title={user?.email}>{user?.email}</p><div className="app-account-tools">{tools}</div></div></aside>
    <div className="app-main"><header className="app-mobile-header"><Link to="/dashboard"><Wordmark /></Link><Button variant="quiet" onClick={toggleTheme} aria-label={de ? 'Design wechseln' : 'Change theme'}><Icon name={theme === 'dark' ? 'sun' : 'moon'} /></Button></header><DemoBanner /><main id="main-content">{children}</main></div>
    <nav className="app-bottom-nav" aria-label={de ? 'Mobile Navigation' : 'Phone navigation'}>{[['/dashboard', 'home', t('home')], ['/jobs', 'search', t('jobs')], ['/kanban', 'board', de ? 'Bewerbungen' : 'Applications'], ['/reminders', 'calendar', t('reminders')]].map(([path, icon, label]) => <NavLink key={path} to={path}><Icon name={icon as IconName} /><span>{label}</span></NavLink>)}<button type="button" aria-expanded={more} onClick={() => setMore(true)}><Icon name="more" /><span>{t('more')}</span></button></nav>
    <Dialog open={more} title={de ? 'Weitere Bereiche' : 'More'} onClose={() => setMore(false)}><nav className="app-nav-group">{groups.flatMap(group => group.items).filter(([path]) => !['/dashboard', '/jobs', '/kanban', '/reminders'].includes(path)).map(nav)}{nav(['/settings', 'settings', t('settings')])}{user?.isAdmin && nav(['/admin', 'settings', 'Administration'])}</nav><div className="ui-divider" /><p className="ui-muted text-sm break-all">{user?.email}</p><div className="ui-actions mt-4">{tools}</div></Dialog>
    <Dialog open={idle.showWarning} title={de ? 'Sitzung fortsetzen?' : 'Continue your session?'} onClose={idle.stayLoggedIn}><p className="ui-muted">{de ? 'Du warst eine Weile inaktiv. Fahre fort oder melde dich ab.' : 'You have been inactive for a while. Continue working or sign out.'} <span className="tabular-nums">{idle.secondsLeft}s</span></p><div className="ui-form-footer"><Button onClick={() => void signOut()}>{t('logout')}</Button><Button variant="primary" onClick={idle.stayLoggedIn}>{de ? 'Weiterarbeiten' : 'Continue working'}</Button></div></Dialog>
    <ToastContainer />
  </div>;
}
