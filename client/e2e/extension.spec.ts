import { createHash } from 'node:crypto';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { chromium, type BrowserContext } from '@playwright/test';
import { test, expect, environment } from './fixtures';

// Public test identity only: no private key, production manifest or browser
// profile is changed. Chromium derives the installed id from this DER key.
const TEST_KEY = 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAp39fBiJ0orlqugym3NE+Y6kiTbYJeX4AnRPdB2ams8a8wkPhFMI07U67FR5Cm8fFSbE7YrVtOQZLqPDD5ZbwGGxdg4M40fo1PMNtt1oTjPCezEON33QVo12fnq5hRT91X8MRNw3pmzkLUJ6QvcAQa37OtyvrFOvf8mzbFRcAM9iwM7URhWhFUfE5aWEjY7MqaBpiAyg2PsMq8G6c00NwEMahobU6yqpAvK/Aqxn1Yitd9JDrV3IMeOPdCBFVwhaWGwCxXO42FYgdtPK/yAOtyelSXxkcFZf+rV9UWPKCqAqs4FwYRrplmVLSpt882Eri7+sdD7xRUJfa30Ll7dUoLwIDAQAB';
const EXTENSION_ID = [...createHash('sha256').update(Buffer.from(TEST_KEY, 'base64')).digest('hex').slice(0, 32)].map(character => String.fromCharCode(97 + parseInt(character, 16))).join('');

test.describe('installed Chromium extension', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'Unpacked Chrome extensions require Chromium');

  test('popup signs in, saves a manual capture, preserves preparation and signs out', async ({ account, backend }) => {
    const root = await mkdtemp(join(tmpdir(), 'afavers-extension-'));
    await writeFile(join(root, '.owner'), environment.owner);
    const installed = join(root, 'extension');
    let context: BrowserContext | undefined;
    try {
      await mkdir(installed);
      const source = resolve(process.cwd(), '../extension');
      for (const name of ['manifest.json', 'popup.html', 'popup.css', 'popup.bundle.js', 'config.js', 'content.js']) await cp(join(source, name), join(installed, name));
      await cp(join(source, 'icons'), join(installed, 'icons'), { recursive: true });
      const manifest = JSON.parse(await readFile(join(installed, 'manifest.json'), 'utf8')) as { key?: string; host_permissions: string[] };
      manifest.key = TEST_KEY;
      manifest.host_permissions = [...manifest.host_permissions.filter(permission => !permission.includes('YOUR-PROJECT-REF')), new URL(environment.apiUrl).origin + '/*'];
      await writeFile(join(installed, 'manifest.json'), JSON.stringify(manifest));
      await writeFile(join(installed, 'config.js'), 'self.__AFAVERS_CONFIG__ = ' + JSON.stringify({ SUPABASE_URL: environment.apiUrl, SUPABASE_ANON_KEY: environment.anonKey, DASHBOARD_URL: environment.appUrl + '/jobs' }) + ';\n');
      context = await chromium.launchPersistentContext('', { channel: 'chromium', headless: true, args: [`--disable-extensions-except=${installed}`, `--load-extension=${installed}`] });
      const popup = await context.newPage();
      await popup.goto(`chrome-extension://${EXTENSION_ID}/popup.html`);
      await popup.getByPlaceholder('Email', { exact: true }).fill(account.email);
      await popup.getByPlaceholder('Password', { exact: true }).fill(account.password);
      await popup.getByRole('button', { name: 'Sign In', exact: true }).click();
      await expect(popup.locator('#user-email')).toHaveText(account.email);
      await expect(popup.locator('#capture-form')).toBeVisible();
      // Opening popup.html as a tab uses the real manual-entry fallback. This
      // verifies installed auth/storage/save APIs, not toolbar auto-extraction.
      const title = 'CI extension capture ' + account.authId;
      const fillCapture = async () => {
        await popup.locator('#field-title').fill(title);
        await popup.locator('#field-company').fill('CI extension studio');
        await popup.locator('#field-location').fill('Köln');
      };
      await fillCapture();
      await popup.locator('#field-status').selectOption('applied');
      await popup.getByRole('button', { name: 'Save to afavers', exact: true }).click();
      await expect(popup.getByText('Job saved!', { exact: true })).toBeVisible();
      const captured = await backend.rows<{ id: number; owner_user_id: number; is_manual: boolean }>(`jobs?select=id,owner_user_id,is_manual&owner_user_id=eq.${account.profileId}&title=eq.${encodeURIComponent(title)}`);
      expect(captured).toHaveLength(1);
      expect(captured[0]).toMatchObject({ owner_user_id: account.profileId, is_manual: true });
      const overlayPath = `user_jobs?user_id=eq.${account.profileId}&job_id=eq.${captured[0].id}`;
      expect((await backend.api.patch('rest/v1/' + overlayPath, { data: { notes: 'Preparation survives another capture', checklist: { 'CV tailored': true, 'Application submitted': true } } })).ok()).toBeTruthy();
      await popup.getByRole('button', { name: 'Save another job', exact: true }).click();
      await expect(popup.locator('#capture-form')).toBeVisible();
      await fillCapture();
      await popup.locator('#field-status').selectOption('preparing');
      await popup.getByRole('button', { name: 'Save to afavers', exact: true }).click();
      await expect(popup.getByText('Job saved!', { exact: true })).toBeVisible();
      expect(await backend.rows(`jobs?select=id&owner_user_id=eq.${account.profileId}&title=eq.${encodeURIComponent(title)}`)).toHaveLength(1);
      expect(await backend.rows(overlayPath + '&select=status,notes,checklist')).toEqual([{ status: 'preparing', notes: 'Preparation survives another capture', checklist: { 'CV tailored': true, 'Application submitted': true } }]);
      await popup.reload();
      await expect(popup.locator('#user-email')).toHaveText(account.email);
      await expect(popup.locator('#capture-form')).toBeVisible();
      await popup.locator('#logout-btn').click();
      await expect(popup.getByRole('button', { name: 'Sign In', exact: true })).toBeVisible();
      await popup.reload();
      await expect(popup.getByRole('button', { name: 'Sign In', exact: true })).toBeVisible();
    } finally {
      try {
        // Playwright Test already owns tracing for custom contexts as well.
        if (context) await context.close();
      } finally {
        if (dirname(root) !== tmpdir() || (await readFile(join(root, '.owner'), 'utf8')) !== environment.owner) throw new Error('Refusing cleanup of an unowned extension fixture');
        await rm(root, { recursive: true, force: true });
      }
    }
  });
});
