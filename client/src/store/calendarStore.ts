import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { getPrivateDataOwner, privateStorage, registerPrivateStore } from './privateStorage';
import { registerAccountCollection } from '../services/accountSync';

export type CalendarEventType = 'interview' | 'followup' | 'deadline' | 'note';

export interface CalendarEvent {
  id: string;
  date: string; // YYYY-MM-DD
  title: string;
  type: CalendarEventType;
  time?: string; // HH:MM
}

interface CalendarState {
  events: CalendarEvent[];
  addEvent: (event: Omit<CalendarEvent, 'id'>) => void;
  removeEvent: (id: string) => void;
}

export const useCalendarStore = create<CalendarState>()(
  persist(
    (set) => ({
      events: [],
      addEvent: (event) => {
        const entry = { ...event, id: crypto.randomUUID() };
        set(state => ({ events: [...state.events, entry] })); calendarSync.put(entry);
      },
      removeEvent: (id) => { set(state => ({ events: state.events.filter(e => e.id !== id) })); calendarSync.remove(id); },
    }),
    { name: 'calendar-events', storage: createJSONStorage(() => privateStorage) }
  )
);

const calendarSync = registerAccountCollection<CalendarEvent>('calendar_events', events => useCalendarStore.setState({ events: events.sort((a,b) => (a.date+(a.time || '')+a.id).localeCompare(b.date+(b.time || '')+b.id)) }));

async function activateCalendar() {
  useCalendarStore.setState({ events: [] });
  await useCalendarStore.persist.rehydrate();
  calendarSync.activate(getPrivateDataOwner(), useCalendarStore.getState().events);
}
registerPrivateStore(activateCalendar);
const initialOwner = getPrivateDataOwner();
if (initialOwner !== null) void Promise.resolve(useCalendarStore.persist.rehydrate()).then(() => {
  if (getPrivateDataOwner() === initialOwner) calendarSync.activate(initialOwner,useCalendarStore.getState().events);
});
