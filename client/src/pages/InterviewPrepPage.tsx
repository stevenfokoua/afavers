import { ModalSurface } from "../components/ui";
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '../store/languageStore';
interface Video {
  id: string;
  title: string;
  channel: string;
  category: 'germany' | 'german';
}
const VIDEOS: Video[] = [
// Germany — English videos about German work culture & interviews
{
  id: 'GlPdGVhGNCE',
  title: 'How to Prepare for a Job Interview in Germany',
  channel: 'HalloGermany',
  category: 'germany'
}, {
  id: 'dJTztoXp7KM',
  title: '10 Interview Tips in Germany to Get the Job 🇩🇪',
  channel: 'YouTube',
  category: 'germany'
}, {
  id: 'mNnqFp4Ufa4',
  title: 'Avoid These 8 Interview Mistakes in Germany 🇩🇪',
  channel: 'YouTube',
  category: 'germany'
}, {
  id: '4C_cfg3Iemg',
  title: 'Job Interview Questions in Germany',
  channel: 'YouTube',
  category: 'germany'
}, {
  id: 'A006dXZ-5Tg',
  title: 'How to Negotiate a Salary Offer in Germany',
  channel: 'HalloGermany',
  category: 'germany'
}, {
  id: 'tYFz_Etplnc',
  title: 'Job Offer in Germany: 5 Things to Negotiate Besides Salary',
  channel: 'HalloGermany',
  category: 'germany'
},
// Auf Deutsch — German-language interview prep
{
  id: '8OOvvJ0hd3M',
  title: 'Das Vorstellungsgespräch (Beispiel-Dialog in voller Länge)',
  channel: 'StepUp! Coaching',
  category: 'german'
}, {
  id: '__Uh1kUKKW4',
  title: 'Das Vorstellungsgespräch für Berufseinsteiger',
  channel: 'StepUp! Coaching',
  category: 'german'
}, {
  id: 'tivaK_Hbx1w',
  title: 'Vorstellungsgespräch: Schwächen nennen (5 Beispiele)',
  channel: 'StepUp! Coaching',
  category: 'german'
}, {
  id: '3JXC5FPcSLU',
  title: 'Die Gehaltsverhandlung (Beispiel-Dialog in voller Länge)',
  channel: 'StepUp! Coaching',
  category: 'german'
}, {
  id: 'uarNpr8eQPM',
  title: 'Die häufigsten Fragen beim Bewerben (+ Antworten)',
  channel: 'StepUp! Coaching',
  category: 'german'
}];
const CATEGORIES = [{
  key: 'all',
  labelKey: 'allVideos',
  emoji: ''
}, {
  key: 'germany',
  labelKey: 'germanySpecific',
  emoji: '🇩🇪'
}, {
  key: 'german',
  labelKey: 'aufDeutsch',
  emoji: ''
}];
export const InterviewPrepPage = () => {
  const {
    t
  } = useLanguage();
  const navigate = useNavigate();
  const [category, setCategory] = useState<string>('all');
  const [activeVideo, setActiveVideo] = useState<Video | null>(null);
  const filtered = category === 'all' ? VIDEOS : VIDEOS.filter(v => v.category === category);
  return <div className="min-h-screen bg-canvas">

      {/* Page header */}
      <div className="bg-surface border-b border-line px-6 py-5">
        <h1 className="text-2xl font-semibold text-ink"> {t('interviewPrep')}</h1>
        <p className="text-sm text-muted mt-1">{t('interviewPrepSubtitle')}</p>
      </div>

      {/* Category filter pills */}
      <div className="bg-surface border-b border-line px-6 py-3 sticky top-0 z-10">
        <div className="flex gap-2 flex-wrap">
          {CATEGORIES.map(cat => <button key={cat.key} onClick={() => setCategory(cat.key)} className={`px-4 py-1.5 rounded-md text-sm font-medium transition border ${category === cat.key ? 'bg-ink text-on-ink border-line' : 'bg-surface text-muted border-line hover:border-line hover:text-accent'}`}>
              {cat.emoji} {t(cat.labelKey)}
            </button>)}
        </div>
      </div>

      {/* Main content — videos left, guides right */}
      <main className="max-w-7xl mx-auto px-6 py-6 flex flex-col lg:flex-row gap-8 pb-16">

        {/* Left — Video grid */}
        <div className="flex-1 min-w-0">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            {filtered.map(video => <button key={video.id} onClick={() => setActiveVideo(video)} className="group bg-surface rounded-lg border border-line overflow-hidden hover:border-line hover:shadow-none transition text-left">
                <div className="relative aspect-video bg-line">
                  <img src={`https://img.youtube.com/vi/${video.id}/hqdefault.jpg`} alt={video.title} className="w-full h-full object-cover" loading="lazy" />
                  <div className="absolute inset-0 bg-black/25 group-hover:bg-black/45 transition flex items-center justify-center">
                    <div className="w-12 h-12 bg-red-600 rounded-md flex items-center justify-center shadow-none group- transition-colors">
                      <svg className="w-5 h-5 text-on-ink ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M8 5v14l11-7z" />
                      </svg>
                    </div>
                  </div>
                </div>
                <div className="p-4">
                  <h3 className="font-semibold text-ink text-sm leading-snug line-clamp-2 group-hover:text-accent transition">
                    {video.title}
                  </h3>
                  <p className="text-xs text-muted mt-1.5">{video.channel}</p>
                </div>
              </button>)}
          </div>
        </div>

        {/* Right — Career Guides */}
        <div className="lg:w-80 shrink-0">
          <h2 className="text-lg font-semibold text-ink mb-1">Career Guides</h2>
          <p className="text-sm text-muted mb-5">Practical advice for your job search in Germany</p>
          <div className="flex flex-col gap-3">
            {[{
            emoji: '🇩🇪',
            title: 'The German Job Market',
            desc: 'What you need to know about sectors, culture, and the application process.'
          }, {
            emoji: '',
            title: 'Jobs After Graduation',
            desc: 'How to land your first role and make the most of your post-study visa.'
          }, {
            emoji: '',
            title: 'Managing Job Search Stress',
            desc: 'Process goals, daily habits, and keeping your mental health in check.'
          }, {
            emoji: '',
            title: 'Green Jobs in Germany',
            desc: 'Sustainability roles, Energiewende, and where to find them.'
          }].map(card => <button key={card.title} onClick={() => navigate('/career-guides')} className="group bg-surface rounded-lg border border-line p-4 text-left hover:border-line hover:shadow-none transition-colors duration-200 ">
                <div className="flex items-start gap-3">
                  <span className="text-xl shrink-0">{card.emoji}</span>
                  <div>
                    <h3 className="text-sm font-semibold text-ink mb-1 group-hover:text-accent transition-colors">{card.title}</h3>
                    <p className="text-xs text-muted leading-relaxed">{card.desc}</p>
                    <span className="mt-2 inline-block text-xs font-semibold text-accent group-hover:text-accent">Read guide →</span>
                  </div>
                </div>
              </button>)}
          </div>
        </div>

      </main>

      {/* Video modal */}
      {activeVideo && <ModalSurface label="Interview video" onClose={() => setActiveVideo(null)} wide>
          <div className="w-full max-w-6xl bg-ink rounded-lg overflow-hidden shadow-none flex flex-col md:flex-row" style={{
        maxHeight: '90vh'
      }} onClick={e => e.stopPropagation()}>
            {/* Left — player */}
            <div className="flex flex-col flex-1 min-w-0">
              {/* Player header */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-line shrink-0">
                <div className="min-w-0 flex-1 mr-4">
                  <h3 className="text-on-ink text-sm font-semibold truncate">{activeVideo.title}</h3>
                  <p className="text-muted text-xs mt-0.5">{activeVideo.channel}</p>
                </div>
                <button onClick={() => setActiveVideo(null)} className="text-muted hover:text-on-ink transition shrink-0">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* YouTube embed */}
              <div className="aspect-video w-full">
                <iframe key={activeVideo.id} src={`https://www.youtube.com/embed/${activeVideo.id}?autoplay=1&rel=0`} className="w-full h-full" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen />
              </div>
            </div>

            {/* Right — playlist */}
            <div className="md:w-72 shrink-0 border-t border-line md:border-t-0 md:border-l md:border-line flex flex-col overflow-hidden">
              <div className="px-4 py-3 border-b border-line shrink-0">
                <p className="text-muted text-xs font-semibold uppercase tracking-wide">Up next</p>
              </div>
              <div className="overflow-y-auto flex-1">
                {VIDEOS.map(v => <button key={v.id} onClick={() => setActiveVideo(v)} className={`w-full flex gap-3 px-3 py-2.5 hover:bg-ink transition text-left ${v.id === activeVideo.id ? 'bg-ink' : ''}`}>
                    <div className="relative shrink-0 w-24 aspect-video rounded-lg overflow-hidden bg-gray-700">
                      <img src={`https://img.youtube.com/vi/${v.id}/mqdefault.jpg`} alt={v.title} className="w-full h-full object-cover" loading="lazy" />
                      {v.id === activeVideo.id && <div className="absolute inset-0 bg-ink flex items-center justify-center">
                          <div className="w-4 h-4 bg-ink rounded-md" />
                        </div>}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className={`text-xs font-medium leading-snug line-clamp-2 ${v.id === activeVideo.id ? 'text-accent' : 'text-gray-200'}`}>
                        {v.title}
                      </p>
                      <p className="text-[10px] text-muted mt-1">{v.channel}</p>
                    </div>
                  </button>)}
              </div>
            </div>
          </div>
        </ModalSurface>}
    </div>;
};
