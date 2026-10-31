import { useLanguage } from '../../store/languageStore';

export const LanguageToggle = () => {
  const { lang, setLang, t } = useLanguage();

  return (
    <div className="flex gap-0 border border-line rounded-lg overflow-hidden text-sm font-semibold bg-surface">
      <button
        type="button"
        onClick={() => setLang('en')}
        aria-label={t('switchEnglish')}
        className={`px-2.5 py-1.5 transition ${
          lang === 'en'
            ? 'bg-ink text-on-ink'
            : 'bg-surface text-muted hover:bg-canvas'
        }`}
        title={t('switchEnglish')}
      >
        EN
      </button>
      <div className="w-px bg-line" />
      <button
        type="button"
        onClick={() => setLang('de')}
        aria-label={t('switchGerman')}
        className={`px-2.5 py-1.5 transition ${
          lang === 'de'
            ? 'bg-ink text-on-ink'
            : 'bg-surface text-muted hover:bg-canvas'
        }`}
        title={t('switchGerman')}
      >
        DE
      </button>
    </div>
  );
};
