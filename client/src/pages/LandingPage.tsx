import { ModalSurface } from "../components/ui";
import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import {usePageLanguage} from '../hooks/usePageLanguage';
import {messages} from '../i18n/LandingPage';
import { getPublicJobs } from '../services/publicJobs.service';
import { LanguageToggle } from '../components/common/LanguageToggle';
const CARD_COLORS = ['bg-ink', 'bg-ink', 'bg-ink', 'bg-ink', 'bg-ink', 'bg-ink', 'bg-ink', 'bg-ink', 'bg-ink', 'bg-ink'];
const SAMPLE_JOBS = [{
  id: -1,
  title: 'Nachhaltigkeitsberater (m/w/d)',
  company: 'GreenConsult GmbH',
  location: 'Düsseldorf',
  url: '#',
  salary: '45.000 – 60.000 €',
  source: 'sample',
  posted_date: null
}, {
  id: -2,
  title: 'GIS-Spezialist Umweltplanung',
  company: 'EnviroGeo AG',
  location: 'Köln',
  url: '#',
  salary: null,
  source: 'sample',
  posted_date: null
}, {
  id: -3,
  title: 'Projektmanager Erneuerbare Energien',
  company: 'SolarWind Solutions',
  location: 'Essen',
  url: '#',
  salary: '50.000 – 65.000 €',
  source: 'sample',
  posted_date: null
}, {
  id: -4,
  title: 'Umweltingenieur / Environmental Engineer',
  company: 'EcoTech GmbH',
  location: 'Bochum',
  url: '#',
  salary: null,
  source: 'sample',
  posted_date: null
}, {
  id: -5,
  title: 'Consultant Klimaschutz & Energie',
  company: 'ClimateForce',
  location: 'Dortmund',
  url: '#',
  salary: '42.000 – 58.000 €',
  source: 'sample',
  posted_date: null
}];
interface PublicJob {
  id: number;
  title: string;
  company: string;
  location: string;
  url: string;
  salary: string | null;
  source: string;
  posted_date: string | null;
  color?: string;
}
function useInView() {
  return {
    ref: useRef<HTMLDivElement>(null),
    inView: true
  };
}

// ── Animated visuals ──────────────────────────────────────────

