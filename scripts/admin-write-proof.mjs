#!/usr/bin/env node
// scripts/admin-write-proof.mjs
//
// Unit 4.4: proves that the admin's writes work end to end, through the real
// user interface, the way the 2025 dashboard's did not on the live site. For
// each list section it creates a TEST- 4.4 record from the deck's New card,
// reloads and finds it, edits it, uploads a tiny PNG where the section takes
// a picture or file, deletes it and checks that the row and its files are
// gone. The two drag decks (projects, internships) also swap two TEST cards
// and swap them back, and the inbox opens, stars, archives and deletes a
// TEST message. Hero and About hold one live row each, so they run only with
// --singletons, as a save that leaves the row exactly as it was.
//
// Two modes:
//   --offline (default)  the e2e build (npm run build:e2e) on localhost:4173,
//                        the fake aal2 session and the in-memory database of
//                        e2e/support; nothing leaves the machine. Used to
//                        develop and check the proof itself.
//   --live               the owner's saved session (.playwright/admin-state.json,
//                        from npm run admin:login) against the real project.
//                        --serve <dir> serves a production build on --port
//                        (default 4174) with the .htaccess headers; --base
//                        points at a server that is already running instead.
//
// Every request is classified by lib/write-proof.mjs before it leaves the
// browser. A write that does not touch this run's own rows or files is
// aborted and stops the run; e-mail sending functions and analytics events
// are answered locally and never sent. A finally block deletes every row
// whose title starts with "TEST- 4.4" and every file this run uploaded, and
// checks that none is left. Content Security Policy violations, page errors
// and failed responses all fail the run, so a clean report is also the proof
// that the CSP lets the admin reach everything it needs.
//
// Usage:
//   node scripts/admin-write-proof.mjs --out <dir>                       offline
//   node scripts/admin-write-proof.mjs --live --serve build --out <dir>  live, production build on :4174
//   node scripts/admin-write-proof.mjs --live --base http://localhost:3000 --out <dir>
//   options: --sections projects,inbox   --singletons   --headed   --width 1440
//
// Exit codes: 0 pass, 1 a step or check failed, 2 refused to start, 3 the
// guard stopped the run.

import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium, expect } from '@playwright/test';
import { checkAdminOpenPath } from './lib/admin-open-path.mjs';
import {
  CLEANUP_TABLES, SECTIONS, SINGLETONS, TEST_PREFIX, TINY_PNG,
  classifyRequest, compareOrderSnapshots, decodeJwtPayload, editedTitle, fieldValues, isTestTitle,
  makeRunId, mergeSessionBack, orderRewriteImpact, recordTitle, remapStorageState, renderReport,
  passkeyCorsNoise, reportPasses, rowDiff, sessionLevel, storagePath, storagePaths,
} from './lib/write-proof.mjs';

const STATE_FILE = path.join('.playwright', 'admin-state.json');
const OFFLINE_PORT = 4173;
const HEIGHTS = { 390: 844, 768: 1024, 1280: 800, 1440: 900 };
/** Buckets the sections store files in, for the cleanup's file sweep. */
const BUCKETS = ['project-images', 'organization-logos', 'documents', 'skill-icons', 'certification-badges', 'profile-images', 'achievement-images'];

class GuardStop extends Error {}

// ---- options ----------------------------------------------------------------

function readOptions(argv) {
  const has = (name) => argv.includes(name);
  const arg = (name, fallback = null) => { const i = argv.indexOf(name); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : fallback; };
  const live = has('--live');
  return {
    live,
    serve: arg('--serve'),
    port: Number(arg('--port', live ? '4174' : String(OFFLINE_PORT))),
    base: arg('--base'),
    out: arg('--out', path.join('test-results', `write-proof-${new Date().toISOString().slice(0, 10)}`)),
    sections: arg('--sections')?.split(',').map((s) => s.trim()).filter(Boolean) ?? null,
    singletons: has('--singletons'),
    headed: has('--headed'),
    width: Number(arg('--width', '1440')),
  };
}

// ---- servers ------------------------------------------------------------------

/** Starts scripts/static-server.mjs and waits until it answers. */
async function startStaticServer(root, port) {
  const child = spawn(process.execPath, ['scripts/static-server.mjs', '--root', root, '--port', String(port)], { stdio: 'ignore' });
  const url = `http://localhost:${port}`;
  for (let i = 0; i < 60; i += 1) {
    try { const r = await fetch(`${url}/home`); if (r.ok) return { url, stop: () => child.kill() }; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 250));
  }
  child.kill();
  throw new Error(`The static server did not start on port ${port}.`);
}

