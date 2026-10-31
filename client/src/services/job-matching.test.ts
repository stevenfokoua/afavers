import { describe, expect, it } from 'vitest';
import { isRemoteListing, isStudentListing, keywordMatches, listingSearchScore, matchesJobLocation, matchesJobTerm, scoreListing, splitMatchTerms } from '../../../supabase/functions/_shared/matching';
import { jobMatchesFilter } from '../store/preferencesStore';

const now = Date.parse('2026-10-31T12:00:00Z');
const role = { title: 'GIS Analyst', company: 'Example', location: 'Köln', description: 'QGIS, ArcGIS and spatial data analysis.', language: 'en', posted_date: '2026-10-31' };

describe('lexical job matching', () => {
  it('does not mistake short keywords for letters inside unrelated words', () => {
    expect(matchesJobTerm('Psychologischen Studienberatung', 'GIS')).toBe(false);
    expect(matchesJobTerm('Mitarbeit im Vertrieb und Logistik', 'IT')).toBe(false);
    expect(matchesJobTerm('Candidate for finance position', 'data')).toBe(false);
    expect(matchesJobTerm('Biomedical sales', 'BI')).toBe(false);
  });
  it('recognizes whole acronyms, punctuation boundaries and explicit GIS family names', () => {
    for (const title of ['GIS-Spezialist', 'QGIS specialist', 'ArcGIS Analyst', 'Geoinformatik', 'geospatial engineer']) expect(matchesJobTerm(title, 'GIS')).toBe(true);
    expect(matchesJobTerm('IT-Berater', 'IT')).toBe(true);
    expect(matchesJobTerm('Information technology consultant', 'IT')).toBe(true);
  });
  it('supports deliberate German compound families and English equivalents', () => {
    expect(matchesJobTerm('Umweltplaner / Umweltingenieur', 'umwelt')).toBe(true);
    expect(matchesJobTerm('Energiewirtschaft', 'energy')).toBe(true);
    expect(matchesJobTerm('Nachhaltigkeitsmanagement', 'nachhaltigkeit')).toBe(true);
    expect(matchesJobTerm('Unternehmensberatung', 'consulting')).toBe(true);
    expect(matchesJobTerm('Datenanalystin', 'data analyst')).toBe(true);
    expect(isStudentListing({ title: 'Werkstudentin Geoinformatik' })).toBe(true);
  });
  it('retains technical language identifiers without conflating C, C++ and C#', () => {
    expect(matchesJobTerm('C++ Entwickler', 'C++')).toBe(true);
    expect(matchesJobTerm('C# developer', 'C#')).toBe(true);
    expect(matchesJobTerm('.NET developer', '.NET')).toBe(true);
    expect(matchesJobTerm('C developer', 'C++')).toBe(false);
    expect(matchesJobTerm('C++ developer', 'C#')).toBe(false);
  });
  it('matches phrases across harmless punctuation and not unrelated separated words', () => {
    expect(matchesJobTerm('Business-Intelligence Analyst', 'business intelligence')).toBe(true);
    expect(matchesJobTerm('Business support with emotional intelligence', 'business intelligence')).toBe(false);
  });
  it('strips HTML markup and deduplicates equivalent saved criteria', () => {
    expect(matchesJobTerm('<p>GIS</p><p>Developer</p>', 'GIS developer')).toBe(true);
    expect(keywordMatches('React developer', ['React', 'react', ' react '])).toEqual(['react']);
    expect(splitMatchTerms('GIS, GIS, , IT')).toEqual(['gis', 'it']);
  });
  it('matches city boundaries, German spellings and known NRW cities', () => {
    expect(matchesJobLocation('Hessen', 'Essen')).toBe(false);
    expect(matchesJobLocation('Düsseldorf (40212)', 'Duesseldorf')).toBe(true);
    expect(matchesJobLocation('Koeln · Remote', 'Köln')).toBe(true);
    expect(matchesJobLocation('Nordrhein-Westfalen', 'NRW')).toBe(true);
    expect(matchesJobLocation('Dortmund (44139)', 'NRW')).toBe(true);
    expect(matchesJobLocation('Berlin', 'NRW')).toBe(false);
  });
  it('does not advertise explicitly unavailable remote work', () => {
    expect(isRemoteListing({ description: 'No remote work available.' })).toBe(false);
    expect(isRemoteListing({ description: 'Remote is not possible.' })).toBe(false);
    expect(isRemoteListing({ description: 'Kein Homeoffice möglich.' })).toBe(false);
    expect(isRemoteListing({ description: 'Not fully remote; hybrid work is available.' })).toBe(true);
    expect(isRemoteListing({ location: 'Berlin · Remote' })).toBe(true);
  });
  it('uses the same lexical matcher for dashboard and Hot Picks feed filtering', () => {
    expect(jobMatchesFilter({ title: 'Psychologischen Studienberatung' }, ['GIS'], true)).toBe(false);
    expect(jobMatchesFilter({ title: 'ArcGIS Analyst' }, ['GIS'], true)).toBe(true);
    expect(jobMatchesFilter({ title: 'Unrelated role' }, ['GIS'], false)).toBe(true);
  });
});

