import { confirmedWorkingLanguage } from './language.ts';

/** Lexical relevance shared by discovery, Hot Picks and priority email alerts.
 * Scores describe observable listing matches, not a probability of employment.
 */
export interface MatchListing {
  title?: string | null;
  company?: string | null;
  location?: string | null;
  description?: string | null;
  source?: string | null;
  language?: string | null;
  posted_date?: string | null;
  deadline?: string | null;
  is_active?: boolean;
  description_quality?: 'summary' | 'full' | null;
}

export type MatchLimitation = 'requirements_unavailable' | 'working_language_unknown';
export interface ListingMatch { score: number; reasons: string[]; gaps: string[]; limitations: MatchLimitation[] }
export const HIGH_MATCH_SCORE = 70;

const ALIASES: Readonly<Record<string, readonly string[]>> = {
  gis: ['qgis', 'arcgis', 'geoinformatik', 'geospatial', 'geomatics', 'geoinformation', 'cartography', 'kartografie'],
  geoinformatik: ['gis', 'qgis', 'arcgis', 'geospatial', 'geomatics', 'geoinformation'],
  geospatial: ['gis', 'qgis', 'arcgis', 'geoinformatik', 'geomatics', 'geoinformation'],
  it: ['information technology', 'informationstechnologie', 'informatik'],
  data: ['analytics', 'analysis', 'analyst', 'bi', 'business intelligence', 'datenanalyse'],
  'data analyst': ['datenanalyst', 'datenanalystin', 'datenanalyse'],
  'data analysis': ['datenanalyse'],
  werkstudent: ['werkstudentin', 'werkstudierende', 'working student', 'studentische', 'student assistant'],
  'working student': ['werkstudent', 'werkstudentin', 'werkstudierende', 'studentische'],
  praktikum: ['praktikant', 'praktikantin', 'internship'],
  internship: ['praktikum', 'praktikant', 'praktikantin'],
  consulting: ['consultant', 'consultants', 'beratung', 'berater', 'beraterin'],
  beratung: ['berater', 'beraterin', 'consulting', 'consultant'],
  energy: ['energie'],
  energie: ['energy'],
  engineer: ['engineers', 'engineering', 'ingenieur', 'ingenieurin'],
  'software engineer': ['softwareentwickler', 'softwareentwicklerin', 'softwareentwicklung'],
  developer: ['developers', 'entwickler', 'entwicklerin'],
  'node js': ['nodejs'],
  nodejs: ['node js'],
  cplusplus: ['cpp'],
  dotnet: ['dot net'],
};

// Deliberately bounded German word families; arbitrary substrings never match.
// Thus GIS does not match psychologischen and IT does not match Mitarbeit.
const WORD_FAMILIES: Readonly<Record<string, RegExp>> = {
  werkstudent: /^werkstudent(?:in|innen|en|entatigkeit|entatigkeiten)?$/,
  studentische: /^studentisch(?:e|en|er|es)?$/,
  praktikum: /^praktik(?:um|ant|antin|anten|antinnen)$/,
  umwelt: /^umwelt[a-z]+$/,
  energie: /^energie[a-z]+$/,
  nachhaltigkeit: /^nachhaltigkeit(?:s[a-z]+)?$/,
  software: /^software[a-z]+$/,
  informatik: /^informatik(?:er|erin|erinnen|studium|studiengang)?$/,
  ingenieur: /^(?:[a-z]+)?ingenieur(?:in|innen|e|wesen)?$/,
  beratung: /^(?:[a-z]+)?beratung(?:en|s[a-z]+)?$/,
  berater: /^(?:[a-z]+)?berater(?:in|innen)?$/,
  analyst: /^analyst(?:s|in|innen)?$/,
};

