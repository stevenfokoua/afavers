import { test, expect, signIn } from './fixtures';

const OLD_ROLE = 'CI Deep-corpus QGIS Specialist';

test('lexical and alias searches find a real role beyond the latest 1000 public jobs', async ({ page, account, backend }) => {
  const records = await backend.rows<{ id: number; created_at: string; description: string }>(`jobs?select=id,created_at,description&title=eq.${encodeURIComponent(OLD_ROLE)}&is_manual=eq.false`);
  expect(records).toHaveLength(1);
  const [oldRole] = records;
  expect(oldRole.description).toContain('QGIS');
  expect(oldRole.description.toLowerCase()).not.toContain('geospatial');
  const latest = await backend.rows<{ id: number }>('jobs?select=id&is_manual=eq.false&is_active=eq.true&order=created_at.desc,id.desc&limit=1000');
  expect(latest).toHaveLength(1000);
  expect(latest.some(job => job.id === oldRole.id)).toBe(false);

  await signIn(page, account);
  for (const query of ['GIS', 'geospatial']) {
    // Fresh document per query prevents retained GIS results from making a
    // subsequent alias query appear successful before its backend call ends.
    await page.goto('/jobs');
    const search = page.getByRole('textbox', { name: 'Search jobs', exact: true });
    await expect(search).toHaveValue('');
    const remoteSearch = page.waitForResponse(response => response.request().method() === 'POST' && response.url().includes('/rest/v1/rpc/search_job_candidates'));
    await search.fill(query);
    await expect(page).toHaveURL(new RegExp('search=' + query));
    const response = await remoteSearch;
    expect(response.ok()).toBeTruthy();
    const candidates = await response.json() as { id: number }[];
    expect(candidates.some(job => job.id === oldRole.id)).toBe(true);
    const result = page.getByRole('button', { name: new RegExp('^' + OLD_ROLE) });
    await expect(result).toBeVisible();
    await expect(page.getByRole('button', { name: /^Psychologischen Studienberatung/ })).toHaveCount(0);
  }
  await page.getByRole('button', { name: new RegExp('^' + OLD_ROLE) }).click();
  await expect(page.getByRole('heading', { name: OLD_ROLE, exact: true })).toBeVisible();
  expect(new URL(page.url()).pathname).toBe('/jobs/' + oldRole.id);
});