// 1. Typing animation visual
const TypingVisual = () => {
  const {
    t,
    lang
  } = usePageLanguage(messages);
  const [keyword, setKeyword] = useState('nachhaltigkeit');
  return <div className="ui-panel p-5 w-full max-w-sm"><label className="ui-label">{t('landingJobKeywords')}<input className="ui-field" value={keyword} onChange={event => setKeyword(event.target.value)} /></label><p className="ui-muted text-sm mt-4">Düsseldorf · Köln · Remote</p><Link className="ui-button ui-button--primary mt-5" to="/demo">{lang === 'de' ? 'Demo ansehen' : 'View demo'}</Link></div>;
};
const SwipeVisual = () => {
  const [swipeX, setSwipeX] = useState(0);
  const [swiped, setSwiped] = useState<'left' | 'right' | null>(null);
  const [cardIdx, setCardIdx] = useState(0);
  const dragging = useRef(false);
  const startX = useRef(0);
  const getX = (e: React.MouseEvent | React.TouchEvent) => 'touches' in e ? e.touches[0].clientX : e.clientX;
  const handleDown = (e: React.MouseEvent | React.TouchEvent) => {
    dragging.current = true;
    startX.current = getX(e);
  };
  const handleMove = (e: React.MouseEvent | React.TouchEvent) => {
    if (!dragging.current) return;
    setSwipeX(getX(e) - startX.current);
  };
  const handleUp = () => {
    dragging.current = false;
    if (swipeX > 80) {
      setSwiped('right');
      setTimeout(() => {
        setSwiped(null);
        setSwipeX(0);
        setCardIdx(i => (i + 1) % SAMPLE_JOBS.length);
      }, 500);
    } else if (swipeX < -80) {
      setSwiped('left');
      setTimeout(() => {
        setSwiped(null);
        setSwipeX(0);
        setCardIdx(i => (i + 1) % SAMPLE_JOBS.length);
      }, 500);
    } else setSwipeX(0);
  };
  const job = SAMPLE_JOBS[cardIdx];
  const rot = swipeX / 15;
  const saveOpacity = Math.min(1, swipeX / 80);
  const skipOpacity = Math.min(1, -swipeX / 80);
  return <div className="w-full max-w-xs mx-auto select-none" style={{
    height: '300px',
    position: 'relative'
  }}>
      {/* Stack behind */}
      {[2, 1].map(o => <div key={o} className="absolute inset-x-4 bg-surface rounded-lg border border-line shadow-none" style={{
      top: o * 10,
      zIndex: 3 - o,
      height: '240px'
    }} />)}
      {/* Top card */}
      <div className="absolute inset-0 bg-surface rounded-lg border border-line shadow-none p-5 cursor-grab active:cursor-grabbing z-10" style={{
      transform: swiped === 'right' ? 'translateX(120%) rotate(4deg)' : swiped === 'left' ? 'translateX(-120%) rotate(-4deg)' : `translateX(${swipeX}px) rotate(${rot}deg)`,
      transition: swiped ? 'transform 0.18s cubic-bezier(0.16,1,0.3,1)' : swipeX === 0 ? 'transform 0.18s ease' : 'none'
    }} onMouseDown={handleDown} onMouseMove={handleMove} onMouseUp={handleUp} onMouseLeave={handleUp} onTouchStart={handleDown} onTouchMove={handleMove} onTouchEnd={handleUp}>
        {/* Save/Skip badges */}
        <div className="absolute top-4 left-4 px-3 py-1.5 bg-ink text-on-ink text-xs font-semibold rounded-md rotate-[-12deg] border-2 border-white" style={{
        opacity: saveOpacity
      }}>SAVE </div>
        <div className="absolute top-4 right-4 px-3 py-1.5 bg-red-400 text-on-ink text-xs font-semibold rounded-md rotate-[12deg] border-2 border-white" style={{
        opacity: skipOpacity
      }}>SKIP ✕</div>

        
        <p className="font-semibold text-ink text-sm leading-snug mb-1">{job.title}</p>
        <p className="text-xs text-muted mb-3">{job.company} · {job.location}</p>
        {job.salary && <span className="text-xs px-2.5 py-1 bg-subtle text-muted rounded-lg font-medium">{job.salary}</span>}
        <p className="text-[10px] text-muted mt-4 text-center">← drag to skip · drag to save →</p>
      </div>
    </div>;
};

// 3. Save/Click animation visual
const SaveVisual = () => {
  const {
    t
  } = usePageLanguage(messages);
  const [saved, setSaved] = useState<number | null>(null);
  const [ripple, setRipple] = useState<number | null>(null);
  const handleSave = (i: number) => {
    setSaved(i);
    setRipple(i);
    setTimeout(() => setRipple(null), 600);
  };
  return <div className="bg-surface rounded-lg border border-line shadow-none p-5 w-full max-w-sm">
      <p className="text-xs font-semibold text-muted uppercase tracking-wide mb-4">{t('landingLatestJobs')}</p>
      {SAMPLE_JOBS.slice(0, 4).map((j, i) => <div key={i} className="flex items-center gap-3 py-3 border-b border-line last:border-0">
          
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-ink truncate">{j.title}</p>
            <p className="text-xs text-muted">{j.location}</p>
          </div>
          <button onClick={() => handleSave(i)} className="relative shrink-0 w-8 h-8 rounded-md flex items-center justify-center transition-colors" style={{
        background: saved === i ? '#16a34a' : '#f3f4f6'
      }}>
            {ripple === i && <span className="absolute inset-0 rounded-md bg-ink  opacity-50" />}
            <svg className="w-4 h-4 transition-colors" fill={saved === i ? 'white' : 'none'} stroke={saved === i ? 'white' : '#9ca3af'} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
            </svg>
          </button>
        </div>)}
      <p className="text-xs text-muted text-center mt-3">{t('landingClickBookmark')}</p>
    </div>;
};

