import {useCallback} from 'react';
import {useLanguage} from '../store/languageStore';
import type {Lang} from '../i18n/translations';
/** Route-owned copy stays in its lazy route chunk; shared labels stay global. */
export function usePageLanguage(messages:Record<Lang,Record<string,string>>){
  const {lang,setLang,t:sharedT}=useLanguage();
  const t=useCallback((key:string)=>messages[lang][key]??messages.en[key]??sharedT(key),[messages,lang,sharedT]);
  return {lang,setLang,t};
}
