import type { StateStorage } from 'zustand/middleware';

let owner: number | null = null;
let switching = false;
const listeners = new Set<() => void | Promise<void>>();
let activation = Promise.resolve();

/** Current app-profile owner; collection services use this without importing Auth. */
export function getPrivateDataOwner(): number | null { return owner; }

// Legacy unscoped keys are deliberately preserved but never assigned to an
// unknown account. New data stays available when its owner signs in again.
export const privateStorage: StateStorage = {
  getItem: (name) => owner === null ? null : localStorage.getItem(`${name}:user:${owner}`),
  setItem: (name, value) => {
    if (owner !== null && !switching) localStorage.setItem(`${name}:user:${owner}`, value);
  },
  removeItem: (name) => {
    if (owner !== null && !switching) localStorage.removeItem(`${name}:user:${owner}`);
  },
};

export function registerPrivateStore(resetAndHydrate: () => void | Promise<void>): void {
  listeners.add(resetAndHydrate);
}

export function activatePrivateDataOwner(userId: number | null): Promise<void> {
  activation = activation.catch(() => {}).then(async () => {
    if (owner === userId) return;
    switching = true;
    owner = userId;
    try {
      await Promise.all([...listeners].map((reset) => reset()));
    } finally {
      switching = false;
    }
  });
  return activation;
}
