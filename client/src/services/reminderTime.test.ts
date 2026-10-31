import { describe, expect, it } from 'vitest';
import { reminderInstant } from './reminderTime';

describe('timezone-aware reminders', () => {
  it('uses the scheduled date offset across DST, not the device current offset', () => {
    expect(reminderInstant('2027-01-10','09:00','Europe/Berlin')?.toISOString()).toBe('2027-01-10T08:00:00.000Z');
    expect(reminderInstant('2027-07-10','09:00','Europe/Berlin')?.toISOString()).toBe('2027-07-10T07:00:00.000Z');
  });
  it('rejects nonexistent DST wall-clock times and selects the later fold', () => {
    expect(reminderInstant('2027-03-28','02:30','Europe/Berlin')).toBeNull();
    expect(reminderInstant('2027-10-31','02:30','Europe/Berlin')?.toISOString()).toBe('2027-10-31T01:30:00.000Z');
    expect(reminderInstant('2027-11-07','01:30','America/New_York')?.toISOString()).toBe('2027-11-07T06:30:00.000Z');
  });
  it('rejects invalid dates, clock values and zone identifiers', () => {
    expect(reminderInstant('2027-02-31','09:00','UTC')).toBeNull();
    expect(reminderInstant('2027-02-01','25:00','UTC')).toBeNull();
    expect(reminderInstant('2027-02-01','09:00','Not/AZone')).toBeNull();
  });
});
