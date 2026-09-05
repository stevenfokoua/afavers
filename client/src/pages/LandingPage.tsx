import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { useLanguage } from '../store/languageStore';
import { getPublicJobs } from '../services/publicJobs.service';
import { LanguageToggle } from '../components/common/LanguageToggle';

const CARD_COLORS = ['bg-emerald-500','bg-blue-500','bg-violet-500','bg-orange-500','bg-cyan-500','bg-green-600','bg-pink-500','bg-amber-500','bg-teal-500','bg-indigo-500'];

const SAMPLE_JOBS = [
  { id: -1, title: 'Nachhaltigkeitsberater (m/w/d)', company: 'GreenConsult GmbH', location: 'Düsseldorf', url: '#', salary: '45.000 – 60.000 €', source: 'sample', posted_date: null },
  { id: -2, title: 'GIS-Spezialist Umweltplanung', company: 'EnviroGeo AG', location: 'Köln', url: '#', salary: null, source: 'sample', posted_date: null },
  { id: -3, title: 'Projektmanager Erneuerbare Energien', company: 'SolarWind Solutions', location: 'Essen', url: '#', salary: '50.000 – 65.000 €', source: 'sample', posted_date: null },
  { id: -4, title: 'Umweltingenieur / Environmental Engineer', company: 'EcoTech GmbH', location: 'Bochum', url: '#', salary: null, source: 'sample', posted_date: null },
  { id: -5, title: 'Consultant Klimaschutz & Energie', company: 'ClimateForce', location: 'Dortmund', url: '#', salary: '42.000 – 58.000 €', source: 'sample', posted_date: null },
];

interface PublicJob { id: number; title: string; company: string; location: string; url: string; salary: string | null; source: string; posted_date: string | null; color?: string; }

function useInView(threshold = 0.2) {
  const ref = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setInView(true); obs.disconnect(); } }, { threshold });
    obs.observe(el); return () => obs.disconnect();
  }, [threshold]);
  return { ref, inView };
}

// ── Animated visuals ──────────────────────────────────────────

// 1. Typing animation visual
const TypingVisual = () => {
  const { t } = useLanguage();
  const words = ['nachhaltigkeit', 'renewable energy', 'gis', 'umwelt', 'consulting'];
  const [wordIdx, setWordIdx] = useState(0);
  const [displayed, setDisplayed] = useState('');
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const word = words[wordIdx];
    let timeout: ReturnType<typeof setTimeout>;
    if (!deleting && displayed.length < word.length) {
      timeout = setTimeout(() => setDisplayed(word.slice(0, displayed.length + 1)), 80);
    } else if (!deleting && displayed.length === word.length) {
      timeout = setTimeout(() => setDeleting(true), 1400);
    } else if (deleting && displayed.length > 0) {
      timeout = setTimeout(() => setDisplayed(displayed.slice(0, -1)), 45);
    } else if (deleting && displayed.length === 0) {
      setDeleting(false);
      setWordIdx((wordIdx + 1) % words.length);
    }
    return () => clearTimeout(timeout);
  }, [displayed, deleting, wordIdx]);

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-xl p-6 w-full max-w-sm">
      <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-4">{t('landingSetPrefs')}</p>
      <div className="mb-4">
        <label className="text-xs text-gray-500 font-medium block mb-1.5">{t('landingJobKeywords')}</label>
        <div className="border-2 border-[#16a34a] rounded-xl px-4 py-3 bg-green-50/30 flex items-center gap-1 min-h-[44px]">
          <span className="text-sm font-medium text-gray-800">{displayed}</span>
          <span className="w-0.5 h-4 bg-[#16a34a] animate-pulse" />
        </div>
      </div>
      <div className="mb-4">
        <label className="text-xs text-gray-500 font-medium block mb-1.5">{t('landingCities')}</label>
        <div className="flex flex-wrap gap-1.5">
          {['Düsseldorf','Köln','Essen','Remote'].map(c => (
            <span key={c} className="px-2.5 py-1 bg-[#0a1a25] text-white text-xs font-semibold rounded-full">{c}</span>
          ))}
          <span className="px-2.5 py-1 bg-gray-100 text-gray-500 text-xs rounded-full">{t('landingAdd')}</span>
        </div>
      </div>
      <button className="w-full py-2.5 bg-[#16a34a] text-white text-sm font-bold rounded-xl mt-2 hover:bg-green-700 transition">
        {t('landingFindJobs')}
      </button>
    </div>
  );
};