// 4. Hide/dismiss visual
const HideVisual = () => {
  const {
    t
  } = usePageLanguage(messages);
  const [hidden, setHidden] = useState<number[]>([]);
  const handleHide = (i: number) => setHidden(previous => [...previous, i]);
  return <div className="bg-surface rounded-lg border border-line shadow-none p-5 w-full max-w-sm">
      <div className="flex items-center justify-between mb-4">
        <p className="text-xs font-semibold text-muted uppercase tracking-wide">{t('jobFeedFilters')}</p>
        {hidden.length > 0 && <span className="text-xs text-muted">{hidden.length} {t('landingHidden')}</span>}
      </div>
      {SAMPLE_JOBS.slice(0, 4).map((j, i) => <div key={i} className="flex items-center gap-3 py-2.5 border-b border-line last:border-0 overflow-hidden" style={{
      display: hidden.includes(i) ? 'none' : undefined
    }}>
          
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-ink truncate">{j.title}</p>
            <p className="text-xs text-muted">{j.location}</p>
          </div>
          <button onClick={() => handleHide(i)} className="shrink-0 w-7 h-7 rounded-md bg-subtle hover:bg-danger-soft hover:text-danger flex items-center justify-center text-muted transition-colors text-xs font-semibold">✕</button>
        </div>)}
      {hidden.length === SAMPLE_JOBS.slice(0, 4).length && <div className="text-center py-4">
          <p className="text-xs text-muted mb-2">{t('landingAllHidden')}</p>
          <button onClick={() => setHidden([])} className="text-xs text-accent font-semibold">{t('landingRestoreAll')}</button>
        </div>}
    </div>;
};

