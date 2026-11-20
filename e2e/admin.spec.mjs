// e2e/admin.spec.mjs
//
// The admin dashboard ("voyage") in a real browser, fully offline: the local
// e2e build, a fake unsigned session, and every Supabase request answered
// from the hand-written fixtures in e2e/fixtures/admin/ (see
// support/admin-fixtures.mjs). No request may reach the real project; each
// test fails on any request the fixtures do not know, and the first
// signed-in test also proves that nothing escaped the intercept at all.
//
// Run: npm run build:e2e, then npm run e2e:admin.

import { test, expect } from '@playwright/test';
import { goToChapter, hasHorizontalOverflow, openAdmin, waitForDashboard, writesTo } from './support/admin-setup.mjs';

/** Every admin test ends with these: nothing unknown was asked for and nothing escaped. */
async function expectOffline(net) {
  expect(net.unexpected, 'no request outside the admin fixtures').toEqual([]);
  expect(net.escaped(), 'no request escaped the intercept').toEqual([]);
}

test.describe('signed out', () => {
  test('the dashboard routes end on the login page', async ({ browser }) => {
    const { page, context, net, errors } = await openAdmin(browser, { session: 'none' });
    try {
      await expect(page).toHaveURL(/\/adminlogin$/);
      await expect(page.getByRole('button', { name: /Continue with Google/ })).toBeVisible();
      await expect(page.getByTestId('voyage')).toHaveCount(0);

      for (const path of ['/admindashboard/classic', '/admindashboard/voyage']) {
        await page.goto(path);
        await expect(page).toHaveURL(/\/adminlogin$/);
      }
      expect(errors).toEqual([]);
      await expectOffline(net);
    } finally {
      await context.close();
    }
  });
});

test.describe('signed in at level 1 with a verified authenticator', () => {
  test('shows the second step, not the dashboard', async ({ browser }) => {
    const { page, context, net, errors } = await openAdmin(browser, { session: 'aal1' });
    try {
      await expect(page).toHaveURL(/\/admindashboard$/);
      await expect(page.getByText(/Open your authenticator app/)).toBeVisible({ timeout: 20_000 });
      await expect(page.getByTestId('voyage')).toHaveCount(0);
      await expect(page.getByTestId('fix-queue')).toHaveCount(0);
      expect(errors).toEqual([]);
      await expectOffline(net);
    } finally {
      await context.close();
    }
  });
});

test.describe('signed in at level 2', () => {
  test('Mission Control loads from the fixtures with no errors and nothing escaping', async ({ browser }) => {
    const { page, context, net, errors } = await openAdmin(browser);
    try {
      await waitForDashboard(page);
      const health = page.locator('h5', { hasText: 'Health' }).locator('..');
      await expect(health.locator('.tile__big')).toHaveText('99/100');
      await expect(health).toContainText('11 strong · 0 need attention');
      const queue = page.getByTestId('fix-queue');
      await expect(queue.getByText('1 project has no picture')).toBeVisible();
      await expect(queue.getByRole('button', { name: 'Not needed: 1 project has no picture' })).toBeVisible();

      // Travel to the end so every chapter mounts and loads.
      await goToChapter(page, 'security');
      await expect(page.getByTestId('security-chapter')).toBeVisible();
      await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => {});

      expect(errors, 'no console errors or failed requests').toEqual([]);
      expect(net.seenCount(), 'the page did talk to Supabase, through the intercept').toBeGreaterThan(10);
      await expectOffline(net);
      expect(net.writes, 'opening the dashboard writes nothing').toEqual([]);
    } finally {
      await context.close();
    }
  });

  for (const width of [390, 768, 1280, 1440]) {
    test(`no horizontal overflow at ${width}px`, async ({ browser }) => {
      const { page, context, net, errors } = await openAdmin(browser, { width });
      try {
        await waitForDashboard(page);
        expect(await hasHorizontalOverflow(page), 'Mission Control').toBe(false);
        for (const chapter of ['projects', 'inbox', 'security']) {
          await goToChapter(page, chapter);
          expect(await hasHorizontalOverflow(page), chapter).toBe(false);
        }
        expect(errors).toEqual([]);
        await expectOffline(net);
      } finally {
        await context.close();
      }
    });
  }
});