// 2. Swipe / Tinder visual
const SwipeVisual = () => {
  const [swipeX, setSwipeX] = useState(0);
  const [swiped, setSwiped] = useState<'left'|'right'|null>(null);
  const [cardIdx, setCardIdx] = useState(0);
  const dragging = useRef(false);
  const startX = useRef(0);

  const getX = (e: React.MouseEvent | React.TouchEvent) =>
    'touches' in e ? e.touches[0].clientX : e.clientX;

  const handleDown = (e: React.MouseEvent | React.TouchEvent) => { dragging.current = true; startX.current = getX(e); };
  const handleMove = (e: React.MouseEvent | React.TouchEvent) => { if (!dragging.current) return; setSwipeX(getX(e) - startX.current); };
  const handleUp = () => {
    dragging.current = false;
    if (swipeX > 80) { setSwiped('right'); setTimeout(() => { setSwiped(null); setSwipeX(0); setCardIdx(i => (i + 1) % SAMPLE_JOBS.length); }, 500); }
    else if (swipeX < -80) { setSwiped('left'); setTimeout(() => { setSwiped(null); setSwipeX(0); setCardIdx(i => (i + 1) % SAMPLE_JOBS.length); }, 500); }
    else setSwipeX(0);
  };

  const job = SAMPLE_JOBS[cardIdx];
  const rot = swipeX / 15;
  const saveOpacity = Math.min(1, swipeX / 80);
  const skipOpacity = Math.min(1, -swipeX / 80);

  return (
    <div className="w-full max-w-xs mx-auto select-none" style={{ height: '300px', position: 'relative' }}>
      {/* Stack behind */}
      {[2, 1].map(o => (
        <div key={o} className="absolute inset-x-4 bg-white rounded-2xl border border-gray-200 shadow" style={{ top: o * 10, zIndex: 3 - o, height: '240px' }} />
      ))}
      {/* Top card */}
      <div
        className="absolute inset-0 bg-white rounded-2xl border border-gray-200 shadow-xl p-5 cursor-grab active:cursor-grabbing z-10"
        style={{ transform: swiped === 'right' ? 'translateX(120%) rotate(20deg)' : swiped === 'left' ? 'translateX(-120%) rotate(-20deg)' : `translateX(${swipeX}px) rotate(${rot}deg)`, transition: swiped ? 'transform 0.4s cubic-bezier(0.16,1,0.3,1)' : swipeX === 0 ? 'transform 0.3s ease' : 'none' }}
        onMouseDown={handleDown} onMouseMove={handleMove} onMouseUp={handleUp} onMouseLeave={handleUp}
        onTouchStart={handleDown} onTouchMove={handleMove} onTouchEnd={handleUp}
      >
        {/* Save/Skip badges */}
        <div className="absolute top-4 left-4 px-3 py-1.5 bg-green-500 text-white text-xs font-black rounded-full rotate-[-12deg] border-2 border-white" style={{ opacity: saveOpacity }}>SAVE ♥</div>
        <div className="absolute top-4 right-4 px-3 py-1.5 bg-red-400 text-white text-xs font-black rounded-full rotate-[12deg] border-2 border-white" style={{ opacity: skipOpacity }}>SKIP ✕</div>

        <div className={`w-12 h-12 rounded-2xl ${CARD_COLORS[cardIdx % CARD_COLORS.length]} flex items-center justify-center text-white font-black text-lg mb-3`}>{job.company[0]}</div>
        <p className="font-bold text-gray-900 text-sm leading-snug mb-1">{job.title}</p>
        <p className="text-xs text-gray-400 mb-3">{job.company} · {job.location}</p>
        {job.salary && <span className="text-xs px-2.5 py-1 bg-gray-100 text-gray-600 rounded-lg font-medium">{job.salary}</span>}
        <p className="text-[10px] text-gray-300 mt-4 text-center">← drag to skip · drag to save →</p>
      </div>
    </div>
  );
};

// 3. Save/Click animation visual
const SaveVisual = () => {
  const { t } = useLanguage();
  const [saved, setSaved] = useState<number | null>(null);
  const [ripple, setRipple] = useState<number | null>(null);

  const handleSave = (i: number) => {
    setSaved(i); setRipple(i);
    setTimeout(() => setRipple(null), 600);
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-xl p-5 w-full max-w-sm">
      <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-4">{t('landingLatestJobs')}</p>
      {SAMPLE_JOBS.slice(0, 4).map((j, i) => (
        <div key={i} className="flex items-center gap-3 py-3 border-b border-gray-50 last:border-0">
          <div className={`w-9 h-9 rounded-xl ${CARD_COLORS[i]} flex items-center justify-center text-white text-xs font-black shrink-0`}>{j.company[0]}</div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-gray-900 truncate">{j.title}</p>
            <p className="text-xs text-gray-400">{j.location}</p>
          </div>
          <button onClick={() => handleSave(i)} className="relative shrink-0 w-8 h-8 rounded-full flex items-center justify-center transition-all" style={{ background: saved === i ? '#16a34a' : '#f3f4f6' }}>
            {ripple === i && <span className="absolute inset-0 rounded-full bg-green-400 animate-ping opacity-50" />}
            <svg className="w-4 h-4 transition-all" fill={saved === i ? 'white' : 'none'} stroke={saved === i ? 'white' : '#9ca3af'} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
            </svg>
          </button>
        </div>
      ))}
      <p className="text-xs text-gray-400 text-center mt-3">{t('landingClickBookmark')}</p>
    </div>
  );
};

