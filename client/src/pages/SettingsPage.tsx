import { useState, useEffect, useMemo } from 'react';
import { settingsService, type Settings } from '../services/settings.service';
import { DEFAULT_JOB_ALERT, jobAlertsService, type JobAlert, type JobAlertFrequency } from '../services/jobAlerts.service';
import { supabase } from '../lib/supabase';
import { useLanguage } from '../store/languageStore';
import { useAuthStore } from '../store/authStore';
import { usePreferencesStore, ALL_NEWS_TOPICS, type NewsTopic } from '../store/preferencesStore';
import { useUnsavedChangesGuard } from '../hooks/useUnsavedChangesGuard';
import { refreshAppCache } from '../utils/cacheRecovery';

const FEED_PRESETS = [
  { label: 'Tech / IT',    kw: ['developer', 'software engineer', 'data analyst', 'DevOps', 'IT'] },
  { label: 'Environment', kw: ['umwelt', 'klimaschutz', 'nachhaltigkeit', 'GIS', 'energie'] },
  { label: 'Business',    kw: ['consulting', 'beratung', 'project manager', 'finance', 'accounting'] },
  { label: 'Healthcare',  kw: ['nurse', 'Pflegefachkraft', 'doctor', 'Arzt', 'medical'] },
  { label: 'Engineering', kw: ['Ingenieur', 'engineer', 'mechanical', 'electrical', 'civil'] },
  { label: 'Marketing',   kw: ['marketing', 'social media', 'SEO', 'content', 'brand'] },
];

function normalizeCommaList(value: string): string {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
    .join(', ');
}