const REMOTE_TERMS = ['remote', 'homeoffice', 'home office', 'hybrid', 'mobiles arbeiten'];
const STUDENT_TERMS = ['werkstudent', 'working student', 'studentische', 'student assistant', 'praktikum', 'internship'];
const NRW_CITIES = ['dusseldorf', 'koln', 'essen', 'dortmund', 'bochum', 'bonn', 'wuppertal', 'duisburg', 'munster', 'aachen', 'bielefeld', 'hagen', 'hamm', 'herne', 'krefeld', 'monchengladbach', 'oberhausen', 'solingen', 'leverkusen', 'paderborn', 'gelsenkirchen', 'bottrop', 'remscheid', 'recklinghausen', 'gutersloh'];

const EVIDENCE_GROUPS = [
  ['gis', 'qgis', 'arcgis', 'geoinformatik', 'geospatial', 'geomatics', 'geoinformation'],
  ['it', 'information technology', 'informationstechnologie', 'informatik'],
  ['consulting', 'consultant', 'consultants', 'beratung', 'berater', 'beraterin'],
  ['energy', 'energie'], ['developer', 'developers', 'entwickler', 'entwicklerin'],
  ['engineer', 'engineers', 'engineering', 'ingenieur', 'ingenieurin'],
  ['werkstudent', 'werkstudentin', 'working student', 'studentische'],
  ['praktikum', 'praktikant', 'praktikantin', 'internship'],
];

/** Synonymous preferences contribute one concept rather than inflating relevance. */
function keywordEvidenceCount(hits: readonly string[]): number {
  return new Set(hits.map(hit => {
    const normalized = normalizeMatchText(hit);
    return EVIDENCE_GROUPS.find(group => group.includes(normalized))?.[0] ?? normalized;
  })).size;
}

export function hasDetailedDescription(job: MatchListing): boolean {
  const description = normalizeMatchText(job.description ?? '');
  if (!description || job.description_quality === 'summary' || /^position\s/.test(description)) return false;
  return description !== normalizeMatchText(job.title ?? '') && description.split(' ').length >= 20;
}

export function listingLimitations(job: MatchListing): MatchLimitation[] {
  const limitations: MatchLimitation[] = [];
  if (!hasDetailedDescription(job)) limitations.push('requirements_unavailable');
  if (!confirmedWorkingLanguage(job.description ?? '')) limitations.push('working_language_unknown');
  return limitations;
}

