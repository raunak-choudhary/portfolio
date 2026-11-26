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

import { readFileSync } from 'node:fs';
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
      // 97, not 99: the fixture hero has no resume uploaded, and Resume is a Hero quality check
      await expect(health.locator('.tile__big')).toHaveText('97/100');
      await expect(health).toContainText('11 strong · 0 need attention');
      const queue = page.getByTestId('fix-queue');
      await expect(queue.getByText('1 project has no picture')).toBeVisible();
      await expect(queue.getByRole('button', { name: 'Not needed: 1 project has no picture' })).toBeVisible();
      // Tonight's Moon from New York, worked out in the browser from the real clock.
      await expect(page.getByTestId('tonight-new-york')).toHaveText(/^from New York · (lit side (tilted \d+° (left|right) of up|straight up|straight down)|below the horizon( until \d\d:\d\d)?)$/);
      await expect(page.getByRole('img', { name: /^The Moon from New York: \d+% lit, / })).toBeVisible();

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

test.describe('sky menu', () => {
  for (const width of [390, 1440]) {
    test(`lists only switches that act on the voyage sky, and remembers Drawings, at ${width}px`, async ({ browser }) => {
      const { page, context, net, errors } = await openAdmin(browser, { width });
      try {
        await waitForDashboard(page);
        await page.getByTitle('Sky and glass settings').click();
        const panel = page.getByRole('dialog', { name: 'Sky settings' });
        await expect(panel).toBeVisible();
        // Clouds was removed: it only reached the flat stand-in sky, never the 3D voyage.
        await expect(panel.locator('.sky-controls__toggle')).toHaveText(['Drawings', 'Motion', 'Panels']);
        expect(await hasHorizontalOverflow(page), 'with the menu open').toBe(false);

        const saved = () => page.evaluate(() => JSON.parse(window.localStorage.getItem('rc-admin-sky') || '{}'));
        const drawings = panel.getByRole('switch', { name: 'Drawings' });
        await expect(drawings).toBeChecked();
        await panel.locator('.sky-controls__toggle', { hasText: 'Drawings' }).click();
        await expect(drawings).not.toBeChecked();
        expect((await saved()).drawings).toBe(false);
        expect(await saved()).not.toHaveProperty('clouds');
        await panel.locator('.sky-controls__toggle', { hasText: 'Drawings' }).click();
        await expect(drawings).toBeChecked();

        expect(errors, 'no console errors or failed requests').toEqual([]);
        await expectOffline(net);
        expect(net.writes, 'the sky menu writes nothing to the database').toEqual([]);
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

// The Files pop-up reads the storage fixtures in e2e/fixtures/admin/storage/:
// eleven files, seven used by fixture records, four not connected (two of
// them likely copies), and one achievement pointing at a file that is gone.
const filesButton = (page) => page.locator('.voyage-bar').getByRole('button', { name: 'Files', exact: true });

async function openFiles(page) {
  await filesButton(page).click();
  const files = page.getByTestId('media-library');
  await expect(files.getByText('11 files')).toBeVisible();
  return files;
}

test.describe('files', () => {
  test('the Files button opens the pop-up; a file in use cannot be deleted and Open that entry opens its record', async ({ browser }) => {
    const { page, context, net, errors } = await openAdmin(browser);
    try {
      await waitForDashboard(page);
      await expect(page.locator('#chapter-media'), 'Media is no longer a chapter').toHaveCount(0);
      const rail = page.getByRole('navigation', { name: 'Chapters' });
      await expect(rail.locator('[aria-label^="Inbox"]')).toHaveCount(1);
      await expect(rail.locator('[aria-label^="Media"], [aria-label*="Pisces"]'), 'nor a star on the rail').toHaveCount(0);
      const files = await openFiles(page);
      await expect(files).toContainText('4 not connected');
      await expect(page.getByRole('button', { name: 'Close files' })).toBeFocused();
      await expect(files.getByRole('tab', { name: /In use/ })).toHaveAttribute('aria-selected', 'true');
      const cover = files.locator('[data-file="project-images:alpha/cover.png"]');
      await expect(cover).toContainText('Used by Projects · TEST- Alpha Tracker');

      await cover.getByRole('button', { name: /^Delete cover\.png/ }).click();
      const blocked = page.getByRole('alertdialog', { name: 'This file is in use' });
      await expect(blocked).toContainText('This file is used by Projects · TEST- Alpha Tracker. Detach it there first');
      await blocked.getByRole('button', { name: 'Open that entry' }).click();
      await expect(files).toHaveCount(0);
      const record = page.getByTestId('record-dialog');
      await expect(record.getByRole('heading', { name: 'TEST- Alpha Tracker' })).toBeVisible();
      expect(net.writes, 'nothing was written').toEqual([]);
      expect(errors).toEqual([]);
      await expectOffline(net);
    } finally {
      await context.close();
    }
  });

  test('deleting not-connected files checks again first, keeps one attached meanwhile, and deletes the rest', async ({ browser }) => {
    const { page, context, net, errors } = await openAdmin(browser);
    try {
      await waitForDashboard(page);
      const files = await openFiles(page);
      await files.getByRole('tab', { name: /Not connected/ }).click();
      await expect(files.locator('[data-file="documents:internships/certificate-copy.pdf"]')).toContainText('Possible duplicate of certificate.pdf, which is in use');
      await files.getByRole('checkbox', { name: 'Select draft-shot.png' }).check();
      await files.getByRole('checkbox', { name: 'Select resume-2025.pdf' }).check();
      await expect(files).toContainText('2 selected');

      // while the owner decides, the Beta project starts using the draft shot
      net.rows('projects').find((row) => row.id === 'TEST-project-beta').image_urls = ['project-images/old/draft-shot.png'];

      await files.getByRole('button', { name: 'Delete 2 files' }).click();
      const confirm = page.getByRole('alertdialog', { name: 'Delete 2 files?' });
      await expect(confirm).toContainText('draft-shot.png');
      await expect(confirm).toContainText('resume-2025.pdf');
      await expect(confirm.getByRole('button', { name: 'Cancel' })).toBeFocused();
      await confirm.getByRole('button', { name: 'Delete 2 files' }).click();

      const report = files.getByTestId('media-report');
      await expect(report).toContainText('1 file deleted, 1 kept');
      await expect(report).toContainText('draft-shot.png');
      await expect(report).toContainText('Projects · TEST- Beta Planner');
      const storageWrites = net.writes.filter((write) => write.table.startsWith('storage:'));
      expect(storageWrites).toHaveLength(1);
      expect(storageWrites[0]).toMatchObject({ table: 'storage:documents', method: 'DELETE', body: { prefixes: ['resume-2025.pdf'] } });
      expect(net.writes, 'no table was written').toHaveLength(1);
      await expect(files.getByText('10 files')).toBeVisible();   // the list reloaded
      expect(errors).toEqual([]);
      await expectOffline(net);
    } finally {
      await context.close();
    }
  });

  test('a section that cannot be read turns delete off everywhere until Try again succeeds', async ({ browser }) => {
    // the pop-up's narrow read of skills fails; the Skills deck's own read is untouched
    const narrowSkills = (url) => url.pathname === '/rest/v1/skills' && /icon_url/.test(url.searchParams.get('select') || '') && !/\*/.test(url.searchParams.get('select') || '');
    let failed = 0;
    let markHandled = () => {};
    const { page, context, net } = await openAdmin(browser, {
      before: (ctx) => ctx.route(narrowSkills, (route) => {
        failed += 1;
        markHandled(route.request());
        return route.fulfill({ status: 503, contentType: 'application/json', body: '{"message":"offline"}' });
      }),
    });
    markHandled = net.markHandled;
    try {
      await waitForDashboard(page);
      const files = await openFiles(page);
      const banner = files.getByTestId('media-refs-failed');
      await expect(banner).toContainText('Nothing can be deleted right now');
      await expect(banner).toContainText('Skills could not be checked');
      await files.getByRole('tab', { name: /Not connected/ }).click();
      await expect(files.getByRole('checkbox', { name: 'Select resume-2025.pdf' })).toBeDisabled();
      await expect(files.getByRole('button', { name: 'Delete resume-2025.pdf', exact: true })).toBeDisabled();
      await expect(files.locator('.media-dialog__foot').getByRole('button', { name: 'Delete', exact: true })).toBeDisabled();
      await expect(files.locator('.media-dialog__foot')).toContainText('Delete is off');

      expect(failed).toBeGreaterThan(0);
      await context.unroute(narrowSkills);
      await banner.getByRole('button', { name: 'Try again' }).click();
      await expect(banner).toHaveCount(0);
      await expect(files.getByRole('checkbox', { name: 'Select resume-2025.pdf' })).toBeEnabled();
      expect(net.writes).toEqual([]);
      await expectOffline(net);
    } finally {
      await context.close();
    }
  });

  test('Cmd+K "Files: broken links" opens that tab; Escape closes the pop-up and focus comes back', async ({ browser }) => {
    const { page, context, net, errors } = await openAdmin(browser);
    try {
      await waitForDashboard(page);
      await page.keyboard.press('ControlOrMeta+k');
      const input = page.getByPlaceholder('Jump to a chapter or run an action…');
      await input.fill('broken links');
      await page.keyboard.press('Enter');
      const files = page.getByTestId('media-library');
      await expect(files.getByRole('tab', { name: /Broken links/ })).toHaveAttribute('aria-selected', 'true');
      const row = files.locator('.media-row--broken');
      await expect(row).toContainText('TEST- Hackathon Finalist');
      await expect(row).toContainText('Certificate points at a missing file');
      await expect(row).toContainText('achievement-images/hackathon.pdf');
      await page.keyboard.press('Escape');
      await expect(files).toHaveCount(0);

      const button = filesButton(page);
      await button.click();
      await expect(page.getByTestId('media-library')).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(page.getByTestId('media-library')).toHaveCount(0);
      await expect(button).toBeFocused();
      expect(errors).toEqual([]);
      await expectOffline(net);
    } finally {
      await context.close();
    }
  });

  for (const width of [375, 768, 1280, 1440]) {
    test(`the Files pop-up fits at ${width}px`, async ({ browser }) => {
      const { page, context, net, errors } = await openAdmin(browser, { width });
      try {
        await waitForDashboard(page);
        const files = await openFiles(page);
        expect(await hasHorizontalOverflow(page), 'in use').toBe(false);
        const box = await files.boundingBox();
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(width + 0.5);
        await files.getByRole('tab', { name: /Not connected/ }).click();
        expect(await hasHorizontalOverflow(page), 'not connected').toBe(false);
        await files.locator('[data-file="project-images:old/draft-shot.png"] .media-row__main').click();
        if (width >= 1100) await expect(files.locator('.media-pane')).toContainText('draft-shot.png');
        else await expect(page.getByRole('dialog', { name: 'draft-shot.png' })).toBeVisible();
        expect(await hasHorizontalOverflow(page), 'preview').toBe(false);
        expect(errors).toEqual([]);
        await expectOffline(net);
      } finally {
        await context.close();
      }
    });
  }
});

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

// The fix walk: two TEST- leadership roles with no description give the queue
// one TEXT gap with two records. The override keeps the fixture's complete
// role, so only the two new rows count against the score.
const LEADERSHIP_FIXTURE = JSON.parse(readFileSync('e2e/fixtures/admin/tables/leadership.json', 'utf8'));
const walkRole = (n, title) => ({
  ...LEADERSHIP_FIXTURE[0],
  id: `TEST-leadership-walk-${n}`,
  title,
  description: '',
  position_number: n + 1,
  updated_at: `2026-11-1${n}T10:00:00.000Z`,
});
const WALK_TABLES = { leadership: [...LEADERSHIP_FIXTURE, walkRole(1, 'TEST- Walk Role One'), walkRole(2, 'TEST- Walk Role Two')] };
const LONG_DESCRIPTION = 'TEST- Led a synthetic team of ten through a full year of events.';
const SHORT_DESCRIPTION = 'TEST- Too short.';

/** The queue row for the leadership description gap. */
const walkRow = (page) => page.getByTestId('fix-queue').locator('.fx-row[data-rule="leadership:description"]');

/** Opens the queue's two-record walk and returns the dialog, its banner and the target field. */
async function startDescriptionWalk(page) {
  const row = walkRow(page);
  await row.scrollIntoViewIfNeeded();
  await expect(row).toContainText('2 leadership roles have no description');
  await row.getByRole('button', { name: 'Fix 2, one by one' }).click();
  const dialog = page.getByTestId('record-dialog');
  const banner = dialog.getByTestId('fix-banner');
  const field = dialog.getByRole('textbox', { name: 'Description', exact: true });
  await expect(banner).toBeVisible();
  return { dialog, banner, field };
}

/** Reads "Fixed. Health a → b" off the banner. */
async function healthChange(banner) {
  const title = await banner.locator('.record-banner__title').innerText();
  const match = /^Fixed\. Health (\d+(?:\.\d+)?) → (\d+(?:\.\d+)?)$/.exec(title.trim());
  expect(match, `banner title "${title}"`).not.toBeNull();
  return { before: Number(match[1]), after: Number(match[2]) };
}

/** True when two boxes share any area. */
const overlaps = (a, b) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

/** At phone width the banner must leave the ringed field visible and the page must not scroll sideways. */
async function expectBannerClearOfField(page, banner, cell, width) {
  if (width >= 768) return;
  const [bannerBox, cellBox] = [await banner.boundingBox(), await cell.boundingBox()];
  expect(bannerBox && cellBox, 'banner and field both on screen').toBeTruthy();
  expect(overlaps(bannerBox, cellBox), 'the banner does not cover the target field').toBe(false);
  expect(await hasHorizontalOverflow(page), 'no horizontal overflow').toBe(false);
}

test.describe('fix walk', () => {
  for (const width of [1440, 390]) {
    test(`"Fix 2, one by one" opens the first record in edit mode at 1 of 2, field ringed and focused, at ${width}px`, async ({ browser }) => {
      const { page, context, net, errors } = await openAdmin(browser, { width, tables: WALK_TABLES });
      try {
        await waitForDashboard(page);
        const { dialog, banner, field } = await startDescriptionWalk(page);
        await expect(dialog.getByRole('heading', { name: 'TEST- Walk Role One' })).toBeVisible();
        await expect(banner).toContainText('Fixing: fill in the description');
        await expect(banner.locator('.record-banner__step')).toHaveText(' · 1 of 2');
        await expect(field).toBeVisible();
        await expect(field).toBeFocused();
        const cell = dialog.locator('.record-form__cell.is-target');
        await expect(cell).toHaveCount(1);
        await expect(cell).toContainText('Missing');
        await expect(cell.getByRole('textbox', { name: 'Description', exact: true })).toHaveCount(1);
        await expect(dialog.getByRole('button', { name: 'Save and next' })).toBeVisible();
        await expectBannerClearOfField(page, banner, cell, width);
        expect(net.writes, 'opening the walk writes nothing').toEqual([]);
        expect(errors).toEqual([]);
        await expectOffline(net);
      } finally {
        await context.close();
      }
    });

    test(`"Save and next" sends one write, shows Fixed with the health going up, and Next opens 2 of 2, at ${width}px`, async ({ browser }) => {
      const { page, context, net, errors } = await openAdmin(browser, { width, tables: WALK_TABLES });
      try {
        await waitForDashboard(page);
        const { dialog, banner, field } = await startDescriptionWalk(page);
        await field.fill(LONG_DESCRIPTION);
        await dialog.getByRole('button', { name: 'Save and next' }).click();

        await expect(banner.locator('.record-banner__title')).toHaveText(/^Fixed\. Health /);
        const { before, after } = await healthChange(banner);
        expect(after).toBeGreaterThan(before);
        await expect(banner).toContainText('1 left in this group. Next: TEST- Walk Role Two.');

        const writes = writesTo(net, 'leadership');
        expect(writes).toHaveLength(1);
        expect(writes[0].method).toBe('PATCH');
        expect(writes[0].query).toContain('id=eq.TEST-leadership-walk-1');
        expect(writes[0].body).toMatchObject({ description: LONG_DESCRIPTION });
        expect(net.writes, 'nothing else was written').toHaveLength(1);

        await banner.getByRole('button', { name: 'Next: TEST- Walk Role Two' }).click();
        await expect(dialog.getByRole('heading', { name: 'TEST- Walk Role Two' })).toBeVisible();
        await expect(banner.locator('.record-banner__step')).toHaveText(' · 2 of 2');
        await expect(banner).toContainText('This is the last one in this group.');
        await expect(field).toHaveValue('');
        await expect(field).toBeFocused();
        await expectBannerClearOfField(page, banner, dialog.locator('.record-form__cell.is-target'), width);
        expect(net.writes, 'moving on writes nothing').toHaveLength(1);
        expect(errors).toEqual([]);
        await expectOffline(net);
      } finally {
        await context.close();
      }
    });
  }

  test('a description still under 40 characters is saved but not called fixed', async ({ browser }) => {
    const { page, context, net, errors } = await openAdmin(browser, { tables: WALK_TABLES });
    try {
      await waitForDashboard(page);
      const { dialog, banner, field } = await startDescriptionWalk(page);
      await field.fill(SHORT_DESCRIPTION);
      await dialog.getByRole('button', { name: 'Save and next' }).click();

      await expect(banner.locator('.record-banner__title')).toHaveText('Saved, but this one still needs work.');
      await expect(banner).toContainText('The description is still under 40 characters. Next: TEST- Walk Role Two.');
      await expect(banner).not.toContainText('Fixed');
      await expect(banner.getByRole('button', { name: 'Edit again' })).toBeVisible();
      const writes = writesTo(net, 'leadership');
      expect(writes).toHaveLength(1);
      expect(writes[0].body).toMatchObject({ description: SHORT_DESCRIPTION });

      // Edit again shows the form with the field marked too short, not missing.
      await banner.getByRole('button', { name: 'Edit again' }).click();
      await expect(dialog.locator('.record-form__cell.is-target')).toContainText('Too short');
      await expect(field).toHaveValue(SHORT_DESCRIPTION);
      expect(errors).toEqual([]);
      await expectOffline(net);
    } finally {
      await context.close();
    }
  });

  test('"Stop fixing" mid-walk closes the walk; the queue keeps the remaining role and drops the fixed one', async ({ browser }) => {
    const { page, context, net, errors } = await openAdmin(browser, { tables: WALK_TABLES });
    try {
      await waitForDashboard(page);
      const { dialog, banner, field } = await startDescriptionWalk(page);
      await field.fill(LONG_DESCRIPTION);
      await dialog.getByRole('button', { name: 'Save and next' }).click();
      await banner.getByRole('button', { name: 'Next: TEST- Walk Role Two' }).click();
      await expect(banner.locator('.record-banner__step')).toHaveText(' · 2 of 2');

      await banner.getByRole('button', { name: 'Stop fixing' }).click();
      await expect(dialog).toHaveCount(0);

      const row = walkRow(page);
      await expect(row).toContainText('1 leadership role has no description');
      await row.scrollIntoViewIfNeeded();
      await row.getByRole('button', { name: 'Show it' }).click();
      const items = row.locator('.fx-items');
      await expect(items.getByRole('button', { name: 'Fix TEST- Walk Role Two' })).toBeVisible();
      await expect(items.getByText('TEST- Walk Role One')).toHaveCount(0);
      await expect(row.getByRole('button', { name: 'Fix it' })).toBeVisible();
      expect(writesTo(net, 'leadership'), 'only the first role was written').toHaveLength(1);
      expect(errors).toEqual([]);
      await expectOffline(net);
    } finally {
      await context.close();
    }
  });

  test('after the walk ends the activity pane and the fix queue re-read their tables without a reload', async ({ browser }) => {
    const { page, context, net, errors } = await openAdmin(browser, { tables: WALK_TABLES });
    try {
      await waitForDashboard(page);
      await page.evaluate(() => { window.__sameDocument = true; });
      const { dialog, banner, field } = await startDescriptionWalk(page);
      await field.fill(LONG_DESCRIPTION);
      await dialog.getByRole('button', { name: 'Save and next' }).click();
      await banner.getByRole('button', { name: 'Next: TEST- Walk Role Two' }).click();
      await expect(banner.locator('.record-banner__step')).toHaveText(' · 2 of 2');
      await field.fill(LONG_DESCRIPTION);
      await dialog.getByRole('button', { name: 'Save and next' }).click();
      await expect(banner.locator('.record-banner__title')).toHaveText(/^Fixed\. Health /);
      await expect(banner).toContainText('That was the last one in this group.');

      const writes = writesTo(net, 'leadership');
      expect(writes.map((w) => w.query.match(/id=eq\.[^&]+/)?.[0])).toEqual(['id=eq.TEST-leadership-walk-1', 'id=eq.TEST-leadership-walk-2']);
      // everything read so far happened before the walk ended
      const endedAt = Math.max(...net.reads.map((r) => r.seq), ...net.writes.map((w) => w.seq));
      await banner.getByRole('button', { name: 'Back to the queue' }).click();
      await expect(dialog).toHaveCount(0);

      const readAfter = (table) => net.reads.filter((r) => r.table === table && r.method === 'GET' && r.seq > endedAt).length;
      await expect.poll(() => readAfter('admin_activity'), { message: 'the activity pane re-read admin_activity' }).toBeGreaterThan(0);
      await expect.poll(() => readAfter('leadership'), { message: 'the fix queue re-read leadership' }).toBeGreaterThan(0);
      await expect(walkRow(page)).toHaveCount(0);
      await expect(page.getByTestId('fix-queue')).toBeInViewport();
      expect(await page.evaluate(() => window.__sameDocument), 'no page reload').toBe(true);
      expect(net.writes, 'only the two descriptions were written').toHaveLength(2);
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

test.describe('reports', () => {
  // Two stored reports, newest first in the archive. The ids are uuids because the service refuses anything else.
  const stored = (id, label, quarter, created) => ({
    id, period_label: label, quarter, period_start: '2026-07-01', period_end: '2026-09-30', partial: false, trigger: 'schedule',
    email_status: 'sent', created_at: created, summary: {}, body_html: `<!doctype html><p>${label} body</p>`, body_text: `${label} body`,
  });
  const NEWER = '7d0f5b1e-3c2a-4e8f-9b6d-2a1c3e5f7a90';
  const reports = [
    stored(NEWER, 'TEST- July to September 2026', 'Q3 2026', '2026-10-01T13:00:05Z'),
    stored('1b2c3d4e-5f60-4718-8a9b-0c1d2e3f4a5b', 'TEST- April to June 2026', 'Q2 2026', '2026-07-01T13:00:04Z'),
  ];

  test('Delete asks first, sends one delete, and the archive drops the row without a reload', async ({ browser }) => {
    const { page, context, net, errors } = await openAdmin(browser, { tables: { analytics_reports: reports } });
    try {
      await waitForDashboard(page);
      await goToChapter(page, 'analytics');
      const chapter = page.getByTestId('analytics-chapter');
      await chapter.getByRole('tab', { name: 'Reports' }).click();
      const archive = chapter.locator('.ins-reports li');
      await expect(archive).toHaveCount(2);

      await chapter.getByRole('button', { name: 'Open the report for TEST- July to September 2026' }).click();
      const dialog = page.getByTestId('report-dialog');
      await dialog.getByRole('button', { name: 'Delete', exact: true }).click();
      const confirm = page.getByRole('alertdialog');
      await expect(confirm).toContainText('The report for TEST- July to September 2026, made 1 Oct 2026, 9:00 AM');
      await expect(confirm.getByRole('button', { name: 'Cancel' })).toBeFocused();

      // Escape backs out of the confirmation only.
      await page.keyboard.press('Escape');
      await expect(confirm).toHaveCount(0);
      await expect(dialog).toBeVisible();
      expect(writesTo(net, 'analytics_reports'), 'nothing deleted yet').toEqual([]);

      await dialog.getByRole('button', { name: 'Delete', exact: true }).click();
      await page.getByRole('alertdialog').getByRole('button', { name: 'Delete', exact: true }).click();
      await expect(dialog).toHaveCount(0);
      await expect(archive).toHaveCount(1);
      await expect(archive.first()).toContainText('TEST- April to June 2026');
      await expect(page.locator('#ins-archive-h')).toBeFocused();

      const deletes = writesTo(net, 'analytics_reports');
      expect(deletes).toHaveLength(1);
      expect(deletes[0].method).toBe('DELETE');
      expect(new URLSearchParams(deletes[0].query).get('id')).toBe(`eq.${NEWER}`);
      // The report body sits in an iframe with an empty sandbox, so nothing may run in it. Playwright
      // still injects this suite's init scripts into every frame; the browser refuses them there and
      // logs the refusal. Those two messages show the sandbox working and are the only ones allowed.
      const sandboxRefusals = [/about:srcdoc.*sandboxed.*'allow-scripts'/, /'serviceWorker'.*context is sandboxed/];
      expect(errors.filter((line) => !sandboxRefusals.some((known) => known.test(line)))).toEqual([]);
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

test.describe('sign out', () => {
  /**
   * Records every class change on the film's root, with the time since the
   * page started, and every painted frame's time, so a test can tell the
   * film's own clock from wall time on a busy machine.
   */
  const recordPhases = (context) => context.addInitScript(() => {
    window.__phases = [];
    window.__frames = [];
    // registered before the film's loop, so in each frame it runs first and
    // a phase change can be tied to the frame that made it
    const paint = (t) => { window.__frames.push(t); requestAnimationFrame(paint); };
    requestAnimationFrame(paint);
    const seen = new WeakSet();
    const watch = () => {
      const root = document.querySelector('[data-testid="exit-sequence"]');
      if (!root || seen.has(root)) return;
      seen.add(root);
      new MutationObserver(() => window.__phases.push({ t: Math.round(performance.now()), f: window.__frames.at(-1), c: root.className })).observe(root, { attributes: true, attributeFilter: ['class'] });
    };
    new MutationObserver(watch).observe(document, { childList: true, subtree: true });
  });

  test('the film plays once, in order, ends the session and lands on the login', async ({ browser }) => {
    test.setTimeout(60_000);
    const { page, context, net, errors } = await openAdmin(browser, { path: '/adminsignout', motion: true, before: recordPhases });
    try {
      await expect(page.getByTestId('exit-sequence')).toBeVisible();
      // long enough for the security level to have arrived and the clapperboard to have closed
      await page.waitForTimeout(4000);
      const phases = await page.evaluate(() => window.__phases);
      const clapIns = phases.filter((p, i) => /\bclap-in\b/.test(p.c) && !/\bclap-in\b/.test(phases[i - 1]?.c ?? ''));
      expect(clapIns, 'the clapperboard rises exactly once').toHaveLength(1);
      const snaps = phases.filter((p, i) => /\bsnap\b/.test(p.c) && !/\bsnap\b/.test(phases[i - 1]?.c ?? ''));
      expect(snaps, 'the stick snaps exactly once').toHaveLength(1);
      // one clock: the snap follows the board by the film's own 1.7 s. The
      // film counts each frame's gap up to 250 ms, so a stall on a busy
      // machine holds it; the same sum over the frames between the two
      // changes gives the film time that passed (snap is due 1700 ms after
      // the board rises, plus at most one frame of lateness).
      const frames = await page.evaluate(() => window.__frames);
      let filmGap = 0;
      for (let i = 1; i < frames.length; i += 1) {
        if (frames[i] > clapIns[0].f && frames[i] <= snaps[0].f) filmGap += Math.min(250, frames[i] - frames[i - 1]);
      }
      expect(filmGap).toBeGreaterThanOrEqual(1700 - 250);
      expect(filmGap).toBeLessThan(1700 + 250);
      expect(phases.some((p) => /\bleader\b/.test(p.c)), 'the countdown follows').toBe(true);

      // a click skips to the closing card; the login follows
      await page.getByTestId('exit-sequence').click({ position: { x: 40, y: 40 } });
      await page.waitForURL('**/adminlogin', { timeout: 15_000 });
      const all = await page.evaluate(() => window.__phases ?? []);
      expect(all.filter((p, i) => /\bclap-in\b/.test(p.c) && !/\bclap-in\b/.test(all[i - 1]?.c ?? '')).length, 'no second clapperboard after the skip').toBeLessThanOrEqual(1);
      const stored = await page.evaluate(() => Object.keys(localStorage).filter((k) => /^sb-.*-auth-token$/.test(k)));
      expect(stored, 'the session is gone from storage').toEqual([]);
      await page.waitForTimeout(1500);
      expect(new URL(page.url()).pathname, 'the login page stays').toBe('/adminlogin');
      expect(errors).toEqual([]);
      await expectOffline(net);
    } finally {
      await context.close();
    }
  });

  test('a sign-out the server refuses still leaves the browser signed out', async ({ browser }) => {
    test.setTimeout(60_000);
    const refuse = (context) => context.route('**/auth/v1/logout**', (route) => route.fulfill({ status: 503, contentType: 'application/json', body: '{"message":"unavailable"}' }));
    const { page, context, errors } = await openAdmin(browser, { path: '/adminsignout', before: refuse });
    try {
      await page.waitForURL('**/adminlogin', { timeout: 20_000 });
      await page.waitForTimeout(1500);
      expect(new URL(page.url()).pathname, 'not bounced back into the dashboard').toBe('/adminlogin');
      const stored = await page.evaluate(() => Object.keys(localStorage).filter((k) => /^sb-.*-auth-token$/.test(k)));
      expect(stored, 'the session is gone from storage').toEqual([]);
      // the refused request itself is the only console entry allowed
      expect(errors.filter((e) => !/503/.test(e))).toEqual([]);
    } finally {
      await context.close();
    }
  });
});
