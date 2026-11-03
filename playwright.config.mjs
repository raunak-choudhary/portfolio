// playwright.config.mjs
//
// One browser suite, two targets:
//   - default: the local production build in `build/`, served by
//     scripts/static-server.mjs on localhost, with Supabase answered from
//     recorded fixtures (no live database traffic);
//   - live:    E2E_BASE_URL=https://www.raunakchoudhary.com, no server, no
//     fixtures, real data. Used for baseline captures and post-deploy checks.
//
// Runs one worker: the suite targets an 8 GB laptop and free CI runners, and
// full-page captures are memory heavy.

import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;
const liveBaseUrl = process.env.E2E_BASE_URL;
const isCI = Boolean(process.env.CI);

export default defineConfig({
  testDir: './e2e',
  testMatch: /.*\.spec\.mjs$/,
  outputDir: './test-results',
  workers: 1,
  fullyParallel: false,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  timeout: 60_000,
  globalTimeout: 30 * 60_000,
  expect: { timeout: 10_000 },
  reporter: isCI ? [['list'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: liveBaseUrl || `http://localhost:${PORT}`,
    ...devices['Desktop Chrome'],
    reducedMotion: 'reduce',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: liveBaseUrl
    ? undefined
    : {
        command: `node scripts/static-server.mjs --root build --port ${PORT}`,
        url: `http://localhost:${PORT}/home`,
        reuseExistingServer: !isCI,
        timeout: 60_000,
        stdout: 'ignore',
      },
});
