#!/usr/bin/env node
// scripts/admin-open.mjs
//
// Opens the real admin dashboard in Chromium with the owner's saved session
// (see admin-login-capture.mjs), then either keeps the window open for a look
// or takes screenshots at the agreed widths and reports console errors. This is
// how dashboard changes are verified in a real browser before hand-off.
//
// Usage:
//   node scripts/admin-open.mjs                         visible window, stays open until closed
//   node scripts/admin-open.mjs --shots out/dir         headless: 390, 768, 1024, 1440 screenshots + error report
//   node scripts/admin-open.mjs --path /admindashboard  which admin route to open (default /admindashboard)
//   node scripts/admin-open.mjs --skip-entry            set the flag that skips the Matrix entry animation

import { access, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from '@playwright/test';

const STATE_FILE = path.join('.playwright', 'admin-state.json');
export const WIDTHS = [[390, 844], [768, 1024], [1024, 768], [1440, 900]];

/** True when the page is on an admin route other than the login, i.e. the saved session still works. */
export const signedIn = (pathname) => /^\/admindashboard/.test(pathname);

async function main(argv) {
  const arg = (name, fallback) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : fallback; };
  const base = arg('--url', 'http://localhost:3000'), route = arg('--path', '/admindashboard'), shots = arg('--shots', null);
  try { await access(STATE_FILE); } catch {
    process.stderr.write(`No saved session at ${STATE_FILE}. The owner runs: node scripts/admin-login-capture.mjs\n`);
    return 2;
  }
  const browser = await chromium.launch({ headless: !!shots, args: ['--ignore-gpu-blocklist', '--enable-webgl'] });
  const sizes = shots ? WIDTHS : [[1440, 900]];
  let failures = 0;
  for (const [width, height] of sizes) {
    const context = await browser.newContext({ storageState: STATE_FILE, viewport: { width, height }, deviceScaleFactor: 1 });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text().slice(0, 200)}`); });
    if (argv.includes('--skip-entry')) await context.addInitScript(() => { try { sessionStorage.setItem('rc-admin-entry-seen', '1'); } catch { /* ignore */ } });
    await page.goto(`${base}${route}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    const where = new URL(page.url()).pathname;
    if (!signedIn(where)) {
      process.stderr.write(`Saved session did not sign in (landed on ${where}). Rerun admin-login-capture.\n`);
      await browser.close();
      return 3;
    }
    if (shots) {
      await mkdir(shots, { recursive: true });
      // give the entry animation time to finish before the still
      await page.waitForTimeout(9000);
      const file = path.join(shots, `admin-${width}.png`);
      await page.screenshot({ path: file, fullPage: false });
      process.stdout.write(`${width}x${height} -> ${file}${errors.length ? `  ERRORS: ${errors.join(' | ')}` : '  clean'}\n`);
      if (errors.length) failures += 1;
      await context.close();
    } else {
      process.stdout.write(`Open at ${width}x${height}. Close the window to finish.\n`);
      await page.waitForEvent('close', { timeout: 0 }).catch(() => {});
    }
  }
  await browser.close();
  return failures ? 1 : 0;
}

process.exitCode = await main(process.argv.slice(2));
