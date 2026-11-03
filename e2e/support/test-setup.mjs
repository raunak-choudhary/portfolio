// e2e/support/test-setup.mjs
//
// Opens a page the way every suite test needs it: own context at the right
// viewport, theme preset, fixtures installed unless the run targets a live
// site, and error collection running before navigation.

import { installSupabaseFixtures } from './supabase-fixtures.mjs';
import { collectPageErrors, presetTheme, waitForPageReady } from './page-probe.mjs';
import { heightForWidth } from './site-map.mjs';

/** True when the run targets a deployed site with real data. */
export const isLiveRun = () => Boolean(process.env.E2E_BASE_URL);

/**
 * True when Supabase is answered from recorded fixtures: the default for
 * local runs. Off for live runs and for local captures that deliberately
 * read the real database (E2E_REAL_DATA=1) to compare against the live site.
 */
export const usesFixtures = () => !isLiveRun() && !process.env.E2E_REAL_DATA;

/**
 * @param {import('@playwright/test').Browser} browser
 * @param {{ path: string, width: number, theme: string, isMobile?: boolean }} target
 * @returns {Promise<{ page, context, errors: string[], unexpected: string[] }>}
 */
export async function openPage(browser, { path, width, theme, isMobile = width < 768 }) {
  const context = await browser.newContext({
    viewport: { width, height: heightForWidth(width) },
    deviceScaleFactor: 1,
    isMobile,
    hasTouch: isMobile,
    reducedMotion: 'reduce',
  });
  await presetTheme(context, theme);
  const { unexpected } = usesFixtures() ? await installSupabaseFixtures(context) : { unexpected: [] };

  const page = await context.newPage();
  const errors = collectPageErrors(page);
  await page.goto(path, { waitUntil: 'load' });
  await waitForPageReady(page);

  return { page, context, errors, unexpected };
}
