// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { SetupPage } from './SetupPage';
import { settingsService } from '../services/settings.service';

const { navigate, markSeen } = vi.hoisted(() => ({ navigate: vi.fn(), markSeen: vi.fn() }));
vi.mock('react-router-dom', () => ({ useNavigate: () => navigate }));
vi.mock('../services/settings.service', () => ({ settingsService: { save: vi.fn() } }));
vi.mock('../routes/OnboardingRedirect', () => ({ markSetupSeen: markSeen }));
vi.mock('../store/authStore', () => ({ useAuthStore: (selector: (state: unknown) => unknown) => selector({ user: { id: 99 } }) }));
vi.mock('../store/languageStore', () => ({ useLanguage: () => ({ t: (key: string) => key, lang: 'en' }) }));
vi.mock('../components/common/LanguageToggle', () => ({ LanguageToggle: () => null }));
let root: Root | undefined;
let host: HTMLDivElement;
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  if (root) act(() => root!.unmount());
  document.body.innerHTML = ''; vi.clearAllMocks(); localStorage.clear();
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
function renderPage() { act(() => root!.render(<SetupPage />)); }
function button(name: string) {
  const found = [...host.querySelectorAll('button')].find((item) => item.textContent?.includes(name));
  if (!found) throw new Error('Missing button ' + name);
  return found;
}
function click(name: string) { act(() => button(name).click()); }
afterEach(() => vi.restoreAllMocks());


function completeChoices() {
  renderPage(); click('setupFeed'); click('Tech / IT'); click('setupNext'); click('Berlin'); click('setupNext');
}

describe('onboarding recovery and first results', () => {
  it('completes after a server save when optional device storage is full', async () => {
    vi.mocked(settingsService.save).mockResolvedValueOnce();
    completeChoices();
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota'); });
    await act(async () => button('setupFindJobs').click());
    expect(markSeen).toHaveBeenCalledWith(99);
    expect(navigate).toHaveBeenCalledWith('/jobs?sort=match_score');
    expect(host.querySelector('[role=alert]')).toBeNull();
  });
  it('keeps choices on save failure and allows a successful retry without forcing high-match-only results', async () => {
    vi.mocked(settingsService.save).mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce();
    completeChoices();
    await act(async () => button('setupFindJobs').click());
    expect(host.querySelector('[role=alert]')?.textContent).toContain('Your choices are still here');
    expect(navigate).not.toHaveBeenCalled();
    expect(markSeen).not.toHaveBeenCalled();
    await act(async () => button('setupFindJobs').click());
    expect(navigate).toHaveBeenCalledWith('/jobs?sort=match_score');
    expect(settingsService.save).toHaveBeenLastCalledWith(expect.objectContaining({ locations: 'Berlin', keywords: expect.stringContaining('developer') }));
    expect(localStorage.getItem('afavers-search-profile:user:99')).not.toBeNull();
    expect(localStorage.getItem('afavers-search-profile')).toBeNull();
  });
  it('takes skip directly to browsing without saving defaults', () => {
    renderPage(); click('setupSkip');
    expect(markSeen).toHaveBeenCalledWith(99);
    expect(navigate).toHaveBeenCalledWith('/jobs');
    expect(settingsService.save).not.toHaveBeenCalled();
  });
});