// 4. Hide/dismiss visual
const HideVisual = () => {
  const { t } = useLanguage();
  const [hidden, setHidden] = useState<number[]>([]);
  const [hiding, setHiding] = useState<number | null>(null);

  const handleHide = (i: number) => {
    setHiding(i);
    setTimeout(() => { setHidden(h => [...h, i]); setHiding(null); }, 400);
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-xl p-5 w-full max-w-sm">
      <div className="flex items-center justify-between mb-4">
        <p className="text-xs font-bold text-gray-400 uppercase tracking-wide">{t('jobFeedFilters')}</p>
        {hidden.length > 0 && <span className="text-xs text-gray-400">{hidden.length} {t('landingHidden')}</span>}
      </div>
      {SAMPLE_JOBS.slice(0, 4).map((j, i) => (
        <div key={i} className="flex items-center gap-3 py-2.5 border-b border-gray-50 last:border-0 overflow-hidden"
          style={{ maxHeight: hidden.includes(i) ? 0 : '60px', opacity: hidden.includes(i) ? 0 : hiding === i ? 0.3 : 1, transform: hiding === i ? 'translateX(20px)' : 'translateX(0)', transition: 'all 0.4s cubic-bezier(0.16,1,0.3,1)', marginBottom: hidden.includes(i) ? 0 : undefined }}>
          <div className={`w-9 h-9 rounded-xl ${CARD_COLORS[i]} flex items-center justify-center text-white text-xs font-black shrink-0`}>{j.company[0]}</div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-gray-900 truncate">{j.title}</p>
            <p className="text-xs text-gray-400">{j.location}</p>
          </div>
          <button onClick={() => handleHide(i)} className="shrink-0 w-7 h-7 rounded-full bg-gray-100 hover:bg-red-50 hover:text-red-400 flex items-center justify-center text-gray-400 transition-all text-xs font-bold">✕</button>
        </div>
      ))}
      {hidden.length === SAMPLE_JOBS.slice(0, 4).length && (
        <div className="text-center py-4">
          <p className="text-xs text-gray-400 mb-2">{t('landingAllHidden')}</p>
          <button onClick={() => setHidden([])} className="text-xs text-[#16a34a] font-semibold">{t('landingRestoreAll')}</button>
        </div>
      )}
    </div>
  );
};