test.describe('travelling', () => {
  test('the command palette jumps to a chapter', async ({ browser }) => {
    const { page, context, net } = await openAdmin(browser);
    try {
      await waitForDashboard(page);
      await page.keyboard.press('ControlOrMeta+k');
      const input = page.getByPlaceholder('Jump to a chapter or run an action…');
      await expect(input).toBeFocused();
      await input.fill('Inbox');
      await page.keyboard.press('Enter');
      await expect(input).toHaveCount(0);
      await expect(page.locator('#chapter-inbox')).toBeInViewport();
      await expectOffline(net);
    } finally {
      await context.close();
    }
  });

  for (const width of [390, 1440]) {
    test(`the star rail jumps and the Projects deck lists the fixture projects at ${width}px`, async ({ browser }) => {
      const { page, context, net } = await openAdmin(browser, { width });
      try {
        await waitForDashboard(page);
        await page.getByRole('navigation', { name: 'Chapters' }).getByRole('button', { name: /^Projects \(/ }).click();
        await expect(page.locator('#chapter-projects')).toBeInViewport();
        const deck = page.locator('#chapter-projects').getByTestId('deck');
        for (const title of ['TEST- Alpha Tracker', 'TEST- Beta Planner', 'TEST- Gamma Notes']) {
          await expect(deck.getByLabel(`Open ${title}`, { exact: true })).toBeVisible();
        }
        await expectOffline(net);
      } finally {
        await context.close();
      }
    });
  }
});

/** Opens a project card's read view. */
async function openProject(page, title) {
  await goToChapter(page, 'projects');
  await page.getByLabel(`Open ${title}`, { exact: true }).click();
  const dialog = page.getByTestId('record-dialog');
  await expect(dialog.getByTestId('record-view')).toBeVisible();
  return dialog;
}

test.describe('a record', () => {
  test('read view, edit form, and a required field emptied blocks the save', async ({ browser }) => {
    const { page, context, net, errors } = await openAdmin(browser);
    try {
      await waitForDashboard(page);
      const dialog = await openProject(page, 'TEST- Alpha Tracker');
      await expect(dialog.getByRole('heading', { name: 'TEST- Alpha Tracker' })).toBeVisible();

      await dialog.getByRole('button', { name: 'Edit' }).click();
      const title = dialog.getByRole('textbox', { name: 'Title', exact: true });
      await expect(title).toHaveValue('TEST- Alpha Tracker');
      await title.fill('');
      await dialog.getByRole('button', { name: 'Save', exact: true }).click();

      await expect(dialog.getByText('Title is required.')).toBeVisible();
      await expect(title).toHaveAttribute('aria-invalid', 'true');
      await expect(title).toBeFocused();
      expect(writesTo(net, 'projects'), 'no write was sent').toEqual([]);
      expect(net.writes).toEqual([]);
      expect(errors).toEqual([]);
      await expectOffline(net);
    } finally {
      await context.close();
    }
  });

  test('a save sends exactly one write and the card shows the new title', async ({ browser }) => {
    const { page, context, net, errors } = await openAdmin(browser);
    try {
      await waitForDashboard(page);
      const dialog = await openProject(page, 'TEST- Alpha Tracker');
      await dialog.getByRole('button', { name: 'Edit' }).click();
      await dialog.getByRole('textbox', { name: 'Title', exact: true }).fill('TEST- Alpha Tracker Renamed');
      await dialog.getByRole('button', { name: 'Save', exact: true }).click();

      await expect(dialog.getByTestId('record-view')).toBeVisible();
      const writes = writesTo(net, 'projects');
      expect(writes).toHaveLength(1);
      expect(writes[0].method).toBe('PATCH');
      expect(writes[0].query).toContain('id=eq.TEST-project-alpha');
      expect(writes[0].body).toMatchObject({ title: 'TEST- Alpha Tracker Renamed' });
      expect(net.writes, 'nothing else was written').toHaveLength(1);

      await dialog.getByRole('button', { name: 'Close' }).first().click();
      await expect(page.getByLabel('Open TEST- Alpha Tracker Renamed', { exact: true })).toBeVisible();
      expect(errors).toEqual([]);
      await expectOffline(net);
    } finally {
      await context.close();
    }
  });
});

test.describe('fix queue', () => {
  for (const width of [390, 1440]) {
    test(`"How the score works" opens above the top bar, inside the screen, at ${width}px`, async ({ browser }) => {
      const { page, context, net } = await openAdmin(browser, { width });
      try {
        await waitForDashboard(page);
        const trigger = page.getByTestId('fix-queue').getByRole('button', { name: 'How the score works' });
        await trigger.scrollIntoViewIfNeeded();
        await trigger.click();
        const dialog = page.getByRole('dialog', { name: 'How the score works' });
        await expect(dialog).toBeVisible();

        const box = await dialog.boundingBox();
        const viewport = page.viewportSize();
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.y).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 0.5);
        expect(box.y + box.height).toBeLessThanOrEqual(viewport.height + 0.5);

        // Whatever sits at the top bar's position now belongs to the dialog's layer, not the bar.
        const onTop = await page.evaluate(() => {
          const bar = document.querySelector('.voyage-bar').getBoundingClientRect();
          const hit = document.elementFromPoint(bar.left + bar.width / 2, bar.top + bar.height / 2);
          return { inDialogLayer: Boolean(hit?.closest('.explain-backdrop')), inBar: Boolean(hit?.closest('.voyage-bar')) };
        });
        expect(onTop).toEqual({ inDialogLayer: true, inBar: false });

        await page.keyboard.press('Escape');
        await expect(dialog).toHaveCount(0);
        await expect(trigger).toBeFocused();
        await expectOffline(net);
      } finally {
        await context.close();
      }
    });
  }

  test('"Not needed" with a reason sends one insert and moves the group', async ({ browser }) => {
    const { page, context, net, errors } = await openAdmin(browser);
    try {
      await waitForDashboard(page);
      const queue = page.getByTestId('fix-queue');
      await queue.getByRole('button', { name: 'Not needed: 1 project has no picture' }).click();
      const form = queue.getByTestId('fx-dismiss');
      await form.getByLabel(/Why is this not needed/).fill('TEST- pictures come later');
      await form.getByRole('button', { name: 'Save' }).click();

      await expect(queue.getByText('Marked not needed.').or(page.getByText('Marked not needed.')).first()).toBeVisible();
      const inserts = writesTo(net, 'admin_fix_dismissals');
      expect(inserts).toHaveLength(1);
      expect(inserts[0].method).toBe('POST');
      expect(inserts[0].body).toEqual([{ rule_key: 'projects:images', record_id: null, note: 'TEST- pictures come later' }]);
      expect(net.writes).toHaveLength(1);

      const hidden = queue.getByTestId('fx-hidden');
      await expect(hidden).toContainText('1 item');
      await hidden.getByRole('button', { name: 'Show them' }).click();
      await expect(hidden.getByRole('button', { name: /^Bring back: / })).toBeVisible();
      await expect(hidden).toContainText('TEST- pictures come later');
      await expect(queue.getByRole('button', { name: 'Not needed: 1 project has no picture' })).toHaveCount(0);
      expect(errors).toEqual([]);
      await expectOffline(net);
    } finally {
      await context.close();
    }
  });
});

