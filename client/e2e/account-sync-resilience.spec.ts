import { randomUUID } from 'node:crypto';
import type { BrowserContext, Page, Route } from '@playwright/test';
import { test, expect, signIn, secondDevice, futureDate, type Account, type Backend } from './fixtures';

type ReminderData = { id: string; title: string; notes?: string; completed: boolean };
type StoredReminder = { item_id: string; data: ReminderData | null; deleted: boolean; revision: number };
const collectionRequest = (url: URL) => url.pathname === '/backend/rest/v1/account_items' || url.pathname === '/backend/rest/v1/rpc/write_account_item';
const abortCollection = (route: Route) => route.abort('internetdisconnected');
const synced = (page: Page) => expect(page.getByText('Synced to your account.', { exact: true })).toBeVisible();

async function stored(backend: Backend, account: Account, id: string): Promise<StoredReminder> {
  const rows = await backend.rows<StoredReminder>(`account_items?select=item_id,data,deleted,revision&user_id=eq.${account.profileId}&collection=eq.reminders&item_id=eq.${id}`);
  expect(rows).toHaveLength(1);
  return rows[0];
}

async function createReminder(page: Page, backend: Backend, account: Account, title: string): Promise<string> {
  await page.goto('/reminders');
  await page.getByLabel('New Reminder', { exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'New reminder', exact: true });
  await dialog.getByRole('textbox', { name: 'Title', exact: true }).fill(title);
  await dialog.getByRole('textbox', { name: 'Notes', exact: true }).fill('Initial account note');
  await dialog.getByLabel('Date', { exact: true }).fill(futureDate(2));
  await dialog.getByLabel('Time', { exact: true }).fill('15:00');
  await dialog.getByLabel('Timezone', { exact: true }).fill('Europe/Berlin');
  await dialog.getByRole('button', { name: 'Add', exact: true }).click();
  let id = '';
  await expect.poll(async () => {
    const rows = await backend.rows<StoredReminder>(`account_items?select=item_id,data,deleted,revision&user_id=eq.${account.profileId}&collection=eq.reminders&deleted=eq.false`);
    id = rows.find(row => row.data?.title === title)?.item_id ?? '';
    return Boolean(id);
  }).toBe(true);
  await synced(page);
  return id;
}

async function editNotes(page: Page, title: string, notes: string): Promise<void> {
  await page.getByRole('button', { name: 'Delete: ' + title, exact: true }).click();
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Edit reminder', exact: true });
  await dialog.getByRole('textbox', { name: 'Notes', exact: true }).fill(notes);
  await dialog.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText(notes, { exact: true })).toBeVisible();
}

async function interruptCollection(context: BrowserContext): Promise<void> {
  await context.route(collectionRequest, abortCollection);
  await context.setOffline(true);
}

async function reloadDuringCollectionOutage(page: Page): Promise<void> {
  // A static page needs a network connection to reload. Resume Auth/static
  // transport while keeping the collection requests unavailable across reload.
  await page.context().setOffline(false);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Retry sync', exact: true })).toBeVisible();
}

async function reconnect(page: Page): Promise<void> {
  // Restore the real transport before emitting the browser's online event.
  // This also tests automatic replay instead of racing a disappearing Retry.
  await page.context().setOffline(true);
  await page.context().unroute(collectionRequest, abortCollection);
  await page.context().setOffline(false);
}

test('an offline edit survives reload and reaches the real account after reconnect', async ({ page, browser, account, backend }) => {
  await signIn(page, account);
  const title = 'CI offline edit';
  const id = await createReminder(page, backend, account, title);
  await interruptCollection(page.context());
  await editNotes(page, title, 'Offline note survives document reload');
  expect((await stored(backend, account, id)).data?.notes).toBe('Initial account note');
  await reloadDuringCollectionOutage(page);
  await expect(page.getByText('Offline note survives document reload', { exact: true })).toBeVisible();
  expect((await stored(backend, account, id)).data?.notes).toBe('Initial account note');
  await reconnect(page);
  await expect.poll(async () => (await stored(backend, account, id)).data?.notes).toBe('Offline note survives document reload');
  await synced(page);
  const other = await secondDevice(browser, account);
  try {
    await other.page.goto('/reminders');
    await synced(other.page);
    await expect(other.page.getByText('Offline note survives document reload', { exact: true })).toBeVisible();
  } finally { await other.context.close(); }
});