// 5. Kanban drag visual
const KanbanVisual = () => {
  const { t } = useLanguage();
  const [active, setActive] = useState(0);
  const cols = [
    { label: t('saved'), color: 'bg-blue-100 text-blue-700', dot: 'bg-blue-400' },
    { label: t('applied'), color: 'bg-violet-100 text-violet-700', dot: 'bg-violet-400' },
    { label: t('interviewing'), color: 'bg-orange-100 text-orange-700', dot: 'bg-orange-400' },
    { label: t('offered'), color: 'bg-green-100 text-green-700', dot: 'bg-green-400' },
  ];

  useEffect(() => {
    const t = setInterval(() => setActive(a => (a + 1) % cols.length), 2000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-xl p-5 w-full max-w-sm">
      <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-4">{t('landingPipeline')}</p>
      <div className="relative mb-4">
        <div className="flex gap-2 mb-3">
          {cols.map((c, i) => (
            <div key={i} className={`flex-1 h-1.5 rounded-full transition-all duration-500 ${i <= active ? c.dot : 'bg-gray-100'}`} />
          ))}
        </div>
        <div className={`flex items-center gap-2 px-3 py-2 rounded-xl border-2 transition-all duration-500 ${cols[active].color} border-current`}>
          <div className={`w-2 h-2 rounded-full ${cols[active].dot}`} />
          <span className="text-xs font-bold">{cols[active].label}</span>
          <span className="ml-auto text-xs font-bold opacity-60">GreenConsult</span>
        </div>
        <div className="text-xs text-gray-400 text-center mt-2">↑ {t('landingAutoStages')}</div>
      </div>
      {cols.map((c, i) => (
        <div key={i} className={`flex items-center gap-2 px-3 py-2 rounded-xl mb-1.5 transition-all duration-300 ${i === active ? `${c.color} shadow-sm` : 'bg-gray-50'}`}>
          <div className={`w-1.5 h-1.5 rounded-full transition-all ${i === active ? c.dot : 'bg-gray-300'}`} />
          <span className={`text-xs font-semibold transition-all ${i === active ? '' : 'text-gray-400'}`}>{c.label}</span>
          <span className={`ml-auto text-xs font-bold transition-all ${i === active ? '' : 'text-gray-300'}`}>{[12, 7, 3, 1][i]}</span>
        </div>
      ))}
    </div>
  );
};

const USE_CASES = [
  { tagKey: 'landingUcSetupTag', headlineKey: 'landingUcSetupHead', bodyKey: 'landingUcSetupBody', Visual: TypingVisual },
  { tagKey: 'landingUcSwipeTag', headlineKey: 'landingUcSwipeHead', bodyKey: 'landingUcSwipeBody', Visual: SwipeVisual },
  { tagKey: 'landingUcSaveTag', headlineKey: 'landingUcSaveHead', bodyKey: 'landingUcSaveBody', Visual: SaveVisual },
  { tagKey: 'landingUcHideTag', headlineKey: 'landingUcHideHead', bodyKey: 'landingUcHideBody', Visual: HideVisual },
  { tagKey: 'landingUcTrackTag', headlineKey: 'landingUcTrackHead', bodyKey: 'landingUcTrackBody', Visual: KanbanVisual },
];

// Wrapper so useInView is called at component level (not inside .map)
const UseCaseRow = ({ uc, i }: { uc: { tag: string; headline: string; body: string; Visual: React.ComponentType }; i: number }) => {
  const { ref, inView } = useInView(0.2);
  const isEven = i % 2 === 0;
  return (
    <div ref={ref} className={`py-16 md:py-24 px-6 border-b border-gray-100 ${isEven ? 'bg-white' : 'bg-[#f4f6fa]'}`}>
      <div className="max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-10 md:gap-12 items-center">
        <div className={isEven ? 'order-1' : 'order-1 md:order-2'} style={{ opacity: inView ? 1 : 0, transform: inView ? 'translateX(0)' : isEven ? 'translateX(-32px)' : 'translateX(32px)', transition: 'all 0.8s cubic-bezier(0.16,1,0.3,1)' }}>
          <span className="text-xs font-bold text-[#16a34a] uppercase tracking-widest">{uc.tag}</span>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-black text-[#0a1a25] leading-tight mt-3 mb-5">{uc.headline}</h2>
          <p className="text-gray-500 text-base md:text-lg leading-relaxed">{uc.body}</p>
          <Link to="/register" className="inline-flex items-center gap-2 mt-8 text-[#0a1a25] font-semibold text-sm hover:gap-3 transition-all">
            {useLanguage.getState().t('landingTryFree')} <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>
          </Link>
        </div>
        <div className={`flex justify-center ${isEven ? 'order-2' : 'order-2 md:order-1'}`} style={{ opacity: inView ? 1 : 0, transform: inView ? 'translateY(0) scale(1)' : 'translateY(24px) scale(0.96)', transition: 'all 0.8s cubic-bezier(0.16,1,0.3,1) 120ms' }}>
          <uc.Visual />
        </div>
      </div>
    </div>
  );
};

export const LandingPage = () => {
  const isAuthenticated = useAuthStore(s => s.isAuthenticated);
  const { t } = useLanguage();
  const [selectedJob, setSelectedJob] = useState<PublicJob | null>(null);
  const [jobs, setJobs] = useState<PublicJob[]>([]);
  const useCases = USE_CASES.map((uc) => ({
    tag: t(uc.tagKey),
    headline: t(uc.headlineKey),
    body: t(uc.bodyKey),
    Visual: uc.Visual,
  }));

  const heroRef = useInView(0.1);
  const statsRef = useInView(0.3);
  const ctaRef = useInView(0.3);

  useEffect(() => {
    getPublicJobs()
      .then((data: PublicJob[]) => {
        const src = data.length > 0 ? data : SAMPLE_JOBS;
        setJobs(src.map((j, i) => ({ ...j, color: CARD_COLORS[i % CARD_COLORS.length] })));
      })
      .catch(() => setJobs(SAMPLE_JOBS.map((j, i) => ({ ...j, color: CARD_COLORS[i % CARD_COLORS.length] }))));
  }, []);

  return (
    <div className="min-h-screen bg-white flex flex-col" style={{ fontFamily: "'Figtree', system-ui, sans-serif" }}>
      <style>{`
        /* Figtree is preloaded in index.html to avoid a per-render @import. */
        @keyframes fadeUp{from{opacity:0;transform:translateY(32px)}to{opacity:1;transform:translateY(0)}}
        @keyframes shimmer{0%,100%{background-position:0% center}50%{background-position:100% center}}
        @keyframes scaleIn{from{opacity:0;transform:scale(0.94)}to{opacity:1;transform:scale(1)}}
        @keyframes marquee{from{transform:translateX(0)}to{transform:translateX(-50%)}}
        .fade-up{animation:fadeUp 0.9s cubic-bezier(0.16,1,0.3,1) both}
        .scale-in{animation:scaleIn 1s cubic-bezier(0.16,1,0.3,1) both}
        .shimmer-text{background:linear-gradient(90deg,#16a34a,#059669,#0d9488,#16a34a);background-size:300% auto;background-clip:text;-webkit-background-clip:text;-webkit-text-fill-color:transparent;animation:shimmer 4s ease infinite}
        .scrollbar-hide::-webkit-scrollbar{display:none}
        .scrollbar-hide{-ms-overflow-style:none;scrollbar-width:none}
        .nav-pill{background:rgba(255,255,255,0.85);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);border:1px solid rgba(0,0,0,0.08);border-radius:9999px;box-shadow:0 2px 16px rgba(0,0,0,0.06)}
      `}</style>

      {/* ── Announcement bar + Nav (sticky together) ── */}
      <div className="sticky top-0 z-50">
      <div className="relative bg-[#0a1a25] text-white text-xs font-semibold py-2.5 px-4 text-center flex items-center justify-center gap-3">
        <span className="hidden sm:flex items-center gap-1.5">
          <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 fill-green-400"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z"/></svg>
          {t('landingExtensionBar')}
        </span>
        <span className="sm:hidden">{t('landingExtensionBarMobile')}</span>
        <span className="text-white/30">·</span>
        <a href="#extension" className="underline underline-offset-2 text-green-400 hover:text-green-300 transition">{t('landingInstallFree')}</a>
        <div className="absolute right-3 top-1/2 hidden -translate-y-1/2 lg:block">
          <LanguageToggle />
        </div>
      </div>

      {/* ── Nav (OVO pill style) ── */}
      <div className="flex justify-center px-4 py-3 bg-white/80 backdrop-blur-xl">
        <nav className="nav-pill w-full max-w-5xl px-4 h-14 flex items-center justify-between">
          <img src="/logo.png" alt="afavers" className="h-16 w-auto"
            onError={e => { const t = e.target as HTMLImageElement; t.style.display = 'none'; (t.parentElement as HTMLElement).insertAdjacentHTML('afterbegin', '<span style="font-size:1.2rem;font-weight:900;color:#0a1a25;letter-spacing:-0.5px">afavers</span>'); }} />
          <div className="hidden md:flex items-center gap-1">
            {[[t('landingFeatures'),'#use-cases'],[t('landingExtension'),'#extension'],[t('landingLiveJobs'),'#jobs']].map(([label, href]) => (
              <a key={label} href={href} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-900 hover:bg-gray-100/70 rounded-full transition font-medium">{label}</a>
            ))}
          </div>
          <div className="flex items-center gap-2">
            {isAuthenticated ? (
              <Link to="/dashboard" className="px-5 py-2 bg-[#0a1a25] hover:bg-gray-800 text-white text-sm font-semibold rounded-full transition">{t('landingDashboardCta')}</Link>
            ) : (
              <>
                <Link to="/login" className="hidden sm:inline px-4 py-2 text-sm font-medium text-gray-500 hover:text-gray-900 transition rounded-full">{t('landingLogin')}</Link>
                <Link to="/register" className="px-5 py-2 bg-[#16a34a] hover:bg-green-700 text-white text-sm font-bold rounded-full transition shadow-sm">{t('landingGetStarted')}</Link>
              </>
            )}
          </div>
        </nav>
      </div>
      </div>{/* end sticky wrapper */}

      {/* ── Hero ── */}
      <section className="relative min-h-[88vh] flex flex-col items-center justify-center text-center px-6 overflow-hidden">
        {/* Gradient background like OVO */}
        <div className="absolute inset-0 pointer-events-none" style={{ background: 'linear-gradient(160deg, #f0fdf4 0%, #ffffff 35%, #f0f9ff 65%, #f5f3ff 100%)' }} />
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-green-200/30 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute top-10 right-1/4 w-80 h-80 bg-emerald-100/40 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-1/2 w-[600px] h-64 bg-green-50/60 rounded-full blur-3xl -translate-x-1/2 pointer-events-none" />

        <div ref={heroRef.ref} className="relative max-w-5xl mx-auto">
          <div className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white border border-green-200 text-green-700 text-xs font-semibold mb-8 shadow-sm ${heroRef.inView ? 'fade-up' : 'opacity-0'}`}>
            <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
            {t('landingBadge')}
          </div>

          <h1 className={`text-4xl sm:text-6xl lg:text-8xl font-black text-[#0a1a25] leading-[0.95] tracking-tight mb-6 ${heroRef.inView ? 'fade-up' : 'opacity-0'}`} style={{ animationDelay: '80ms' }}>
            {t('landingHeadlineTop')}<br /><span className="shimmer-text">{t('landingHeadlineAccent')}</span>
          </h1>

          <p className={`text-gray-500 text-base sm:text-xl leading-relaxed max-w-2xl mx-auto mb-10 ${heroRef.inView ? 'fade-up' : 'opacity-0'}`} style={{ animationDelay: '160ms' }}>
            {t('landingSubtitle')}
          </p>

          <div className={`flex flex-col sm:flex-row gap-3 justify-center mb-10 ${heroRef.inView ? 'fade-up' : 'opacity-0'}`} style={{ animationDelay: '240ms' }}>
            <Link to="/register" className="inline-flex items-center justify-center gap-2 px-8 py-4 bg-[#0a1a25] hover:bg-gray-800 text-white font-bold rounded-2xl text-base transition-all hover:shadow-2xl hover:-translate-y-0.5">
              {t('landingStartFree')} <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>
            </Link>
            <Link to="/demo" className="inline-flex items-center justify-center px-8 py-4 bg-white/80 border border-gray-200 hover:bg-white text-gray-700 font-semibold rounded-2xl text-base transition shadow-sm">
              {t('landingBrowseLive')}
            </Link>
          </div>

          <div className={`flex flex-wrap items-center justify-center gap-2 sm:gap-3 text-sm text-gray-400 mb-12 md:mb-16 ${heroRef.inView ? 'fade-up' : 'opacity-0'}`} style={{ animationDelay: '320ms' }}>
            <div className="flex -space-x-2">
              {['#16a34a','#3b82f6','#8b5cf6','#f59e0b','#ef4444'].map((c, i) => (
                <div key={i} className="w-7 h-7 sm:w-8 sm:h-8 rounded-full border-2 border-white flex items-center justify-center text-[10px] font-black text-white" style={{ background: c }}>{['M','A','J','T','S'][i]}</div>
              ))}
            </div>
            <span className="text-xs sm:text-sm">{t('landingTrust')}</span>
            <span className="hidden sm:inline text-gray-200">·</span>
            <span className="text-[#16a34a] font-semibold text-xs sm:text-sm">{t('landingFreeForever')}</span>
          </div>
        </div>

        {/* Dashboard mockup */}
        <div className={`relative w-full max-w-4xl mx-auto hidden sm:block ${heroRef.inView ? 'scale-in' : 'opacity-0'}`} style={{ animationDelay: '400ms' }}>
          <div className="rounded-2xl border border-gray-200/80 overflow-hidden" style={{ boxShadow: '0 40px 80px -20px rgba(0,0,0,0.15), 0 0 0 1px rgba(0,0,0,0.04)' }}>
            <div className="bg-[#f8f9fa] border-b border-gray-200 px-4 py-3 flex items-center gap-3">
              <div className="flex gap-1.5"><div className="w-3 h-3 rounded-full bg-red-400" /><div className="w-3 h-3 rounded-full bg-amber-400" /><div className="w-3 h-3 rounded-full bg-green-400" /></div>
              <div className="flex-1 bg-white rounded-lg px-3 py-1.5 text-xs text-gray-400 text-center border border-gray-200">afavers.online/dashboard</div>
            </div>
            <div className="bg-[#f4f6fa] p-5 grid grid-cols-4 gap-3">
              {[{ label:t('totalJobs'),value:'2,418',c:'text-[#16a34a]'},{label:t('saved'),value:'12',c:'text-blue-600'},{label:t('applied'),value:'7',c:'text-violet-600'},{label:t('interviewing'),value:'2',c:'text-orange-500'}].map(s => (
                <div key={s.label} className="bg-white rounded-xl border border-gray-200 p-4"><p className="text-xs text-gray-500 mb-1">{s.label}</p><p className={`text-2xl font-black ${s.c}`}>{s.value}</p></div>
              ))}
              <div className="col-span-3 bg-white rounded-xl border border-gray-200 p-4">
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">{t('landingLatestJobs')}</p>
                {SAMPLE_JOBS.slice(0,3).map((j,i)=>(
                  <div key={i} className="flex items-center gap-3 py-2 border-b border-gray-50 last:border-0">
                    <div className={`w-8 h-8 rounded-lg ${CARD_COLORS[i]} flex items-center justify-center text-white text-xs font-black shrink-0`}>{j.company[0]}</div>
                    <div className="flex-1 min-w-0"><p className="text-xs font-semibold text-gray-900 truncate">{j.title}</p><p className="text-xs text-gray-400">{j.company}</p></div>
                    <span className="shrink-0 px-2 py-0.5 bg-green-50 text-green-700 text-[10px] font-semibold rounded-full border border-green-100">{t('landingNew')}</span>
                  </div>
                ))}
              </div>
              <div className="bg-white rounded-xl border border-gray-200 p-4">
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">{t('landingPipeline')}</p>
                {[[t('saved'),'bg-blue-100 text-blue-700','12'],[t('applied'),'bg-violet-100 text-violet-700','7'],[t('interviewing'),'bg-orange-100 text-orange-700','2']].map(([l,c,n])=>(
                  <div key={l} className="flex items-center justify-between mb-2"><span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${c}`}>{l}</span><span className="text-xs font-black text-gray-700">{n}</span></div>
                ))}
              </div>
            </div>
          </div>
          <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-white to-transparent pointer-events-none" />
        </div>
      </section>

      {/* ── Stats ── */}
      <section className="py-16 sm:py-20 bg-white border-y border-gray-100">
        <div ref={statsRef.ref} className="max-w-4xl mx-auto px-6 grid grid-cols-1 sm:grid-cols-3 gap-8 text-center">
          {[{num:'2,400+',label:t('landingStatsJobs'),sub:t('landingStatsJobsSub')},{num:'50+',label:t('landingStatsCities'),sub:t('landingStatsCitiesSub')},{num:'< 60s',label:t('landingStatsSetup'),sub:t('landingStatsSetupSub')}].map((s,i)=>(
            <div key={s.label} style={{opacity:statsRef.inView?1:0,transform:statsRef.inView?'translateY(0)':'translateY(24px)',transition:`all 0.7s cubic-bezier(0.16,1,0.3,1) ${i*100}ms`}}>
              <div className="text-5xl sm:text-6xl font-black text-[#0a1a25] mb-2">{s.num}</div>
              <div className="text-sm font-semibold text-gray-700">{s.label}</div>
              <div className="text-xs text-gray-400 mt-1">{s.sub}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Use cases ── */}
      <section id="use-cases" className="bg-white">
        {useCases.map((uc, i) => <UseCaseRow key={i} uc={uc} i={i} />)}
      </section>

      {/* ── Live Jobs ── */}
      <section id="jobs" className="py-16 sm:py-24 bg-[#f4f6fa] border-y border-gray-100">
        <div className="max-w-6xl mx-auto px-6 mb-8 sm:mb-10 flex items-end justify-between">
          <div>
            <p className="text-[#16a34a] text-xs font-bold uppercase tracking-widest mb-2">{t('landingLiveNow')}</p>
            <h2 className="text-2xl sm:text-4xl font-black text-[#0a1a25]">{t('landingJobsToday')}</h2>
            <p className="text-gray-400 text-sm mt-1">{jobs.length > 0 ? `${jobs.length} ${t('landingListings')}` : t('landingLoading')}</p>
          </div>
          <Link to={isAuthenticated ? '/jobs' : '/demo'} className="text-sm font-semibold text-[#0a1a25] hover:text-gray-600 transition flex items-center gap-1 shrink-0">
            {t('landingSeeAll')} <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>
          </Link>
        </div>
        <div className="flex gap-4 overflow-x-auto px-6 pb-4 scrollbar-hide snap-x snap-mandatory">
          {jobs.map((job, i) => (
            <button key={job.id ?? i} onClick={() => setSelectedJob(job)}
              className="snap-start shrink-0 bg-white border border-gray-200 hover:border-gray-300 rounded-2xl p-5 flex flex-col text-left group transition-all duration-300 hover:shadow-xl hover:-translate-y-1"
              style={{ width: '272px' }}>
              <div className="flex items-start justify-between mb-4">
                <div className={`w-11 h-11 rounded-xl ${job.color} flex items-center justify-center text-white font-black text-base shrink-0`}>{job.company[0].toUpperCase()}</div>
                <svg className="w-4 h-4 text-gray-200 group-hover:text-gray-400 transition mt-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
              </div>
              <p className="text-gray-900 font-bold text-sm leading-snug mb-1 group-hover:text-[#16a34a] transition line-clamp-2">{job.title}</p>
              <p className="text-gray-400 text-xs mb-4">{job.company} · {job.location}</p>
              <div className="mt-auto">
                {job.salary ? <span className="inline-block px-2.5 py-1 bg-gray-100 text-gray-600 text-xs font-medium rounded-lg">{job.salary}</span>
                  : <span className="inline-block px-2.5 py-1 bg-green-50 text-green-700 text-xs font-semibold rounded-lg border border-green-100">{t('viewFullListing')}</span>}
              </div>
            </button>
          ))}
          <div className="snap-start shrink-0 w-64 border-2 border-dashed border-gray-300 hover:border-gray-400 rounded-2xl p-5 flex flex-col items-center justify-center text-center gap-4 transition-colors">
            <div className="w-11 h-11 rounded-xl bg-gray-100 flex items-center justify-center">
              <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
            </div>
            <div><p className="text-gray-900 font-bold text-sm mb-1">{t('landingSeeAllJobs')}</p><p className="text-gray-400 text-xs">{t('landingTrackApply')}</p></div>
            <Link to="/register" className="w-full text-center px-4 py-2.5 bg-[#0a1a25] hover:bg-gray-800 text-white text-sm font-bold rounded-xl transition">{t('landingSignupFree')}</Link>
          </div>
        </div>
      </section>

      {/* ── Browser Extension ── */}
      <section id="extension" className="py-16 sm:py-24 px-6 bg-white border-y border-gray-100">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12 sm:mb-16">
            <p className="text-[#16a34a] text-xs font-bold uppercase tracking-widest mb-3">{t('landingExtension')}</p>
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-black text-[#0a1a25] mb-4">{t('landingExtensionTitle')}</h2>
            <p className="text-gray-500 text-base sm:text-lg max-w-xl mx-auto">{t('landingExtensionBody')}</p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4 mt-8">
              <a href="/afavers-chrome-extension.zip" download="afavers-chrome-extension.zip"
                className="w-full sm:w-auto inline-flex items-center justify-center gap-3 px-6 py-3 bg-[#0a1a25] hover:bg-gray-800 text-white font-semibold rounded-2xl transition hover:shadow-lg hover:-translate-y-0.5">
                <svg viewBox="0 0 24 24" className="w-5 h-5 fill-white"><path d="M12 0C8.21 0 4.831 1.757 2.632 4.501l3.953 6.848A5.454 5.454 0 0 1 12 6.545h10.691A12 12 0 0 0 12 0zM1.931 5.47A11.943 11.943 0 0 0 0 12c0 6.012 4.42 10.991 10.189 11.864l3.953-6.847a5.45 5.45 0 0 1-6.865-2.29zm13.342 2.166a5.446 5.446 0 0 1 1.45 7.09l.002.001h-.002l-5.344 9.257c.206.01.413.016.621.016 6.627 0 12-5.373 12-12 0-1.54-.29-3.011-.818-4.364zM12 10.545a1.455 1.455 0 1 0 0 2.91 1.455 1.455 0 0 0 0-2.91z"/></svg>
                {t('landingDownloadChrome')}
              </a>
              <a href="https://addons.mozilla.org/firefox/addon/afavers-job-capture/" target="_blank" rel="noopener noreferrer"
                className="w-full sm:w-auto inline-flex items-center justify-center gap-3 px-6 py-3 bg-white border border-gray-200 hover:border-gray-300 hover:bg-gray-50 text-gray-700 font-semibold rounded-2xl transition">
                <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none"><path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2z" fill="#FF6611"/><path d="M12 4.5c-1.8 0-3.45.63-4.75 1.67.48-.1.98-.17 1.5-.17 3.59 0 6.5 2.91 6.5 6.5 0 1.2-.33 2.33-.9 3.3A7.5 7.5 0 0 0 12 4.5z" fill="white" opacity="0.6"/></svg>
                {t('landingAddFirefox')}
              </a>
            </div>
          </div>

          {/* How to use steps */}
          <div className="grid sm:grid-cols-3 gap-6">
            {[
              {
                step: '01',
                icon: (
                  <svg className="w-6 h-6 text-[#16a34a]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                ),
                title: t('landingStepInstall'),
                desc: t('landingStepInstallDesc'),
              },
              {
                step: '02',
                icon: (
                  <svg className="w-6 h-6 text-[#16a34a]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                ),
                title: t('landingStepBrowse'),
                desc: t('landingStepBrowseDesc'),
              },
              {
                step: '03',
                icon: (
                  <svg className="w-6 h-6 text-[#16a34a]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" /></svg>
                ),
                title: t('landingStepSave'),
                desc: t('landingStepSaveDesc'),
              },
            ].map((s, i) => (
              <div key={i} className="relative bg-[#f4f6fa] rounded-2xl p-7 border border-gray-100 hover:border-green-200 hover:shadow-md transition-all">
                <div className="text-5xl font-black text-gray-200 leading-none mb-4 select-none">{s.step}</div>
                <div className="w-11 h-11 bg-white rounded-xl border border-gray-200 flex items-center justify-center mb-4 shadow-sm">
                  {s.icon}
                </div>
                <h3 className="font-bold text-[#0a1a25] text-base mb-2">{s.title}</h3>
                <p className="text-gray-500 text-sm leading-relaxed">{s.desc}</p>
              </div>
            ))}
          </div>

          {/* Extension mockup */}
          <div className="mt-12 flex justify-center">
            <div className="bg-white rounded-2xl border border-gray-200 shadow-xl p-5 w-72">
              <div className="flex items-center gap-2 mb-4 pb-3 border-b border-gray-100">
                <div className="w-6 h-6 rounded bg-[#16a34a] flex items-center justify-center">
                  <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" /></svg>
                </div>
                <span className="text-sm font-bold text-[#0a1a25]">afavers</span>
                <span className="ml-auto text-[10px] font-bold text-green-600 bg-green-50 px-2 py-0.5 rounded-full border border-green-100">● {t('landingConnected')}</span>
              </div>
              <p className="text-xs text-gray-500 mb-1 font-medium">{t('landingDetected')}</p>
              <p className="text-sm font-bold text-[#0a1a25] mb-0.5 truncate">Sustainability Manager (m/w/d)</p>
              <p className="text-xs text-gray-400 mb-4">GreenConsult GmbH · LinkedIn</p>
              <button className="w-full py-2.5 bg-[#16a34a] hover:bg-green-700 text-white text-sm font-bold rounded-xl transition flex items-center justify-center gap-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" /></svg>
                {t('landingSaveToAfavers')}
              </button>
              <p className="text-[10px] text-gray-400 text-center mt-2">{t('landingSync')}</p>
            </div>
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="py-20 sm:py-32 px-6 bg-white">
        <div ref={ctaRef.ref} className="max-w-3xl mx-auto text-center" style={{ opacity: ctaRef.inView ? 1 : 0, transform: ctaRef.inView ? 'translateY(0)' : 'translateY(32px)', transition: 'all 0.8s cubic-bezier(0.16,1,0.3,1)' }}>
          <h2 className="text-4xl sm:text-5xl md:text-7xl font-black text-[#0a1a25] leading-tight mb-6">
            {t('landingFinalTop')}<br /><span className="shimmer-text">{t('landingFinalAccent')}</span>
          </h2>
          <p className="text-gray-500 text-base sm:text-xl mb-10 sm:mb-12">{t('landingFinalSub')}</p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link to="/register" className="px-10 py-4 bg-[#0a1a25] hover:bg-gray-800 text-white font-bold rounded-2xl text-base transition-all hover:shadow-2xl hover:-translate-y-0.5">{t('landingStartFree')} →</Link>
            <Link to="/login" className="px-10 py-4 border border-gray-200 hover:border-gray-300 hover:bg-gray-50 text-gray-700 font-semibold rounded-2xl text-base transition">{t('landingAlreadyAccount')}</Link>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="bg-white border-t border-gray-100 py-10 px-6">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row justify-between items-center gap-5">
          <img src="/logo.png" alt="afavers" className="h-16 w-auto"
            onError={e => { const t = e.target as HTMLImageElement; t.style.display = 'none'; (t.parentElement as HTMLElement).insertAdjacentHTML('afterbegin', '<span style="font-size:1.1rem;font-weight:900;color:#0a1a25">afavers</span>'); }} />
          <p className="text-gray-400 text-sm">© {new Date().getFullYear()} afavers · {t('landingFooter')}</p>
          <div className="flex gap-6 text-sm font-medium text-gray-400">
            {!isAuthenticated && <Link to="/login" className="hover:text-gray-900 transition">{t('landingLogin')}</Link>}
            {!isAuthenticated && <Link to="/register" className="hover:text-gray-900 transition">{t('createAccount')}</Link>}
            <Link to="/disclaimer" className="hover:text-gray-900 transition">{t('landingPrivacy')}</Link>
          </div>
        </div>
      </footer>

      {/* ── Job modal ── */}
      {selectedJob && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={() => setSelectedJob(null)}>
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg p-8 relative" onClick={e => e.stopPropagation()}>
            <button onClick={() => setSelectedJob(null)} className="absolute top-5 right-5 w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-500 transition">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
            <div className="flex items-center gap-4 mb-6">
              <div className={`w-14 h-14 rounded-2xl ${selectedJob.color} flex items-center justify-center text-white font-black text-xl shrink-0`}>{selectedJob.company[0].toUpperCase()}</div>
              <div><p className="font-bold text-gray-900">{selectedJob.company}</p><p className="text-gray-500 text-sm">{selectedJob.location}</p></div>
            </div>
            <h2 className="text-xl font-black text-gray-900 mb-4 leading-snug">{selectedJob.title}</h2>
            {selectedJob.salary && <span className="inline-block px-3 py-1.5 bg-gray-100 text-gray-700 text-sm font-semibold rounded-xl mb-6">{selectedJob.salary}</span>}
            <a href={selectedJob.url} target="_blank" rel="noopener noreferrer" className="block w-full text-center py-3.5 bg-[#0a1a25] hover:bg-gray-800 text-white font-bold text-sm rounded-2xl mb-3 transition">{t('landingGoPosting')}</a>
            <Link to="/register" className="block w-full text-center py-3 border border-gray-200 hover:border-gray-400 text-gray-600 font-semibold text-sm rounded-2xl transition">{t('landingTrackApplication')}</Link>
            <p className="text-center text-xs text-gray-400 mt-3">{t('landingNoCard')}</p>
          </div>
        </div>
      )}
    </div>
  );
};