/** Reads the Supabase project origin the app was built with, from its own scripts (never printed). */
async function discoverSupabaseOrigin(base) {
  const html = await (await fetch(`${base}/admindashboard`)).text();
  const sources = [...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map((m) => new URL(m[1], base).href);
  for (const src of sources) {
    const match = /https:\/\/[a-z0-9]{10,40}\.supabase\.co/.exec(await (await fetch(src)).text());
    if (match) return match[0];
  }
  throw new Error('No Supabase address found in the app\'s scripts.');
}

// ---- the data port: how the proof itself reads and cleans up ------------------

/**
 * Live: Node fetch straight to the project with the page's own session token
 * (and the build's public key), so the proof's own reads and its cleanup do
 * not depend on the page still being open. The token and key are kept in
 * memory only and never written to the report.
 */
function livePort(supabaseOrigin, auth) {
  const headers = (anon = false) => {
    if (!auth.apikey) throw new Error('The public key has not been seen yet.');
    const h = { apikey: auth.apikey, 'content-type': 'application/json' };
    if (!anon) {
      if (!auth.bearer) throw new Error('No signed-in token has been seen yet.');
      h.authorization = `Bearer ${auth.bearer}`;
    }
    return h;
  };
  const rest = async (method, query, body, { anon = false, prefer } = {}) => {
    const res = await fetch(`${supabaseOrigin}/rest/v1/${query}`, { method, headers: { ...headers(anon), ...(prefer ? { prefer } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
    const text = await res.text();
    if (!res.ok) throw new Error(`${method} ${query.split('?')[0]} answered ${res.status}`);
    return text ? JSON.parse(text) : null;
  };
  const like = encodeURIComponent(`${TEST_PREFIX}*`);
  return {
    findTestRows: (table, titleKey) => rest('GET', `${table}?select=*&${titleKey}=like.${like}`),
    getRow: async (table, id) => (await rest('GET', `${table}?select=*&id=eq.${encodeURIComponent(id)}`))[0] ?? null,
    allRows: (table, columns) => rest('GET', `${table}?select=${columns}`),
    deleteRow: (table, id) => rest('DELETE', `${table}?id=eq.${encodeURIComponent(id)}`),
    restoreColumn: (table, id, patch) => rest('PATCH', `${table}?id=eq.${encodeURIComponent(id)}`, patch),
    insertAnon: (table, row) => rest('POST', table, row, { anon: true, prefer: 'return=minimal' }),
    storageHas: async (bucket, filePath) => {
      const dir = filePath.includes('/') ? filePath.slice(0, filePath.lastIndexOf('/')) : '';
      const name = filePath.slice(filePath.lastIndexOf('/') + 1);
      const res = await fetch(`${supabaseOrigin}/storage/v1/object/list/${bucket}`, { method: 'POST', headers: headers(), body: JSON.stringify({ prefix: dir, search: name, limit: 100, offset: 0 }) });
      if (!res.ok) throw new Error(`storage list ${bucket} answered ${res.status}`);
      return (await res.json()).some((o) => o.name === name);
    },
    storageRemove: async (bucket, paths) => {
      if (!paths.length) return;
      const res = await fetch(`${supabaseOrigin}/storage/v1/object/${bucket}`, { method: 'DELETE', headers: headers(), body: JSON.stringify({ prefixes: paths }) });
      if (!res.ok) throw new Error(`storage delete ${bucket} answered ${res.status}`);
    },
  };
}

/** Offline: the same questions answered from the in-memory tables and the fake storage. */
function offlinePort(net, store) {
  const rows = (table) => net.rows(table) ?? [];
  return {
    findTestRows: async (table, titleKey) => rows(table).filter((r) => isTestTitle(r[titleKey])),
    getRow: async (table, id) => rows(table).find((r) => String(r.id) === String(id)) ?? null,
    allRows: async (table) => rows(table),
    restoreColumn: async (table, id, patch) => { Object.assign(rows(table).find((r) => String(r.id) === String(id)) ?? {}, patch); },
    deleteRow: async (table, id) => { const list = rows(table); const i = list.findIndex((r) => String(r.id) === String(id)); if (i >= 0) list.splice(i, 1); },
    insertAnon: async (table, row) => { rows(table).push({ id: `TEST-msg-${Date.now()}`, created_at: new Date().toISOString(), updated_at: new Date().toISOString(), is_starred: false, is_archived: false, is_spam: false, read_at: null, ...row }); },
    storageHas: async (bucket, filePath) => store.has(`${bucket}/${filePath}`),
    storageRemove: async (bucket, paths) => { for (const p of paths) store.delete(`${bucket}/${p}`); },
  };
}

/** Offline storage: uploads, removals and listings kept in a Set, on top of the fixture layer. */
async function installFakeStorage(context, supabaseOrigin, store) {
  await context.route((url) => url.origin === supabaseOrigin && url.pathname.startsWith('/storage/v1/object/'), async (route) => {
    const request = route.request();
    const method = request.method();
    const { pathname } = new URL(request.url());
    const list = /^\/storage\/v1\/object\/list\/([^/]+)$/.exec(pathname);
    if (list && method === 'POST') {
      const body = request.postDataJSON() ?? {};
      const prefix = String(body.prefix ?? '').replace(/^\/+|\/+$/g, '');
      const entries = [...store].filter((key) => key.startsWith(`${list[1]}/`)).map((key) => key.slice(list[1].length + 1))
        .filter((p) => (p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '') === prefix)
        .map((p) => p.slice(p.lastIndexOf('/') + 1))
        .filter((name) => !body.search || name.includes(body.search))
        .map((name) => ({ name, id: name, updated_at: new Date().toISOString(), created_at: new Date().toISOString(), metadata: { size: TINY_PNG.length, mimetype: 'image/png' } }));
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(entries) });
    }
    const remove = /^\/storage\/v1\/object\/([^/]+)$/.exec(pathname);
    if (remove && method === 'DELETE') {
      const prefixes = request.postDataJSON()?.prefixes ?? [];
      const gone = prefixes.filter((p) => store.delete(`${remove[1]}/${p}`));
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(gone.map((name) => ({ name }))) });
    }
    const upload = /^\/storage\/v1\/object\/(?!list\/|sign\/|public\/)([^/]+)\/(.+)$/.exec(pathname);
    if (upload && (method === 'POST' || method === 'PUT')) {
      const key = `${upload[1]}/${decodeURIComponent(upload[2])}`;
      store.add(key);
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ Key: key, Id: key }) });
    }
    return route.fallback();
  });
}