test('an offline deletion survives reload and an older real device cannot resurrect it', async ({ page, browser, account, backend }) => {
  await signIn(page, account);
  const title = 'CI offline deletion';
  const id = await createReminder(page, backend, account, title);
  const other = await secondDevice(browser, account);
  try {
    await other.page.goto('/reminders');
    await synced(other.page);
    await expect(other.page.getByRole('button', { name: 'Complete: ' + title, exact: true })).toBeVisible();
    await interruptCollection(page.context());
    await page.getByRole('button', { name: 'Delete: ' + title, exact: true }).click();
    await page.getByRole('button', { name: 'Delete', exact: true }).click();
    await expect(page.getByText(title, { exact: true })).toHaveCount(0);
    expect((await stored(backend, account, id)).deleted).toBe(false);
    await reloadDuringCollectionOutage(page);
    await expect(page.getByText(title, { exact: true })).toHaveCount(0);
    expect((await stored(backend, account, id)).deleted).toBe(false);
    await reconnect(page);
    await expect.poll(async () => (await stored(backend, account, id)).deleted).toBe(true);
    await synced(page);
    await other.page.reload();
    await synced(other.page);
    await expect(other.page.getByText(title, { exact: true })).toHaveCount(0);
    expect((await stored(backend, account, id)).deleted).toBe(true);
  } finally { await other.context.close(); }
});

test('two real devices preserve conflicting edits until each explicit resolution choice', async ({ page, browser, account, backend }) => {
  await signIn(page, account);
  const title = 'CI conflicting reminder';
  const id = await createReminder(page, backend, account, title);
  const other = await secondDevice(browser, account);
  try {
    await other.page.goto('/reminders');
    await synced(other.page);
    await expect(other.page.getByRole('button', { name: 'Complete: ' + title, exact: true })).toBeVisible();
    for (const choice of ['local', 'account'] as const) {
      const localNote = 'Device B pending ' + choice;
      const accountNote = 'Device A accepted ' + choice;
      await interruptCollection(other.context);
      await editNotes(other.page, title, localNote);
      await editNotes(page, title, accountNote);
      await expect.poll(async () => (await stored(backend, account, id)).data?.notes).toBe(accountNote);
      await synced(page);
      await other.context.setOffline(false);
      await expect(other.page.getByRole('button', { name: 'Retry sync', exact: true })).toBeVisible();
      await reconnect(other.page);
      await expect(other.page.getByText('This device and your account have different changes. Your edits are kept here.', { exact: true })).toBeVisible();
      await expect(other.page.getByText(localNote, { exact: true })).toBeVisible();
      const beforeResolution = await stored(backend, account, id);
      expect(beforeResolution.data?.notes).toBe(accountNote);
      await other.page.getByRole('button', { name: choice === 'local' ? 'Keep this device’s changes' : 'Use account version', exact: true }).click();
      const expected = choice === 'local' ? localNote : accountNote;
      await expect.poll(async () => (await stored(backend, account, id)).data?.notes).toBe(expected);
      await synced(other.page);
      await expect(other.page.getByText(expected, { exact: true })).toBeVisible();
      if (choice === 'account') expect((await stored(backend, account, id)).revision).toBe(beforeResolution.revision);
      await page.reload();
      await synced(page);
      await expect(page.getByText(expected, { exact: true })).toBeVisible();
    }
  } finally { await other.context.close(); }
});

