#!/usr/bin/env node
// scripts/admin-login-capture.mjs
//
// One-time, owner-run: opens a visible Chromium on the local login page, waits
// while the owner signs in (email code, then authenticator), and saves the
// browser's storage state to .playwright/admin-state.json. That file holds a
// live Supabase session for the owner's account, so it is gitignored and lives
// only on this machine. scripts/admin-open.mjs reuses it so the agent can open
// the real dashboard in a browser and verify changes before handing them over.
//
// Usage: node scripts/admin-login-capture.mjs [--url http://localhost:3000]
// The session lasts as long as Supabase's refresh token (weeks); rerun when
// admin-open reports that the saved state no longer signs in.

import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from '@playwright/test';

const STATE_DIR = '.playwright';
export const STATE_FILE = path.join(STATE_DIR, 'admin-state.json');

async function main(argv) {
  const urlIndex = argv.indexOf('--url');
  const base = urlIndex >= 0 ? argv[urlIndex + 1] : 'http://localhost:3000';
  await mkdir(STATE_DIR, { recursive: true });

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  const page = await context.newPage();
  await page.goto(`${base}/adminlogin`);
  process.stdout.write('Sign in in the browser window (email code, then authenticator). Waiting for the dashboard...\n');

  // Complete means: the Supabase session in localStorage carries an access token whose
  // assurance claim is aal2, i.e. the authenticator code has been accepted. The URL alone is
  // not enough: the code step is also shown at /admindashboard.
  await page.waitForFunction(
    () => {
      try {
        const key = Object.keys(window.localStorage).find((k) => k.startsWith('sb-') && k.endsWith('-auth-token'));
        if (!key) return false;
        const token = JSON.parse(window.localStorage.getItem(key))?.access_token;
        if (!token) return false;
        const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
        return payload.aal === 'aal2';
      } catch { return false; }
    },
    null,
    { timeout: 10 * 60 * 1000 },
  );
  process.stdout.write('Second factor accepted. Saving in a moment...\n');
  // Let the entry animation and the first data load settle, so the saved state includes any refreshed token.
  await page.waitForTimeout(4000);
  await context.storageState({ path: STATE_FILE });
  await browser.close();
  process.stdout.write(`Saved ${STATE_FILE}. Keep it private; it is gitignored.\n`);
  return 0;
}

process.exitCode = await main(process.argv.slice(2));
