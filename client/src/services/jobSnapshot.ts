import { registerPrivateStore } from '../store/privateStorage';

// One account, one short-lived in-memory snapshot. Never persist private jobs.
const TTL_MS = 30_000;
let snapshot: { userId: number; expiresAt: number; promise: Promise<unknown> } | undefined;
const searchSnapshots = new Map<string, { expiresAt: number; promise: Promise<unknown> }>();
let generation = 0;

export function invalidateJobSnapshot(): void {
  snapshot = undefined;
  searchSnapshots.clear();
  generation++;
}

/** Only a few account/query snapshots live in memory; never persist search data. */
export function readJobSearchSnapshot<T>(userId: number, query: string, load: () => Promise<T>): Promise<T> {
  const key = JSON.stringify([userId, query]);
  const cached = searchSnapshots.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.promise as Promise<T>;
  searchSnapshots.delete(key);
  while (searchSnapshots.size >= 4) searchSnapshots.delete(searchSnapshots.keys().next().value!);
  const version = generation;
  const entry = { expiresAt: Number.POSITIVE_INFINITY, promise: Promise.resolve() as Promise<unknown> };
  entry.promise = load().then(value => {
    if (generation !== version) throw new Error('Your search data changed. Please retry.');
    entry.expiresAt = Date.now() + TTL_MS;
    return value;
  }).catch(error => {
    if (searchSnapshots.get(key) === entry) searchSnapshots.delete(key);
    throw error;
  });
  searchSnapshots.set(key, entry);
  return entry.promise as Promise<T>;
}

export function readJobSnapshot<T>(userId: number, load: () => Promise<T>): Promise<T> {
  if (snapshot?.userId === userId && snapshot.expiresAt > Date.now()) {
    return snapshot.promise as Promise<T>;
  }
  const entry = { userId, expiresAt: Number.POSITIVE_INFINITY, promise: Promise.resolve() as Promise<unknown> };
  entry.promise = load().then((value) => {
    entry.expiresAt = Date.now() + TTL_MS;
    return value;
  }, (error) => {
    if (snapshot === entry) snapshot = undefined;
    throw error;
  });
  snapshot = entry;
  return entry.promise as Promise<T>;
}

registerPrivateStore(invalidateJobSnapshot);
