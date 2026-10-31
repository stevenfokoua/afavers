import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { getPrivateDataOwner, privateStorage, registerPrivateStore } from './privateStorage';
import { registerAccountCollection } from '../services/accountSync';
import { deviceTimezone } from '../services/reminderTime';
import { cancelReminder, scheduleReminder } from '../services/notification.service';

export type ReminderType = 'interview' | 'followup' | 'deadline' | 'custom';

export interface Reminder {
  id: string;
  title: string;
  date: string;       // YYYY-MM-DD
  time: string;       // HH:MM
  type: ReminderType;
  completed: boolean;
  linkedJobId?: number;
  notes?: string;
  /** IANA zone preserves the chosen wall-clock time across DST changes. */
  timezone?: string;
  /** Explicit per-reminder consent; existing local reminders default to off. */
  emailEnabled?: boolean;
}

interface ReminderState {
  reminders: Reminder[];
  addReminder: (r: Omit<Reminder, 'id' | 'completed'>) => string;
  toggleComplete: (id: string) => void;
  removeReminder: (id: string) => void;
  updateReminder: (id: string, changes: Partial<Omit<Reminder, 'id'>>) => void;
}

export const useReminderStore = create<ReminderState>()(
  persist<ReminderState>(
    (set, get) => ({
      reminders: [],

      addReminder: (r) => {
        const previous = r.linkedJobId ? get().reminders.find(item => item.linkedJobId === r.linkedJobId && item.type === r.type) : undefined;
        const id = previous?.id || (r.linkedJobId ? `job-${r.linkedJobId}-${r.type}` : crypto.randomUUID());
        const reminder: Reminder = { ...r, id, completed: false, timezone: r.timezone || previous?.timezone || deviceTimezone(), emailEnabled: r.emailEnabled ?? previous?.emailEnabled ?? false };
        set(state => ({
          reminders: [...state.reminders.filter(item => item.id !== id), reminder],
        }));
        reminderSync.put(reminder);
        return id;
      },

      toggleComplete: (id) => {
        set(state => ({ reminders: state.reminders.map(r => r.id === id ? { ...r, completed: !r.completed } : r) }));
        const reminder = get().reminders.find(r => r.id === id); if (reminder) reminderSync.put(reminder);
      },

      removeReminder: (id) => { set(state => ({ reminders: state.reminders.filter(r => r.id !== id) })); reminderSync.remove(id); },

      updateReminder: (id, changes) => {
        set(state => ({ reminders: state.reminders.map(r => r.id === id ? { ...r, ...changes } : r) }));
        const reminder = get().reminders.find(r => r.id === id); if (reminder) reminderSync.put(reminder);
      },
    }),
    { name: 'afavers-reminders', storage: createJSONStorage(() => privateStorage) }
  )
);

const reminderSync = registerAccountCollection<Reminder>('reminders', reminders => {
  const previous = useReminderStore.getState().reminders;
  useReminderStore.setState({ reminders: reminders.sort((a,b) => (a.date+a.time+a.id).localeCompare(b.date+b.time+b.id)) });
  for (const old of previous) if (!reminders.some(item => item.id === old.id)) void cancelReminder(old.id).catch(() => {});
  for (const reminder of reminders) {
    const old = previous.find(item => item.id === reminder.id);
    if (!old || old.date !== reminder.date || old.time !== reminder.time || old.timezone !== reminder.timezone || old.completed !== reminder.completed || old.title !== reminder.title || old.notes !== reminder.notes) void scheduleReminder(reminder).catch(() => {});
  }
});

async function activateReminders() {
  useReminderStore.setState({ reminders: [] });
  await useReminderStore.persist.rehydrate();
  const reminders = useReminderStore.getState().reminders.map(reminder => ({ ...reminder, timezone: reminder.timezone || deviceTimezone(), emailEnabled: reminder.emailEnabled ?? false }));
  useReminderStore.setState({ reminders });
  reminderSync.activate(getPrivateDataOwner(), reminders);
}
registerPrivateStore(activateReminders);
const initialOwner = getPrivateDataOwner();
if (initialOwner !== null) void Promise.resolve(useReminderStore.persist.rehydrate()).then(() => {
  if (getPrivateDataOwner() !== initialOwner) return;
  const reminders = useReminderStore.getState().reminders.map(reminder => ({ ...reminder, timezone: reminder.timezone || deviceTimezone(), emailEnabled: reminder.emailEnabled ?? false }));
  useReminderStore.setState({reminders}); reminderSync.activate(initialOwner,reminders);
});