export const SettingsPage = () => {
  const { t, lang } = useLanguage();
  const isDemo = useAuthStore((s) => s.isDemo);
  const [settings, setSettings] = useState<Settings>({ keywords: '', locations: '' });
  const [jobAlert, setJobAlert] = useState<JobAlert>(DEFAULT_JOB_ALERT);
  // Snapshot of the last-saved settings — used to detect unsaved edits.
  const [savedSnapshot, setSavedSnapshot] = useState<Settings>({ keywords: '', locations: '' });
  const [savedAlertSnapshot, setSavedAlertSnapshot] = useState<JobAlert>(DEFAULT_JOB_ALERT);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  const isDirty = useMemo(
    () =>
      settings.keywords !== savedSnapshot.keywords ||
      settings.locations !== savedSnapshot.locations ||
      jobAlert.enabled !== savedAlertSnapshot.enabled ||
      jobAlert.keywords !== savedAlertSnapshot.keywords ||
      jobAlert.locations !== savedAlertSnapshot.locations ||
      jobAlert.min_score !== savedAlertSnapshot.min_score ||
      jobAlert.frequency !== savedAlertSnapshot.frequency,
    [settings, savedSnapshot, jobAlert, savedAlertSnapshot]
  );
  const { showPrompt, confirmLeave, cancelLeave } = useUnsavedChangesGuard(isDirty);
  const [pwForm, setPwForm] = useState({ current: '', next: '', confirm: '' });
  const [pwSaving, setPwSaving] = useState(false);
  const [cacheResetting, setCacheResetting] = useState(false);
  const [pwMsg, setPwMsg] = useState<{ text: string; ok: boolean } | null>(null);

  // Feed filter preferences (local, persisted)
  const {
    filterKeywords, filterEnabled, setFilterKeywords, setFilterEnabled,
    newsOnDashboard, newsTopics, setNewsOnDashboard, setNewsTopics,
  } = usePreferencesStore();
  const [feedInput, setFeedInput] = useState('');

  const handleChangePassword = async () => {
    setPwMsg(null);
    if (pwForm.next !== pwForm.confirm) {
      setPwMsg({ text: t('pwMismatch'), ok: false });
      return;
    }
    if (pwForm.next.length < 8) {
      setPwMsg({ text: t('pwTooShort'), ok: false });
      return;
    }
    setPwSaving(true);
    try {
      const email = useAuthStore.getState().user?.email;
      if (!email) throw new Error('You need to sign in again.');
      const current = await supabase.auth.signInWithPassword({ email, password: pwForm.current });
      if (current.error) throw current.error;
      const { error } = await supabase.auth.updateUser({ password: pwForm.next });
      if (error) throw error;
      setPwMsg({ text: t('pwChanged'), ok: true });
      setPwForm({ current: '', next: '', confirm: '' });
    } catch (err) {
      setPwMsg({ text: err instanceof Error ? err.message : t('pwChangeFailed'), ok: false });
    } finally {
      setPwSaving(false);
    }
  };

  useEffect(() => {
    Promise.all([
      settingsService.get(),
      jobAlertsService.getPrimary(),
    ]).then(([data, alert]) => {
      setSettings(data);
      setSavedSnapshot(data);
      setJobAlert((current) => ({
        ...alert,
        keywords: alert.keywords || data.keywords || current.keywords,
        locations: alert.locations || data.locations || current.locations,
      }));
      setSavedAlertSnapshot((current) => ({
        ...alert,
        keywords: alert.keywords || data.keywords || current.keywords,
        locations: alert.locations || data.locations || current.locations,
      }));
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    const normalizedSettings = {
      keywords: normalizeCommaList(settings.keywords),
      locations: normalizeCommaList(settings.locations),
    };
    const normalizedAlert = {
      ...jobAlert,
      keywords: normalizeCommaList(jobAlert.keywords),
      locations: normalizeCommaList(jobAlert.locations),
    };

    setSaving(true);
    setError('');
    try {
      await settingsService.save(normalizedSettings);
      setSettings(normalizedSettings);
      setSavedSnapshot(normalizedSettings);

      try {
        const savedAlertData = await jobAlertsService.save(normalizedAlert);
        setJobAlert(savedAlertData);
        setSavedAlertSnapshot(savedAlertData);
      } catch (alertError) {
        setJobAlert(normalizedAlert);
        setSavedAlertSnapshot(normalizedAlert);
        setError(
          lang === 'de'
            ? 'Deine Suchbegriffe wurden gespeichert, aber die E-Mail-Benachrichtigungen konnten nicht aktualisiert werden.'
            : 'Your search settings were saved, but priority email alerts could not be updated.'
        );
        console.warn('Priority alerts failed to save:', alertError);
      }

      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : t('failedToSave'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="px-6 py-8 max-w-3xl mx-auto">
      {/* Page title */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">{t('settings')}</h1>
        <p className="text-sm text-gray-500 mt-1">{t('settingsSubtitle')}</p>
      </div>

      {loading ? (
        <div className="text-center py-16">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Info banner */}
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-800 flex gap-3">
            <span className="text-lg shrink-0">ℹ️</span>
            <div>
              <strong>{t('howItWorks')}</strong> {t('settingsInfo')}
            </div>
          </div>

          {/* Search settings */}
          <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-5">
            <h2 className="text-base font-semibold text-gray-900">{t('searchSettings')}</h2>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">{t('keywords')}</label>
              <p className="text-xs text-gray-400 mb-2">{t('keywordsDesc')}</p>
              <textarea
                rows={3}
                value={settings.keywords}
                onChange={e => setSettings(s => ({ ...s, keywords: e.target.value }))}
                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:border-transparent outline-none text-sm resize-none bg-white"
                placeholder={t('keywordsPlaceholder')}
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">{t('locations')}</label>
              <p className="text-xs text-gray-400 mb-2">{t('locationsDesc')}</p>
              <textarea
                rows={2}
                value={settings.locations}
                onChange={e => setSettings(s => ({ ...s, locations: e.target.value }))}
                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:border-transparent outline-none text-sm resize-none bg-white"
                placeholder={t('locationsPlaceholder')}
              />
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}

            <div className="flex justify-between items-center pt-1">
              <span className={`text-sm transition ${saved ? 'text-green-600' : 'text-transparent'}`}>
                ✓ {t('settingsSaved')}
              </span>
              <button
                onClick={handleSave}
                disabled={saving || isDemo}
                title={isDemo ? t('notAvailableDemo') : undefined}
                className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-semibold rounded-xl transition"
              >
                {saving ? t('saving') : t('saveSettings')}
              </button>
            </div>
          </div>

          {/* Priority Email Alerts */}
          <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-base font-semibold text-gray-900">{t('priorityAlerts')}</h2>
                <p className="text-xs text-gray-400 mt-0.5">
                  {t('priorityAlertsDesc')}
                </p>
              </div>
              <button
                onClick={() => setJobAlert((alert) => ({ ...alert, enabled: !alert.enabled }))}
                className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${jobAlert.enabled ? 'bg-green-500' : 'bg-gray-200'}`}
                aria-label="Toggle priority email alerts"
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${jobAlert.enabled ? 'translate-x-6' : 'translate-x-1'}`} />
              </button>
            </div>

            <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 text-sm text-orange-900">
              <strong>{t('priorityAlertsExample')}</strong> {t('priorityAlertsExampleText')}
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">{t('alertKeywords')}</label>
              <p className="text-xs text-gray-400 mb-2">{t('alertKeywordsDesc')}</p>
              <textarea
                rows={3}
                value={jobAlert.keywords}
                onChange={e => setJobAlert((alert) => ({ ...alert, keywords: e.target.value }))}
                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:border-transparent outline-none text-sm resize-none bg-white"
                placeholder="werkstudent, IT, GIS, data analyst, data analysis"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">{t('alertLocations')}</label>
              <p className="text-xs text-gray-400 mb-2">{t('alertLocationsDesc')}</p>
              <textarea
                rows={2}
                value={jobAlert.locations}
                onChange={e => setJobAlert((alert) => ({ ...alert, locations: e.target.value }))}
                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:border-transparent outline-none text-sm resize-none bg-white"
                placeholder="NRW, Düsseldorf, Köln, Essen, Dortmund, Bochum"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">{t('howOften')}</label>
                <select
                  value={jobAlert.frequency}
                  onChange={e => setJobAlert((alert) => ({ ...alert, frequency: e.target.value as JobAlertFrequency }))}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-xl text-sm bg-white outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:border-transparent"
                >
                  <option value="instant">{t('everyJobFetch')}</option>
                  <option value="daily">{t('dailyDigest')}</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">{t('minimumMatch')}</label>
                <select
                  value={jobAlert.min_score}
                  onChange={e => setJobAlert((alert) => ({ ...alert, min_score: Number(e.target.value) }))}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-xl text-sm bg-white outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:border-transparent"
                >
                  <option value={65}>{t('goodMatchAbove')}</option>
                  <option value={70}>{t('highMatchAbove')}</option>
                  <option value={80}>{t('veryHighMatchOnly')}</option>
                </select>
              </div>
            </div>

            {jobAlert.last_sent_at && (
              <p className="text-xs text-gray-400">
                {t('lastAlertSent')} {new Date(jobAlert.last_sent_at).toLocaleString()}.
              </p>
            )}
          </div>

          {/* Keyword presets */}
          <div className="bg-white rounded-2xl border border-gray-200 p-6">
            <h2 className="text-base font-semibold text-gray-900 mb-4">{t('keywordIdeas')}</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {[
                { field: 'Tech / IT',    icon: '💻', kw: 'developer, software engineer, data analyst, DevOps, IT' },
                { field: 'Environment', icon: '🌿', kw: 'umwelt, klimaschutz, nachhaltigkeit, GIS, energie' },
                { field: 'Business',    icon: '📈', kw: 'consulting, beratung, project manager, finance, accounting' },
                { field: 'Healthcare',  icon: '🏥', kw: 'nurse, Pflegefachkraft, doctor, Arzt, medical' },
                { field: 'Engineering', icon: '⚙️', kw: 'Ingenieur, engineer, mechanical, electrical, civil' },
                { field: 'Marketing',   icon: '📢', kw: 'marketing, social media, SEO, content, brand' },
              ].map(({ field, icon, kw }) => (
                <button
                  key={field}
                  onClick={() => setSettings(s => ({ ...s, keywords: kw }))}
                  className="text-left px-4 py-3 rounded-xl border border-gray-200 hover:border-blue-300 hover:bg-blue-50 transition group"
                >
                  <div className="flex items-center gap-2 mb-0.5">
                    <span>{icon}</span>
                    <span className="font-semibold text-sm text-gray-800 group-hover:text-blue-700">{field}</span>
                  </div>
                  <p className="text-xs text-gray-400 truncate">{kw}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Job Feed Filters */}
          <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-base font-semibold text-gray-900">{t('jobFeedFilters')}</h2>
                <p className="text-xs text-gray-400 mt-0.5">{t('jobFeedFiltersDesc')}</p>
              </div>
              {/* Toggle */}
              <button
                onClick={() => setFilterEnabled(!filterEnabled)}
                className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${filterEnabled ? 'bg-green-500' : 'bg-gray-200'}`}
                aria-label="Toggle feed filter"
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${filterEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
              </button>
            </div>

            {/* Keyword tags */}
            <div>
              <p className="text-xs text-gray-500 mb-2">
                {filterEnabled && filterKeywords.length === 0
                  ? t('addKeywordHint')
                  : filterEnabled
                  ? t('filterEnabledHint')
                  : t('filterDisabledHint')}
              </p>
              <div className="flex flex-wrap gap-2 mb-3">
                {filterKeywords.map((kw) => (
                  <span
                    key={kw}
                    className="flex items-center gap-1.5 px-3 py-1 bg-green-50 border border-green-200 text-green-800 text-xs font-medium rounded-full"
                  >
                    {kw}
                    <button
                      onClick={() => setFilterKeywords(filterKeywords.filter(k => k !== kw))}
                      className="text-green-400 hover:text-green-700 transition leading-none"
                      aria-label={`Remove ${kw}`}
                    >
                      ×
                    </button>
                  </span>
                ))}
                {filterKeywords.length === 0 && (
                  <span className="text-xs text-gray-300 italic">{t('noKeywordsYet')}</span>
                )}
              </div>
              {/* Add keyword input */}
              <div className="flex gap-2">
                <input
                  type="text"
                  value={feedInput}
                  onChange={e => setFeedInput(e.target.value)}
                  onKeyDown={e => {
                    if ((e.key === 'Enter' || e.key === ',') && feedInput.trim()) {
                      e.preventDefault();
                      const kw = feedInput.trim().replace(/,$/, '');
                      if (kw && !filterKeywords.includes(kw)) {
                        setFilterKeywords([...filterKeywords, kw]);
                      }
                      setFeedInput('');
                    }
                  }}
                  placeholder={t('typeKeywordEnter')}
                  className="flex-1 px-4 py-2.5 border border-gray-300 rounded-xl text-sm outline-none focus-visible:ring-2 focus-visible:ring-green-500 focus-visible:border-transparent bg-white"
                />
                <button
                  onClick={() => {
                    const kw = feedInput.trim();
                    if (kw && !filterKeywords.includes(kw)) {
                      setFilterKeywords([...filterKeywords, kw]);
                    }
                    setFeedInput('');
                  }}
                  disabled={!feedInput.trim()}
                  className="px-4 py-2.5 bg-green-600 hover:bg-green-700 disabled:opacity-40 text-white text-sm font-semibold rounded-xl transition"
                >
                  {t('add')}
                </button>
              </div>
            </div>

            {/* Quick-add presets */}
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">{t('quickAddPreset')}</p>
              <div className="flex flex-wrap gap-2">
                {FEED_PRESETS.map(({ label, kw }) => (
                  <button
                    key={label}
                    onClick={() => {
                      const toAdd = kw.filter(k => !filterKeywords.includes(k));
                      if (toAdd.length) setFilterKeywords([...filterKeywords, ...toAdd]);
                      setFilterEnabled(true);
                    }}
                    className="px-3 py-1.5 text-xs font-medium rounded-xl border border-gray-200 hover:border-green-300 hover:bg-green-50 text-gray-700 hover:text-green-700 transition"
                  >
                    {label}
                  </button>
                ))}
                {filterKeywords.length > 0 && (
                  <button
                    onClick={() => setFilterKeywords([])}
                    className="px-3 py-1.5 text-xs font-medium rounded-xl border border-red-100 bg-red-50 text-red-500 hover:bg-red-100 transition"
                  >
                    {t('clearAll')}
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* News Preferences */}
          <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-base font-semibold text-gray-900">{t('newsPreferences')}</h2>
                <p className="text-xs text-gray-400 mt-0.5">{t('newsPreferencesDesc')}</p>
              </div>
            </div>

            {/* Show on dashboard toggle */}
            <div className="flex items-center justify-between gap-4 py-1">
              <div>
                <p className="text-sm font-medium text-gray-700">{t('showNewsDashboard')}</p>
                <p className="text-xs text-gray-400 mt-0.5">{t('showNewsDashboardDesc')}</p>
              </div>
              <button
                onClick={() => setNewsOnDashboard(!newsOnDashboard)}
                className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${newsOnDashboard ? 'bg-green-500' : 'bg-gray-200'}`}
                aria-label="Toggle news on dashboard"
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${newsOnDashboard ? 'translate-x-6' : 'translate-x-1'}`} />
              </button>
            </div>

            {/* Topic selection */}
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">{t('topicsToShow')}</p>
              <p className="text-xs text-gray-400 mb-3">
                {newsTopics.length === 0 ? t('allTopicsShown') : `${newsTopics.length} ${t('selectedTopics')}`}
              </p>
              <div className="space-y-2">
                {ALL_NEWS_TOPICS.map(({ key, label, emoji, desc }) => {
                  const selected = newsTopics.includes(key);
                  return (
                    <button
                      key={key}
                      onClick={() => {
                        const next = selected
                          ? newsTopics.filter(t => t !== key)
                          : [...newsTopics, key] as NewsTopic[];
                        setNewsTopics(next);
                      }}
                      className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border text-left transition-all ${
                        selected
                          ? 'border-green-300 bg-green-50 text-green-900'
                          : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      <span className="text-lg shrink-0">{emoji}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold">{label}</p>
                        <p className="text-xs text-gray-400 mt-0.5">{desc}</p>
                      </div>
                      <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-all ${
                        selected ? 'border-green-500 bg-green-500' : 'border-gray-300'
                      }`}>
                        {selected && (
                          <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
              {newsTopics.length > 0 && (
                <button
                  onClick={() => setNewsTopics([])}
                  className="mt-3 text-xs text-gray-400 hover:text-gray-600 transition"
                >
                  {t('clearSelectionShowAll')}
                </button>
              )}
            </div>
          </div>

          {/* Change Password */}
          <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-4">
            <h2 className="text-base font-semibold text-gray-900">{t('changePassword')}</h2>
            {[
              { key: 'current', labelKey: 'currentPassword', placeholder: '••••••••' },
              { key: 'next',    labelKey: 'newPassword',     placeholderKey: 'minCharsHint' },
              { key: 'confirm', labelKey: 'confirmNewPassword', placeholder: '••••••••' },
            ].map(f => (
              <div key={f.key}>
                <label className="block text-sm font-medium text-gray-600 mb-1">{t(f.labelKey)}</label>
                <input
                  type="password"
                  value={pwForm[f.key as keyof typeof pwForm]}
                  onChange={e => setPwForm(prev => ({ ...prev, [f.key]: e.target.value }))}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:border-transparent outline-none text-sm bg-white"
                  placeholder={f.placeholderKey ? t(f.placeholderKey) : f.placeholder}
                />
              </div>
            ))}
            {pwMsg && (
              <p className={`text-sm ${pwMsg.ok ? 'text-green-600' : 'text-red-600'}`}>{pwMsg.text}</p>
            )}
            <div className="flex justify-end pt-1">
              <button
                onClick={handleChangePassword}
                disabled={pwSaving || !pwForm.current || !pwForm.next || !pwForm.confirm || isDemo}
                title={isDemo ? t('notAvailableDemo') : undefined}
                className="px-6 py-2.5 bg-gray-900 hover:bg-black disabled:opacity-40 text-white text-sm font-semibold rounded-xl transition"
              >
                {pwSaving ? t('saving') : t('updatePassword')}
              </button>
            </div>
          </div>

          {/* App recovery */}
          <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-4">
            <div>
              <h2 className="text-base font-semibold text-gray-900">{t('appRecovery')}</h2>
              <p className="text-xs text-gray-400 mt-0.5">{t('appRecoveryDesc')}</p>
            </div>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <p className="text-xs text-gray-500">{t('resetAppCacheNote')}</p>
              <button
                type="button"
                onClick={() => {
                  setCacheResetting(true);
                  refreshAppCache();
                }}
                disabled={cacheResetting}
                className="px-5 py-2.5 bg-gray-900 hover:bg-black disabled:opacity-50 text-white text-sm font-semibold rounded-xl transition"
              >
                {cacheResetting ? t('resettingCache') : t('resetAppCache')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Unsaved-changes confirmation dialog. Rendered when the user tries
          to navigate away (SPA or hard reload) with pending edits. */}
      {showPrompt && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="unsaved-title"
        >
          <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-6 space-y-4">
            <h3 id="unsaved-title" className="text-base font-semibold text-gray-900">
              {t('unsavedChangesTitle') || 'Unsaved changes'}
            </h3>
            <p className="text-sm text-gray-600">
              {t('unsavedChangesBody') || 'You have unsaved changes. Leave the page anyway?'}
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={cancelLeave}
                className="px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-100 rounded-xl transition"
              >
                {t('cancel') || 'Cancel'}
              </button>
              <button
                onClick={confirmLeave}
                className="px-4 py-2 text-sm font-semibold text-white bg-red-600 hover:bg-red-700 rounded-xl transition"
              >
                {t('leaveAnyway') || 'Leave anyway'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