// ---- the run --------------------------------------------------------------------

async function main(argv) {
  const opts = readOptions(argv);
  const runId = makeRunId();
  const report = {
    runId, mode: opts.live ? 'live' : 'offline', base: null, startedAt: new Date().toISOString(), finishedAt: null, passed: false,
    steps: [], order: [], violations: [], blocked: [], orderRewrites: 0, csp: [], pageErrors: [], failedResponses: [], cleanup: { status: 'fail', detail: 'not reached' },
  };
  const step = (section, name, status, detail = '') => { report.steps.push({ section, step: name, status, detail }); process.stdout.write(`${status.padEnd(7)} ${section} / ${name}${detail ? `: ${detail}` : ''}\n`); };

  // ---- refuse to start when anything is off
  let savedState = null;
  let sessionKey = null;
  if (opts.live) {
    if (!opts.serve && !opts.base) { process.stderr.write('--live needs --serve <build dir> or --base <url>.\n'); return 2; }
    try { savedState = JSON.parse(await readFile(STATE_FILE, 'utf8')); } catch {
      process.stderr.write(`No saved session at ${STATE_FILE}. The owner runs: npm run admin:login\n`);
      return 2;
    }
    const level = sessionLevel(savedState);
    if (!level.ok) { process.stderr.write(`${level.message}\n`); return 2; }
    sessionKey = level.key;
  }
  if (opts.base) {
    let parsed;
    try { parsed = new URL(opts.base); } catch { process.stderr.write(`${opts.base} is not a valid address.\n`); return 2; }
    const check = checkAdminOpenPath(parsed.pathname, '--base');
    if (!check.ok) { process.stderr.write(`${check.message}\n`); return 2; }
  }
  const chosen = (key) => !opts.sections || opts.sections.includes(key);

  let server = null;
  let browser = null;
  let context = null;
  let port = null;
  const store = new Set();
  const auth = { apikey: null, bearer: null };
  const created = Object.fromEntries([...SECTIONS.map((s) => s.table), 'contact_messages'].map((t) => [t, new Set()]));
  const uploaded = [];          // { bucket, path } of every upload the guard let through
  const snapshots = new Map();  // table -> order snapshot before the drag test
  const guard = { reorder: null, singleton: null, stopped: null };
  let exitCode = 1;

  try {
    if (opts.live) {
      if (opts.serve) server = await startStaticServer(opts.serve, opts.port);
      report.base = opts.base ?? server.url;
    } else {
      server = await startStaticServer('build', OFFLINE_PORT);
      report.base = server.url;
    }
    const base = report.base;
    const baseOrigin = new URL(base).origin;
    const supabaseOrigin = await discoverSupabaseOrigin(base);

    browser = await chromium.launch({ headless: !opts.headed });
    const width = opts.width;
    context = await browser.newContext({
      viewport: { width, height: HEIGHTS[width] ?? 900 }, deviceScaleFactor: 1, reducedMotion: 'reduce', serviceWorkers: 'block',
      ...(opts.live ? { storageState: remapStorageState(savedState, baseOrigin) } : {}),
    });

    if (opts.live) {
      port = livePort(supabaseOrigin, auth);
    } else {
      const { installAdminFixtures } = await import('../e2e/support/admin-fixtures.mjs');
      const net = await installAdminFixtures(context, { session: 'aal2' });
      await installFakeStorage(context, supabaseOrigin, store);
      port = offlinePort(net, store);
    }

    // CSP violations reach Node through a binding that survives reloads
    await context.exposeBinding('__writeProofCsp', (_source, v) => { report.csp.push(v); });
    await context.addInitScript(() => {
      document.addEventListener('securitypolicyviolation', (e) => {
        try { window.__writeProofCsp({ directive: e.violatedDirective, blocked: e.blockedURI, source: e.sourceFile || '' }); } catch { /* binding gone during unload */ }
      });
    });

    const titleKeys = Object.fromEntries(SECTIONS.map((s) => [s.table, s.titleKey]));
    // The guard runs before every other route (Playwright tries the last registered first).
    await context.route(() => true, async (route) => {
      const request = route.request();
      const verdict = classifyRequest({ method: request.method(), url: request.url(), postData: request.postData() }, {
        baseOrigin, supabaseOrigin, runId, created, titleKeys, reorder: guard.reorder, singleton: guard.singleton,
      });
      const where = (() => { const u = new URL(request.url()); return `${u.origin === supabaseOrigin ? '<project>' : u.origin}${u.pathname}`; })();
      if (verdict.verdict === 'violation') {
        report.violations.push({ method: request.method(), url: where, reason: verdict.reason });
        guard.stopped = guard.stopped ?? verdict.reason;
        return route.abort('blockedbyclient');
      }
      if (verdict.verdict === 'block') {
        report.blocked.push({ method: request.method(), url: where, reason: verdict.reason });
        if (verdict.kind === 'analytics') return route.fulfill({ status: 201, body: '' });
        if (verdict.kind === 'function') return route.fulfill({ status: 200, contentType: 'application/json', body: '{"success":true,"data":null}' });
        return route.abort('blockedbyclient');
      }
      if (verdict.kind === 'order-rewrite') report.orderRewrites += 1;
      if (verdict.kind === 'upload') {
        const m = /^\/storage\/v1\/object\/([^/]+)\/(.+)$/.exec(new URL(request.url()).pathname);
        uploaded.push({ bucket: m[1], path: decodeURIComponent(m[2]) });
      }
      return route.fallback();
    });

    context.on('request', (request) => {
      if (!request.url().startsWith(supabaseOrigin)) return;
      const h = request.headers();
      if (h.apikey) auth.apikey = h.apikey;
      const bearer = /^Bearer (.+)$/.exec(h.authorization ?? '')?.[1];
      if (bearer && decodeJwtPayload(bearer)?.role === 'authenticated') auth.bearer = bearer;
    });
    context.on('response', async (response) => {
      const request = response.request();
      const url = new URL(response.url());
      if (url.origin !== supabaseOrigin) return;
      if (response.status() >= 400) report.failedResponses.push({ status: response.status(), method: request.method(), url: `<project>${url.pathname}` });
      const rest = /^\/rest\/v1\/([a-z0-9_]+)$/.exec(url.pathname);
      if (!rest || request.method() !== 'POST' || !(rest[1] in created) || response.status() >= 300) return;
      try {
        const body = await response.json();
        for (const row of Array.isArray(body) ? body : [body]) if (row?.id && isTestTitle(row[titleKeys[rest[1]]], runId)) created[rest[1]].add(String(row.id));
      } catch { /* return=minimal */ }
    });

    const page = await context.newPage();
    page.on('pageerror', (e) => report.pageErrors.push(`pageerror: ${e.message}`));
    page.on('console', (m) => {
      if (m.type() !== 'error') return;
      const text = m.text();
      // The passkey function accepts only http://localhost:3000 and the live site, so its
      // read-only status check is refused by CORS when the build is served on another port.
      // Expected here and listed apart; it never touches a write.
      if (passkeyCorsNoise(text, m.location()?.url, baseOrigin)) { report.expectedErrors = (report.expectedErrors ?? 0) + 1; return; }
      report.pageErrors.push(`console: ${text.slice(0, 240)}`);
    });
    page.on('dialog', (d) => d.dismiss().catch(() => {}));
    page.on('framenavigated', (frame) => {
      if (frame !== page.mainFrame()) return;
      const where = new URL(frame.url()).pathname.toLowerCase();
      if (where.startsWith('/adminsignout') || where.startsWith('/adminlogin')) guard.stopped = guard.stopped ?? `the page went to ${where}`;
    });

    const live = () => { if (guard.stopped) throw new GuardStop(guard.stopped); };

    // ---- page helpers
    const openDashboard = async () => {
      await page.goto(`${base}/admindashboard`, { waitUntil: 'load' });
      await expect(page.getByTestId('voyage')).toBeVisible({ timeout: 30_000 });
      await expect(page.getByRole('dialog', { name: 'Signing in to the admin dashboard' })).toHaveCount(0, { timeout: 30_000 });
      live();
    };
    const chapter = async (id) => {
      const stage = page.locator(`#chapter-${id}`);
      await stage.evaluate((el) => el.scrollIntoView({ block: 'start' }));
      return stage;
    };
    const deckReady = async (stage, section) => {
      const newCard = stage.getByRole('button', { name: `New ${section.singular}`, exact: true });
      await expect(newCard).toBeEnabled({ timeout: 20_000 });
      return newCard;
    };
    /** A card's open button (the sortable article around it carries the same name, so match the label). */
    const card = (stage, title) => stage.locator('button.card__open').and(stage.getByLabel(`Open ${title}`, { exact: true }));
    const recordDialog = () => page.getByTestId('record-dialog');
    const closeDialog = async (dialog) => {
      await dialog.getByRole('button', { name: 'Close' }).first().click();
      const discard = page.getByRole('alertdialog').getByRole('button', { name: 'Discard' });
      if (await discard.isVisible().catch(() => false)) await discard.click();
      await expect(page.getByTestId('record-dialog')).toHaveCount(0, { timeout: 10_000 });
    };
    /** Saves the open form: a new record's button reads "Add <singular>", an edit's "Save". */
    const saveDialog = async (dialog, button = 'Save') => {
      await dialog.getByRole('button', { name: button, exact: true }).click();
      await expect(dialog.getByTestId('record-view')).toBeVisible({ timeout: 20_000 });
      live();
    };
    const waitFor = async (check, what, timeout = 15_000) => {
      const end = Date.now() + timeout;
      for (;;) {
        live();
        const value = await check();
        if (value) return value;
        if (Date.now() > end) throw new Error(`timed out waiting for ${what}`);
        await new Promise((r) => setTimeout(r, 300));
      }
    };
    const createRecord = async (section, title) => {
      const stage = await chapter(section.chapter);
      await (await deckReady(stage, section)).click();
      const dialog = recordDialog();
      await expect(dialog).toBeVisible();
      const values = { ...fieldValues(section, runId), [section.titleLabel]: title };
      for (const [label, text] of Object.entries(values)) await dialog.getByRole('textbox', { name: label, exact: true }).fill(text);
      const before = new Set(created[section.table]);
      await saveDialog(dialog, `Add ${section.singular}`);
      const id = await waitFor(() => [...created[section.table]].find((x) => !before.has(x)), `the new ${section.singular}'s id`);
      await closeDialog(dialog);
      return id;
    };
    const openCard = async (section, title) => {
      const stage = await chapter(section.chapter);
      await deckReady(stage, section);
      await card(stage, title).click();
      const dialog = recordDialog();
      await expect(dialog.getByTestId('record-view')).toBeVisible();
      return dialog;
    };
    const deleteFromDialog = async (dialog) => {
      await dialog.getByRole('button', { name: 'Delete' }).click();
      await page.getByRole('alertdialog').getByRole('button', { name: 'Delete' }).click();
      await expect(page.getByTestId('record-dialog')).toHaveCount(0, { timeout: 20_000 });
      live();
    };
    const attempt = async (sectionLabel, name, fn) => {
      try {
        const detail = await fn();
        step(sectionLabel, name, 'pass', typeof detail === 'string' ? detail : '');
        return true;
      } catch (err) {
        if (err instanceof GuardStop) throw err;
        step(sectionLabel, name, 'fail', err.message.split('\n')[0].slice(0, 300));
        if (process.env.WRITE_PROOF_DEBUG) {
          process.stderr.write(`${err.stack}\n`);
          await page.screenshot({ path: path.join(opts.out, `fail-${sectionLabel}-${name}.png`.replace(/[^a-z0-9.-]+/gi, '-')) }).catch(() => {});
        }
        return false;
      }
    };

    await openDashboard();
    step('dashboard', 'open', 'pass', `${width}px wide, reduced motion`);

    // ---- the list sections
    for (const section of SECTIONS.filter((s) => chosen(s.key))) {
      const title = recordTitle(section, runId);
      const edited = editedTitle(section, runId);
      let id = null;
      const ok = await attempt(section.label, 'create', async () => { id = await createRecord(section, title); return `row created through the New card`; });
      if (!ok) { step(section.label, 'edit, upload, delete', 'skipped', 'create failed'); continue; }
      await attempt(section.label, 'survives a reload', async () => {
        await openDashboard();
        const stage = await chapter(section.chapter);
        await deckReady(stage, section);
        await expect(card(stage, title)).toBeVisible();
      });
      const editedOk = await attempt(section.label, 'edit', async () => {
        const dialog = await openCard(section, title);
        await dialog.getByRole('button', { name: 'Edit' }).click();
        await dialog.getByRole('textbox', { name: section.titleLabel, exact: true }).fill(edited);
        await saveDialog(dialog);
        await closeDialog(dialog);
        await openDashboard();
        const stage = await chapter(section.chapter);
        await deckReady(stage, section);
        await expect(card(stage, edited)).toBeVisible();
        await expect(card(stage, title)).toHaveCount(0);
        const row = await port.getRow(section.table, id);
        if (row?.[section.titleKey] !== edited) throw new Error('the stored title is not the edited one');
        return 'stored and shown after a reload';
      });
      const current = editedOk ? edited : title;
      let stored = [];
      if (section.upload) {
        await attempt(section.label, `upload (${section.upload.label})`, async () => {
          const dialog = await openCard(section, current);
          await dialog.getByRole('button', { name: 'Edit' }).click();
          await dialog.locator(`[data-field="${section.upload.column}"] input[type="file"]`).setInputFiles({ name: `test-4-4-${runId}.png`, mimeType: 'image/png', buffer: TINY_PNG });
          const row = await waitFor(async () => { const r = await port.getRow(section.table, id); return storagePaths(r, section.upload.column, section.upload.bucket).length ? r : null; }, 'the uploaded file in the row');
          stored = storagePaths(row, section.upload.column, section.upload.bucket);
          for (const p of stored) if (!(await port.storageHas(section.upload.bucket, p))) throw new Error(`${p} is not in ${section.upload.bucket}`);
          const shown = await dialog.locator(`[data-field="${section.upload.column}"]`).locator(`img[src*="${stored[0].split('/').pop()}"], a[href*="${stored[0].split('/').pop()}"]`).count();
          if (!shown) throw new Error('the uploaded file is not shown in the form');
          await closeDialog(dialog);
          return `${section.upload.bucket}/${stored[0]}`;
        });
      }
      await attempt(section.label, 'delete', async () => {
        const dialog = await openCard(section, current);
        await deleteFromDialog(dialog);
        await openDashboard();
        const stage = await chapter(section.chapter);
        await deckReady(stage, section);
        await expect(card(stage, current)).toHaveCount(0);
        if (await port.getRow(section.table, id)) throw new Error('the row is still in the table');
        for (const p of stored) if (await port.storageHas(section.upload.bucket, p)) throw new Error(`${p} is still in ${section.upload.bucket}`);
        created[section.table].delete(id);
        return stored.length ? 'row and file gone' : 'row gone';
      });
    }

    // ---- the drag decks: swap two TEST cards and back, then prove no other row moved
    for (const section of SECTIONS.filter((s) => s.reorder && chosen(s.key))) {
      const { orderKey, direction } = section.reorder;
      const label = `${section.label} order`;
      const snapshotOf = async () => (await port.allRows(section.table, `id,${orderKey},${section.titleKey}`))
        .filter((r) => !isTestTitle(r[section.titleKey]))
        .map((r) => ({ id: String(r.id), value: r[orderKey] ?? null, title: r[section.titleKey] }));
      const before = await snapshotOf();
      snapshots.set(section.table, { before, snapshotOf, section });
      const ids = [];
      try {
        const titles = [`${recordTitle(section, runId)} A`, `${recordTitle(section, runId)} B`];
        for (const t of titles) ids.push(await createRecord(section, t));
        step(label, 'two TEST cards', 'pass', 'created');
        await openDashboard();
        const stage = await chapter(section.chapter);
        await deckReady(stage, section);
        const deckOrder = async () => stage.locator('.deck article.card .card__open').evaluateAll((nodes) => nodes.map((n) => n.getAttribute('aria-label').replace(/^Open /, '')));
        const order = await deckOrder();
        const byTitle = new Map();
        for (const r of [...before, ...titles.map((t, i) => ({ id: ids[i], value: null, title: t }))]) byTitle.set(r.title, byTitle.has(r.title) ? null : r);
        const ordered = order.map((t) => byTitle.get(t));
        const posA = order.indexOf(titles[0]), posB = order.indexOf(titles[1]);
        if (ordered.some((r) => !r)) {
          step(label, 'swap and swap back', 'skipped', 'two cards share a title, so the deck order cannot be matched to rows');
        } else if (Math.abs(posA - posB) !== 1) {
          step(label, 'swap and swap back', 'skipped', `the TEST cards are not next to each other (positions ${posA} and ${posB})`);
        } else {
          const current = await Promise.all(ordered.map(async (r) => ({ ...r, value: r.value ?? (await port.getRow(section.table, r.id))?.[orderKey] ?? null })));
          const impact = orderRewriteImpact(current, direction, new Set(ids));
          if (impact.length) {
            step(label, 'swap and swap back', 'skipped', `a drag would renumber ${impact.length} live row(s): today's values are not consecutive`);
            report.order.push({ table: section.table, status: 'skipped', detail: 'drag not run, values not consecutive', diffs: impact });
          } else {
            guard.reorder = { table: section.table, orderKey };
            const valueOf = async (id) => (await port.getRow(section.table, id))?.[orderKey] ?? null;
            const idOf = (title) => ids[titles.indexOf(title)];
            const [first, second] = posA < posB ? titles : [titles[1], titles[0]];
            const original = { [first]: await valueOf(idOf(first)), [second]: await valueOf(idOf(second)) };
            // A mouse drag past the sensor's 6 px threshold, then onto the
            // other card; the stored values, not a toast, prove the write.
            const drag = async (deck, from, to) => {
              await card(deck, from).scrollIntoViewIfNeeded();
              const a = await card(deck, from).boundingBox(), b = await card(deck, to).boundingBox();
              await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
              await page.mouse.down();
              await page.mouse.move(a.x + a.width / 2 + 12, a.y + a.height / 2, { steps: 4 });
              await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 16 });
              await page.mouse.move(b.x + b.width / 2 + 2, b.y + b.height / 2, { steps: 2 });
              await page.mouse.up();
              if (await page.getByTestId('record-dialog').count()) await closeDialog(recordDialog());
            };
            await drag(stage, first, second);
            await waitFor(async () => (await valueOf(idOf(first))) === original[second] && (await valueOf(idOf(second))) === original[first], 'the swapped order to be stored');
            const valueA = await valueOf(idOf(first)), valueB = await valueOf(idOf(second));
            await openDashboard();
            const stage2 = await chapter(section.chapter);
            await deckReady(stage2, section);
            const reloaded = await stage2.locator('.deck article.card .card__open').evaluateAll((nodes) => nodes.map((n) => n.getAttribute('aria-label').replace(/^Open /, '')));
            if (reloaded.indexOf(first) !== reloaded.indexOf(second) + 1) throw new Error('the swap did not survive a reload');
            await drag(stage2, second, first);
            await waitFor(async () => (await valueOf(idOf(first))) === original[first] && (await valueOf(idOf(second))) === original[second], 'the original order to be stored again');
            guard.reorder = null;
            step(label, 'swap and swap back', 'pass', `stored ${orderKey} ${valueA} and ${valueB} after the swap, back after the second drag`);
          }
        }
      } catch (err) {
        guard.reorder = null;
        if (err instanceof GuardStop) throw err;
        step(label, 'swap and swap back', 'fail', err.message.split('\n')[0].slice(0, 300));
        if (process.env.WRITE_PROOF_DEBUG) process.stderr.write(`${err.stack}\n`);
      }
      guard.reorder = null;
      // the two TEST cards go through the UI too; the cleanup catches them if this fails
      for (const id of ids) {
        try {
          await openDashboard();
          const row = await port.getRow(section.table, id);
          if (!row) continue;
          const dialog = await openCard(section, row[section.titleKey]);
          await deleteFromDialog(dialog);
          created[section.table].delete(id);
        } catch (err) {
          if (err instanceof GuardStop) throw err;
          step(label, 'delete TEST cards', 'fail', err.message.split('\n')[0]);
        }
      }
      const diffs = compareOrderSnapshots(before, await snapshotOf());
      report.order.push({ table: section.table, status: diffs.length ? 'fail' : 'pass', detail: diffs.length ? `${diffs.length} live row(s) changed` : `${before.length} live rows unchanged`, diffs });
      snapshots.delete(section.table);
    }

    // ---- the inbox
    if (chosen('inbox')) {
      const name = `${TEST_PREFIX} ${runId}`;
      let messageId = null;
      const inserted = await attempt('Inbox', 'anonymous insert (no e-mail)', async () => {
        await port.insertAnon('contact_messages', {
          name, email: 'test@example.com', subject: `${TEST_PREFIX} write proof ${runId}`, message: `A test message from the Unit 4.4 write proof, run ${runId}.`,
          inquiry_type: 'general-inquiry', role_position: 'other', priority: 'normal', status: 'unread', attachment_urls: [], attachment_names: [],
        });
        const rows = await port.findTestRows('contact_messages', 'name');
        messageId = rows.find((r) => r.name === name)?.id ?? null;
        if (!messageId) throw new Error('the message was not found after the insert');
        created.contact_messages.add(String(messageId));
        return 'stored with the public key only';
      });
      if (inserted) {
        const read = async (key, want) => waitFor(async () => (await port.getRow('contact_messages', messageId))?.[key] === want, `${key} to be ${want}`);
        await attempt('Inbox', 'open marks it read, star, archive', async () => {
          await openDashboard();
          const stage = await chapter('inbox');
          const open = stage.getByRole('button', { name: new RegExp(`^Open the message from ${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`) });
          await expect(open).toBeVisible({ timeout: 20_000 });
          await open.click();
          const dialog = page.getByTestId('inbox-dialog');
          await expect(dialog).toBeVisible();
          await read('status', 'read');
          await dialog.getByRole('button', { name: 'Star', exact: true }).click();
          await read('is_starred', true);
          await dialog.getByRole('button', { name: 'Archive', exact: true }).click();
          await read('is_archived', true);
          return 'each change stored';
        });
        await attempt('Inbox', 'delete', async () => {
          let dialog = page.getByTestId('inbox-dialog');
          if (!(await dialog.isVisible().catch(() => false))) {
            await openDashboard();
            const stage = await chapter('inbox');
            await stage.getByRole('button', { name: 'Archived', exact: true }).click();
            await stage.getByRole('button', { name: new RegExp(`^Open the message from ${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`) }).click();
            dialog = page.getByTestId('inbox-dialog');
          }
          await dialog.getByRole('button', { name: 'Delete' }).click();
          await page.getByRole('alertdialog').getByRole('button', { name: 'Delete' }).click();
          await waitFor(async () => !(await port.getRow('contact_messages', messageId)), 'the message to be deleted');
          created.contact_messages.delete(String(messageId));
          return 'row gone';
        });
      }
    }

    // ---- the singletons, only when asked
    for (const single of SINGLETONS.filter((s) => chosen(s.key))) {
      if (!opts.singletons) { step(single.label, 'save round trip', 'skipped', 'not run (live content); pass --singletons'); continue; }
      await attempt(single.label, 'save round trip', async () => {
        const rows = await port.allRows(single.table, '*');
        const row = [...rows].sort((a, b) => Number(Boolean(b.is_active)) - Number(Boolean(a.is_active)) || String(b.updated_at ?? '').localeCompare(String(a.updated_at ?? '')))[0];
        if (!row) throw new Error('no row to edit');
        const original = row[single.column];
        guard.singleton = { table: single.table, id: String(row.id) };
        try {
          // One save through the UI: open the panel's editor, type, save, wait for the stored row to change.
          const saveValue = async (value) => {
            const stamp = (await port.getRow(single.table, row.id))?.updated_at;
            await openDashboard();
            const stage = await chapter(single.chapter);
            await stage.locator('[data-action="edit"]').first().click();
            const dialog = recordDialog();
            const box = dialog.getByRole('textbox', { name: single.fieldLabel, exact: true });
            await box.fill(value);
            await expect(box, 'the typed value is still in the field when Save is pressed').toHaveValue(value);
            await dialog.getByRole('button', { name: 'Save', exact: true }).click();
            await waitFor(async () => (await port.getRow(single.table, row.id))?.updated_at !== stamp, 'the save to land');
            if (await page.getByTestId('record-dialog').count()) await closeDialog(recordDialog());
          };
          // a visible marker (a trailing space would be trimmed and never make the form dirty)
          const marked = `${original} (${TEST_PREFIX})`;
          await saveValue(marked);
          if ((await port.getRow(single.table, row.id))?.[single.column] !== marked) throw new Error('the changed value was not stored');
          await saveValue(original);
          const after = await port.getRow(single.table, row.id);
          const changed = rowDiff(row, after);
          if (changed.length) throw new Error(`the row differs after the round trip in ${changed.join(', ')}`);
          return 'changed and restored through the UI, row identical apart from updated_at';
        } finally {
          guard.singleton = null;
          // A full form save rewrites every column, so any column that differs from the
          // snapshot (the marker, or a value the form normalised on the way back) is put
          // back directly: live content always ends exactly as it started.
          const now = await port.getRow(single.table, row.id).catch(() => null);
          const drifted = now ? rowDiff(row, now) : [];
          if (drifted.length) {
            await port.restoreColumn(single.table, row.id, Object.fromEntries(drifted.map((key) => [key, row[key]])));
            const back = await port.getRow(single.table, row.id).catch(() => null);
            const still = back ? rowDiff(row, back) : drifted;
            step(single.label, 'restored directly', 'fail', `${drifted.join(', ')} put back outside the UI${still.length ? `; STILL DIFFERENT: ${still.join(', ')}` : ''}`);
          }
        }
      });
    }

    exitCode = 0;
  } catch (err) {
    if (err instanceof GuardStop || guard.stopped) {
      step('guard', 'stopped the run', 'fail', guard.stopped ?? err.message);
      exitCode = 3;
      await context?.close().catch(() => {});
      context = null;
    } else {
      step('run', 'aborted', 'fail', err.message.split('\n')[0].slice(0, 300));
      exitCode = 1;
    }
  } finally {
    // ---- cleanup: every TEST- 4.4 row and every file this run uploaded
    if (context && opts.live) {
      try {
        const fresh = await context.storageState();
        const token = fresh.origins.flatMap((o) => o.localStorage ?? []).find((i) => i.name === sessionKey)?.value;
        const accessToken = token ? JSON.parse(token).access_token : null;
        if (accessToken) auth.bearer = accessToken;
        const merged = mergeSessionBack(savedState, fresh, sessionKey);
        if (merged !== savedState) await writeFile(STATE_FILE, JSON.stringify(merged, null, 2));
      } catch { /* keep the old state */ }
    }
    if (port) {
      const problems = [];
      let removedRows = 0, removedFiles = 0;
      for (const { table, titleKey } of CLEANUP_TABLES) {
        try {
          for (const row of await port.findTestRows(table, titleKey)) {
            for (const bucket of BUCKETS) {
              const paths = Object.values(row).flatMap((v) => (Array.isArray(v) ? v : [v])).map((v) => storagePath(typeof v === 'string' && v.includes('/storage/v1/object/') ? v : null, bucket)).filter(Boolean);
              if (paths.length) { await port.storageRemove(bucket, paths).catch((e) => problems.push(e.message)); removedFiles += paths.length; }
            }
            await port.deleteRow(table, row.id);
            removedRows += 1;
          }
          const left = await port.findTestRows(table, titleKey);
          if (left.length) problems.push(`${left.length} TEST- 4.4 row(s) left in ${table}`);
        } catch (e) { problems.push(`${table}: ${e.message}`); }
      }
      for (const { bucket, path: p } of uploaded) {
        try {
          if (await port.storageHas(bucket, p)) { await port.storageRemove(bucket, [p]); removedFiles += 1; }
          if (await port.storageHas(bucket, p)) problems.push(`${bucket}/${p} is still stored`);
        } catch (e) { problems.push(`${bucket}/${p}: ${e.message}`); }
      }
      for (const [table, { before, snapshotOf }] of snapshots) {
        try {
          const diffs = compareOrderSnapshots(before, await snapshotOf());
          report.order.push({ table, status: diffs.length ? 'fail' : 'pass', detail: `checked after cleanup: ${diffs.length ? `${diffs.length} live row(s) changed` : 'live rows unchanged'}`, diffs });
        } catch (e) { problems.push(`order check ${table}: ${e.message}`); }
      }
      report.cleanup = problems.length
        ? { status: 'fail', detail: problems.join('; ') }
        : { status: 'pass', detail: `${removedRows} leftover row(s) and ${removedFiles} file(s) removed; ${uploaded.length} upload(s) checked; none left` };
    }
    await context?.close().catch(() => {});
    await browser?.close().catch(() => {});
    server?.stop();
    report.finishedAt = new Date().toISOString();
    report.passed = exitCode === 0 && reportPasses(report);
    if (exitCode === 0 && !report.passed) exitCode = 1;
    await mkdir(opts.out, { recursive: true });
    await writeFile(path.join(opts.out, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
    await writeFile(path.join(opts.out, 'report.md'), renderReport(report));
    process.stdout.write(`\n${report.passed ? 'PASS' : 'FAIL'}: report in ${path.join(opts.out, 'report.md')}\n`);
  }
  return exitCode;
}

process.exitCode = await main(process.argv.slice(2));
