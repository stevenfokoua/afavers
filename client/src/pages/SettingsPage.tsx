import { useState, useEffect, useMemo } from 'react';
import { AccountSyncStatus } from '../components/common/AccountSyncStatus';
import { settingsService, type Settings } from '../services/settings.service';
import { DEFAULT_JOB_ALERT, jobAlertsService, type JobAlert, type JobAlertFrequency } from '../services/jobAlerts.service';
import { supabase } from '../lib/supabase';
import {usePageLanguage} from '../hooks/usePageLanguage';
import {messages} from '../i18n/SettingsPage';
import { useAuthStore } from '../store/authStore';
import { usePreferencesStore, ALL_NEWS_TOPICS, type NewsTopic } from '../store/preferencesStore';
import { useDirtyNavigation } from '../hooks/useDirtyNavigation';
import { refreshAppCache } from '../utils/cacheRecovery';
const FEED_PRESETS = [{
  label: 'Tech / IT',
  kw: ['developer', 'software engineer', 'data analyst', 'DevOps', 'IT']
}, {
  label: 'Environment',
  kw: ['umwelt', 'klimaschutz', 'nachhaltigkeit', 'GIS', 'energie']
}, {
  label: 'Business',
  kw: ['consulting', 'beratung', 'project manager', 'finance', 'accounting']
}, {
  label: 'Healthcare',
  kw: ['nurse', 'Pflegefachkraft', 'doctor', 'Arzt', 'medical']
}, {
  label: 'Engineering',
  kw: ['Ingenieur', 'engineer', 'mechanical', 'electrical', 'civil']
}, {
  label: 'Marketing',
  kw: ['marketing', 'social media', 'SEO', 'content', 'brand']
}];
function normalizeCommaList(value: string): string {
  return value.split(',').map(item => item.trim()).filter(Boolean).join(', ');
}
export const SettingsPage = () => {
  const {
    t,
    lang
  } = usePageLanguage(messages);
  const isDemo = useAuthStore(s => s.isDemo);
  const [settings, setSettings] = useState<Settings>({
    keywords: '',
    locations: ''
  });
  const [jobAlert, setJobAlert] = useState<JobAlert>(DEFAULT_JOB_ALERT);
  // Snapshot of the last-saved settings — used to detect unsaved edits.
  const [savedSnapshot, setSavedSnapshot] = useState<Settings>({
    keywords: '',
    locations: ''
  });
  const [savedAlertSnapshot, setSavedAlertSnapshot] = useState<JobAlert>(DEFAULT_JOB_ALERT);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const isDirty = useMemo(() => settings.keywords !== savedSnapshot.keywords || settings.locations !== savedSnapshot.locations || jobAlert.enabled !== savedAlertSnapshot.enabled || jobAlert.keywords !== savedAlertSnapshot.keywords || jobAlert.locations !== savedAlertSnapshot.locations || jobAlert.min_score !== savedAlertSnapshot.min_score || jobAlert.frequency !== savedAlertSnapshot.frequency, [settings, savedSnapshot, jobAlert, savedAlertSnapshot]);
  const setDirtyNavigation = useDirtyNavigation();
  useEffect(() => {
    setDirtyNavigation(isDirty, false);
    return () => setDirtyNavigation(false);
  }, [isDirty, setDirtyNavigation]);
  const [pwForm, setPwForm] = useState({
    current: '',
    next: '',
    confirm: ''
  });
  const [pwSaving, setPwSaving] = useState(false);
  const [cacheResetting, setCacheResetting] = useState(false);
  const [pwMsg, setPwMsg] = useState<{
    text: string;
    ok: boolean;
  } | null>(null);

  // Feed filter preferences (local, persisted)
  const {
    filterKeywords,
    filterEnabled,
    setFilterKeywords,
    setFilterEnabled,
    newsOnDashboard,
    newsTopics,
    setNewsOnDashboard,
    setNewsTopics
  } = usePreferencesStore();
  const [feedInput, setFeedInput] = useState('');
  const handleChangePassword = async () => {
    setPwMsg(null);
    if (pwForm.next !== pwForm.confirm) {
      setPwMsg({
        text: t('pwMismatch'),
        ok: false
      });
      return;
    }
    if (pwForm.next.length < 8) {
      setPwMsg({
        text: t('pwTooShort'),
        ok: false
      });
      return;
    }
    setPwSaving(true);
    try {
      const email = useAuthStore.getState().user?.email;
      if (!email) throw new Error('You need to sign in again.');
      const current = await supabase.auth.signInWithPassword({
        email,
        password: pwForm.current
      });
      if (current.error) throw current.error;
      const {
        error
      } = await supabase.auth.updateUser({
        password: pwForm.next
      });
      if (error) throw error;
      setPwMsg({
        text: t('pwChanged'),
        ok: true
      });
      setPwForm({
        current: '',
        next: '',
        confirm: ''
      });
    } catch (err) {
      setPwMsg({
        text: err instanceof Error ? err.message : t('pwChangeFailed'),
        ok: false
      });
    } finally {
      setPwSaving(false);
    }
  };
  useEffect(() => {
    Promise.all([settingsService.get(), jobAlertsService.getPrimary()]).then(([data, alert]) => {
      setSettings(data);
      setSavedSnapshot(data);
      setJobAlert(current => ({
        ...alert,
        keywords: alert.keywords || data.keywords || current.keywords,
        locations: alert.locations || data.locations || current.locations
      }));
      setSavedAlertSnapshot(current => ({
        ...alert,
        keywords: alert.keywords || data.keywords || current.keywords,
        locations: alert.locations || data.locations || current.locations
      }));
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);
  const handleSave = async () => {
    const normalizedSettings = {
      keywords: normalizeCommaList(settings.keywords),
      locations: normalizeCommaList(settings.locations)
    };
    const normalizedAlert = {
      ...jobAlert,
      keywords: normalizeCommaList(jobAlert.keywords),
      locations: normalizeCommaList(jobAlert.locations)
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
        setError(lang === 'de' ? 'Deine Suchbegriffe wurden gespeichert, aber die E-Mail-Benachrichtigungen konnten nicht aktualisiert werden.' : 'Your search settings were saved, but priority email alerts could not be updated.');
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
  return <div className="px-6 py-8 max-w-3xl mx-auto">
      {/* Page title */}
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-ink">{t('settings')}</h1>
        <p className="text-sm text-muted mt-1">{t('settingsSubtitle')}</p>
      </div>

      {loading ? <div className="text-center py-16">
          <p role="status">{t('loading')}</p>
        </div> : <div className="space-y-6">
          {/* Info banner */}
          <div className="bg-subtle border border-line rounded-lg p-4 text-sm text-muted flex gap-3">
            
            <div>
              <strong>{t('howItWorks')}</strong> {t('settingsInfo')}
            </div>
          </div>

          <div className="settings-groups">
          <div className="settings-group space-y-3"><h2 className="text-base font-semibold text-ink">{lang === 'de' ? 'Kontosynchronisierung' : 'Account sync'}</h2><p className="text-sm text-muted">{lang === 'de' ? 'Gespeicherte Suchen, Erinnerungen und eigene Kalendereinträge werden zwischen deinen Geräten synchronisiert. Ausstehende Offline-Änderungen bleiben auf diesem Gerät, bis eine Verbindung besteht.' : 'Saved searches, reminders and custom calendar entries sync between your devices. Pending offline changes stay on this device until a connection is available.'}</p>{([['saved_searches',lang === 'de' ? 'Gespeicherte Suchen' : 'Saved searches'],['reminders',lang === 'de' ? 'Erinnerungen' : 'Reminders'],['calendar_events',lang === 'de' ? 'Kalender' : 'Calendar']] as const).map(([collection,label]) => <div key={collection}><h3 className="text-sm">{label}</h3><AccountSyncStatus collection={collection} compact /></div>)}</div>
          {/* Search settings */}
          <div className="settings-group space-y-5">
            <h2 className="text-base font-semibold text-ink">{t('searchSettings')}</h2>

            <div>
              <label className="block text-sm font-semibold text-ink mb-1" htmlFor="settings-field-1">{t('keywords')}</label>
              <p className="text-xs text-muted mb-2">{t('keywordsDesc')}</p>
              <textarea rows={3} value={settings.keywords} onChange={e => setSettings(s => ({
            ...s,
            keywords: e.target.value
          }))} className="w-full px-4 py-3 border border-line rounded-lg focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:border-transparent outline-none text-sm resize-none bg-surface" placeholder={t('keywordsPlaceholder')} id="settings-field-1" />
            </div>

            <div>
              <label className="block text-sm font-semibold text-ink mb-1" htmlFor="settings-field-2">{t('locations')}</label>
              <p className="text-xs text-muted mb-2">{t('locationsDesc')}</p>
              <textarea rows={2} value={settings.locations} onChange={e => setSettings(s => ({
            ...s,
            locations: e.target.value
          }))} className="w-full px-4 py-3 border border-line rounded-lg focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:border-transparent outline-none text-sm resize-none bg-surface" placeholder={t('locationsPlaceholder')} id="settings-field-2" />
            </div>

            {error && <p className="text-sm text-danger">{error}</p>}

            <div className="flex justify-between items-center pt-1">
              <span aria-hidden={!saved} className={`text-sm transition ${saved ? 'text-accent' : 'text-transparent'}`}>
                ✓ {t('settingsSaved')}
              </span>
              <button onClick={handleSave} disabled={saving || isDemo} title={isDemo ? t('notAvailableDemo') : undefined} className="px-6 py-2.5 bg-ink hover:bg-ink disabled:opacity-50 text-on-ink text-sm font-semibold rounded-lg transition">
                {saving ? t('saving') : t('saveSettings')}
              </button>
            </div>
          </div>

          {/* Priority Email Alerts */}
          <div className="settings-group space-y-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-base font-semibold text-ink">{t('priorityAlerts')}</h2>
                <p className="text-xs text-muted mt-0.5">
                  {t('priorityAlertsDesc')}
                </p>
              </div>
              <button onClick={() => setJobAlert(alert => ({
            ...alert,
            enabled: !alert.enabled
          }))} className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-md transition-colors ${jobAlert.enabled ? 'bg-ink' : 'bg-line'}`} role="switch" aria-checked={jobAlert.enabled} aria-label={t('priorityAlerts')}>
                <span className={`inline-block h-4 w-4 transform rounded-md bg-surface shadow-none transition-colors ${jobAlert.enabled ? 'translate-x-6' : 'translate-x-1'}`} />
              </button>
            </div>

            <div className="bg-subtle border border-line rounded-lg p-4 text-sm text-muted">
              <strong>{t('priorityAlertsExample')}</strong> {t('priorityAlertsExampleText')}
            </div>

            <div>
              <label className="block text-sm font-semibold text-ink mb-1" htmlFor="settings-field-3">{t('alertKeywords')}</label>
              <p className="text-xs text-muted mb-2">{t('alertKeywordsDesc')}</p>
              <textarea rows={3} value={jobAlert.keywords} onChange={e => setJobAlert(alert => ({
            ...alert,
            keywords: e.target.value
          }))} className="w-full px-4 py-3 border border-line rounded-lg focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:border-transparent outline-none text-sm resize-none bg-surface" placeholder="werkstudent, IT, GIS, data analyst, data analysis" id="settings-field-3" />
            </div>

            <div>
              <label className="block text-sm font-semibold text-ink mb-1" htmlFor="settings-field-4">{t('alertLocations')}</label>
              <p className="text-xs text-muted mb-2">{t('alertLocationsDesc')}</p>
              <textarea rows={2} value={jobAlert.locations} onChange={e => setJobAlert(alert => ({
            ...alert,
            locations: e.target.value
          }))} className="w-full px-4 py-3 border border-line rounded-lg focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:border-transparent outline-none text-sm resize-none bg-surface" placeholder="NRW, Düsseldorf, Köln, Essen, Dortmund, Bochum" id="settings-field-4" />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-ink mb-1" htmlFor="settings-field-5">{t('howOften')}</label>
                <select value={jobAlert.frequency} onChange={e => setJobAlert(alert => ({
              ...alert,
              frequency: e.target.value as JobAlertFrequency
            }))} className="w-full px-4 py-2.5 border border-line rounded-lg text-sm bg-surface outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:border-transparent" id="settings-field-5">
                  <option value="instant">{t('everyJobFetch')}</option>
                  <option value="daily">{t('dailyDigest')}</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-semibold text-ink mb-1" htmlFor="settings-field-6">{t('minimumMatch')}</label>
                <select value={jobAlert.min_score} onChange={e => setJobAlert(alert => ({
              ...alert,
              min_score: Number(e.target.value)
            }))} className="w-full px-4 py-2.5 border border-line rounded-lg text-sm bg-surface outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:border-transparent" id="settings-field-6">
                  <option value={65}>{t('goodMatchAbove')}</option>
                  <option value={70}>{t('highMatchAbove')}</option>
                  <option value={80}>{t('veryHighMatchOnly')}</option>
                </select>
              </div>
            </div>

            {jobAlert.last_sent_at && <p className="text-xs text-muted">
                {t('lastAlertSent')} {new Date(jobAlert.last_sent_at).toLocaleString()}.
              </p>}
          </div>

          {/* Keyword presets */}
          <div className="settings-group">
            <h2 className="text-base font-semibold text-ink mb-4">{t('keywordIdeas')}</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {[{
            field: 'Tech / IT',
            icon: '',
            kw: 'developer, software engineer, data analyst, DevOps, IT'
          }, {
            field: 'Environment',
            icon: '',
            kw: 'umwelt, klimaschutz, nachhaltigkeit, GIS, energie'
          }, {
            field: 'Business',
            icon: '',
            kw: 'consulting, beratung, project manager, finance, accounting'
          }, {
            field: 'Healthcare',
            icon: '',
            kw: 'nurse, Pflegefachkraft, doctor, Arzt, medical'
          }, {
            field: 'Engineering',
            icon: '',
            kw: 'Ingenieur, engineer, mechanical, electrical, civil'
          }, {
            field: 'Marketing',
            icon: '',
            kw: 'marketing, social media, SEO, content, brand'
          }].map(({
            field,
            icon,
            kw
          }) => <button key={field} onClick={() => setSettings(s => ({
            ...s,
            keywords: kw
          }))} className="text-left px-4 py-3 rounded-lg border border-line hover:border-line hover:bg-subtle transition group">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span>{icon}</span>
                    <span className="font-semibold text-sm text-ink group-hover:text-muted">{field}</span>
                  </div>
                  <p className="text-xs text-muted truncate">{kw}</p>
                </button>)}
            </div>
          </div>

          {/* Job Feed Filters */}
          <div className="settings-group space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-base font-semibold text-ink">{t('jobFeedFilters')}</h2>
                <p className="text-xs text-muted mt-0.5">{t('jobFeedFiltersDesc')}</p>
              </div>
              {/* Toggle */}
              <button onClick={() => setFilterEnabled(!filterEnabled)} className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-md transition-colors ${filterEnabled ? 'bg-ink' : 'bg-line'}`} aria-label="Toggle feed filter">
                <span className={`inline-block h-4 w-4 transform rounded-md bg-surface shadow-none transition-colors ${filterEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
              </button>
            </div>

            {/* Keyword tags */}
            <div>
              <p className="text-xs text-muted mb-2">
                {filterEnabled && filterKeywords.length === 0 ? t('addKeywordHint') : filterEnabled ? t('filterEnabledHint') : t('filterDisabledHint')}
              </p>
              <div className="flex flex-wrap gap-2 mb-3">
                {filterKeywords.map(kw => <span key={kw} className="flex items-center gap-1.5 px-3 py-1 bg-subtle border border-line text-accent text-xs font-medium rounded-md">
                    {kw}
                    <button onClick={() => setFilterKeywords(filterKeywords.filter(k => k !== kw))} className="text-accent hover:text-accent transition leading-none" aria-label={`Remove ${kw}`}>
                      ×
                    </button>
                  </span>)}
                {filterKeywords.length === 0 && <span className="text-xs text-muted italic">{t('noKeywordsYet')}</span>}
              </div>
              {/* Add keyword input */}
              <div className="flex gap-2">
                <input type="text" value={feedInput} onChange={e => setFeedInput(e.target.value)} onKeyDown={e => {
              if ((e.key === 'Enter' || e.key === ',') && feedInput.trim()) {
                e.preventDefault();
                const kw = feedInput.trim().replace(/,$/, '');
                if (kw && !filterKeywords.includes(kw)) {
                  setFilterKeywords([...filterKeywords, kw]);
                }
                setFeedInput('');
              }
            }} placeholder={t('typeKeywordEnter')} className="flex-1 px-4 py-2.5 border border-line rounded-lg text-sm outline-none focus-visible:ring-2 focus-visible:ring-green-500 focus-visible:border-transparent bg-surface" />
                <button onClick={() => {
              const kw = feedInput.trim();
              if (kw && !filterKeywords.includes(kw)) {
                setFilterKeywords([...filterKeywords, kw]);
              }
              setFeedInput('');
            }} disabled={!feedInput.trim()} className="px-4 py-2.5 bg-ink hover:bg-ink disabled:opacity-40 text-on-ink text-sm font-semibold rounded-lg transition">
                  {t('add')}
                </button>
              </div>
            </div>

            {/* Quick-add presets */}
            <div>
              <p className="text-xs font-semibold text-muted uppercase tracking-wide mb-2">{t('quickAddPreset')}</p>
              <div className="flex flex-wrap gap-2">
                {FEED_PRESETS.map(({
              label,
              kw
            }) => <button key={label} onClick={() => {
              const toAdd = kw.filter(k => !filterKeywords.includes(k));
              if (toAdd.length) setFilterKeywords([...filterKeywords, ...toAdd]);
              setFilterEnabled(true);
            }} className="px-3 py-1.5 text-xs font-medium rounded-lg border border-line hover:border-line hover:bg-subtle text-ink hover:text-accent transition">
                    {label}
                  </button>)}
                {filterKeywords.length > 0 && <button onClick={() => setFilterKeywords([])} className="px-3 py-1.5 text-xs font-medium rounded-lg border border-line bg-danger-soft text-danger hover:bg-danger-soft transition">
                    {t('clearAll')}
                  </button>}
              </div>
            </div>
          </div>

          {/* News Preferences */}
          <div className="settings-group space-y-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-base font-semibold text-ink">{t('newsPreferences')}</h2>
                <p className="text-xs text-muted mt-0.5">{t('newsPreferencesDesc')}</p>
              </div>
            </div>

            {/* Show on dashboard toggle */}
            <div className="flex items-center justify-between gap-4 py-1">
              <div>
                <p className="text-sm font-medium text-ink">{t('showNewsDashboard')}</p>
                <p className="text-xs text-muted mt-0.5">{t('showNewsDashboardDesc')}</p>
              </div>
              <button onClick={() => setNewsOnDashboard(!newsOnDashboard)} className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-md transition-colors ${newsOnDashboard ? 'bg-ink' : 'bg-line'}`} role="switch" aria-checked={newsOnDashboard} aria-label={t('showNewsDashboard')}>
                <span className={`inline-block h-4 w-4 transform rounded-md bg-surface shadow-none transition-colors ${newsOnDashboard ? 'translate-x-6' : 'translate-x-1'}`} />
              </button>
            </div>

            {/* Topic selection */}
            <div>
              <p className="text-xs font-semibold text-muted uppercase tracking-wide mb-3">{t('topicsToShow')}</p>
              <p className="text-xs text-muted mb-3">
                {newsTopics.length === 0 ? t('allTopicsShown') : `${newsTopics.length} ${t('selectedTopics')}`}
              </p>
              <div className="space-y-2">
                {ALL_NEWS_TOPICS.map(({
              key,
              label,
              desc
            }) => {
              const selected = newsTopics.includes(key);
              return <button key={key} onClick={() => {
                const next = selected ? newsTopics.filter(t => t !== key) : [...newsTopics, key] as NewsTopic[];
                setNewsTopics(next);
              }} className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg border text-left transition-colors ${selected ? 'border-line bg-subtle text-accent' : 'border-line bg-surface text-ink hover:border-line hover:bg-canvas'}`}>
                      
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold">{label}</p>
                        <p className="text-xs text-muted mt-0.5">{desc}</p>
                      </div>
                      <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-colors ${selected ? 'border-line bg-ink' : 'border-line'}`}>
                        {selected && <svg className="w-3 h-3 text-on-ink" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                          </svg>}
                      </div>
                    </button>;
            })}
              </div>
              {newsTopics.length > 0 && <button onClick={() => setNewsTopics([])} className="mt-3 text-xs text-muted hover:text-muted transition">
                  {t('clearSelectionShowAll')}
                </button>}
            </div>
          </div>

          {/* Change Password */}
          <div className="settings-group space-y-4">
            <h2 className="text-base font-semibold text-ink">{t('changePassword')}</h2>
            {[{
          key: 'current',
          labelKey: 'currentPassword',
          placeholder: '••••••••'
        }, {
          key: 'next',
          labelKey: 'newPassword',
          placeholderKey: 'minCharsHint'
        }, {
          key: 'confirm',
          labelKey: 'confirmNewPassword',
          placeholder: '••••••••'
        }].map(f => <div key={f.key}>
                <label className="block text-sm font-medium text-muted mb-1" htmlFor={`settings-password-${f.key}`}>{t(f.labelKey)}</label>
                <input type="password" value={pwForm[f.key as keyof typeof pwForm]} onChange={e => setPwForm(prev => ({
            ...prev,
            [f.key]: e.target.value
          }))} className="w-full px-4 py-2.5 border border-line rounded-lg focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:border-transparent outline-none text-sm bg-surface" placeholder={f.placeholderKey ? t(f.placeholderKey) : f.placeholder} id={`settings-password-${f.key}`} />
              </div>)}
            {pwMsg && <p className={`text-sm ${pwMsg.ok ? 'text-accent' : 'text-danger'}`}>{pwMsg.text}</p>}
            <div className="flex justify-end pt-1">
              <button onClick={handleChangePassword} disabled={pwSaving || !pwForm.current || !pwForm.next || !pwForm.confirm || isDemo} title={isDemo ? t('notAvailableDemo') : undefined} className="px-6 py-2.5 bg-ink hover:bg-ink disabled:opacity-40 text-on-ink text-sm font-semibold rounded-lg transition">
                {pwSaving ? t('saving') : t('updatePassword')}
              </button>
            </div>
          </div>

          {/* App recovery */}
          <div className="settings-group space-y-4">
            <div>
              <h2 className="text-base font-semibold text-ink">{t('appRecovery')}</h2>
              <p className="text-xs text-muted mt-0.5">{t('appRecoveryDesc')}</p>
            </div>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <p className="text-xs text-muted">{t('resetAppCacheNote')}</p>
              <button type="button" onClick={() => {
            setCacheResetting(true);
            refreshAppCache();
          }} disabled={cacheResetting} className="px-5 py-2.5 bg-ink hover:bg-ink disabled:opacity-50 text-on-ink text-sm font-semibold rounded-lg transition">
                {cacheResetting ? t('resettingCache') : t('resetAppCache')}
              </button>
            </div>
          </div>
          </div>
        </div>}


    </div>;
};
