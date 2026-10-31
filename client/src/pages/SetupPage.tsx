import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { settingsService } from '../services/settings.service';
import { markSetupSeen } from '../routes/OnboardingRedirect';
import { useAuthStore } from '../store/authStore';
import {usePageLanguage} from '../hooks/usePageLanguage';
import {messages} from '../i18n/SetupPage';
import { LanguageToggle } from '../components/common/LanguageToggle';

const FIELD_PRESETS = [
  { label: 'Tech / IT',     keywords: 'developer,software engineer,data analyst,DevOps,IT',            emoji: '' },
  { label: 'Environment',   keywords: 'umwelt,klimaschutz,nachhaltigkeit,GIS,energie,renewables',       emoji: '' },
  { label: 'Business',      keywords: 'consulting,beratung,project manager,finance,accounting',          emoji: '' },
  { label: 'Healthcare',    keywords: 'nurse,Pflegefachkraft,doctor,Arzt,medical',                      emoji: '' },
  { label: 'Engineering',   keywords: 'Ingenieur,engineer,mechanical,electrical,civil',                 emoji: '' },
  { label: 'Marketing',     keywords: 'marketing,social media,SEO,content,brand manager',               emoji: '' },
  { label: 'Design / UX',   keywords: 'designer,UX,UI,Grafik,product design,creative',                 emoji: '' },
  { label: 'Logistics',     keywords: 'logistics,supply chain,Spedition,warehouse,transport',           emoji: '' },
];

const LOCATION_PRESETS = [
  'Berlin', 'München', 'Hamburg', 'Frankfurt', 'Köln',
  'Düsseldorf', 'Stuttgart', 'Leipzig', 'Dortmund', 'Essen',
  'Hannover', 'Nürnberg', 'Bremen', 'Dresden', 'Remote',
];

const JOB_TYPE_PRESETS = [
  { label: 'Junior', keywords: 'junior,entry level,berufseinsteiger' },
  { label: 'Full-time', keywords: 'full-time,vollzeit' },
  { label: 'Werkstudent', keywords: 'werkstudent,working student,studentische hilfskraft' },
  { label: 'Internship', keywords: 'praktikum,internship,trainee' },
  { label: 'Thesis', keywords: 'abschlussarbeit,bachelorarbeit,masterarbeit,thesis' },
  { label: 'Remote', keywords: 'remote,homeoffice,hybrid' },
];

const LANGUAGE_PRESETS = [
  { value: 'both', label: 'English + German', keywords: 'english,deutsch,german,bilingual,international' },
  { value: 'en', label: 'English-friendly', keywords: 'english,english speaking,international' },
  { value: 'de', label: 'German roles', keywords: 'deutsch,german,deutschsprachig' },
];

const WORK_STATUS_PRESETS = [
  'EU / no sponsorship needed',
  'Visa sponsorship helpful',
  'Student visa',
  'Blue Card path',
];

const TOTAL_STEPS = 4;

const ProgressDots = ({ current }: { current: number }) => (
  <div className="flex items-center justify-center gap-2 mb-8">
    {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
      <div
        key={i}
        className={`rounded-md transition-colors duration-300 ${
          i < current   ? 'w-6 h-2 bg-ink' :
          i === current ? 'w-8 h-2 bg-ink' :
                          'w-2 h-2 bg-[#dfe3eb]'
        }`}
      />
    ))}
  </div>
);

