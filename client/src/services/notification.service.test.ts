import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { cancelReminder, scheduleReminder } from './notification.service';

describe('browser reminder lifecycle', () => {
  const notify = Object.assign(vi.fn(), { permission: 'granted' });
  const reminder = { id: 'owned-reminder', title: 'Interview', date: '2026-11-05', time: '09:00', type: 'interview' as const, completed: false };
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-04T09:00:00'));
    vi.stubGlobal('window', { Notification: notify });
    vi.stubGlobal('Notification', notify);
    notify.mockClear();
  });
  afterEach(async () => {
    await cancelReminder(reminder.id);
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });
  it('does not notify after a scheduled reminder is deleted', async () => {
    await scheduleReminder(reminder);
    await cancelReminder(reminder.id);
    await vi.advanceTimersByTimeAsync(2 * 86400000);
    expect(notify).not.toHaveBeenCalled();
  });
  it('replaces an old timer when the same reminder is rescheduled', async () => {
    await scheduleReminder(reminder);
    await scheduleReminder({ ...reminder, date: '2026-11-06' });
    await vi.advanceTimersByTimeAsync(86400000);
    expect(notify).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(86400000);
    expect(notify).toHaveBeenCalledTimes(1);
  });
  it('cancels a pending notification when a reminder is completed', async () => {
    await scheduleReminder(reminder);
    await scheduleReminder({ ...reminder, completed: true });
    await vi.advanceTimersByTimeAsync(2 * 86400000);
    expect(notify).not.toHaveBeenCalled();
  });
});