test('a delayed real account read cannot overwrite the next signed-in account', async ({ page, account, backend }) => {
  const nextAccount = await backend.createAccount();
  const session = await backend.api.post('auth/v1/token?grant_type=password', { data: { email: nextAccount.email, password: nextAccount.password } });
  expect(session.ok()).toBeTruthy();
  const token = (await session.json() as { access_token: string }).access_token;
  const nextId = 'next-account-' + randomUUID();
  const nextTitle = 'CI next account reminder';
  const created = await backend.api.post('rest/v1/rpc/write_account_item', {
    headers: { Authorization: 'Bearer ' + token },
    data: { p_user_id: nextAccount.profileId, p_collection: 'reminders', p_item_id: nextId, p_expected_revision: null, p_data: { id: nextId, title: nextTitle, notes: 'Only the next account', date: futureDate(2), time: '15:00', timezone: 'Europe/Berlin', type: 'custom', completed: false, emailEnabled: false }, p_deleted: false, p_operation: randomUUID() },
  });
  expect(created.ok()).toBeTruthy();
  await signIn(page, account);
  const firstTitle = 'CI previous account reminder';
  const firstId = await createReminder(page, backend, account, firstTitle);
  let release!: () => void, captured!: () => void, delivered!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const fetched = new Promise<void>(resolve => { captured = resolve; });
  const finished = new Promise<void>(resolve => { delivered = resolve; });
  let holding = false;
  const isOldRead = (url: URL) => url.pathname === '/backend/rest/v1/account_items' && url.searchParams.get('user_id') === 'eq.' + account.profileId && url.searchParams.get('collection') === 'eq.reminders';
  const delayRead = async (route: Route) => {
    if (holding) { await route.continue(); return; }
    holding = true;
    try {
      const response = await route.fetch();
      expect(response.ok()).toBeTruthy();
      const rows = await response.json() as StoredReminder[];
      expect(rows.some(row => row.item_id === firstId)).toBe(true);
      captured();
      await gate;
      // Forward the actual server response unchanged, after the account switch.
      await route.fulfill({ response });
    } finally { delivered(); }
  };
  await page.context().route(isOldRead, delayRead);
  try {
    await page.reload();
    await fetched;
    if (page.viewportSize()!.width < 768) await page.getByRole('button', { name: 'More', exact: true }).click();
    await page.getByRole('button', { name: /^log\s*out$/i }).click();
    await expect(page).toHaveURL(/\/login(?:[?#]|$)/);
    // Use the existing SPA login page; another full document navigation would
    // cancel the old request instead of exercising its late-response guard.
    await page.getByRole('textbox', { name: 'Email', exact: true }).fill(nextAccount.email);
    await page.getByLabel('Password', { exact: true }).fill(nextAccount.password);
    await page.getByRole('button', { name: 'Sign In', exact: true }).click();
    await expect(page).toHaveURL(/\/(setup|dashboard|jobs)(?:[?#]|$)/);
    if (new URL(page.url()).pathname === '/setup') await page.getByRole('button', { name: "Skip — I'll set up later", exact: true }).click();
    await page.getByRole('link', { name: 'Reminders', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Complete: ' + nextTitle, exact: true })).toBeVisible();
    await synced(page);
    const oldResponse = page.waitForResponse(response => isOldRead(new URL(response.url())));
    release();
    await oldResponse;
    await finished;
    await expect(page.getByText(firstTitle, { exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Complete: ' + nextTitle, exact: true }).click();
    await expect.poll(async () => (await stored(backend, nextAccount, nextId)).data?.completed).toBe(true);
    expect((await stored(backend, account, firstId)).data).toMatchObject({ title: firstTitle, completed: false });
    expect((await backend.rows(`account_items?select=item_id&user_id=eq.${nextAccount.profileId}&collection=eq.reminders`))).toHaveLength(1);
  } finally {
    release();
    await page.context().unroute(isOldRead, delayRead);
  }
});
