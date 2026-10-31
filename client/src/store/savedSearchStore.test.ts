import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../services/accountSync', () => ({ registerAccountCollection: () => ({ activate: vi.fn(), put: vi.fn(), remove: vi.fn() }) }));
import { activatePrivateDataOwner } from './privateStorage';
import { useSavedSearchStore, type SavedSearchFilters } from './savedSearchStore';

const filters: SavedSearchFilters = { tab: 'new', search: 'developer', sortBy: 'posted_date', source: '', dateDays: '7', remoteOnly: true, studentOnly: false, highMatchOnly: false, location: '' };
const data = new Map<string, string>();
beforeEach(async () => {
  vi.stubGlobal('localStorage', { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); }, removeItem: (key: string) => { data.delete(key); } });
  await activatePrivateDataOwner(null); data.clear(); await activatePrivateDataOwner(100); useSavedSearchStore.setState({ searches: [] });
});

describe('private saved searches', () => {
  it('restores only the signed-in user’s searches across account switches', async () => {
    useSavedSearchStore.getState().save('Remote developer', filters);
    await activatePrivateDataOwner(200);
    expect(useSavedSearchStore.getState().searches).toEqual([]);
    useSavedSearchStore.getState().save('Other search', { ...filters, search: 'design' });
    await activatePrivateDataOwner(100);
    expect(useSavedSearchStore.getState().searches.map((item) => item.name)).toEqual(['Remote developer']);
    await activatePrivateDataOwner(null);
    expect(useSavedSearchStore.getState().searches).toEqual([]);
  });
  it('updates a named search without creating duplicates and bounds storage', () => {
    const store = useSavedSearchStore.getState();
    expect(store.save('Remote developer', filters)).toBe(true);
    expect(store.save('remote developer', { ...filters, dateDays: '30' })).toBe(true);
    expect(useSavedSearchStore.getState().searches).toHaveLength(1);
    expect(useSavedSearchStore.getState().searches[0].filters.dateDays).toBe('30');
    for (let i = 0; i < 11; i++) store.save('Search ' + i, filters);
    expect(store.save('Too many', filters)).toBe(false);
    expect(store.save('   ', filters)).toBe(false);
  });
});
