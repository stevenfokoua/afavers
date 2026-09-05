// Formatting shared by every export path: the Analytics report (CSV, Excel,
// print-to-PDF) and jobsService.exportCsv. These are the functions that decide
// what the document handed to the Ausländerbehörde actually says, so they are
// kept in one place and covered by exportFormat.test.ts.

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The calendar date the user sees, as YYYY-MM-DD.
 *
 * applied_date, follow_up_date, interview_date and deadline are Postgres DATE
 * columns and arrive as "2026-04-15". Per ECMA-262 a date-only ISO string
 * parses as UTC midnight, so `new Date(v).toLocaleDateString()` renders it a
 * day early in every negative UTC offset -- a user in New York exporting an
 * application dated the 15th gets a document saying the 14th. So date-only
 * strings are never handed to Date at all. Real timestamps still resolve to
 * the viewer's local calendar date, which is what the screen shows.
 */
export const toDateKey = (value?: string | null): string => {
  if (!value) return '';
  if (DATE_ONLY.test(value)) return value;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.slice(0, 10);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

/** German display format, dd.mm.yyyy. Same input handling as toDateKey. */
export const formatDate = (value?: string | null): string => {
  const key = toDateKey(value);
  if (!DATE_ONLY.test(key)) return key;
  const [year, month, day] = key.split('-');
  return `${day}.${month}.${year}`;
};

// Excel and LibreOffice evaluate any cell whose first character is one of
// these. Job titles and companies are scraped from third-party boards and
// notes are free text, so the content is untrusted and the recipient is a
// caseworker opening the file. Prefixing a single quote makes the cell literal.
const FORMULA_PREFIX = /^[=+\-@\t\r]/;

export const escapeCsv = (value: unknown): string => {
  if (value == null) return '';
  let text = String(value);
  if (FORMULA_PREFIX.test(text)) text = `'${text}`;
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

export const downloadBlob = (content: BlobPart, type: string, filename: string): void => {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  // click() starts the download asynchronously; revoking synchronously can
  // cancel it (Firefox, and more often the larger the file).
  setTimeout(() => URL.revokeObjectURL(url), 0);
};

/** The date filter on the Analytics report. Bounds are inclusive. */
export const isWithinDateRange = (value: string | null | undefined, from: string, to: string): boolean => {
  const key = toDateKey(value);
  if (from && key < from) return false;
  if (to && key > to) return false;
  return true;
};
