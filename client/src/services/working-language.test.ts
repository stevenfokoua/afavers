import { describe, expect, it } from 'vitest';
import { confirmedWorkingLanguage, detectLanguage } from '../../../supabase/functions/_shared/language';

describe('explicit working-language evidence', () => {
  it('does not treat English titles or translated marketing copy as an English workplace', () => {
    expect(detectLanguage('Senior IT Project Manager', 'Position: Senior IT Project Manager')).toBeNull();
    expect(detectLanguage('Data Analyst', 'We are looking for a talented candidate to join our team and build software with our customers.')).toBeNull();
    expect(confirmedWorkingLanguage('Good English skills are required.')).toBeNull();
  });
  it('recognizes stated English working language and leaves optional German optional', () => {
    for (const text of ['Our working language is English.', 'Arbeitssprache: Englisch.', 'You will work in English.', 'Join our English-speaking team.']) expect(confirmedWorkingLanguage(text)).toBe('en');
    expect(confirmedWorkingLanguage('Our working language is English. German is optional.')).toBe('en');
  });
  it('does not hide a mandatory German requirement behind English team language', () => {
    expect(confirmedWorkingLanguage('Our working language is English. Sehr gute deutsche Sprachkenntnisse in Wort und Schrift (mindestens C1-Niveau).')).toBe('de');
    expect(confirmedWorkingLanguage('Working language: English. Fluent German required.')).toBe('de');
    expect(confirmedWorkingLanguage('Arbeitssprache ist Deutsch.')).toBe('de');
  });
  it('rejects negated language claims and handles separated HTML requirement bullets', () => {
    expect(confirmedWorkingLanguage('We are not an English-speaking team.')).toBeNull();
    expect(confirmedWorkingLanguage('Our working language is not English.')).toBeNull();
    expect(confirmedWorkingLanguage('<p>Our working language is English.</p><li>German is not required.</li>')).toBe('en');
  });
});
