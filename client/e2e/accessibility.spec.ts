import { test, expect, signIn } from './fixtures';

test('keyboard modal containment, Escape return and detail-tab navigation', async ({ page, account }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page, account);
  await page.goto('/jobs');
  const filters = page.getByRole('button', { name: 'Filters', exact: true });
  await filters.focus();
  await filters.press('Enter');
  const dialog = page.getByRole('dialog', { name: 'Filter jobs', exact: true });
  const close = dialog.getByRole('button', { name: 'Close / Schließen', exact: true });
  await expect(close).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(dialog.getByRole('button', { name: 'Show results', exact: true })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(close).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(filters).toBeFocused();
  const outline = await filters.evaluate(element => {
    const style = getComputedStyle(element);
    return { style: style.outlineStyle, width: parseFloat(style.outlineWidth) };
  });
  expect(outline.style).not.toBe('none');
  expect(outline.width).toBeGreaterThanOrEqual(2);
  const result = page.getByRole('button', { name: /^CI GIS Analyst/ }).first();
  await result.focus();
  await result.press('Enter');
  await expect(page.getByRole('heading', { name: 'CI GIS Analyst', exact: true })).toBeVisible();
  const overview = page.getByRole('tab', { name: 'Overview', exact: true });
  const preparation = page.getByRole('tab', { name: 'Preparation', exact: true });
  await overview.focus();
  await overview.press('ArrowRight');
  await expect(preparation).toBeFocused();
  await expect(preparation).toHaveAttribute('aria-selected', 'true');
  await preparation.press('Home');
  await expect(overview).toBeFocused();
  await expect(overview).toHaveAttribute('aria-selected', 'true');
});

test('320 CSS-pixel reflow retains long real records in both languages and themes', async ({ page, account, backend }) => {
  await page.setViewportSize({ width: 320, height: 800 });
  const title = 'CI Reflow Geoinformationssysteme und Umweltverträglichkeitsprüfungen mit interdisziplinärer Infrastrukturplanung';
  const response = await backend.api.post('rest/v1/jobs', {
    headers: { Prefer: 'return=representation' },
    data: { external_id: 'ci-reflow-' + account.authId, title, company: 'ArbeitsgemeinschaftMitEinemBesondersLangenZusammengesetztenUnternehmensnamen', location: 'Nordrhein-Westfalen · Düsseldorf und Umgebung', source: 'manual', is_manual: true, owner_user_id: account.profileId, description: 'This synthetic manual vacancy checks long content layout against a real backend. Requirements include geospatial planning and explaining technical project outcomes to interdisciplinary teams. Our working language is English.' },
  });
  expect(response.ok()).toBeTruthy();
  await signIn(page, account);
  for (const theme of ['light', 'dark']) {
    for (const lang of ['en', 'de']) {
      await page.evaluate(({ theme, lang }) => {
        localStorage.setItem('afavers-theme', JSON.stringify({ state: { theme }, version: 0 }));
        localStorage.setItem('lang-preference', JSON.stringify({ state: { lang }, version: 0 }));
      }, { theme, lang });
      await page.goto('/jobs?search=CI%20Reflow');
      await expect(page.getByRole('heading', { name: lang === 'de' ? 'Jobs finden' : 'Find jobs', exact: true })).toBeVisible();
      expect(await page.locator('html').evaluate(element => element.classList.contains('dark'))).toBe(theme === 'dark');
      const result = page.getByRole('button', { name: new RegExp('^CI Reflow') }).first();
      await expect(result).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
      await result.click();
      await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
    }
  }
  // A real empty result set is distinct from a backend/network error.
  await page.goto('/jobs?search=CI-no-such-vacancy-' + account.authId);
  await expect(page.getByRole('heading', { name: 'Keine passenden Jobs', exact: true })).toBeVisible();
});

test('reduced motion suppresses authored detail/save animation while notes still persist', async ({ page, account, backend }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(() => {
    const nativeAnimate = Element.prototype.animate;
    const audit = { authoredCalls: 0 };
    Object.defineProperty(window, '__afaversMotionAudit', { value: audit });
    Element.prototype.animate = function (...args: Parameters<Element['animate']>) {
      if (this.matches('.job-details') || this.closest('.job-details')) audit.authoredCalls++;
      return nativeAnimate.apply(this, args);
    };
  });
  await signIn(page, account);
  await page.goto('/jobs');
  await page.getByRole('button', { name: /^CI GIS Analyst/ }).first().click();
  await expect(page.getByRole('heading', { name: 'CI GIS Analyst', exact: true })).toBeVisible();
  const jobId = Number(new URL(page.url()).pathname.split('/').at(-1));
  await page.getByRole('tab', { name: 'Preparation', exact: true }).click();
  await page.getByRole('textbox', { name: 'Notes', exact: true }).fill('CI reduced-motion note');
  await page.getByRole('button', { name: 'Save Notes', exact: true }).click();
  await expect.poll(async () => (await backend.rows<{ notes: string }>(`user_jobs?select=notes&user_id=eq.${account.profileId}&job_id=eq.${jobId}`))[0]?.notes).toBe('CI reduced-motion note');
  expect(await page.evaluate(() => ({ reduced: matchMedia('(prefers-reduced-motion: reduce)').matches, calls: (window as unknown as { __afaversMotionAudit: { authoredCalls: number } }).__afaversMotionAudit.authoredCalls }))).toEqual({ reduced: true, calls: 0 });
  expect(await page.locator('.job-details').evaluate(element => getComputedStyle(element).transitionDuration)).toBe('0s');
});
