import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { settingsService } from '../services/settings.service';
import { markSetupSeen } from '../routes/OnboardingRedirect';
import { useAuthStore } from '../store/authStore';
import { useLanguage } from '../store/languageStore';
import { LanguageToggle } from '../components/common/LanguageToggle';

const FIELD_PRESETS = [
  { label: 'Tech / IT',     keywords: 'developer,software engineer,data analyst,DevOps,IT',            emoji: '💻' },
  { label: 'Environment',   keywords: 'umwelt,klimaschutz,nachhaltigkeit,GIS,energie,renewables',       emoji: '🌱' },
  { label: 'Business',      keywords: 'consulting,beratung,project manager,finance,accounting',          emoji: '📊' },
  { label: 'Healthcare',    keywords: 'nurse,Pflegefachkraft,doctor,Arzt,medical',                      emoji: '🏥' },
  { label: 'Engineering',   keywords: 'Ingenieur,engineer,mechanical,electrical,civil',                 emoji: '⚙️' },
  { label: 'Marketing',     keywords: 'marketing,social media,SEO,content,brand manager',               emoji: '📣' },
  { label: 'Design / UX',   keywords: 'designer,UX,UI,Grafik,product design,creative',                 emoji: '🎨' },
  { label: 'Logistics',     keywords: 'logistics,supply chain,Spedition,warehouse,transport',           emoji: '🚛' },
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
        className={`rounded-full transition-all duration-300 ${
          i < current   ? 'w-6 h-2 bg-[#16a34a]' :
          i === current ? 'w-8 h-2 bg-[#16a34a]' :
                          'w-2 h-2 bg-[#dfe3eb]'
        }`}
      />
    ))}
  </div>
);

