import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { test as base, expect, request, type APIRequestContext, type Browser, type BrowserContext, type Page } from '@playwright/test';

type TestEnvironment = { apiUrl: string; anonKey: string; serviceKey: string; owner: string; mailUrl: string; appUrl: string };
export const environment: TestEnvironment = JSON.parse(readFileSync(process.env.AFAVERS_E2E_ENV!, 'utf8'));
for (const value of [environment.apiUrl, environment.mailUrl, environment.appUrl]) {
  const url = new URL(value);
  if (url.protocol !== 'http:' || !['localhost', '127.0.0.1'].includes(url.hostname)) throw new Error('Refusing a non-disposable E2E endpoint');
}

export type Account = { email: string; password: string; authId: string; profileId: number };
export type Backend = {
  api: APIRequestContext;
  createAccount(): Promise<Account>;
  rows<T = Record<string, unknown>>(path: string): Promise<T[]>;
};

export const test = base.extend<{ account: Account; backend: Backend }>({
  backend: async ({}, use) => {
    const api = await request.newContext({ baseURL: environment.apiUrl + '/', extraHTTPHeaders: { apikey: environment.anonKey, Authorization: 'Bearer ' + environment.serviceKey } });
    const accounts: Account[] = [];
    const rows = async <T = Record<string, unknown>>(path: string): Promise<T[]> => {
      const response = await api.get('rest/v1/' + path);
      expect(response.ok(), 'Disposable backend query failed').toBeTruthy();
      return response.json() as Promise<T[]>;
    };
    try {
      await use({ api, rows, createAccount: async () => {
        const email = 'ci-' + randomUUID() + '@example.invalid';
        const password = 'Ci-' + randomUUID() + '-pass';
        const response = await api.post('auth/v1/admin/users', { data: { email, password, email_confirm: true, user_metadata: { afavers_resource_owner: environment.owner, purpose: 'disposable browser regression' } } });
        expect(response.ok()).toBeTruthy();
        const user = await response.json() as { id: string };
        const profiles = await rows<{ id: number }>('users?select=id&auth_user_id=eq.' + user.id);
        expect(profiles).toHaveLength(1);
        const account = { email, password, authId: user.id, profileId: profiles[0].id };
        accounts.push(account);
        const settings = await api.patch('rest/v1/user_settings?user_id=eq.' + account.profileId, { data: { keywords: 'GIS, IT, data analyst', locations: 'Köln, Düsseldorf' } });
        expect(settings.ok()).toBeTruthy();
        return account;
      } });
    } finally {
      for (const account of accounts) {
        const current = await api.get('auth/v1/admin/users/' + account.authId);
        if (current.ok()) {
          const user = await current.json() as { email: string; user_metadata?: { afavers_resource_owner?: string } };
          expect(user.email).toBe(account.email);
          expect(user.user_metadata?.afavers_resource_owner).toBe(environment.owner);
          expect((await api.delete('auth/v1/admin/users/' + account.authId)).ok()).toBeTruthy();
        }
      }
      await api.dispose();
    }
  },
  account: async ({ backend }, use) => use(await backend.createAccount()),
});

export { expect };

export async function signIn(page: Page, account: Account): Promise<void> {
  await page.goto(environment.appUrl + '/login');
  await page.getByRole('textbox', { name: 'Email', exact: true }).fill(account.email);
  await page.getByLabel('Password', { exact: true }).fill(account.password);
  await page.getByRole('button', { name: 'Sign In', exact: true }).click();
  await expect(page).toHaveURL(/\/(setup|dashboard|jobs)(?:[?#]|$)/);
  if (new URL(page.url()).pathname === '/setup') await page.getByRole('button', { name: "Skip — I'll set up later", exact: true }).click();
  await expect(page).toHaveURL(/\/(dashboard|jobs)(?:[?#]|$)/);
}

export async function secondDevice(browser: Browser, account: Account): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, baseURL: environment.appUrl, serviceWorkers: 'block' });
  const page = await context.newPage();
  await signIn(page, account);
  return { context, page };
}

export function futureDate(days = 1): string {
  const date = new Date(); date.setUTCDate(date.getUTCDate() + days); return date.toISOString().slice(0, 10);
}
