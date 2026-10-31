import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { invalidateJobSnapshot, readJobSearchSnapshot, readJobSnapshot } from './jobSnapshot';
import { activatePrivateDataOwner } from '../store/privateStorage';

beforeEach(invalidateJobSnapshot);
afterEach(() => vi.restoreAllMocks());

describe('account-scoped job snapshot', () => {
  it('makes one read across sequential filters, then expires after thirty seconds', async () => {
    const clock = vi.spyOn(Date, 'now').mockReturnValue(1000);
    const load = vi.fn().mockResolvedValue(['job']);
    for (let i = 0; i < 6; i++) await readJobSnapshot(1, load);
    expect(load).toHaveBeenCalledTimes(1);
    clock.mockReturnValue(31_001);
    await readJobSnapshot(1, load);
    expect(load).toHaveBeenCalledTimes(2);
  });
  it('never serves one user another user’s snapshot and clears on logout', async () => {
    await activatePrivateDataOwner(1);
    const a = vi.fn().mockResolvedValue(['private A']);
    const b = vi.fn().mockResolvedValue(['private B']);
    expect(await readJobSnapshot(1, a)).toEqual(['private A']);
    expect(await readJobSnapshot(2, b)).toEqual(['private B']);
    await activatePrivateDataOwner(null);
    await readJobSnapshot(2, b);
    expect(b).toHaveBeenCalledTimes(2);
  });
  it('evicts failed loads so retry can recover', async () => {
    const load = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(['online']);
    await expect(readJobSnapshot(1, load)).rejects.toThrow('offline');
    expect(await readJobSnapshot(1, load)).toEqual(['online']);
  });
  it('does not republish an invalidated in-flight response', async () => {
    let finish!: (value: string[]) => void;
    const old = readJobSnapshot(1, () => new Promise<string[]>((resolve) => { finish = resolve; }));
    invalidateJobSnapshot();
    const loadNew = vi.fn().mockResolvedValue(['new']);
    await readJobSnapshot(1, loadNew);
    finish(['old']);
    await old;
    expect(await readJobSnapshot(1, loadNew)).toEqual(['new']);
    expect(loadNew).toHaveBeenCalledTimes(1);
  });
});

describe('bounded account/query search cache', () => {
  it('shares a query for thirty seconds, scopes by owner, and clears with mutations/logout', async () => {
    const clock = vi.spyOn(Date, 'now').mockReturnValue(1000);
    await activatePrivateDataOwner(1);
    const load = vi.fn().mockResolvedValue(['public candidates']);
    await readJobSearchSnapshot(1, 'gis', load);
    await readJobSearchSnapshot(1, 'gis', load);
    expect(load).toHaveBeenCalledTimes(1);
    await readJobSearchSnapshot(2, 'gis', load);
    expect(load).toHaveBeenCalledTimes(2);
    clock.mockReturnValue(31_001);
    await readJobSearchSnapshot(1, 'gis', load);
    expect(load).toHaveBeenCalledTimes(3);
    invalidateJobSnapshot();
    await readJobSearchSnapshot(1, 'gis', load);
    await activatePrivateDataOwner(null);
    await readJobSearchSnapshot(1, 'gis', load);
    expect(load).toHaveBeenCalledTimes(5);
  });
  it('retains only four queries and rejects an invalidated in-flight result', async () => {
    const load = vi.fn().mockResolvedValue([]);
    for (const query of ['one', 'two', 'three', 'four', 'five']) await readJobSearchSnapshot(1, query, load);
    await readJobSearchSnapshot(1, 'one', load);
    expect(load).toHaveBeenCalledTimes(6);
    let finish!: (value: string[]) => void;
    const old = readJobSearchSnapshot(1, 'pending', () => new Promise<string[]>(resolve => { finish = resolve; }));
    invalidateJobSnapshot(); finish(['obsolete']);
    await expect(old).rejects.toThrow('changed');
  });
});
