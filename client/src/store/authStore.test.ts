import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../services/accountSync', () => ({ registerAccountCollection: () => ({ activate: vi.fn(), put: vi.fn(), remove: vi.fn() }) }));
const { signOut } = vi.hoisted(() => {
  const data = new Map<string, string>();
  const storage = { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); }, removeItem: (key: string) => { data.delete(key); } };
  vi.stubGlobal('sessionStorage', storage); vi.stubGlobal('localStorage', storage);
  return { signOut: vi.fn() };
});
vi.mock('../lib/supabase', () => ({ supabase: { auth: { signOut, getSession: vi.fn().mockResolvedValue({ data: { session: null } }), onAuthStateChange: vi.fn() } } }));
vi.mock('../services/notification.service', () => ({ cancelReminder: vi.fn().mockResolvedValue(undefined), scheduleReminder: vi.fn().mockResolvedValue(undefined) }));
import { useAuthStore } from './authStore';
import { activatePrivateDataOwner } from './privateStorage';
import { invalidateJobSnapshot, readJobSnapshot } from '../services/jobSnapshot';

beforeEach(async () => { await Promise.resolve(); vi.clearAllMocks(); invalidateJobSnapshot(); await activatePrivateDataOwner(1); useAuthStore.setState({ user: { id: 1, email: 'test@example.invalid' }, isAuthenticated: true }); });
describe('logout and job cache race', () => {
  it('clears a snapshot started while remote sign-out is still pending', async () => {
    let complete!: () => void;
    signOut.mockImplementationOnce(() => new Promise<void>((resolve) => { complete = resolve; }));
    const logout = useAuthStore.getState().logout();
    await vi.waitFor(() => expect(signOut).toHaveBeenCalled());
    const load = vi.fn().mockResolvedValue(['private account A']);
    await readJobSnapshot(1, load);
    complete(); await logout;
    expect(useAuthStore.getState().user).toBeNull();
    await readJobSnapshot(1, load);
    expect(load).toHaveBeenCalledTimes(2);
  });
});
