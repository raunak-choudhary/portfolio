// e2e/support/admin-setup.mjs
//
// Opens the admin the way every admin browser test needs it: its own context
// at the right viewport, reduced motion (the Matrix entry then lasts about
// 2.5 s instead of 5), the offline network layer and the fake session
// installed before the first request, and error collection running before
// navigation.

import { expect } from '@playwright/test';
import { installAdminFixtures } from './admin-fixtures.mjs';
import { collectPageErrors } from './page-probe.mjs';

/** Viewport heights used with each width the admin tests cover. */
const HEIGHTS = { 390: 844, 768: 1024, 1280: 800, 1440: 900 };

/**
 * @param {import('@playwright/test').Browser} browser
 * @param {{ width?: number, session?: 'none'|'aal1'|'aal2', path?: string, tables?: Record<string, object[]>, motion?: boolean, before?: (context: import('@playwright/test').BrowserContext) => Promise<void> }} [options]
 *   `motion: true` keeps full motion (the sign-out film plays whole); `before` runs after the
 *   fixtures are installed and before the first navigation, to add routes or init scripts.
 */
export async function openAdmin(browser, { width = 1440, session = 'aal2', path = '/admindashboard', tables, storage, motion = false, before } = {}) {
  const isMobile = width < 768;
  const context = await browser.newContext({
    viewport: { width, height: HEIGHTS[width] ?? 900 },
    deviceScaleFactor: 1,
    isMobile,
    hasTouch: isMobile,
    reducedMotion: motion ? 'no-preference' : 'reduce',
    serviceWorkers: 'block',
  });
  const net = await installAdminFixtures(context, { session, tables, storage });
  if (before) await before(context);
  const page = await context.newPage();
  const errors = collectPageErrors(page);
  const dialogs = [];
  page.on('dialog', async (dialog) => {
    dialogs.push(`${dialog.type()}: ${dialog.message()}`);
    await dialog.dismiss().catch(() => {});
  });
  await page.goto(path, { waitUntil: 'load' });
  return { page, context, net, errors, dialogs };
}

/**
 * Waits until the dashboard is on screen and the entry animation has gone,
 * so the voyage is no longer inert.
 */
export async function waitForDashboard(page) {
  await expect(page.getByTestId('voyage')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole('dialog', { name: 'Signing in to the admin dashboard' })).toHaveCount(0, { timeout: 20_000 });
  await expect(page.getByTestId('fix-queue')).toBeVisible();
}

/** Scrolls a chapter's stage into view the way a rail jump would. */
export async function goToChapter(page, id) {
  const stage = page.locator(`#chapter-${id}`);
  await stage.evaluate((element) => element.scrollIntoView({ block: 'start' }));
  return stage;
}

/** True when the page scrolls sideways. */
export const hasHorizontalOverflow = (page) =>
  page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);

/** The REST writes the page sent to one table. */
export const writesTo = (net, table) => net.writes.filter((write) => write.table === table);
