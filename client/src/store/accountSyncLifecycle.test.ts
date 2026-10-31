import { describe, expect, it, vi } from 'vitest';
const calls = vi.hoisted(() => [] as Array<{ kind: string; owner: number | null }>);
vi.mock('../services/accountSync', () => ({ registerAccountCollection: (kind: string) => ({ activate: (owner: number | null) => calls.push({ kind, owner }), put: vi.fn(), remove: vi.fn() }) }));

describe('lazy-loaded account collections', () => {
  it('activates a saved-search collection imported after sign-in, then follows owner changes', async () => {
    const data = new Map<string,string>();
    data.set('afavers-saved-searches:user:17',JSON.stringify({state:{searches:[{id:'owned-legacy',name:'My existing search',filters:{}}]},version:0}));
    vi.stubGlobal('localStorage',{getItem:(key:string)=>data.get(key)??null,setItem:(key:string,value:string)=>data.set(key,value),removeItem:(key:string)=>data.delete(key)});
    const { activatePrivateDataOwner } = await import('./privateStorage');
    await activatePrivateDataOwner(17);
    const { useSavedSearchStore } = await import('./savedSearchStore'); await Promise.resolve();
    expect(calls).toContainEqual({kind:'saved_searches',owner:17});
    expect(useSavedSearchStore.getState().searches[0].name).toBe('My existing search');
    expect(data.get('afavers-saved-searches:user:17')).toContain('My existing search');
    await activatePrivateDataOwner(18);expect(calls.at(-1)).toEqual({kind:'saved_searches',owner:18});
    await activatePrivateDataOwner(null);expect(calls.at(-1)).toEqual({kind:'saved_searches',owner:null});
    vi.unstubAllGlobals();
  });
});
