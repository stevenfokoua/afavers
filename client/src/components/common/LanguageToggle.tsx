import { useLanguage } from '../../store/languageStore';

export const LanguageToggle = () => {
  const { lang, setLang, t } = useLanguage();

  return (
    <div className="flex gap-0 border border-gray-200 rounded-lg overflow-hidden text-sm font-semibold bg-white">
      <button
        type="button"
        onClick={() => setLang('en')}
        aria-label={t('switchEnglish')}
        className={`px-2.5 py-1.5 transition ${
          lang === 'en'
            ? 'bg-blue-600 text-white'
            : 'bg-white text-gray-500 hover:bg-gray-50'
        }`}
        title={t('switchEnglish')}
      >
        🇬🇧
      </button>
      <div className="w-px bg-gray-200" />
      <button
        type="button"
        onClick={() => setLang('de')}
        aria-label={t('switchGerman')}
        className={`px-2.5 py-1.5 transition ${
          lang === 'de'
            ? 'bg-blue-600 text-white'
            : 'bg-white text-gray-500 hover:bg-gray-50'
        }`}
        title={t('switchGerman')}
      >
        🇩🇪
      </button>
    </div>
  );
};
