export type CollectionKind = 'reminders' | 'calendar_events' | 'saved_searches';
export interface AccountItem { id: string }
export interface RemoteItem<T extends AccountItem> { item_id: string; data: T | null; deleted: boolean; revision: number; last_operation: string | null }
export interface PendingItem<T extends AccountItem> { data: T | null; expectedRevision: number | null; operation: string }
export interface SyncMeta<T extends AccountItem> { migrated: boolean; versions: Record<string, number>; pending: Record<string, PendingItem<T>> }
export interface SyncStatus { phase: 'idle' | 'syncing' | 'synced' | 'offline' | 'conflict' | 'error'; pending: number; conflicts: number; lastSyncedAt?: string; message?: string; storageUnavailable?: boolean; journalIssue?: boolean }
export interface CollectionTransport<T extends AccountItem> {
  list(owner: number, kind: CollectionKind): Promise<RemoteItem<T>[]>;
  write(owner: number, kind: CollectionKind, id: string, pending: PendingItem<T>): Promise<{ applied: boolean; record: RemoteItem<T> }>;
}
export interface CollectionOptions<T extends AccountItem> {
  kind: CollectionKind;
  transport: CollectionTransport<T>;
  loadMeta(owner: number): unknown;
  saveMeta(owner: number, value: SyncMeta<T>): void;
  recoverMeta?(owner: number): void;
  validateItem?(value: unknown): boolean;
  setItems(items: T[]): void;
  status(value: SyncStatus): void;
  uuid(): string;
  online(): boolean;
}
function isObject(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function validId(value: string): boolean { return value.length > 0 && value.length <= 100 && !['__proto__','prototype','constructor'].includes(value); }
/** Validation happens before a journal can influence visible items or writes. */
export function validateSyncMeta<T extends AccountItem>(value: unknown, validateItem?: (item: unknown) => boolean): SyncMeta<T> | null {
  if (value === null) return null;
  if (!isObject(value) || typeof value.migrated !== 'boolean' || !isObject(value.versions) || !isObject(value.pending)) throw new Error('Unreadable account sync journal');
  for (const [id, revision] of Object.entries(value.versions)) if (!validId(id) || !Number.isSafeInteger(revision) || (revision as number) < 1) throw new Error('Unreadable account sync journal');
  for (const [id, entry] of Object.entries(value.pending)) {
    if (!validId(id) || !isObject(entry) || typeof entry.operation !== 'string' || entry.operation.length < 1 || entry.operation.length > 100 || !(entry.expectedRevision === null || Number.isSafeInteger(entry.expectedRevision) && (entry.expectedRevision as number) >= 1) || !(entry.data === null || isObject(entry.data) && entry.data.id === id && (!validateItem || validateItem(entry.data)))) throw new Error('Unreadable account sync journal');
  }
  return value as unknown as SyncMeta<T>;
}
const equal = (a: unknown, b: unknown): boolean => {
  const canonical = (v: unknown): string => Array.isArray(v) ? '[' + v.map(canonical).join(',') + ']' : v && typeof v === 'object' ? '{' + Object.keys(v).sort().map(key => JSON.stringify(key) + ':' + canonical((v as Record<string, unknown>)[key])).join(',') + '}' : JSON.stringify(v) ?? '';
  return canonical(a) === canonical(b);
};

/** Per-item optimistic concurrency, a persistent offline journal and tombstones.
 * Pending edits stay visible on conflict until the user explicitly chooses a version.
 */
export class AccountCollection<T extends AccountItem> {
  private owner: number | null = null;
  private generation = 0;
  private meta: SyncMeta<T> = { migrated: false, versions: {}, pending: {} };
  private items: T[] = [];
  private remote = new Map<string, RemoteItem<T>>();
  private conflicts = new Set<string>();
  private running: Promise<void> | null = null;
  private rerun = false;
  private storageUnavailable = false;
  private journalIssue = false;
  private options: CollectionOptions<T>;
  constructor(options: CollectionOptions<T>) { this.options = options; }

  activate(owner: number | null, items: T[]): void {
    this.generation++; this.owner = owner; this.items = items;
    this.remote = new Map(); this.conflicts.clear(); this.running = null; this.rerun = false; this.storageUnavailable = false; this.journalIssue = false;
    this.meta = { migrated: false, versions: {}, pending: {} };
    if (owner !== null) this.readMeta();
    // The durable journal is authoritative over a lagging browser cache, even
    // when offline. Never wait for a remote read to restore an edit or deletion.
    const visible = new Map((owner === null ? [] : items).map(item => [item.id,item]));
    for (const [id, entry] of Object.entries(this.meta.pending)) { if (entry.data) visible.set(id,entry.data); else visible.delete(id); }
    this.items = [...visible.values()]; this.options.setItems(this.items);
    this.report('idle');
  }
  private readMeta(): boolean {
    if (this.owner === null) return false;
    try {
      const loaded = validateSyncMeta<T>(this.options.loadMeta(this.owner),this.options.validateItem) ?? { migrated: false,versions: {},pending: {} };
      this.meta = { ...loaded, pending: { ...loaded.pending,...this.meta.pending } }; this.journalIssue = false; return true;
    } catch { this.journalIssue = true; this.report('error','Unreadable account sync journal'); return false; }
  }
  active(): boolean { return this.owner !== null; }
  put(item: T): void { this.change(item.id, item); }
  remove(id: string): void { this.change(id, null); }
  private change(id: string, data: T | null): void {
    if (this.owner === null) return;
    const old = this.meta.pending[id];
    this.meta.pending[id] = { data, expectedRevision: old ? old.expectedRevision : this.meta.versions[id] ?? null, operation: this.options.uuid() };
    this.items = this.items.filter(item => item.id !== id); if (data) this.items.push(data);
    this.persist(); this.report(this.options.online() ? 'idle' : 'offline');
    if (this.running) this.rerun = true;
  }
  private persist(): void {
    if (this.owner === null || this.journalIssue) return;
    try { this.options.saveMeta(this.owner, this.meta); this.storageUnavailable = false; }
    catch { this.storageUnavailable = true; }
  }
  private report(phase: SyncStatus['phase'], message?: string): void {
    this.options.status({ phase: this.journalIssue || this.storageUnavailable && phase !== 'synced' ? 'error' : phase, pending: Object.keys(this.meta.pending).length, conflicts: this.conflicts.size, message, storageUnavailable: this.storageUnavailable, journalIssue: this.journalIssue });
  }
  private publish(): void {
    const merged = new Map<string, T>();
    for (const record of this.remote.values()) if (!record.deleted && record.data) merged.set(record.item_id, record.data);
    for (const [id, pending] of Object.entries(this.meta.pending)) { if (pending.data) merged.set(id, pending.data); else merged.delete(id); }
    this.items = [...merged.values()]; this.options.setItems(this.items);
  }
  async sync(): Promise<void> {
    if (this.owner === null) return;
    if (this.journalIssue && !this.readMeta()) return;
    if (this.running) { this.rerun = true; return this.running; }
    const owner = this.owner, generation = this.generation;
    const current = () => owner === this.owner && generation === this.generation;
    if (!this.options.online()) { this.report('offline'); return; }
    const run = async () => {
      do {
        this.rerun = false; this.report('syncing');
        let fetched = false;
        try {
          const rows = await this.options.transport.list(owner, this.options.kind); if (!current()) return;
          fetched = true;
          this.remote = new Map(rows.map(row => [row.item_id, row]));
          // Import only records missing from the account, including its deletion history.
          // Never assign legacy unowned localStorage entries to the signed-in user.
          if (!this.meta.migrated) {
            for (const item of this.items) {
              const remote = this.remote.get(item.id);
              if (!this.meta.pending[item.id] && (!remote || (!remote.deleted && !equal(remote.data, item)))) this.meta.pending[item.id] = { data: item, expectedRevision: null, operation: this.options.uuid() };
            }
            this.meta.migrated = true;
          }
          this.conflicts.clear();
          for (const row of rows) this.meta.versions[row.item_id] = row.revision;
          for (const [id, entry] of Object.entries(this.meta.pending).sort((a,b) => Number(a[1].data !== null) - Number(b[1].data !== null))) {
            if (!current()) return;
            const remote = this.remote.get(id);
            if (remote && (remote.last_operation === entry.operation || (remote.deleted && entry.data === null) || (!remote.deleted && equal(remote.data, entry.data)))) {
              if (this.meta.pending[id]?.operation === entry.operation) delete this.meta.pending[id];
              continue;
            }
            if ((remote?.revision ?? null) !== entry.expectedRevision) { this.conflicts.add(id); continue; }
            const result = await this.options.transport.write(owner, this.options.kind, id, entry); if (!current()) return;
            this.remote.set(id, result.record); this.meta.versions[id] = result.record.revision;
            if (result.applied) {
              if (this.meta.pending[id]?.operation === entry.operation) delete this.meta.pending[id];
              else if (this.meta.pending[id]) this.meta.pending[id].expectedRevision = result.record.revision;
            } else this.conflicts.add(id);
            this.persist();
          }
          this.persist(); this.publish();
          this.options.status({ phase: this.storageUnavailable && Object.keys(this.meta.pending).length ? 'error' : this.conflicts.size ? 'conflict' : Object.keys(this.meta.pending).length ? 'idle' : 'synced', pending: Object.keys(this.meta.pending).length, conflicts: this.conflicts.size, lastSyncedAt: new Date().toISOString(), storageUnavailable: this.storageUnavailable });
        } catch (error) {
          if (!current()) return;
          this.persist(); if (fetched) this.publish(); this.report(this.options.online() ? 'error' : 'offline', error instanceof Error ? error.message : 'Account sync failed');
        }
      } while (this.rerun && current());
    };
    const promise = run(); this.running = promise;
    try { await promise; } finally { if (current() && this.running === promise) this.running = null; }
  }
  async resolve(choice: 'local' | 'account'): Promise<void> {
    if (!this.conflicts.size) return;
    for (const id of this.conflicts) {
      if (choice === 'account') delete this.meta.pending[id];
      else if (this.meta.pending[id]) { this.meta.pending[id].expectedRevision = this.remote.get(id)?.revision ?? null; this.meta.pending[id].operation = this.options.uuid(); }
    }
    this.conflicts.clear(); this.persist(); this.publish(); await this.sync();
  }
  async recoverJournal(): Promise<void> {
    if (!this.journalIssue || this.owner === null || !this.options.recoverMeta) return;
    try {
      this.options.recoverMeta(this.owner);
      if (!this.readMeta()) return;
      this.persist(); await this.sync();
    } catch { this.journalIssue = true; this.report('error','Recovery copy could not be saved; stored data is unchanged'); }
  }
}