export const SetupPage = () => {
  const navigate = useNavigate();
  const { t, lang } = usePageLanguage(messages);
  const userId = useAuthStore((state) => state.user?.id);
  const [step, setStep] = useState(0);
  const [keywords, setKeywords] = useState('');
  const [locations, setLocations] = useState('');
  const [languagePreference, setLanguagePreference] = useState('both');
  const [radius, setRadius] = useState('25');
  const [weeklyGoal, setWeeklyGoal] = useState('5');
  const [workStatus, setWorkStatus] = useState('');
  const [selectedField, setSelectedField] = useState<string | null>(null);
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);

  const selectedCities = locations.split(',').map(l => l.trim()).filter(Boolean);

  const handleFieldSelect = (preset: typeof FIELD_PRESETS[0]) => {
    setSelectedField(prev => prev === preset.label ? null : preset.label);
    setKeywords(prev => prev === preset.keywords ? '' : preset.keywords);
  };

  const handleCityToggle = (city: string) => {
    if (selectedCities.includes(city)) {
      setLocations(selectedCities.filter(c => c !== city).join(', '));
    } else {
      setLocations([...selectedCities, city].join(', '));
    }
  };

  const toggleType = (label: string) => {
    setSelectedTypes(prev => prev.includes(label)
      ? prev.filter(item => item !== label)
      : [...prev, label]);
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveError(false);
    try {
      const typeKeywords = JOB_TYPE_PRESETS
        .filter(type => selectedTypes.includes(type.label))
        .map(type => type.keywords)
        .join(',');
      const languageKeywords = LANGUAGE_PRESETS.find(item => item.value === languagePreference)?.keywords ?? '';
      const workKeywords = workStatus.includes('Visa') ? 'visa sponsorship,relocation' : '';
      const resolvedKeywords = [keywords.trim(), typeKeywords, languageKeywords]
        .concat(workKeywords ? [workKeywords] : [])
        .filter(Boolean)
        .join(',');
      await settingsService.save({
        keywords: resolvedKeywords || 'developer,analyst,engineer',
        locations: locations.trim() || 'Berlin,München,Hamburg',
      });
      try {
        localStorage.setItem(`afavers-weekly-goal:user:${userId}`, weeklyGoal);
        localStorage.setItem(`afavers-search-profile:user:${userId}`, JSON.stringify({
        field: selectedField,
        types: selectedTypes,
        language: languagePreference,
        radius,
        weeklyGoal,
        workStatus,
        savedAt: new Date().toISOString(),
        }));
      } catch {
        // Keywords/cities already saved on the server. Optional device details
        // must not turn that success into an unrecoverable save-error loop.
      }
      markSetupSeen(userId);
      navigate('/jobs?sort=match_score');
    } catch {
      setSaveError(true);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-canvas flex items-center justify-center p-4" style={{ fontFamily: 'var(--font-ui)' }}>
      <div className="absolute right-4 top-4">
        <LanguageToggle />
      </div>
      <div className="max-w-md w-full">

        {step > 0 && step < TOTAL_STEPS && <ProgressDots current={step - 1} />}

        <div className="bg-surface border border-line rounded-lg overflow-hidden shadow-none-[0_4px_24px_0_rgba(15,44,65,0.08)]">

          {/* ── STEP 0: Welcome ── */}
          {step === 0 && (
            <div className="p-8">
              {/* Brand header */}
              <div className="text-center mb-8">
                <div className="w-14 h-14 rounded-lg bg-ink flex items-center justify-center mx-auto mb-4 shadow-none-[0_4px_12px_0_rgba(22,163,74,0.3)]">
                  <svg viewBox="0 0 24 24" className="w-8 h-8 fill-white">
                    <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
                  </svg>
                </div>
                <h1 className="text-[26px] font-semibold text-ink leading-tight">{t('setupWelcome')}</h1>
                <p className="text-muted text-[14px] mt-2">{t('setupSubtitle')}</p>
              </div>

              <div className="space-y-3 mb-8">
                {[
                  { icon: '', title: t('setupAutoTitle'), desc: t('setupAutoDesc') },
                  { icon: '', title: t('setupTrackTitle'), desc: t('setupTrackDesc') },
                  { icon: '', title: t('setupPersonalTitle'), desc: t('setupPersonalDesc') },
                ].map(({ icon, title, desc }) => (
                  <div key={title} className="flex items-start gap-3 p-3 rounded-lg bg-canvas">
                    <span className="text-xl shrink-0 mt-0.5">{icon}</span>
                    <div>
                      <p className="text-[13px] font-semibold text-ink">{title}</p>
                      <p className="text-[12px] text-muted leading-snug mt-0.5">{desc}</p>
                    </div>
                  </div>
                ))}
              </div>

              <button
                onClick={() => setStep(1)}
                className="w-full bg-ink hover:bg-ink text-on-ink font-semibold py-3.5 px-4 rounded-lg transition text-[15px] shadow-none-[0_2px_8px_0_rgba(22,163,74,0.3)] "
              >
                {t('setupFeed')}
              </button>
              <button
                onClick={() => { markSetupSeen(userId); navigate('/jobs'); }}
                className="w-full text-[13px] text-muted hover:text-muted transition mt-3 py-1.5 font-semibold"
              >
                {t('setupSkip')}
              </button>
            </div>
          )}

          {/* ── STEP 1: Keywords ── */}
          {step === 1 && (
            <div className="p-8">
              <div className="text-center mb-7">
                <div className="text-4xl mb-3"></div>
                <h2 className="text-[22px] font-semibold text-ink">{t('setupWhatJobs')}</h2>
                <p className="text-muted text-[13px] mt-1.5">{t('setupWhatJobsDesc')}</p>
              </div>

              <div className="grid grid-cols-2 gap-2.5 mb-5">
                {FIELD_PRESETS.map(preset => (
                  <button
                    key={preset.label}
                    onClick={() => handleFieldSelect(preset)}
                    className={`text-left p-3.5 rounded-lg border-2 transition-colors  ${
                      selectedField === preset.label
                        ? 'border-[#16a34a] bg-[#f0fdf4] shadow-none'
                        : 'border-line hover:border-line hover:bg-canvas'
                    }`}
                  >
                    <div className="text-2xl mb-1">{preset.emoji}</div>
                    <div className="font-semibold text-ink text-[13px]">{preset.label}</div>
                    <div className="text-muted text-[11px] mt-0.5 truncate">{preset.keywords.split(',')[0]}…</div>
                  </button>
                ))}
              </div>

              <div>
                <label className="block text-[12px] font-semibold text-muted uppercase tracking-wide mb-1.5">
                  {t('setupCustomKeywords')} <span className="normal-case font-normal">{t('setupComma')}</span>
                </label>
                <textarea
                  aria-label={t('setupCustomKeywords')}
                  rows={2}
                  value={keywords}
                  onChange={e => { setKeywords(e.target.value); setSelectedField(null); }}
                  className="w-full px-3 py-2.5 border border-line rounded-lg focus-visible:ring-2 focus-visible:ring-[#16a34a] focus-visible:border-transparent outline-none text-[13px] resize-none text-ink bg-canvas"
                  placeholder={t('setupKeywordPlaceholder')}
                />
              </div>

              <div className="mt-4">
                <label className="block text-[12px] font-semibold text-muted uppercase tracking-wide mb-2">
                  {t('setupJobTypes')}
                </label>
                <div className="flex flex-wrap gap-2">
                  {JOB_TYPE_PRESETS.map(type => (
                    <button
                      key={type.label}
                      type="button"
                      onClick={() => toggleType(type.label)}
                      className={`px-3 py-1.5 rounded-md text-[12px] font-semibold border-2 transition-colors ${
                        selectedTypes.includes(type.label)
                          ? 'bg-ink text-on-ink border-[#0a1a25]'
                          : 'bg-surface text-ink border-line hover:border-[#0a1a25]'
                      }`}
                    >
                      {type.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex justify-between items-center mt-6">
                <button onClick={() => setStep(0)} className="text-[13px] font-semibold text-muted hover:text-muted transition">
                  {t('setupBack')}
                </button>
                <button
                  onClick={() => setStep(2)}
                  disabled={!keywords.trim()}
                  className="px-6 py-2.5 bg-ink hover:bg-ink disabled:opacity-30 disabled:cursor-not-allowed text-on-ink font-semibold rounded-lg transition text-[13px] "
                >
                  {t('setupNext')}
                </button>
              </div>
            </div>
          )}

          {/* ── STEP 2: Locations ── */}
          {step === 2 && (
            <div className="p-8">
              <div className="text-center mb-7">
                <div className="text-4xl mb-3"></div>
                <h2 className="text-[22px] font-semibold text-ink">{t('setupWhere')}</h2>
                <p className="text-muted text-[13px] mt-1.5">{t('setupWhereDesc')}</p>
              </div>

              <div className="flex flex-wrap gap-2 mb-4">
                {LOCATION_PRESETS.map(city => (
                  <button
                    key={city}
                    onClick={() => handleCityToggle(city)}
                    className={`px-3.5 py-1.5 rounded-md text-[13px] font-semibold border-2 transition-colors  ${
                      selectedCities.includes(city)
                        ? 'bg-ink text-on-ink border-[#16a34a] shadow-none'
                        : 'bg-surface text-ink border-line hover:border-[#16a34a] hover:text-accent'
                    }`}
                  >
                    {city}
                  </button>
                ))}
              </div>

              <div className="mb-5">
                <label className="block text-[12px] font-semibold text-muted uppercase tracking-wide mb-1.5">
                  {t('setupOtherCities')}
                </label>
                <input
                  type="text"
                  aria-label={t('setupOtherCities')}
                  value={locations}
                  onChange={e => setLocations(e.target.value)}
                  className="w-full px-3 py-2.5 border border-line rounded-lg focus-visible:ring-2 focus-visible:ring-[#16a34a] focus-visible:border-transparent outline-none text-[13px] text-ink bg-canvas"
                  placeholder={t('setupOtherCitiesPlaceholder')}
                />
              </div>

              <div className="mb-5">
                <label className="block text-[12px] font-semibold text-muted uppercase tracking-wide mb-2">
                  {t('setupRadius')}
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {['10', '25', '50', '100'].map(value => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setRadius(value)}
                      className={`px-2 py-2 rounded-lg text-[12px] font-semibold border-2 transition-colors ${
                        radius === value
                          ? 'bg-ink text-on-ink border-[#0a1a25]'
                          : 'bg-surface text-ink border-line hover:border-[#0a1a25]'
                      }`}
                    >
                      {value} km
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-[12px] font-semibold text-muted uppercase tracking-wide mb-2">
                  {t('setupLanguage')}
                </label>
                <div className="space-y-2">
                  {LANGUAGE_PRESETS.map(option => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setLanguagePreference(option.value)}
                      className={`w-full flex items-center justify-between p-3 rounded-lg border-2 transition-colors ${
                        languagePreference === option.value
                          ? 'border-[#16a34a] bg-[#f0fdf4]'
                          : 'border-line bg-canvas hover:border-line'
                      }`}
                    >
                      <span className="text-[13px] font-semibold text-ink">{option.label}</span>
                      {languagePreference === option.value && <span className="text-accent text-sm font-semibold">✓</span>}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex justify-between items-center mt-6">
                <button onClick={() => setStep(1)} className="text-[13px] font-semibold text-muted hover:text-muted transition">
                  {t('setupBack')}
                </button>
                <button
                  onClick={() => setStep(3)}
                  disabled={saving || (!locations.trim() && selectedCities.length === 0)}
                  className="px-6 py-2.5 bg-ink hover:bg-ink disabled:opacity-30 disabled:cursor-not-allowed text-on-ink font-semibold rounded-lg transition text-[13px] shadow-none-[0_2px_8px_0_rgba(22,163,74,0.3)]  flex items-center gap-2"
                >
                  {t('setupNext')}
                </button>
              </div>
            </div>
          )}

          {/* ── STEP 3: Goal ── */}
          {step === 3 && (
            <div className="p-8">
              <div className="text-center mb-7">
                <div className="text-4xl mb-3"></div>
                <h2 className="text-[22px] font-semibold text-ink">{t('setupMomentum')}</h2>
                <p className="text-muted text-[13px] mt-1.5">{t('setupMomentumDesc')}</p>
              </div>

              <div className="mb-5">
                <label className="block text-[12px] font-semibold text-muted uppercase tracking-wide mb-2">
                  {t('setupWeeklyGoal')}
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {['3', '5', '8', '12'].map(value => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setWeeklyGoal(value)}
                      className={`px-2 py-3 rounded-lg text-[13px] font-semibold border-2 transition-colors ${
                        weeklyGoal === value
                          ? 'bg-ink text-on-ink border-[#16a34a]'
                          : 'bg-surface text-ink border-line hover:border-[#16a34a]'
                      }`}
                    >
                      {value}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-[12px] font-semibold text-muted uppercase tracking-wide mb-2">
                  {t('setupWorkStatus')} <span className="normal-case font-normal">{t('setupOptional')}</span>
                </label>
                <div className="space-y-2">
                  {WORK_STATUS_PRESETS.map(option => (
                    <button
                      key={option}
                      type="button"
                      onClick={() => setWorkStatus(prev => prev === option ? '' : option)}
                      className={`w-full text-left p-3 rounded-lg border-2 text-[13px] font-semibold transition-colors ${
                        workStatus === option
                          ? 'border-[#0a1a25] bg-[#eef2f6] text-ink'
                          : 'border-line bg-canvas text-ink hover:border-[#0a1a25]'
                      }`}
                    >
                      {option}
                    </button>
                  ))}
                </div>
              </div>

              <div className="mt-5 rounded-lg bg-canvas border border-line p-3">
                <p className="text-[13px] font-semibold text-ink">{t('setupAfter')}</p>
                <p className="text-[12px] text-muted leading-snug mt-1">
                  {t('setupAfterDesc')}
                </p>
              </div>

              <div className="flex justify-between items-center mt-6">
                <button onClick={() => setStep(2)} className="text-[13px] font-semibold text-muted hover:text-muted transition">
                  {t('setupBack')}
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="px-6 py-2.5 bg-ink hover:bg-ink disabled:opacity-30 disabled:cursor-not-allowed text-on-ink font-semibold rounded-lg transition text-[13px] shadow-none-[0_2px_8px_0_rgba(22,163,74,0.3)]  flex items-center gap-2"
                >
                  {saving ? (
                    <>
                      <svg className=" h-4 w-4" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                      </svg>
                      {t('setupSettingUp')}
                    </>
                  ) : t('setupFindJobs')}
                </button>
              </div>
              {saveError && <p role="alert" className="mt-4 text-sm leading-relaxed text-danger">{lang === 'de' ? 'Deine Suche konnte nicht gespeichert werden. Deine Eingaben bleiben erhalten. Prüfe die Verbindung und versuche es erneut.' : 'We couldn’t save your search. Your choices are still here. Check your connection and try again.'}</p>}
            </div>
          )}

        </div>

        <p className="text-center text-[12px] text-muted mt-5 font-semibold">
          {t('setupChangeLater')}
        </p>
      </div>
    </div>
  );
};
