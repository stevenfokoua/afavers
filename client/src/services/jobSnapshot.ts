import { registerPrivateStore } from '../store/privateStorage';

// One account, one short-lived in-memory snapshot. Never persist private jobs.
const TTL_MS = 30_000;
let snapshot: { userId: number; expiresAt: number; promise: Promise<unknown> } | undefined;

export function invalidateJobSnapshot(): void {
  snapshot = undefined;
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
