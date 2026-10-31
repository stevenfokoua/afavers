import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../services/accountSync', () => ({ registerAccountCollection: () => ({ activate: vi.fn(), put: vi.fn(), remove: vi.fn() }) }));
import { activatePrivateDataOwner } from './privateStorage';
import { useReminderStore } from './reminderStore';
import { useCalendarStore } from './calendarStore';
import { useGoalStore } from './goalStore';

describe('private data isolation', () => {
  const data = new Map<string, string>();
  beforeEach(async () => {
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => { data.set(key, value); },
      removeItem: (key: string) => { data.delete(key); },
    });
    await activatePrivateDataOwner(null);
    data.clear();
  });
  it('clears visible private data on logout and restores only its owner’s data', async () => {
    await activatePrivateDataOwner(1);
    useReminderStore.getState().addReminder({ title: 'Private A', date: '2026-11-05', time: '09:00', type: 'interview' });
    useCalendarStore.getState().addEvent({ date: '2026-11-05', title: 'Private A', type: 'interview' });
    useGoalStore.getState().logStress(5);
    await activatePrivateDataOwner(null);
    expect(useReminderStore.getState().reminders).toHaveLength(0);
    await activatePrivateDataOwner(2);
    expect(useReminderStore.getState().reminders).toHaveLength(0);
    expect(useCalendarStore.getState().events).toHaveLength(0);
    expect(useGoalStore.getState().stressLog).toHaveLength(0);
    useReminderStore.getState().addReminder({ title: 'Private B', date: '2026-11-06', time: '10:00', type: 'custom' });
    await activatePrivateDataOwner(1);
    expect(useReminderStore.getState().reminders.map((r) => r.title)).toEqual(['Private A']);
    expect(useCalendarStore.getState().events).toHaveLength(1);
    expect(useGoalStore.getState().stressLog[0].level).toBe(5);
    await activatePrivateDataOwner(2);
    expect(useReminderStore.getState().reminders.map((r) => r.title)).toEqual(['Private B']);
  });
  it('preserves unowned legacy data without exposing it to a new account', async () => {
    const legacy = JSON.stringify({ state: { reminders: [{ title: 'Unknown owner' }] }, version: 0 });
    data.set('afavers-reminders', legacy);
    await activatePrivateDataOwner(3);
    expect(useReminderStore.getState().reminders).toEqual([]);
    expect(data.get('afavers-reminders')).toBe(legacy);
  });
});
