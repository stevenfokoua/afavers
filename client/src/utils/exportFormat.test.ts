import { describe, it, expect, afterAll } from 'vitest';
import { formatDate, toDateKey, escapeCsv, isWithinDateRange } from './exportFormat';

// Vitest runs these in Node, but the client tsconfig has no node types and
// pulling @types/node in for one variable is not worth it.
declare const process: { env: Record<string, string | undefined> };

// These functions produce the document users hand to the Ausländerbehörde as
// proof of when a job search happened, so the assertions below are about
// correctness of that document, not about tidiness.

const originalTz = process.env.TZ;

/** Run a body with the process timezone temporarily set. */
const inTimezone = <T>(tz: string, body: () => T): T => {
  process.env.TZ = tz;
  try {
    return body();
  } finally {
    process.env.TZ = originalTz;
  }
};

afterAll(() => {
  process.env.TZ = originalTz;
});

describe('formatDate', () => {
  it('formats a DATE-only string as dd.mm.yyyy', () => {
    expect(formatDate('2026-04-15')).toBe('15.04.2026');
  });

  it('does not shift a DATE-only string in a negative UTC offset', () => {
    // The old implementation did `new Date('2026-04-15')`, which parses as UTC
    // midnight, then rendered it locally -- 14.04.2026 anywhere west of UTC.
    expect(inTimezone('America/New_York', () => formatDate('2026-04-15'))).toBe('15.04.2026');
    expect(inTimezone('America/Los_Angeles', () => formatDate('2026-01-01'))).toBe('01.01.2026');
  });

  it('does not shift a DATE-only string in a positive UTC offset either', () => {
    expect(inTimezone('Pacific/Auckland', () => formatDate('2026-12-31'))).toBe('31.12.2026');
  });

  it('renders a full timestamp in the viewer local calendar day', () => {
    // 23:30 UTC on the 15th is still the 15th in Berlin (+1/+2) and already
    // the 16th in Auckland.
    expect(inTimezone('Europe/Berlin', () => formatDate('2026-04-15T23:30:00Z'))).toBe('16.04.2026');
    expect(inTimezone('UTC', () => formatDate('2026-04-15T23:30:00Z'))).toBe('15.04.2026');
  });

  it('returns an empty string for null, undefined and empty input', () => {
    expect(formatDate(null)).toBe('');
    expect(formatDate(undefined)).toBe('');
    expect(formatDate('')).toBe('');
  });

  it('falls back to the leading ten characters of an unparseable value', () => {
    expect(formatDate('not a date at all')).toBe('not a date');
  });
});

describe('escapeCsv', () => {
  it('neutralises every formula prefix a spreadsheet would evaluate', () => {
    expect(escapeCsv('=HYPERLINK("https://evil.example","Click")'))
      .toBe('"\'=HYPERLINK(""https://evil.example"",""Click"")"');
    expect(escapeCsv('+1234')).toBe("'+1234");
    expect(escapeCsv('-1+1')).toBe("'-1+1");
    expect(escapeCsv('@SUM(A1)')).toBe("'@SUM(A1)");
    expect(escapeCsv('\tcmd')).toBe("'\tcmd");
    expect(escapeCsv('\rcmd')).toBe('"\'\rcmd"');
  });

  it('leaves ordinary values alone', () => {
    expect(escapeCsv('Werkstudent Data Analyst')).toBe('Werkstudent Data Analyst');
    expect(escapeCsv('2026-04-15')).toBe('2026-04-15');
    expect(escapeCsv(42)).toBe('42');
  });

  it('still quotes and doubles quotes for ordinary CSV special characters', () => {
    expect(escapeCsv('Berlin, Germany')).toBe('"Berlin, Germany"');
    expect(escapeCsv('He said "hi"')).toBe('"He said ""hi"""');
    expect(escapeCsv('line one\nline two')).toBe('"line one\nline two"');
  });

  it('returns an empty string for null and undefined', () => {
    expect(escapeCsv(null)).toBe('');
    expect(escapeCsv(undefined)).toBe('');
  });
});

describe('isWithinDateRange', () => {
  it('treats both bounds as inclusive', () => {
    expect(isWithinDateRange('2026-04-15', '2026-04-15', '2026-04-15')).toBe(true);
    expect(isWithinDateRange('2026-04-14', '2026-04-15', '')).toBe(false);
    expect(isWithinDateRange('2026-04-16', '', '2026-04-15')).toBe(false);
  });

  it('accepts everything when no bound is set', () => {
    expect(isWithinDateRange('2026-04-15', '', '')).toBe(true);
  });

  it('compares the same calendar day the export displays', () => {
    // The filter input is a local calendar date from <input type="date">.
    // Filtering on the raw UTC slice while displaying the local day is how a
    // boundary row silently entered or left the official report.
    const timestamp = '2026-04-15T23:30:00Z';
    inTimezone('Europe/Berlin', () => {
      expect(formatDate(timestamp)).toBe('16.04.2026');
      expect(toDateKey(timestamp)).toBe('2026-04-16');
      expect(isWithinDateRange(timestamp, '2026-04-16', '2026-04-16')).toBe(true);
      expect(isWithinDateRange(timestamp, '2026-04-15', '2026-04-15')).toBe(false);
    });
  });

  it('does not shift a DATE-only value against the filter bounds', () => {
    inTimezone('America/New_York', () => {
      expect(isWithinDateRange('2026-04-15', '2026-04-15', '2026-04-15')).toBe(true);
    });
  });
});
