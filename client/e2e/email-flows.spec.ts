import { randomUUID } from 'node:crypto';
import { request, type APIRequestContext } from '@playwright/test';
import { test, expect, environment } from './fixtures';

async function capturedLink(mail: APIRequestContext, email: string, subject: RegExp): Promise<string> {
  let id: string | undefined;
  await expect.poll(async () => {
    const response = await mail.get('api/v1/messages');
    if (!response.ok()) return false;
    const inbox = await response.json() as { messages: { ID: string; Subject: string; To: { Address: string }[] }[] };
    id = inbox.messages.find(message => subject.test(message.Subject) && message.To.some(to => to.Address === email))?.ID;
    return Boolean(id);
  }, { timeout: 20_000 }).toBe(true);
  const detail = await mail.get('api/v1/message/' + id);
  expect(detail.ok()).toBeTruthy();
  const content = await detail.json() as { HTML: string; Text: string };
  const link = (content.HTML || content.Text).replace(/&amp;/g, '&').match(/http:\/\/127\.0\.0\.1:\d+\/backend\/auth\/v1\/verify\?[^\s"'<>]+/)?.[0];
  expect(link, 'Confirmation/reset link was not captured').toBeTruthy();
  expect(new URL(link!).origin).toBe(new URL(environment.apiUrl).origin);
  return link!;
}

test('signup confirmation and password recovery reach the local-only SMTP capture', async ({ page }) => {
  const email = 'ci-signup-' + randomUUID() + '@example.invalid';
  const password = 'Ci-' + randomUUID();
  const nextPassword = 'Ci-next-' + randomUUID();
  const mail = await request.newContext({ baseURL: environment.mailUrl + '/' });
  const auth = await request.newContext({ baseURL: environment.apiUrl + '/', extraHTTPHeaders: { apikey: environment.anonKey } });
  try {
    await page.goto('/register');
    await page.getByRole('textbox', { name: 'Email', exact: true }).fill(email);
    await page.getByLabel('Password', { exact: true }).fill(password);
    await page.getByLabel('Confirm Password', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Create Account', exact: true }).click();
    const confirmation = await capturedLink(mail, email, /confirm|sign.?up/i);
    await page.goto(confirmation);
    await expect.poll(() => new URL(page.url()).origin).toBe(new URL(environment.appUrl).origin);
    expect((await auth.post('auth/v1/token?grant_type=password', { data: { email, password } })).ok()).toBeTruthy();
    await page.goto('/forgot-password');
    await page.getByRole('textbox', { name: 'Email Address', exact: true }).fill(email);
    await page.getByRole('button', { name: 'Send Reset Link', exact: true }).click();
    const recovery = await capturedLink(mail, email, /reset|recover/i);
    await page.goto(recovery);
    await expect(page).toHaveURL(/\/reset-password/);
    await page.locator('input[type=password]').nth(0).fill(nextPassword);
    await page.locator('input[type=password]').nth(1).fill(nextPassword);
    await page.getByRole('button', { name: 'Update Password', exact: true }).click();
    await expect(page.getByText('Password updated!', { exact: true })).toBeVisible();
    expect((await auth.post('auth/v1/token?grant_type=password', { data: { email, password: nextPassword } })).ok()).toBeTruthy();
    expect((await auth.post('auth/v1/token?grant_type=password', { data: { email, password } })).ok()).toBeFalsy();
  } finally { await mail.dispose(); await auth.dispose(); }
});