export const SetupPage = () => {
  const navigate = useNavigate();
  const { t } = useLanguage();
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
      localStorage.setItem('afavers-weekly-goal', weeklyGoal);
      localStorage.setItem('afavers-search-profile', JSON.stringify({
        field: selectedField,
        types: selectedTypes,
        language: languagePreference,
        radius,
        weeklyGoal,
        workStatus,
        savedAt: new Date().toISOString(),
      }));
      markSetupSeen(userId);
      navigate('/jobs?match=high');
    } catch {
      navigate('/dashboard');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f4f6fa] flex items-center justify-center p-4" style={{ fontFamily: "'Lato', 'Inter', sans-serif" }}>
      <div className="absolute right-4 top-4">
        <LanguageToggle />
      </div>
      <div className="max-w-md w-full">

        {step > 0 && step < TOTAL_STEPS && <ProgressDots current={step - 1} />}

        <div className="bg-white border border-[#dfe3eb] rounded-2xl overflow-hidden shadow-[0_4px_24px_0_rgba(15,44,65,0.08)]">

          {/* ── STEP 0: Welcome ── */}
          {step === 0 && (
            <div className="p-8">
              {/* Brand header */}
              <div className="text-center mb-8">
                <div className="w-14 h-14 rounded-2xl bg-[#16a34a] flex items-center justify-center mx-auto mb-4 shadow-[0_4px_12px_0_rgba(22,163,74,0.3)]">
                  <svg viewBox="0 0 24 24" className="w-8 h-8 fill-white">
                    <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
                  </svg>
                </div>
                <h1 className="text-[26px] font-black text-[#0a1a25] leading-tight">{t('setupWelcome')}</h1>
                <p className="text-[#6f839c] text-[14px] mt-2">{t('setupSubtitle')}</p>
              </div>

              <div className="space-y-3 mb-8">
                {[
                  { icon: '⏱️', title: t('setupAutoTitle'), desc: t('setupAutoDesc') },
                  { icon: '📋', title: t('setupTrackTitle'), desc: t('setupTrackDesc') },
                  { icon: '🎯', title: t('setupPersonalTitle'), desc: t('setupPersonalDesc') },
                ].map(({ icon, title, desc }) => (
                  <div key={title} className="flex items-start gap-3 p-3 rounded-xl bg-[#f4f6fa]">
                    <span className="text-xl shrink-0 mt-0.5">{icon}</span>
                    <div>
                      <p className="text-[13px] font-black text-[#0a1a25]">{title}</p>
                      <p className="text-[12px] text-[#6f839c] leading-snug mt-0.5">{desc}</p>
                    </div>
                  </div>
                ))}
              </div>

              <button
                onClick={() => setStep(1)}
                className="w-full bg-[#16a34a] hover:bg-green-700 text-white font-black py-3.5 px-4 rounded-xl transition text-[15px] shadow-[0_2px_8px_0_rgba(22,163,74,0.3)] active:scale-[0.98]"
              >
                {t('setupFeed')}
              </button>
              <button
                onClick={() => { markSetupSeen(userId); navigate('/dashboard'); }}
                className="w-full text-[13px] text-[#c1cbd5] hover:text-[#6f839c] transition mt-3 py-1.5 font-bold"
              >
                {t('setupSkip')}
              </button>
            </div>
          )}

          {/* ── STEP 1: Keywords ── */}
          {step === 1 && (
            <div className="p-8">
              <div className="text-center mb-7">
                <div className="text-4xl mb-3">🎯</div>
                <h2 className="text-[22px] font-black text-[#0a1a25]">{t('setupWhatJobs')}</h2>
                <p className="text-[#6f839c] text-[13px] mt-1.5">{t('setupWhatJobsDesc')}</p>
              </div>

              <div className="grid grid-cols-2 gap-2.5 mb-5">
                {FIELD_PRESETS.map(preset => (
                  <button
                    key={preset.label}
                    onClick={() => handleFieldSelect(preset)}
                    className={`text-left p-3.5 rounded-xl border-2 transition-all active:scale-[0.97] ${
                      selectedField === preset.label
                        ? 'border-[#16a34a] bg-[#f0fdf4] shadow-sm'
                        : 'border-[#dfe3eb] hover:border-[#c1cbd5] hover:bg-[#f4f6fa]'
                    }`}
                  >
                    <div className="text-2xl mb-1">{preset.emoji}</div>
                    <div className="font-black text-[#0a1a25] text-[13px]">{preset.label}</div>
                    <div className="text-[#6f839c] text-[11px] mt-0.5 truncate">{preset.keywords.split(',')[0]}…</div>
                  </button>
                ))}
              </div>

              <div>
                <label className="block text-[12px] font-black text-[#6f839c] uppercase tracking-wide mb-1.5">
                  {t('setupCustomKeywords')} <span className="normal-case font-normal">{t('setupComma')}</span>
                </label>
                <textarea
                  rows={2}
                  value={keywords}
                  onChange={e => { setKeywords(e.target.value); setSelectedField(null); }}
                  className="w-full px-3 py-2.5 border border-[#dfe3eb] rounded-xl focus-visible:ring-2 focus-visible:ring-[#16a34a] focus-visible:border-transparent outline-none text-[13px] resize-none text-[#0a1a25] bg-[#f4f6fa]"
                  placeholder={t('setupKeywordPlaceholder')}
                />
              </div>

              <div className="mt-4">
                <label className="block text-[12px] font-black text-[#6f839c] uppercase tracking-wide mb-2">
                  {t('setupJobTypes')}
                </label>
                <div className="flex flex-wrap gap-2">
                  {JOB_TYPE_PRESETS.map(type => (
                    <button
                      key={type.label}
                      type="button"
                      onClick={() => toggleType(type.label)}
                      className={`px-3 py-1.5 rounded-full text-[12px] font-bold border-2 transition-all ${
                        selectedTypes.includes(type.label)
                          ? 'bg-[#0a1a25] text-white border-[#0a1a25]'
                          : 'bg-white text-[#223a5a] border-[#dfe3eb] hover:border-[#0a1a25]'
                      }`}
                    >
                      {type.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex justify-between items-center mt-6">
                <button onClick={() => setStep(0)} className="text-[13px] font-bold text-[#c1cbd5] hover:text-[#6f839c] transition">
                  {t('setupBack')}
                </button>
                <button
                  onClick={() => setStep(2)}
                  disabled={!keywords.trim()}
                  className="px-6 py-2.5 bg-[#0a1a25] hover:bg-[#223a5a] disabled:opacity-30 disabled:cursor-not-allowed text-white font-black rounded-xl transition text-[13px] active:scale-[0.98]"
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
                <div className="text-4xl mb-3">📍</div>
                <h2 className="text-[22px] font-black text-[#0a1a25]">{t('setupWhere')}</h2>
                <p className="text-[#6f839c] text-[13px] mt-1.5">{t('setupWhereDesc')}</p>
              </div>

              <div className="flex flex-wrap gap-2 mb-4">
                {LOCATION_PRESETS.map(city => (
                  <button
                    key={city}
                    onClick={() => handleCityToggle(city)}
                    className={`px-3.5 py-1.5 rounded-full text-[13px] font-bold border-2 transition-all active:scale-95 ${
                      selectedCities.includes(city)
                        ? 'bg-[#16a34a] text-white border-[#16a34a] shadow-sm'
                        : 'bg-white text-[#223a5a] border-[#dfe3eb] hover:border-[#16a34a] hover:text-[#16a34a]'
                    }`}
                  >
                    {city}
                  </button>
                ))}
              </div>

              <div className="mb-5">
                <label className="block text-[12px] font-black text-[#6f839c] uppercase tracking-wide mb-1.5">
                  {t('setupOtherCities')}
                </label>
                <input
                  type="text"
                  value={locations}
                  onChange={e => setLocations(e.target.value)}
                  className="w-full px-3 py-2.5 border border-[#dfe3eb] rounded-xl focus-visible:ring-2 focus-visible:ring-[#16a34a] focus-visible:border-transparent outline-none text-[13px] text-[#0a1a25] bg-[#f4f6fa]"
                  placeholder={t('setupOtherCitiesPlaceholder')}
                />
              </div>

              <div className="mb-5">
                <label className="block text-[12px] font-black text-[#6f839c] uppercase tracking-wide mb-2">
                  {t('setupRadius')}
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {['10', '25', '50', '100'].map(value => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setRadius(value)}
                      className={`px-2 py-2 rounded-xl text-[12px] font-black border-2 transition-all ${
                        radius === value
                          ? 'bg-[#0a1a25] text-white border-[#0a1a25]'
                          : 'bg-white text-[#223a5a] border-[#dfe3eb] hover:border-[#0a1a25]'
                      }`}
                    >
                      {value} km
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-[12px] font-black text-[#6f839c] uppercase tracking-wide mb-2">
                  {t('setupLanguage')}
                </label>
                <div className="space-y-2">
                  {LANGUAGE_PRESETS.map(option => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setLanguagePreference(option.value)}
                      className={`w-full flex items-center justify-between p-3 rounded-xl border-2 transition-all ${
                        languagePreference === option.value
                          ? 'border-[#16a34a] bg-[#f0fdf4]'
                          : 'border-[#dfe3eb] bg-[#f4f6fa] hover:border-[#c1cbd5]'
                      }`}
                    >
                      <span className="text-[13px] font-black text-[#0a1a25]">{option.label}</span>
                      {languagePreference === option.value && <span className="text-[#16a34a] text-sm font-black">✓</span>}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex justify-between items-center mt-6">
                <button onClick={() => setStep(1)} className="text-[13px] font-bold text-[#c1cbd5] hover:text-[#6f839c] transition">
                  {t('setupBack')}
                </button>
                <button
                  onClick={() => setStep(3)}
                  disabled={saving || (!locations.trim() && selectedCities.length === 0)}
                  className="px-6 py-2.5 bg-[#16a34a] hover:bg-green-700 disabled:opacity-30 disabled:cursor-not-allowed text-white font-black rounded-xl transition text-[13px] shadow-[0_2px_8px_0_rgba(22,163,74,0.3)] active:scale-[0.98] flex items-center gap-2"
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
                <div className="text-4xl mb-3">📆</div>
                <h2 className="text-[22px] font-black text-[#0a1a25]">{t('setupMomentum')}</h2>
                <p className="text-[#6f839c] text-[13px] mt-1.5">{t('setupMomentumDesc')}</p>
              </div>

              <div className="mb-5">
                <label className="block text-[12px] font-black text-[#6f839c] uppercase tracking-wide mb-2">
                  {t('setupWeeklyGoal')}
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {['3', '5', '8', '12'].map(value => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setWeeklyGoal(value)}
                      className={`px-2 py-3 rounded-xl text-[13px] font-black border-2 transition-all ${
                        weeklyGoal === value
                          ? 'bg-[#16a34a] text-white border-[#16a34a]'
                          : 'bg-white text-[#223a5a] border-[#dfe3eb] hover:border-[#16a34a]'
                      }`}
                    >
                      {value}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-[12px] font-black text-[#6f839c] uppercase tracking-wide mb-2">
                  {t('setupWorkStatus')} <span className="normal-case font-normal">{t('setupOptional')}</span>
                </label>
                <div className="space-y-2">
                  {WORK_STATUS_PRESETS.map(option => (
                    <button
                      key={option}
                      type="button"
                      onClick={() => setWorkStatus(prev => prev === option ? '' : option)}
                      className={`w-full text-left p-3 rounded-xl border-2 text-[13px] font-bold transition-all ${
                        workStatus === option
                          ? 'border-[#0a1a25] bg-[#eef2f6] text-[#0a1a25]'
                          : 'border-[#dfe3eb] bg-[#f4f6fa] text-[#223a5a] hover:border-[#0a1a25]'
                      }`}
                    >
                      {option}
                    </button>
                  ))}
                </div>
              </div>

              <div className="mt-5 rounded-xl bg-[#f4f6fa] border border-[#dfe3eb] p-3">
                <p className="text-[13px] font-black text-[#0a1a25]">{t('setupAfter')}</p>
                <p className="text-[12px] text-[#6f839c] leading-snug mt-1">
                  {t('setupAfterDesc')}
                </p>
              </div>

              <div className="flex justify-between items-center mt-6">
                <button onClick={() => setStep(2)} className="text-[13px] font-bold text-[#c1cbd5] hover:text-[#6f839c] transition">
                  {t('setupBack')}
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="px-6 py-2.5 bg-[#16a34a] hover:bg-green-700 disabled:opacity-30 disabled:cursor-not-allowed text-white font-black rounded-xl transition text-[13px] shadow-[0_2px_8px_0_rgba(22,163,74,0.3)] active:scale-[0.98] flex items-center gap-2"
                >
                  {saving ? (
                    <>
                      <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                      </svg>
                      {t('setupSettingUp')}
                    </>
                  ) : t('setupFindJobs')}
                </button>
              </div>
            </div>
          )}

        </div>

        <p className="text-center text-[12px] text-[#c1cbd5] mt-5 font-bold">
          {t('setupChangeLater')}
        </p>
      </div>
    </div>
  );
};
