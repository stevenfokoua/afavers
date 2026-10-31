/** A translated or English-sounding title is not evidence of the working language. */
export function confirmedWorkingLanguage(description = ''): 'en' | 'de' | null {
  const text = description.replace(/<[^>]*>/g, '\n').toLowerCase();
  const clauses = text.split(/[.!?;\n]+/).map(clause => clause.replace(/\s+/g, ' '));
  const germanRequired = clauses.some(clause =>
    !/nicht erforderlich|nicht notwendig|not required|optional|nice to have|von vorteil|wünschenswert/.test(clause) &&
    /(?:sehr gute|verhandlungssichere|fließende|fliessende|fluent|excellent|business fluent)\s+(?:deutsche?(?: sprach)?kenntnisse|deutsch(?:kenntnisse)?|german)|deutsch(?:e sprachkenntnisse|kenntnisse)?[^,]{0,70}(?:c1|c2|erforderlich|voraussetzung)|german[^,]{0,40}(?:c1|c2|required)/.test(clause));
  const explicitGerman = clauses.some(clause => !/\bnot\b|\bnicht\b|\bkeine?\b/.test(clause) && /(?:arbeits|unternehmens|team)sprache\s*(?:ist|:)?.{0,10}\bdeutsch\b|(?:working|company|team) language\s*(?:is|:)?.{0,10}\bgerman\b/.test(clause));
  if (germanRequired || explicitGerman) return 'de';
  const explicitEnglish = clauses.some(clause =>
    !/(?:not|no|kein(?:e)?)\s+(?:an?\s+)?english(?:[- ]speaking)?|english[^,]{0,25}not (?:our|the) (?:working|company) language/.test(clause) &&
    /(?:working|business|company|team|primary) language\s*(?:is|:)?.{0,10}\benglish\b|(?:arbeits|unternehmens|team)sprache\s*(?:ist|:)?.{0,10}\benglisch\b|english\s+(?:is\s+)?(?:our|the)\s+(?:working|company|team) language|work(?:ing)?\s+(?:(?:mainly|primarily|entirely)\s+)?in english|english[- ]speaking\s+(?:team|workplace|environment)/.test(clause));
  return explicitEnglish ? 'en' : null;
}

/** Compatibility for importers; title is deliberately ignored. */
export function detectLanguage(_title: string, description = ''): 'en' | 'de' | null {
  return confirmedWorkingLanguage(description);
}