export function normalizeMatchText(value: string): string {
  return value
    .replace(/<[^>]*>/g, ' ')
    .replace(/&(?:nbsp|amp|quot|apos|lt|gt);/gi, ' ')
    .replace(/\bc\+\+/gi, ' cplusplus ')
    .replace(/\bc#/gi, ' csharp ')
    .replace(/\.net\b/gi, ' dotnet ')
    .toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/ß/g, 'ss')
    .replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

export function splitMatchTerms(value: string): string[] {
  const terms = new Map<string, string>();
  for (const term of value.split(',').map(item => item.trim().toLowerCase()).filter(Boolean)) {
    const key = normalizeMatchText(term);
    if (key && !terms.has(key)) terms.set(key, term);
  }
  return [...terms.values()];
}

/** Broad candidate terms for the database; listingSearchScore remains authoritative. */
export function expandedSearchTerms(query: string): string[] {
  const wanted = normalizeMatchText(query);
  if (!wanted) return [];
  const terms = new Set<string>();
  const add = (term: string) => {
    if (term.length > 100) throw new Error('Search terms are too long. Use a shorter role or keyword.');
    terms.add(term);
  };
  const groups = wanted.split(' ');
  if (wanted.length <= 100) add(wanted);
  for (const term of [...groups, wanted]) {
    if (term.length <= 100) add(term);
    for (const alias of ALIASES[term] ?? []) add(alias);
  }
  if (/\bc\+\+/i.test(query)) add('c++');
  if (/\bc#/i.test(query)) add('c#');
  if (/\.net\b/i.test(query)) add('.net');
  if (groups.some(term => term.length > 100) || terms.size > 64) throw new Error('Search is too broad. Use fewer role or skill terms.');
  return [...terms];
}

function hasLiteral(text: string, term: string): boolean {
  return Boolean(term) && ` ${text} `.includes(` ${term} `);
}

function hasNormalizedTerm(text: string, term: string): boolean {
  if (hasLiteral(text, term)) return true;
  const family = WORD_FAMILIES[term];
  return Boolean(family && text.split(' ').some(word => family.test(word)));
}

function normalizedTermMatches(text: string, term: string): boolean {
  return hasNormalizedTerm(text, term) || (ALIASES[term] ?? []).some(alias => hasNormalizedTerm(text, alias));
}

/** Match a whole word/phrase, documented alias or deliberate compound family. */
export function matchesJobTerm(text: string, term: string): boolean {
  return normalizedTermMatches(normalizeMatchText(text), normalizeMatchText(term));
}

export function keywordMatches(text: string, terms: readonly string[]): string[] {
  const normalized = normalizeMatchText(text);
  return splitMatchTerms(terms.join(',')).filter(term => {
    const wanted = normalizeMatchText(term);
    return normalizedTermMatches(normalized, wanted) && (!REMOTE_TERMS.includes(wanted) || isRemoteListing({ description: text }));
  });
}

function locationText(value: string): string {
  return normalizeMatchText(value)
    .replace(/\bduesseldorf\b/g, 'dusseldorf').replace(/\bkoeln\b/g, 'koln')
    .replace(/\bmuenchen\b/g, 'munchen').replace(/\bmuenster\b/g, 'munster')
    .replace(/\bmoenchengladbach\b/g, 'monchengladbach').replace(/\bguetersloh\b/g, 'gutersloh');
}

export function matchesJobLocation(location: string | null | undefined, term: string): boolean {
  const text = locationText(location ?? '');
  const wanted = locationText(term);
  if (hasLiteral(text, wanted)) return true;
  return ['nrw', 'nordrhein westfalen'].includes(wanted) &&
    ['nrw', 'nordrhein westfalen', ...NRW_CITIES].some(city => hasLiteral(text, city));
}

/** Do not advertise explicitly unavailable remote work as a benefit. */
export function isRemoteListing(job: MatchListing): boolean {
  const clauses = `${job.title ?? ''} ${job.location ?? ''} ${job.description ?? ''}`.split(/[;.!?,\n]+|\b(?:but|aber|jedoch)\b/i).map(normalizeMatchText);
  return clauses.some(text => REMOTE_TERMS.some(term => {
    const pattern = new RegExp(`(?:^| )${term}(?= |$)`, 'g');
    for (const match of text.matchAll(pattern)) {
      const prefix = text.slice(0, match.index).split(' ').slice(-4).join(' ');
      const suffix = text.slice(match.index + match[0].length).split(' ').slice(0, 5).join(' ');
      if (/(?:\bno|\bnot|\bkein|\bkeine|\bkeinen|\bohne)(?: [a-z]+){0,2}$/.test(prefix)) continue;
      if (/^(?:\s*(?:work|working|arbeit|arbeiten|ist|is|sind))*\s+(?:not|nicht|kein|keine)\b/.test(suffix)) continue;
      return true;
    }
    return false;
  }));
}

export function isStudentListing(job: MatchListing): boolean {
  return keywordMatches(`${job.title ?? ''} ${job.description ?? ''}`, STUDENT_TERMS).length > 0;
}

function isSeniorTitle(value: string | null | undefined): boolean {
  const title = normalizeMatchText(value ?? '');
  return ['senior', 'lead', 'principal', 'director', 'head of'].some(term => hasLiteral(title, term)) ||
    title.split(' ').some(word => /^(?:projekt|team|abteilungs|bereichs|gruppen|bau|betriebs|niederlassungs|geschafts)?(?:leiter|leiterin|leitung)$/.test(word));
}

export function scoreListing(job: MatchListing, keywords: readonly string[], locations: readonly string[], now = Date.now()): ListingMatch {
  const text = `${job.title ?? ''} ${job.company ?? ''} ${job.location ?? ''} ${job.description ?? ''}`;
  const reasons: string[] = [], gaps: string[] = [];
  const uniqueKeywords = splitMatchTerms(keywords.join(','));
  const keywordHits = keywordMatches(text, uniqueKeywords);
  const locationHits = splitMatchTerms(locations.join(',')).filter(term => matchesJobLocation(job.location, term));
  const remote = isRemoteListing(job);
  const limitations = listingLimitations(job);
  const workingLanguage = confirmedWorkingLanguage(job.description ?? '');
  let score = 20;
  if (keywordHits.length) { score += Math.min(35, keywordEvidenceCount(keywordHits) * 12); reasons.push(`Keyword: ${keywordHits.slice(0, 2).join(', ')}`); }
  else if (uniqueKeywords.length) gaps.push('No saved keyword hit');
  if (locationHits.length) { score += 20; reasons.push(`Location: ${locationHits[0]}`); }
  else if (locations.length && !remote) gaps.push('Outside your saved cities');
  if (workingLanguage === 'en') { score += 10; reasons.push('Working language stated: English'); }
  else if (uniqueKeywords.some(term => matchesJobTerm(term, 'english')) && workingLanguage === 'de') gaps.push('German is required or stated as the working language');
  if (remote) { score += 10; reasons.push('Remote-friendly'); }
  if (isStudentListing(job)) { score += 8; reasons.push('Werkstudent'); }
  if (isSeniorTitle(job.title) && uniqueKeywords.some(term => ['junior', 'entry', 'werkstudent', 'praktikum', 'internship'].some(level => matchesJobTerm(term, level)))) {
    score -= 8; gaps.push('May be senior-level');
  }
  const posted = job.posted_date ? Date.parse(job.posted_date) : Number.NaN;
  const deadline = job.deadline ? Date.parse(job.deadline) : Number.NaN;
  const expired = Number.isFinite(deadline) && new Date(deadline).toISOString().slice(0, 10) < new Date(now).toISOString().slice(0, 10);
  const ageDays = Math.floor((now - posted) / 86400000);
  if (job.is_active !== false && !expired && Number.isFinite(ageDays) && ageDays >= 0) {
    if (ageDays <= 7) { score += 10; reasons.push('Fresh'); }
    else if (ageDays <= 30) score += 5;
  }
  // Metadata bonuses cannot make a listing a strong match when an explicit
  // search criterion is missing. Keep the explanatory gaps visible in the UI.
  if ((uniqueKeywords.length > 0 && keywordHits.length === 0) || (locations.length > 0 && locationHits.length === 0 && !remote)) score = Math.min(score, HIGH_MATCH_SCORE - 1);
  if (limitations.includes('requirements_unavailable')) score = Math.min(score, HIGH_MATCH_SCORE - 1);
  return { score: Math.max(0, Math.min(100, score)), reasons: reasons.slice(0, 5), gaps: gaps.slice(0, 3), limitations };
}

/** Text search requires all query words (or a complete phrase alias), with
 * direct title hits ahead of supporting description mentions. */
export function listingSearchScore(job: MatchListing, query: string): number {
  const wanted = normalizeMatchText(query);
  if (!wanted) return 0;
  const fields = [job.title, job.company, job.location, job.description, job.source].map(value => normalizeMatchText(value ?? ''));
  const combined = fields.join(' ');
  const groups = wanted.split(' ');
  if (!normalizedTermMatches(combined, wanted) && !groups.every(term => normalizedTermMatches(combined, term))) return 0;
  let score = 0;
  const weights = [90, 40, 35, 25, 10];
  fields.forEach((field, index) => {
    if (hasLiteral(field, wanted)) score += weights[index];
    else if (normalizedTermMatches(field, wanted)) score += weights[index] * .65;
    for (const term of groups) {
      if (hasLiteral(field, term)) score += weights[index] * .5;
      else if (normalizedTermMatches(field, term)) score += weights[index] * .3;
    }
  });
  if (fields[0] === wanted) score += 150;
  // Explicit GIS product names are closer lexical hits than the broad family.
  if (wanted === 'gis' && ['arcgis', 'qgis'].some(term => hasLiteral(fields[0], term))) score += 20;
  return score;
}
