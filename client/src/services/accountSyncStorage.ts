/** Keep unreadable journal text intact until the user explicitly reconnects. */
export function loadSyncJournal(storage: Pick<Storage,'getItem'>, key: string): unknown {
  const raw = storage.getItem(key); return raw === null ? null : JSON.parse(raw);
}

export function recoverSyncJournal(storage: Pick<Storage,'getItem' | 'setItem'>, key: string, recoveryId: string): void {
  const raw = storage.getItem(key);
  if (raw !== null) {
    const recoveryKey = `${key}:recovery:${recoveryId}`;
    if (storage.getItem(recoveryKey) !== null) throw new Error('Existing recovery data preserved');
    // If the recovery copy cannot be stored, leave the original journal alone.
    storage.setItem(recoveryKey,raw);
  }
  storage.setItem(key,JSON.stringify({ migrated:false,versions:{},pending:{} }));
}
