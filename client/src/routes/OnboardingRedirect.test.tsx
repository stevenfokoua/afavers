// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
const { getSettings } = vi.hoisted(() => ({ getSettings: vi.fn() }));
vi.mock('../services/settings.service', () => ({ settingsService: { get: getSettings } }));
vi.mock('react-router-dom', () => ({ useLocation: () => ({ pathname: '/jobs' }), Navigate: () => null }));
vi.mock('../store/authStore', () => ({ useAuthStore: (selector: (state: unknown) => unknown) => selector({ user: { id: 123 } }) }));
import { markSetupSeen, OnboardingRedirect } from './OnboardingRedirect';

it('remembers completed setup in this tab when browser storage is blocked', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
  const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
  expect(() => markSetupSeen(123)).not.toThrow();
  const host = document.createElement('div'); const root = createRoot(host);
  try {
    await act(async () => root.render(<OnboardingRedirect><p>Results ready</p></OnboardingRedirect>));
    expect(host.textContent).toBe('Results ready');
    expect(getSettings).not.toHaveBeenCalled();
  } finally { act(() => root.unmount()); setItem.mockRestore(); getItem.mockRestore(); }
});
