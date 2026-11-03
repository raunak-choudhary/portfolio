// e2e/contract.spec.mjs
//
// The responsive contract: every public route and the admin login, at four
// widths and both themes, must
//   - render real content (an <h1>),
//   - apply the requested theme,
//   - never scroll horizontally,
//   - log no console errors or failed requests,
//   - and, in fixture mode, make no request outside the recorded fixtures
//     (no analytics writes, no auth calls, no unknown tables).

import { test, expect } from '@playwright/test';
import { ADMIN_LOGIN_ROUTE, PUBLIC_ROUTES, THEMES, VIEWPORTS } from './support/site-map.mjs';
import { readLayoutRecord } from './support/page-probe.mjs';
import { openPage, usesFixtures } from './support/test-setup.mjs';
import { loadFixture } from './support/supabase-fixtures.mjs';

const ROUTES = [...PUBLIC_ROUTES, ADMIN_LOGIN_ROUTE];

for (const route of ROUTES) {
  test.describe(`${route.name} (${route.path})`, () => {
    for (const { width } of VIEWPORTS) {
      for (const theme of THEMES) {
        test(`renders cleanly at ${width}px in ${theme} theme`, async ({ browser }) => {
          const { page, context, errors, unexpected } = await openPage(browser, { path: route.path, width, theme });
          try {
            const layout = await readLayoutRecord(page);

            expect(layout.headings.some((heading) => heading.startsWith('h1:')), 'page renders an h1').toBe(true);
            expect(layout.theme, 'requested theme is applied').toBe(theme);
            expect(layout.horizontalOverflow, `no horizontal scroll (document ${layout.documentWidth}px)`).toBe(false);
            if (usesFixtures()) {
              expect(errors, 'no console errors or failed requests').toEqual([]);
              expect(unexpected, 'no requests outside the fixtures').toEqual([]);
            }
          } finally {
            await context.close();
          }
        });
      }
    }
  });
}

test.describe('fixture integration', () => {
  test.skip(!usesFixtures(), 'fixture checks only apply to fixture runs');

  test('the projects page renders the recorded projects, not live data', async ({ browser }) => {
    const { page, context, unexpected } = await openPage(browser, { path: '/projects', width: 1440, theme: 'dark' });
    try {
      const projects = loadFixture('projects');
      expect(projects.length).toBeGreaterThan(0);
      for (const project of projects.slice(0, 3)) {
        await expect(page.getByText(project.title, { exact: false }).first()).toBeVisible();
      }
      expect(unexpected).toEqual([]);
    } finally {
      await context.close();
    }
  });

  test('visiting the home page writes no analytics events', async ({ browser }) => {
    const { page, context, unexpected } = await openPage(browser, { path: '/home', width: 1440, theme: 'dark' });
    try {
      // Scroll through the page so section-view trackers would fire if enabled.
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      await page.waitForTimeout(500);
      expect(unexpected.filter((request) => request.includes('analytics_events'))).toEqual([]);
    } finally {
      await context.close();
    }
  });
});