test.describe('activity', () => {
  test('rows for existing records open them; a deleted record is not a button', async ({ browser }) => {
    const { page, context, net, errors } = await openAdmin(browser);
    try {
      await waitForDashboard(page);
      const pane = page.getByTestId('activity-pane');
      await expect(pane.locator('.act-row', { hasText: 'TEST- Alpha Tracker' })).toBeVisible();

      // The removed project has two rows (added, then deleted); neither may open anything.
      const removed = pane.locator('.act-row', { hasText: 'TEST- Removed Project' });
      await expect(removed).toHaveCount(2);
      expect(await removed.evaluateAll((rows) => rows.map((row) => row.tagName))).toEqual(['DIV', 'DIV']);
      await expect(pane.getByRole('button', { name: /TEST- Removed Project/ })).toHaveCount(0);
      await expect(pane.getByText('record no longer exists').first()).toBeVisible();

      const open = pane.getByRole('button', { name: /TEST- Alpha Tracker/ });
      await expect(open).toHaveCount(1);
      await open.click();
      const dialog = page.getByTestId('record-dialog');
      await expect(dialog.getByRole('heading', { name: 'TEST- Alpha Tracker' })).toBeVisible();
      await expect(page.locator('#chapter-projects')).toBeInViewport();
      expect(errors).toEqual([]);
      await expectOffline(net);
    } finally {
      await context.close();
    }
  });
});

