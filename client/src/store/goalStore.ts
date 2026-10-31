import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { privateStorage, registerPrivateStore } from './privateStorage';

export type GoalType = 'applications' | 'interviews';

export interface Goal {
  type: GoalType;
  target: number;
  setAt: string; // ISO date
}

export interface StressEntry {
  date: string; // YYYY-MM-DD
  level: 1 | 2 | 3 | 4 | 5;
}

interface GoalState {
  goal: Goal | null;
  stressLog: StressEntry[];
  setGoal: (g: { type: GoalType; target: number }) => void;
  clearGoal: () => void;
  logStress: (level: 1 | 2 | 3 | 4 | 5) => void;
  todayStress: () => StressEntry | null;
}

export const useGoalStore = create<GoalState>()(
  persist(
    (set, get) => ({
      goal: null,
      stressLog: [],

      setGoal: (g) => set({ goal: { ...g, setAt: new Date().toISOString() } }),

      clearGoal: () => set({ goal: null }),

      logStress: (level) => {
        const today = new Date().toISOString().split('T')[0];
        set(s => ({
          stressLog: [
            ...s.stressLog.filter(e => e.date !== today),
            { date: today, level },
          ].slice(-60), // keep last 60 days
        }));
      },

      todayStress: () => {
        const today = new Date().toISOString().split('T')[0];
        return get().stressLog.find(e => e.date === today) ?? null;
      },
    }),
    { name: 'afavers-wellbeing', storage: createJSONStorage(() => privateStorage) }
  )
);

registerPrivateStore(async () => {
  useGoalStore.setState({ goal: null, stressLog: [] });
  await useGoalStore.persist.rehydrate();
});
