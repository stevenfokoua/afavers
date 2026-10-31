import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import { AccountCollection, type AccountItem, type CollectionKind, type CollectionTransport, type PendingItem, type RemoteItem, type SyncStatus } from './accountSyncCore';
import { loadSyncJournal, recoverSyncJournal } from './accountSyncStorage';
import { isCollectionItem } from './accountSyncValidation';

interface SyncUI { collections: Partial<Record<CollectionKind, SyncStatus>> }
export const useAccountSync = create<SyncUI>(() => ({ collections: {} }));
const managers = new Map<CollectionKind, AccountCollection<AccountItem>>();
let timer: ReturnType<typeof setInterval> | undefined;
let installed = false;
const refresh = () => { if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return; for (const manager of managers.values()) if (manager.active()) void manager.sync(); };
function listeners(): void {
  if (typeof window === 'undefined' || installed) return; installed = true;
  window.addEventListener('online', refresh); window.addEventListener('focus', refresh); document.addEventListener('visibilitychange', refresh);
}
function updateTimer(): void {
  listeners();
  if ([...managers.values()].some(manager => manager.active())) { if (!timer) timer = setInterval(refresh, 30_000); }
  else if (timer) { clearInterval(timer); timer = undefined; }
}
const transport: CollectionTransport<AccountItem> = {
  async list(owner, kind) {
    const all: RemoteItem<AccountItem>[] = [];
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await supabase.from('account_items').select('item_id,data,deleted,revision,last_operation').eq('user_id', owner).eq('collection', kind).order('item_id').range(offset, offset + 999);
      if (error) throw new Error(error.message);
      for (const row of data ?? []) if (!row.deleted && (!isCollectionItem(kind,row.data) || row.data.id !== row.item_id)) throw new Error('Account item has invalid data; the local copy was retained');
      all.push(...(data ?? [])); if ((data?.length ?? 0) < 1000) return all;
    }
  },
  async write(owner, kind, id, pending) {
    const { data, error } = await supabase.rpc('write_account_item', { p_user_id: owner, p_collection: kind, p_item_id: id, p_expected_revision: pending.expectedRevision, p_data: pending.data, p_deleted: pending.data === null, p_operation: pending.operation });
    if (error) throw new Error(error.message); return data;
  },
};
export function registerAccountCollection<T extends AccountItem>(kind: CollectionKind, setItems: (items: T[]) => void) {
  const storageKey = (owner: number) => `afavers-account-sync:${kind}:user:${owner}`;
  const manager = new AccountCollection<T>({
    kind, transport: transport as CollectionTransport<T>, setItems,
    loadMeta(owner) { return loadSyncJournal(localStorage,storageKey(owner)); },
    saveMeta(owner, meta) { localStorage.setItem(storageKey(owner), JSON.stringify(meta)); },
    recoverMeta(owner) { recoverSyncJournal(localStorage,storageKey(owner),crypto.randomUUID()); },
    validateItem(value) { return isCollectionItem(kind,value); },
    status(status) { useAccountSync.setState(state => ({ collections: { ...state.collections, [kind]: status } })); },
    uuid: () => crypto.randomUUID(), online: () => typeof navigator === 'undefined' || navigator.onLine !== false,
  });
  managers.set(kind, manager as AccountCollection<AccountItem>);
  return {
    activate(owner: number | null, items: T[]) { manager.activate(owner, items); updateTimer(); if (owner !== null) void manager.sync(); },
    put(item: T) { manager.put(item); void manager.sync(); },
    remove(id: string) { manager.remove(id); void manager.sync(); },
  };
}
export function retryAccountSync(kind?: CollectionKind): void { if (kind) void managers.get(kind)?.sync(); else refresh(); }
export function resolveAccountSync(kind: CollectionKind, choice: 'local' | 'account'): void { void managers.get(kind)?.resolve(choice); }
export function recoverAccountSync(kind: CollectionKind): void { void managers.get(kind)?.recoverJournal(); }
export type { CollectionKind, PendingItem, RemoteItem };
