import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { getPrivateDataOwner, privateStorage, registerPrivateStore } from './privateStorage';
import { registerAccountCollection } from '../services/accountSync';

export interface SavedSearchFilters {
  tab: string;
  search: string;
  sortBy: string;
  source: string;
  dateDays: string;
  remoteOnly: boolean;
  studentOnly: boolean;
  highMatchOnly: boolean;
  location: string;
}
export interface SavedSearch { id: string; name: string; filters: SavedSearchFilters }
interface SavedSearchState {
  searches: SavedSearch[];
  save: (name: string, filters: SavedSearchFilters) => boolean;
  remove: (id: string) => void;
}

export const useSavedSearchStore = create<SavedSearchState>()(persist((set, get) => ({
  searches: [],
  save: (name, filters) => {
    const label = name.trim().slice(0, 60);
    if (!label) return false;
    const existing = get().searches.find((item) => item.name.toLowerCase() === label.toLowerCase());
    if (!existing && get().searches.length >= 12) return false;
    const entry = { id: existing?.id ?? crypto.randomUUID(), name: label, filters: { ...filters } };
    set((state) => ({ searches: existing ? state.searches.map((item) => item.id === existing.id ? entry : item) : [...state.searches, entry] }));
    savedSearchSync.put(entry);
    return true;
  },
  remove: (id) => { set((state) => ({ searches: state.searches.filter((item) => item.id !== id) })); savedSearchSync.remove(id); },
}), { name: 'afavers-saved-searches', storage: createJSONStorage(() => privateStorage) }));

const savedSearchSync = registerAccountCollection<SavedSearch>('saved_searches', searches => useSavedSearchStore.setState({ searches: searches.sort((a,b) => a.name.localeCompare(b.name)) }));

async function activateSavedSearches() {
  useSavedSearchStore.setState({ searches: [] });
  await useSavedSearchStore.persist.rehydrate();
  savedSearchSync.activate(getPrivateDataOwner(), useSavedSearchStore.getState().searches);
}
registerPrivateStore(activateSavedSearches);
const initialOwner = getPrivateDataOwner();
if (initialOwner !== null) void Promise.resolve(useSavedSearchStore.persist.rehydrate()).then(() => {
  if (getPrivateDataOwner() === initialOwner) savedSearchSync.activate(initialOwner,useSavedSearchStore.getState().searches);
});
