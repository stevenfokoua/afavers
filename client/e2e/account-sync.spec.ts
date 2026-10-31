import { randomUUID } from 'node:crypto';
import { test, expect, signIn, secondDevice, futureDate } from './fixtures';

test('reminders and saved searches survive independent device contexts and deletion', async ({ page, browser, account, backend }) => {
  await signIn(page, account);
  const other = await secondDevice(browser, account);
  try {
    await page.goto('/reminders');
    await page.getByRole('button', { name: 'New Reminder', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'New reminder', exact: true });
    await dialog.getByRole('textbox', { name: 'Title', exact: true }).fill('CI synced reminder');
    await dialog.getByRole('textbox', { name: 'Notes', exact: true }).fill('Created on the first device');
    await dialog.getByLabel('Date', { exact: true }).fill(futureDate());
    await dialog.getByLabel('Time', { exact: true }).fill('15:00');
    await dialog.getByLabel('Timezone', { exact: true }).fill('Europe/Berlin');
    await dialog.getByRole('button', { name: 'Add', exact: true }).click();
    await expect.poll(async () => (await backend.rows<{ data: { title: string } }>(`account_items?select=data&user_id=eq.${account.profileId}&collection=eq.reminders&deleted=eq.false`)).some(row => row.data.title === 'CI synced reminder')).toBe(true);
    await other.page.goto('/reminders');
    await expect(other.page.getByRole('button', { name: 'Complete: CI synced reminder', exact: true })).toBeVisible();
    await other.page.getByRole('button', { name: 'Complete: CI synced reminder', exact: true }).click();
    await expect.poll(async () => (await backend.rows<{ data: { title: string; completed: boolean } }>(`account_items?select=data&user_id=eq.${account.profileId}&collection=eq.reminders&deleted=eq.false`)).find(row => row.data.title === 'CI synced reminder')?.data.completed).toBe(true);
    await page.reload();
    await page.getByRole('button', { name: 'Completed · 1', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Mark incomplete: CI synced reminder', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Delete: CI synced reminder', exact: true }).click();
    await page.getByRole('button', { name: 'Delete', exact: true }).click();
    await expect.poll(async () => (await backend.rows<{ deleted: boolean }>(`account_items?select=deleted&user_id=eq.${account.profileId}&collection=eq.reminders`)).some(row => row.deleted)).toBe(true);
    await other.page.reload();
    await expect(other.page.getByText('CI synced reminder', { exact: true })).toHaveCount(0);
    await page.goto('/jobs');
    await page.getByRole('textbox', { name: 'Search jobs', exact: true }).fill('GIS');
    await expect(page).toHaveURL(/search=GIS/);
    await page.getByRole('button', { name: 'Save search', exact: true }).click();
    const saved = page.getByRole('dialog', { name: 'Saved searches', exact: true });
    await saved.getByRole('textbox', { name: 'Name these filters', exact: true }).fill('CI GIS search');
    await saved.getByRole('button', { name: 'Save search', exact: true }).click();
    await expect.poll(async () => (await backend.rows<{ data: { name: string } }>(`account_items?select=data&user_id=eq.${account.profileId}&collection=eq.saved_searches&deleted=eq.false`)).some(row => row.data.name === 'CI GIS search')).toBe(true);
    await saved.getByRole('button', { name: 'Close', exact: true }).click();
    await other.page.goto('/jobs');
    await other.page.getByRole('combobox', { name: 'Saved searches', exact: true }).selectOption({ label: 'CI GIS search' });
    await expect(other.page.getByRole('textbox', { name: 'Search jobs', exact: true })).toHaveValue('GIS');
    await page.goto('/dashboard');
    const calendar = page.getByRole('region', { name: 'Calendar', exact: true });
    await calendar.getByRole('button', { name: '15', exact: true }).click();
    await calendar.getByRole('button', { name: '+ Add event', exact: true }).click();
    await calendar.getByPlaceholder('Event title...', { exact: true }).fill('CI synced calendar note');
    await calendar.getByRole('button', { name: 'Save', exact: true }).click();
    await expect.poll(async () => (await backend.rows<{ data: { title: string } }>(`account_items?select=data&user_id=eq.${account.profileId}&collection=eq.calendar_events&deleted=eq.false`)).some(row => row.data.title === 'CI synced calendar note')).toBe(true);
    await other.page.goto('/dashboard');
    const otherCalendar = other.page.getByRole('region', { name: 'Calendar', exact: true });
    await otherCalendar.getByRole('button', { name: '15', exact: true }).click();
    await expect(otherCalendar.getByText('CI synced calendar note', { exact: true })).toBeVisible();
  } finally { await other.context.close(); }
});

test('concurrent saved-search creation enforces the account quota in the real database', async ({ account, backend }) => {
  const session = await backend.api.post('auth/v1/token?grant_type=password', { data: { email: account.email, password: account.password } });
  expect(session.ok()).toBeTruthy();
  const { access_token: token } = await session.json() as { access_token: string };
  const create = (id: string) => backend.api.post('rest/v1/rpc/write_account_item', {
    headers: { Authorization: 'Bearer ' + token },
    data: {
      p_user_id: account.profileId, p_collection: 'saved_searches', p_item_id: id,
      p_expected_revision: null, p_data: { id, name: 'CI quota ' + id, filters: { search: 'GIS' } },
      p_deleted: false, p_operation: randomUUID(),
    },
  });
  for (let index = 0; index < 11; index++) expect((await create('quota-' + index)).ok()).toBeTruthy();
  const contenders = await Promise.all([create('quota-concurrent-a'), create('quota-concurrent-b')]);
  expect(contenders.filter(response => response.ok())).toHaveLength(1);
  const rejected = contenders.find(response => !response.ok());
  expect(rejected).toBeDefined();
  expect(await rejected!.json()).toMatchObject({ message: 'Your account already has 12 saved searches' });
  expect(await backend.rows(`account_items?select=item_id&user_id=eq.${account.profileId}&collection=eq.saved_searches&deleted=eq.false`)).toHaveLength(12);
});