test.describe('inbox', () => {
  test('hostile message content renders as plain text', async ({ browser }) => {
    const { page, context, net, errors, dialogs } = await openAdmin(browser);
    try {
      await waitForDashboard(page);
      await goToChapter(page, 'inbox');
      const inbox = page.getByTestId('inbox');
      await expect(inbox.getByRole('button', { name: /^Open the message from TEST- Plain Sender/ })).toBeVisible();
      await inbox.getByRole('button', { name: /^Open the message from TEST- <b>Bold<\/b> Sender/ }).click();

      const message = page.getByRole('dialog').filter({ hasText: 'TEST- Hostile' });
      await expect(message).toBeVisible();
      await expect(message.getByText(`<img src=x onerror="alert('message')">`, { exact: false })).toBeVisible();
      await expect(message.getByText('javascript:alert(document.domain)')).toBeVisible();

      const unsafe = await page.evaluate(() => [...document.querySelectorAll('a[href]')]
        .map((a) => a.getAttribute('href'))
        .filter((href) => !/^(https?:|mailto:|\/|#)/i.test(href.trim())));
      expect(unsafe, 'no anchor with a non-http(s) or mailto href').toEqual([]);
      const mailto = await page.evaluate(() => [...document.querySelectorAll('a[href^="mailto:"]')].map((a) => a.getAttribute('href')));
      expect(mailto.some((href) => /javascript/i.test(href)), 'the non-address email is not a reply link').toBe(false);
      expect(await page.locator('img[src="x"]').count(), 'no injected image element').toBe(0);
      expect(await page.locator('script', { hasText: "alert('role')" }).count(), 'no injected script element').toBe(0);

      await page.waitForTimeout(300);
      expect(dialogs, 'no alert, confirm or prompt fired').toEqual([]);
      expect(errors).toEqual([]);
      await expectOffline(net);
    } finally {
      await context.close();
    }
  });
});

test.describe('security', () => {
  test('the chapter loads its overview from the fixtures', async ({ browser }) => {
    const { page, context, net, errors } = await openAdmin(browser);
    try {
      await waitForDashboard(page);
      await goToChapter(page, 'security');
      const chapter = page.getByTestId('security-chapter');
      await expect(chapter).toHaveAttribute('data-state', /^(?!loading$)(?!error$).+/);
      await expect(chapter.getByTestId('sec-app')).toHaveCount(1);
      await expect(chapter.getByTestId('sec-app')).toContainText('TEST- authenticator');
      expect(errors).toEqual([]);
      await expectOffline(net);
    } finally {
      await context.close();
    }
  });
});
