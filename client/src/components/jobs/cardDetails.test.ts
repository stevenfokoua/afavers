import { describe, expect, it } from 'vitest';
import type { Job } from '../../types';
import { cardDate, isOverdue, nextApplicationStep } from './cardDetails';

describe('application card dates and actions', () => {
  it('keeps date-only values on their local calendar day', () => {
    const date = cardDate('2026-11-01')!;
    expect([date.getFullYear(), date.getMonth(), date.getDate(), date.getHours()]).toEqual([2026, 10, 1, 0]);
  });
  it('ignores absent or malformed dates', () => {
    for (const value of [null, undefined, '', 'invalid']) {
      expect(cardDate(value)).toBeNull();
      expect(isOverdue(value)).toBe(false);
    }
  });
  it('does not mark today overdue based on the time of day', () => {
    const now = new Date(2026, 9, 31, 23, 59);
    expect(isOverdue('2026-10-30', now)).toBe(true);
    expect(isOverdue('2026-10-31', now)).toBe(false);
    expect(isOverdue('2026-11-01', now)).toBe(false);
  });
  it('uses the interview schedule for interviewing and follow-up for submitted applications', () => {
    const dates = { interview_date: '2026-11-02', follow_up_date: '2026-11-05', deadline: '2026-11-10' };
    expect(nextApplicationStep({ ...dates, status: 'interviewing' } as Job, false)).toEqual({ label: 'Prepare interview', date: '2026-11-02' });
    expect(nextApplicationStep({ ...dates, status: 'applied' } as Job, true)).toEqual({ label: 'Nachfassen', date: '2026-11-05' });
  });
  it('does not present a stale scheduled action for a closed application', () => {
    expect(nextApplicationStep({ status: 'rejected', interview_date: '2026-10-01' } as Job, false)).toEqual({ label: 'Review application', date: null });
    expect(nextApplicationStep({ status: 'offered' } as Job, false)).toEqual({ label: 'Review offer', date: null });
  });
});
