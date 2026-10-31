import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { JobResultContent } from '../components/jobs/JobResultContent';
import { Icon } from '../components/ui';
import { getPublicJobs } from '../services/publicJobs.service';
const CARD_COLORS = ['bg-ink', 'bg-ink', 'bg-ink', 'bg-ink', 'bg-ink', 'bg-ink', 'bg-ink', 'bg-lime-600', 'bg-ink', 'bg-ink'];
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
const SAMPLE_JOBS: PublicJob[] = [{
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
}, {
  id: -6,
  title: 'Referent Nachhaltigkeit / CSR',
  company: 'NatureTech AG',
  location: 'Düsseldorf',
  url: '#',
  salary: null,
  source: 'sample',
  posted_date: null
}, {
  id: -7,
  title: 'Analyst Renewable Energy Markets',
  company: 'WindPower Consult',
  location: 'Köln',
  url: '#',
  salary: '48.000 – 62.000 €',
  source: 'sample',
  posted_date: null
}, {
  id: -8,
  title: 'Umweltschutzbeauftragter (m/w/d)',
  company: 'GreenFactory GmbH',
  location: 'Essen',
  url: '#',
  salary: null,
  source: 'sample',
  posted_date: null
}];
export const DemoJobsPage = () => {
  const [jobs, setJobs] = useState<PublicJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  useEffect(() => {
    getPublicJobs().then((data: PublicJob[]) => {
      const source = data.length > 0 ? data : SAMPLE_JOBS;
      setJobs(source.map((j, i) => ({
        ...j,
        color: CARD_COLORS[i % CARD_COLORS.length]
      })));
    }).catch(() => setJobs(SAMPLE_JOBS.map((j, i) => ({
      ...j,
      color: CARD_COLORS[i % CARD_COLORS.length]
    })))).finally(() => setLoading(false));
  }, []);
  const filtered = jobs.filter(j => !search.trim() || j.title.toLowerCase().includes(search.toLowerCase()) || j.company.toLowerCase().includes(search.toLowerCase()) || j.location.toLowerCase().includes(search.toLowerCase()));
  return <>
    <Helmet>
      <title>Live Job Demo – afavers | Green Jobs in Germany</title>
      <meta name="description" content="Browse real green and sustainability jobs in Germany fetched live from Bundesagentur für Arbeit. No login required. See how afavers tracks your applications." />
      <link rel="canonical" href="https://afavers.saintcreators.com/demo" />
      <meta property="og:title" content="Live Job Demo – afavers" />
      <meta property="og:description" content="Browse real green jobs in Germany fetched live from Bundesagentur für Arbeit. No login required." />
      <meta property="og:url" content="https://afavers.saintcreators.com/demo" />
    </Helmet>
    <div className="min-h-screen bg-canvas flex flex-col" style={{
      fontFamily: 'var(--font-ui)'
    }}>

      {/* ── Sign-up banner ── */}
      <div className="bg-ink text-on-ink py-3 px-6 text-center text-sm font-medium flex flex-col sm:flex-row items-center justify-center gap-3">
        <span>You're browsing in demo mode — sign up to track, save and apply to jobs.</span>
        <Link to="/register" className="shrink-0 px-4 py-1.5 bg-surface text-accent font-semibold rounded-md text-xs hover:bg-subtle transition">
          Create free account →
        </Link>
      </div>

      {/* ── Nav ── */}
      <nav className="sticky top-0 z-40 bg-surface border-b border-line shadow-none">
        <div className="max-w-7xl mx-auto px-4 sm:px-8 h-20 flex items-center justify-between">
          <Link to="/">
            <img src="/logo.png" alt="afavers" className="h-14 w-auto" onError={e => {
              (e.target as HTMLImageElement).style.display = 'none';
            }} />
          </Link>
          <div className="flex items-center gap-3">
            <Link to="/login" className="px-4 py-2 text-sm font-semibold text-muted hover:text-ink transition">
              Log in
            </Link>
            <Link to="/register" className="px-5 py-2 bg-ink hover:bg-ink text-on-ink text-sm font-semibold rounded-md transition">
              Sign up free
            </Link>
          </div>
        </div>
      </nav>

      {/* ── Search header ── */}
      <div className="bg-surface border-b border-line py-4 px-4 sm:px-6">
        <div className="max-w-4xl mx-auto"><h1 className="text-2xl mb-4">Browse jobs</h1>
          <div className="flex items-center bg-surface border-2 border-line focus-within:border-line rounded-lg shadow-none transition overflow-hidden h-14">
            <span className="pl-5 text-muted shrink-0">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </span>
            <input type="text" aria-label="Search jobs, companies, cities" placeholder="Search jobs, companies, cities…" value={search} onChange={e => setSearch(e.target.value)} className="flex-1 px-4 text-ink placeholder-gray-400 bg-transparent outline-none text-base" autoFocus={false} />
            {search && <button aria-label="Clear search" onClick={() => setSearch('')} className="pr-4 text-muted hover:text-muted">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>}
          </div>
        </div>
      </div>

      {/* ── Jobs list ── */}
      <div className="flex-1 max-w-4xl mx-auto w-full px-4 sm:px-6 py-6">
        <p className="text-sm text-muted font-medium mb-6">
          {loading ? 'Loading jobs…' : `${filtered.length} jobs found · `}
          {!loading && <span className="text-muted">{jobs.every(job=>job.source==='sample')?'Illustrative sample vacancies · not live listings':'Public vacancies'}</span>}
        </p>

        {loading ? <div className="space-y-4">
            {[...Array(5)].map((_, i) => <div key={i} className="bg-surface rounded-lg p-6 border border-line ">
                <div className="flex gap-4">
                  <div className="w-14 h-14 bg-line rounded-lg shrink-0" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 bg-line rounded w-2/3" />
                    <div className="h-3 bg-subtle rounded w-1/3" />
                    <div className="h-3 bg-subtle rounded w-1/4" />
                  </div>
                </div>
              </div>)}
          </div> : filtered.length === 0 ? <div className="text-center py-20 text-muted">
            <p className="text-lg font-semibold mb-2">No jobs match your search</p>
            <p className="text-sm">Try a different keyword or city</p>
          </div> : <div className="public-job-list">
            {filtered.map((job, i) => <a key={job.id ?? i} href={/^https?:\/\//i.test(job.url)?job.url:'/register'} target="_blank" rel="noopener noreferrer" className="public-job-row">
              <JobResultContent job={job} /><Icon name="external" />
            </a>)}
          </div>}

        {/* CTA at bottom */}
        {!loading && filtered.length > 0 && <div className="mt-10 bg-subtle border border-line rounded-lg p-8 text-center">
            <p className="text-lg font-semibold text-ink mb-2">Want to track your applications?</p>
            <p className="text-muted text-sm mb-5">Sign up free to save jobs, track every application, and get reminders.</p>
            <Link to="/register" className="inline-block px-8 py-3 bg-ink hover:bg-ink text-on-ink font-semibold rounded-lg transition shadow-none">
              Create free account →
            </Link>
          </div>}
      </div>
    </div>
    </>;
};
