// e2e/capture.spec.mjs
//
// Capture mode: writes one full-page screenshot and one layout record per
// shot to CAPTURE_DIR, for comparison with another capture (for example the
// live site before a deploy). Skipped unless CAPTURE_DIR is set, so ordinary
// test runs never produce capture output.
//
// Usage: see scripts/capture-site.mjs.

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from '@playwright/test';
import { CAPTURE_SHOTS } from './support/site-map.mjs';
import { readLayoutRecord, waitForPageReady } from './support/page-probe.mjs';
import { openPage } from './support/test-setup.mjs';

const captureDir = process.env.CAPTURE_DIR;

test.describe('capture', () => {
  test.skip(!captureDir, 'set CAPTURE_DIR to run a capture');

  const records = [];

  test.afterAll(async () => {
    if (!captureDir) return;
    await writeFile(path.join(captureDir, 'capture-log.json'), `${JSON.stringify(records, null, 2)}\n`);
  });

  for (const shot of CAPTURE_SHOTS) {
    test(shot.name, async ({ browser, baseURL }) => {
      await mkdir(captureDir, { recursive: true });
      const { page, context, errors, unexpected } = await openPage(browser, shot);
      try {
        if (shot.expandCube) {
          const button = page.locator('.cube-control-button').first();
          if (await button.count()) {
            await button.click();
            await waitForPageReady(page);
          }
        }
        await page.screenshot({ path: path.join(captureDir, `${shot.name}.png`), fullPage: true, animations: 'disabled' });
        const layout = await readLayoutRecord(page);
        records.push({
          shot: shot.name,
          url: new URL(shot.path, baseURL).toString(),
          width: shot.width,
          theme: shot.theme,
          ...layout,
          errors: [...errors, ...unexpected.map((request) => `[unexpected] ${request}`)],
        });
      } finally {
        await context.close();
      }
    });
  }
});