// 5. Kanban drag visual
const KanbanVisual = () => {
  const {
    t
  } = usePageLanguage(messages);
  const [active, setActive] = useState(0);
  const cols = [{
    label: t('saved'),
    color: 'bg-subtle text-muted',
    dot: 'bg-ink'
  }, {
    label: t('applied'),
    color: 'bg-subtle text-muted',
    dot: 'bg-ink'
  }, {
    label: t('interviewing'),
    color: 'bg-subtle text-muted',
    dot: 'bg-ink'
  }, {
    label: t('offered'),
    color: 'bg-subtle text-accent',
    dot: 'bg-ink'
  }];
  return <div className="bg-surface rounded-lg border border-line shadow-none p-5 w-full max-w-sm">
      <p className="text-xs font-semibold text-muted uppercase tracking-wide mb-4">{t('landingPipeline')}</p>
      <div className="relative mb-4">
        <div className="flex gap-2 mb-3">
          {cols.map((c, i) => <div key={i} className={`flex-1 h-1.5 rounded-md transition-colors duration-150 ${i <= active ? c.dot : 'bg-subtle'}`} />)}
        </div>
        <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border-2 transition-colors duration-150 ${cols[active].color} border-current`}>
          <div className={`w-2 h-2 rounded-md ${cols[active].dot}`} />
          <span className="text-xs font-semibold">{cols[active].label}</span>
          <span className="ml-auto text-xs font-semibold opacity-60">GreenConsult</span>
        </div>
        <div className="text-xs text-muted text-center mt-2">↑ {t('landingAutoStages')}</div>
      </div>
      {cols.map((c, i) => <button type="button" onClick={() => setActive(i)} key={i} className={`w-full text-left flex items-center gap-2 px-3 py-2 rounded-lg mb-1.5 transition-colors duration-300 ${i === active ? `${c.color} shadow-none` : 'bg-canvas'}`}>
          <div className={`w-1.5 h-1.5 rounded-md transition-colors ${i === active ? c.dot : 'bg-line'}`} />
          <span className={`text-xs font-semibold transition-colors ${i === active ? '' : 'text-muted'}`}>{c.label}</span>
          <span className={`ml-auto text-xs font-semibold transition-colors ${i === active ? '' : 'text-muted'}`}>{[12, 7, 3, 1][i]}</span>
        </button>)}
    </div>;
};
const USE_CASES = [{
  tagKey: 'landingUcSetupTag',
  headlineKey: 'landingUcSetupHead',
  bodyKey: 'landingUcSetupBody',
  Visual: TypingVisual
}, {
  tagKey: 'landingUcSwipeTag',
  headlineKey: 'landingUcSwipeHead',
  bodyKey: 'landingUcSwipeBody',
  Visual: SwipeVisual
}, {
  tagKey: 'landingUcSaveTag',
  headlineKey: 'landingUcSaveHead',
  bodyKey: 'landingUcSaveBody',
  Visual: SaveVisual
}, {
  tagKey: 'landingUcHideTag',
  headlineKey: 'landingUcHideHead',
  bodyKey: 'landingUcHideBody',
  Visual: HideVisual
}, {
  tagKey: 'landingUcTrackTag',
  headlineKey: 'landingUcTrackHead',
  bodyKey: 'landingUcTrackBody',
  Visual: KanbanVisual
}];

// Wrapper so useInView is called at component level (not inside .map)
const UseCaseRow = ({
  uc,
  i
}: {
  uc: {
    tag: string;
    headline: string;
    body: string;
    Visual: React.ComponentType;
  };
  i: number;
}) => {
  const {t}=usePageLanguage(messages);
  const {
    ref
  } = useInView();
  const isEven = i % 2 === 0;
  return <div ref={ref} className={`py-16 md:py-24 px-6 border-b border-line ${isEven ? 'bg-surface' : 'bg-canvas'}`}>
      <div className="max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-10 md:gap-12 items-center">
        <div className={isEven ? 'order-1' : 'order-1 md:order-2'}>
          
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-semibold text-ink leading-tight mt-3 mb-5">{uc.headline}</h2>
          <p className="text-muted text-base md:text-lg leading-relaxed">{uc.body}</p>
          <Link to="/register" className="inline-flex items-center gap-2 mt-8 text-ink font-semibold text-sm hover:gap-3 transition-colors">
            {t('landingTryFree')} <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>
          </Link>
        </div>
        <div className={`flex justify-center ${isEven ? 'order-2' : 'order-2 md:order-1'}`}>
          <uc.Visual />
        </div>
      </div>
    </div>;
};
export const LandingPage = () => {
  const isAuthenticated = useAuthStore(s => s.isAuthenticated);
  const {
    t,
    lang
  } = usePageLanguage(messages);
  const [selectedJob, setSelectedJob] = useState<PublicJob | null>(null);
  const [jobs, setJobs] = useState<PublicJob[]>([]);
  const illustrative=jobs.length>0&&jobs.every(job=>job.source==='sample');
  const useCases = USE_CASES.map(uc => ({
    tag: t(uc.tagKey),
    headline: t(uc.headlineKey),
    body: t(uc.bodyKey),
    Visual: uc.Visual
  }));
  const heroRef = useInView();
  const ctaRef = useInView();
  useEffect(() => {
    getPublicJobs().then((data: PublicJob[]) => {
      const src = data.length > 0 ? data : SAMPLE_JOBS;
      setJobs(src.map((j, i) => ({
        ...j,
        color: CARD_COLORS[i % CARD_COLORS.length]
      })));
    }).catch(() => setJobs(SAMPLE_JOBS.map((j, i) => ({
      ...j,
      color: CARD_COLORS[i % CARD_COLORS.length]
    }))));
  }, []);
  return <div className="min-h-screen bg-surface flex flex-col" style={{
    fontFamily: 'var(--font-ui)'
  }}>
      

      {/* ── Announcement bar + Nav (sticky together) ── */}
      <div className="sticky top-0 z-50">
      <div className="relative bg-ink text-on-ink text-xs font-semibold py-2.5 px-4 text-center flex items-center justify-center gap-3">
        <span className="hidden sm:flex items-center gap-1.5">
          <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 fill-green-400"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z" /></svg>
          {t('landingExtensionBar')}
        </span>
        <span className="sm:hidden">{t('landingExtensionBarMobile')}</span>
        <span className="text-on-ink/30">·</span>
        <a href="#extension" className="underline underline-offset-2 text-accent hover:text-accent transition">{t('landingInstallFree')}</a>
        <div className="absolute right-3 top-1/2 hidden -translate-y-1/2 lg:block">
          <LanguageToggle />
        </div>
      </div>

      {/* ── Nav (OVO pill style) ── */}
      <div className="flex justify-center px-4 py-3 bg-surface ">
        <nav className="nav-pill w-full max-w-5xl px-4 h-14 flex items-center justify-between">
          <img src="/logo.png" alt="afavers" className="h-16 w-auto" onError={e => {
            const t = e.target as HTMLImageElement;
            t.style.display = 'none';
            (t.parentElement as HTMLElement).insertAdjacentHTML('afterbegin', '<span style="font-size:1.2rem;font-weight:900;color:#0a1a25;letter-spacing:-0.5px">afavers</span>');
          }} />
          <div className="hidden md:flex items-center gap-1">
            {[[t('landingFeatures'), '#use-cases'], [t('landingExtension'), '#extension'], [t('landingLiveJobs'), '#jobs']].map(([label, href]) => <a key={label} href={href} className="px-4 py-2 text-sm text-muted hover:text-ink hover:bg-subtle/70 rounded-md transition font-medium">{label}</a>)}
          </div>
          <div className="flex items-center gap-2">
            {isAuthenticated ? <Link to="/dashboard" className="px-5 py-2 bg-ink hover:bg-ink text-on-ink text-sm font-semibold rounded-md transition">{t('landingDashboardCta')}</Link> : <>
                <Link to="/login" className="hidden sm:inline px-4 py-2 text-sm font-medium text-muted hover:text-ink transition rounded-md">{t('landingLogin')}</Link>
                <Link to="/register" className="px-5 py-2 bg-ink hover:bg-ink text-on-ink text-sm font-semibold rounded-md transition shadow-none">{t('landingGetStarted')}</Link>
              </>}
          </div>
        </nav>
      </div>
      </div>{/* end sticky wrapper */}

      {/* ── Hero ── */}
      <section className="relative min-h-[88vh] flex flex-col items-center justify-center text-center px-6 overflow-hidden">
        {/* Gradient background like OVO */}




        <div ref={heroRef.ref} className="relative max-w-5xl mx-auto">
          

          <h1 className={`text-4xl sm:text-6xl lg:text-8xl font-semibold text-ink leading-[0.95] tracking-tight mb-6 ${heroRef.inView ? '' : 'opacity-0'}`} style={{
          animationDelay: '80ms'
        }}>
            {t('landingHeadlineTop')}<br /><span className="">{t('landingHeadlineAccent')}</span>
          </h1>

          <p className={`text-muted text-base sm:text-xl leading-relaxed max-w-2xl mx-auto mb-10 ${heroRef.inView ? '' : 'opacity-0'}`} style={{
          animationDelay: '160ms'
        }}>
            {t('landingSubtitle')}
          </p>

          <div className={`flex flex-col sm:flex-row gap-3 justify-center mb-10 ${heroRef.inView ? '' : 'opacity-0'}`} style={{
          animationDelay: '240ms'
        }}>
            <Link to="/register" className="inline-flex items-center justify-center gap-2 px-8 py-4 bg-ink hover:bg-ink text-on-ink font-semibold rounded-lg text-base transition-colors hover:shadow-none ">
              {t('landingStartFree')} <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>
            </Link>
            <Link to="/demo" className="inline-flex items-center justify-center px-8 py-4 bg-surface border border-line hover:bg-surface text-ink font-semibold rounded-lg text-base transition shadow-none">
              {t('landingBrowseLive')}
            </Link>
          </div>

          
        </div>

        <div className="landing-preview max-w-4xl mx-auto border border-line rounded-lg text-left bg-surface overflow-hidden">
        <p className="px-5 py-3 text-xs text-muted border-b border-line">{lang === 'de' ? 'Beispielansicht · illustrative Stellen und Zahlen' : 'Example workspace · illustrative vacancies and counts'}</p>
        <div className="grid md:grid-cols-[1fr_200px]">
          <div><div className="px-5 py-4 border-b border-line text-sm font-medium">{t('landingLatestJobs')}</div>{SAMPLE_JOBS.slice(0, 3).map(job => <div key={job.id} className="px-5 py-4 border-b border-line last:border-0"><strong className="block text-sm font-medium">{job.title}</strong><span className="block mt-1 text-xs text-muted">{job.company} · {job.location}</span></div>)}</div>
          <div className="border-t md:border-t-0 md:border-l border-line p-5"><h2 className="text-sm font-medium mb-4">{t('landingPipeline')}</h2>{[[t('saved'), '12'], [t('applied'), '7'], [t('interviewing'), '2']].map(([label, count]) => <div key={label} className="flex justify-between text-sm py-2 border-b border-line"><span className="text-muted">{label}</span><span>{count}</span></div>)}</div>
        </div>
      </div>
      </section>

      <section className="border-y border-line bg-canvas py-10"><ol className="max-w-5xl mx-auto px-6 flex flex-wrap justify-between gap-8">{[[t('jobs'), lang === 'de' ? 'Stellen vergleichen und speichern' : 'Compare and save opportunities'], [lang==='de'?'Bewerbungen':'Applications', lang === 'de' ? 'Notizen, Checklisten und Entwürfe' : 'Notes, checklists and drafts'], [t('reminders'), lang === 'de' ? 'Nachfragen und Gespräche im Blick behalten' : 'Keep track of follow-ups and interviews']].map(([title, body]) => <li key={title} className="flex gap-4 text-sm"><span><strong className="block font-medium">{title}</strong><span className="block mt-1 text-muted">{body}</span></span></li>)}</ol></section>

      {/* ── Use cases ── */}
      <section id="use-cases" className="bg-surface">
        {useCases.map((uc, i) => <UseCaseRow key={i} uc={uc} i={i} />)}
      </section>

      {/* ── Live Jobs ── */}
      <section id="jobs" className="py-16 sm:py-24 bg-canvas border-y border-line">
        <div className="max-w-6xl mx-auto px-6 mb-8 sm:mb-10 flex items-end justify-between">
          <div>
            <h2 className="text-2xl sm:text-4xl font-semibold text-ink">{illustrative?(lang==='de'?'Beispielstellen':'Example vacancies'):(lang==='de'?'Stellen entdecken':'Browse job opportunities')}</h2>
            <p className="text-muted text-sm mt-1">{illustrative?(lang==='de'?'Illustrative Beispiele · keine aktuellen Stellenanzeigen':'Illustrative examples · not live vacancies'):jobs.length>0?`${jobs.length} ${lang==='de'?'öffentliche Stellenanzeigen':'public listings'}`:t('landingLoading')}</p>
          </div>
          <Link to={isAuthenticated ? '/jobs' : '/demo'} className="text-sm font-semibold text-ink hover:text-muted transition flex items-center gap-1 shrink-0">
            {t('landingSeeAll')} <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>
          </Link>
        </div>
        <div className="flex gap-4 overflow-x-auto px-6 pb-4 scrollbar-hide snap-x snap-mandatory">
          {jobs.map((job, i) => <button key={job.id ?? i} onClick={() => setSelectedJob(job)} className="ui-linked-card snap-start shrink-0 bg-surface border border-line hover:border-line rounded-lg p-5 flex flex-col text-left group transition-colors duration-300 hover:shadow-none " style={{
          width: '272px'
        }}>
              <div className="flex items-start justify-between mb-4">
                
                <svg className="w-4 h-4 text-gray-200 group-hover:text-muted transition mt-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
              </div>
              <p className="text-ink font-semibold text-sm leading-snug mb-1 group-hover:text-accent transition line-clamp-2">{job.title}</p>
              <p className="text-muted text-xs mb-4">{job.company} · {job.location}</p>
              <div className="mt-auto">
                {job.salary ? <span className="inline-block px-2.5 py-1 bg-subtle text-muted text-xs font-medium rounded-lg">{job.salary}</span> : <span className="inline-block px-2.5 py-1 bg-subtle text-accent text-xs font-semibold rounded-lg border border-line">{t('viewFullListing')}</span>}
              </div>
            </button>)}
          <div className="snap-start shrink-0 w-64 border-2 border-dashed border-line hover:border-line rounded-lg p-5 flex flex-col items-center justify-center text-center gap-4 transition-colors">
            <div className="w-11 h-11 rounded-lg bg-subtle flex items-center justify-center">
              <svg className="w-5 h-5 text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
            </div>
            <div><p className="text-ink font-semibold text-sm mb-1">{t('landingSeeAllJobs')}</p><p className="text-muted text-xs">{t('landingTrackApply')}</p></div>
            <Link to="/register" className="w-full text-center px-4 py-2.5 bg-ink hover:bg-ink text-on-ink text-sm font-semibold rounded-lg transition">{t('landingSignupFree')}</Link>
          </div>
        </div>
      </section>

      {/* ── Browser Extension ── */}
      <section id="extension" className="py-16 sm:py-24 px-6 bg-surface border-y border-line">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12 sm:mb-16">
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-semibold text-ink mb-4">{t('landingExtensionTitle')}</h2>
            <p className="text-muted text-base sm:text-lg max-w-xl mx-auto">{t('landingExtensionBody')}</p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4 mt-8">
              <a href="/afavers-chrome-extension.zip" download="afavers-chrome-extension.zip" className="w-full sm:w-auto inline-flex items-center justify-center gap-3 px-6 py-3 bg-ink hover:bg-ink text-on-ink font-semibold rounded-lg transition hover:shadow-none ">
                <svg viewBox="0 0 24 24" className="w-5 h-5 fill-white"><path d="M12 0C8.21 0 4.831 1.757 2.632 4.501l3.953 6.848A5.454 5.454 0 0 1 12 6.545h10.691A12 12 0 0 0 12 0zM1.931 5.47A11.943 11.943 0 0 0 0 12c0 6.012 4.42 10.991 10.189 11.864l3.953-6.847a5.45 5.45 0 0 1-6.865-2.29zm13.342 2.166a5.446 5.446 0 0 1 1.45 7.09l.002.001h-.002l-5.344 9.257c.206.01.413.016.621.016 6.627 0 12-5.373 12-12 0-1.54-.29-3.011-.818-4.364zM12 10.545a1.455 1.455 0 1 0 0 2.91 1.455 1.455 0 0 0 0-2.91z" /></svg>
                {t('landingDownloadChrome')}
              </a>
              <a href="https://addons.mozilla.org/firefox/addon/afavers-job-capture/" target="_blank" rel="noopener noreferrer" className="w-full sm:w-auto inline-flex items-center justify-center gap-3 px-6 py-3 bg-surface border border-line hover:border-line hover:bg-canvas text-ink font-semibold rounded-lg transition">
                <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none"><path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2z" fill="#FF6611" /><path d="M12 4.5c-1.8 0-3.45.63-4.75 1.67.48-.1.98-.17 1.5-.17 3.59 0 6.5 2.91 6.5 6.5 0 1.2-.33 2.33-.9 3.3A7.5 7.5 0 0 0 12 4.5z" fill="white" opacity="0.6" /></svg>
                {t('landingAddFirefox')}
              </a>
            </div>
          </div>

          {/* How to use steps */}
          <div className="grid sm:grid-cols-3 gap-6">
            {[{
            step: '01',
            icon: <svg className="w-6 h-6 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>,
            title: t('landingStepInstall'),
            desc: t('landingStepInstallDesc')
          }, {
            step: '02',
            icon: <svg className="w-6 h-6 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>,
            title: t('landingStepBrowse'),
            desc: t('landingStepBrowseDesc')
          }, {
            step: '03',
            icon: <svg className="w-6 h-6 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" /></svg>,
            title: t('landingStepSave'),
            desc: t('landingStepSaveDesc')
          }].map((s, i) => <div key={i} className="relative bg-canvas rounded-lg p-7 border border-line hover:border-line hover:shadow-none transition-colors">
                <div className="text-5xl font-semibold text-gray-200 leading-none mb-4 select-none">{s.step}</div>
                <div className="w-11 h-11 bg-surface rounded-lg border border-line flex items-center justify-center mb-4 shadow-none">
                  {s.icon}
                </div>
                <h3 className="font-semibold text-ink text-base mb-2">{s.title}</h3>
                <p className="text-muted text-sm leading-relaxed">{s.desc}</p>
              </div>)}
          </div>

          {/* Extension mockup */}
          <div className="mt-12 flex justify-center">
            <div className="bg-surface rounded-lg border border-line shadow-none p-5 w-72">
              <div className="flex items-center gap-2 mb-4 pb-3 border-b border-line">
                <div className="w-6 h-6 rounded bg-ink flex items-center justify-center">
                  <svg className="w-3.5 h-3.5 text-on-ink" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" /></svg>
                </div>
                <span className="text-sm font-semibold text-ink">afavers</span>
                <span className="ml-auto text-[10px] font-semibold text-accent bg-subtle px-2 py-0.5 rounded-md border border-line">● {t('landingConnected')}</span>
              </div>
              <p className="text-xs text-muted mb-1 font-medium">{t('landingDetected')}</p>
              <p className="text-sm font-semibold text-ink mb-0.5 truncate">Sustainability Manager (m/w/d)</p>
              <p className="text-xs text-muted mb-4">GreenConsult GmbH · LinkedIn</p>
              <button className="w-full py-2.5 bg-ink hover:bg-ink text-on-ink text-sm font-semibold rounded-lg transition flex items-center justify-center gap-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" /></svg>
                {t('landingSaveToAfavers')}
              </button>
              <p className="text-[10px] text-muted text-center mt-2">{t('landingSync')}</p>
            </div>
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="py-20 sm:py-32 px-6 bg-surface">
        <div ref={ctaRef.ref} className="max-w-3xl mx-auto text-center" style={{
        opacity: ctaRef.inView ? 1 : 0,
        transform: ctaRef.inView ? 'translateY(0)' : 'translateY(32px)',
        transition: 'all 0.8s cubic-bezier(0.16,1,0.3,1)'
      }}>
          <h2 className="text-4xl sm:text-5xl md:text-7xl font-semibold text-ink leading-tight mb-6">
            {t('landingFinalTop')}<br /><span className="">{t('landingFinalAccent')}</span>
          </h2>
          <p className="text-muted text-base sm:text-xl mb-10 sm:mb-12">{t('landingFinalSub')}</p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link to="/register" className="px-10 py-4 bg-ink hover:bg-ink text-on-ink font-semibold rounded-lg text-base transition-colors hover:shadow-none ">{t('landingStartFree')} →</Link>
            <Link to="/login" className="px-10 py-4 border border-line hover:border-line hover:bg-canvas text-ink font-semibold rounded-lg text-base transition">{t('landingAlreadyAccount')}</Link>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="bg-surface border-t border-line py-10 px-6">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row justify-between items-center gap-5">
          <img src="/logo.png" alt="afavers" className="h-16 w-auto" onError={e => {
          const t = e.target as HTMLImageElement;
          t.style.display = 'none';
          (t.parentElement as HTMLElement).insertAdjacentHTML('afterbegin', '<span style="font-size:1.1rem;font-weight:900;color:#0a1a25">afavers</span>');
        }} />
          <p className="text-muted text-sm"> {new Date().getFullYear()} afavers · {t('landingFooter')}</p>
          <div className="flex gap-6 text-sm font-medium text-muted">
            {!isAuthenticated && <Link to="/login" className="hover:text-ink transition">{t('landingLogin')}</Link>}
            {!isAuthenticated && <Link to="/register" className="hover:text-ink transition">{t('createAccount')}</Link>}
            <Link to="/disclaimer" className="hover:text-ink transition">{t('landingPrivacy')}</Link>
          </div>
        </div>
      </footer>

      {/* ── Job modal ── */}
      {selectedJob && <ModalSurface label="Job details" onClose={() => setSelectedJob(null)}>
          <div className="bg-surface rounded-lg shadow-none w-full max-w-lg p-8 relative" onClick={e => e.stopPropagation()}>
            <button onClick={() => setSelectedJob(null)} className="absolute top-5 right-5 w-8 h-8 rounded-md bg-subtle hover:bg-line flex items-center justify-center text-muted transition">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
            <div className="flex items-center gap-4 mb-6">
              
              <div><p className="font-semibold text-ink">{selectedJob.company}</p><p className="text-muted text-sm">{selectedJob.location}</p></div>
            </div>
            <h2 className="text-xl font-semibold text-ink mb-4 leading-snug">{selectedJob.source==='sample'?(lang==='de'?'Beispielstelle: ':'Example vacancy: '):''}{selectedJob.title}</h2>
            {selectedJob.salary && <span className="inline-block px-3 py-1.5 bg-subtle text-ink text-sm font-semibold rounded-lg mb-6">{selectedJob.salary}</span>}
            <a href={/^https?:\/\//i.test(selectedJob.url)&&selectedJob.source!=='sample'?selectedJob.url:'/register'} target={selectedJob.source==='sample'?undefined:'_blank'} rel="noopener noreferrer" className="block w-full text-center py-3.5 bg-ink hover:bg-ink text-on-ink font-semibold text-sm rounded-lg mb-3 transition">{selectedJob.source==='sample'?(lang==='de'?'Mit der Jobsuche beginnen':'Start your job search'):t('landingGoPosting')}</a>
            <Link to="/register" className="block w-full text-center py-3 border border-line hover:border-line text-muted font-semibold text-sm rounded-lg transition">{t('landingTrackApplication')}</Link>
            <p className="text-center text-xs text-muted mt-3">{t('landingNoCard')}</p>
          </div>
        </ModalSurface>}
    </div>;
};