describe('transparent relevance and search', () => {
  it('provides evidence for actual keyword and city hits, and gaps for absent criteria', () => {
    const match = scoreListing(role, ['gis'], ['koeln'], now);
    expect(match.reasons).toContain('Keyword: gis');
    expect(match.reasons).toContain('Location: koeln');
    const unrelated = scoreListing({ title: 'Psychologischen Studienberatung', location: 'Hessen' }, ['gis'], ['essen'], now);
    expect(unrelated.reasons.some(reason => reason.startsWith('Keyword:'))).toBe(false);
    expect(unrelated.gaps).toEqual(expect.arrayContaining(['No saved keyword hit', 'Outside your saved cities']));
    expect(match.score).toBeGreaterThan(unrelated.score);
  });
  it('does not inflate scores when an identical keyword is repeated', () => {
    expect(scoreListing(role, ['gis', 'GIS', 'gis'], ['Köln'], now)).toEqual(scoreListing(role, ['gis'], ['Köln'], now));
  });
  it('counts synonymous saved keywords as one evidence concept', () => {
    const consulting = { ...role, title: 'Consultant / Berater', description: 'Business consulting and Unternehmensberatung' };
    expect(scoreListing(consulting, ['consulting', 'beratung', 'berater'], [], now).score).toBe(scoreListing(consulting, ['consulting'], [], now).score);
  });
  it('keeps title-only search summaries below high relevance and explains missing evidence', () => {
    const summary = { title: 'Studienberater in der Psychologischen Studienberatung', location: 'Dortmund · Remote', description: 'Position: Studienberater in der Psychologischen Studienberatung', language: 'en', posted_date: '2026-10-31', description_quality: 'summary' as const };
    const match = scoreListing(summary, ['gis', 'consulting', 'beratung', 'berater'], ['Dortmund'], now);
    expect(match.score).toBeLessThan(70);
    expect(match.limitations).toEqual(['requirements_unavailable', 'working_language_unknown']);
    expect(match.reasons).not.toContain('Working language stated: English');
    expect(keywordMatches(summary.title, ['GIS'])).toEqual([]);
  });
  it('does not trust legacy language tags and grants the language bonus only for an explicit claim', () => {
    const detailed = { ...role, description: 'Build and maintain geospatial datasets and mapping applications with the engineering team. This role needs database experience and confidence explaining technical results to customers.' };
    const unknown = scoreListing({ ...detailed, language: 'en' }, ['GIS'], [], now);
    const confirmed = scoreListing({ ...detailed, language: null, description: detailed.description + ' Our working language is English.' }, ['GIS'], [], now);
    expect(unknown.limitations).toContain('working_language_unknown');
    expect(confirmed.score).toBe(unknown.score + 10);
    expect(confirmed.reasons).toContain('Working language stated: English');
  });
  it('does not turn metadata bonuses into a high match when explicit criteria miss', () => {
    const unrelated = { title: 'Working student', location: 'Köln · Remote', language: 'en', posted_date: '2026-10-31' };
    const keywordMiss = scoreListing(unrelated, ['GIS'], ['Köln'], now);
    expect(keywordMiss.score).toBeLessThan(70);
    expect(keywordMiss.gaps).toContain('No saved keyword hit');
    const cityMiss = scoreListing({ ...role, location: 'Berlin' }, ['gis', 'data', 'analyst'], ['Köln'], now);
    expect(cityMiss.score).toBeLessThan(70);
    expect(cityMiss.gaps).toContain('Outside your saved cities');
    expect(scoreListing({ ...role, location: 'Berlin · Remote' }, ['gis', 'data', 'analyst'], ['Köln'], now).gaps).not.toContain('Outside your saved cities');
  });
  it('does not label future, invalid, closed or expired listings as fresh', () => {
    for (const listing of [{ ...role, posted_date: '2026-11-05' }, { ...role, posted_date: 'bad date' }, { ...role, is_active: false }, { ...role, deadline: '2026-10-30' }]) {
      expect(scoreListing(listing, ['gis'], [], now).reasons).not.toContain('Fresh');
    }
    expect(scoreListing({ ...role, deadline: '2026-10-31' }, ['gis'], [], now).reasons).toContain('Fresh');
  });
  it('does not infer the applicant is junior merely because a description mentions a manager', () => {
    const junior = { title: 'Junior GIS Analyst', description: 'Reports to the head of engineering.' };
    expect(scoreListing(junior, ['junior', 'gis'], [], now).gaps).not.toContain('May be senior-level');
    expect(scoreListing({ ...junior, title: 'Senior GIS Analyst' }, ['junior', 'gis'], [], now).gaps).toContain('May be senior-level');
  });
  it('requires the complete text-search intent and gives title hits priority', () => {
    expect(listingSearchScore({ title: 'GIS Analyst' }, 'GIS analyst')).toBeGreaterThan(0);
    expect(listingSearchScore({ title: 'GIS Administrator' }, 'GIS analyst')).toBe(0);
    expect(listingSearchScore({ title: 'Psychologischen Studienberatung' }, 'GIS')).toBe(0);
    expect(listingSearchScore({ title: 'GIS Analyst' }, 'GIS')).toBeGreaterThan(listingSearchScore({ title: 'Data Analyst', description: 'Some exposure to GIS tools' }, 'GIS'));
  });
});
