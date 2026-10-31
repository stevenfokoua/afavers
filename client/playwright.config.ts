import { readFileSync } from 'node:fs';
import { defineConfig, devices } from '@playwright/test';

if (!process.env.AFAVERS_E2E_ENV) throw new Error('Run deploy/ci/run-e2e.py; production credentials are not accepted.');
const backend = JSON.parse(readFileSync(process.env.AFAVERS_E2E_ENV, 'utf8')) as { appUrl: string; apiUrl: string };
for (const value of [backend.appUrl, backend.apiUrl]) {
  const url = new URL(value);
  if (url.protocol !== 'http:' || !['localhost', '127.0.0.1'].includes(url.hostname)) throw new Error('E2E endpoints must be the disposable loopback backend.');
}
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  globalTimeout: 10 * 60_000,
  expect: { timeout: 12_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: Boolean(process.env.CI),
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }], ['json', { outputFile: 'test-results/results.json' }]],
  outputDir: 'test-results/artifacts',
  use: { baseURL: backend.appUrl, trace: 'retain-on-failure', screenshot: 'only-on-failure', serviceWorkers: 'block' },
  projects: [
    { name: 'chromium-desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 1000 } } },
    { name: 'webkit-phone', use: { browserName: 'webkit', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 } },
  ],
  webServer: {
    command: `npm run preview -- --host 127.0.0.1 --port ${new URL(backend.appUrl).port} --strictPort`,
    url: backend.appUrl,
    timeout: 60_000,
    reuseExistingServer: false,
  },
});
