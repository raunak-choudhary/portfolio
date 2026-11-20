// e2e/support/admin-fixtures.mjs
//
// The offline network layer for the admin browser tests. Every request the
// page makes to anything other than the local build server is intercepted
// here; none may reach the real Supabase project.
//
//   local build (localhost:4173)          -> served by the static server
//   Supabase /rest/v1/<table>             -> e2e/fixtures/admin/tables/<table>.json
//   Supabase /rest/v1/rpc/<fn>            -> e2e/fixtures/admin/rpc/<fn>.json
//   Supabase /functions/v1/<fn>           -> e2e/fixtures/admin/functions/<fn>.json
//   Supabase /auth/v1/user                -> the fake user (fake-session.mjs)
//   Supabase /storage/v1/object/public    -> a 1x1 placeholder image
//   Supabase /realtime/v1/websocket       -> a mock that acknowledges joins
//   fonts, jsdelivr icons, NASA Sun image -> local stand-ins
//   anything else                         -> recorded in `unexpected`, aborted
//
// Table reads are recorded in `reads`, and both reads and writes carry one
// shared sequence number, so a test can prove a screen re-read a table after
// a write. Writes (POST, PATCH, DELETE on a fixture table) are applied to an in-memory
// copy of the table, answered like PostgREST, and recorded in `writes` so a
// test can assert exactly which writes a screen sent; RPC and Edge Function
// calls are answered from their fixture and recorded in `calls`. Each context gets its
// own copy, so tests never see each other's writes.
//
// `escaped()` lists every non-local request the browser made that no
// intercept handled. It must stay empty; a test asserts it.

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { applyWrite, readResponse, writeResponse } from './postgrest-lite.mjs';
import { buildFakeSession, buildFakeUser, storageKeyFor } from './fake-session.mjs';

const FIXTURE_DIR = path.resolve('e2e/fixtures/admin');
const BUILD_JS_DIR = path.resolve('build/static/js');
const LOCAL_ORIGIN = 'http://localhost:4173';

/** Smallest valid transparent PNG, used for every image. */
const PLACEHOLDER_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64',
);

const SUPABASE_URL_PATTERN = /https:\/\/[a-z0-9]{10,40}\.supabase\.co/;

/**
 * Finds the Supabase project URL the build was made with, by reading the
 * built main bundle. The value is used only to route requests and to name
 * the session storage key; it is never logged.
 */
export function discoverSupabaseUrl(jsDir = BUILD_JS_DIR) {
  const mains = readdirSync(jsDir).filter((file) => /^main\..*\.js$/.test(file));
  for (const file of mains) {
    const match = SUPABASE_URL_PATTERN.exec(readFileSync(path.join(jsDir, file), 'utf8'));
    if (match) return match[0];
  }
  throw new Error('No Supabase URL found in build/static/js/main.*.js; run npm run build:e2e first.');
}

/** The placeholder fixtures use for the project's public storage URL. */
export const STORAGE_PLACEHOLDER = '{{storage}}';

/**
 * Replaces the storage placeholder in fixture text with the public storage
 * URL of the project the build talks to, so fixture images load through the
 * intercept (and pass the CSP) without the project host in the repo. Pure.
 */
export const expandFixtureText = (text, supabaseOrigin) =>
  text.split(STORAGE_PLACEHOLDER).join(`${supabaseOrigin}/storage/v1/object/public`);

/** Reads one fixture file, or undefined when it does not exist. */
function readFixture(kind, name, supabaseOrigin) {
  const file = path.join(FIXTURE_DIR, kind, `${name}.json`);
  return existsSync(file) ? JSON.parse(expandFixtureText(readFileSync(file, 'utf8'), supabaseOrigin)) : undefined;
}

/**
 * Classifies a request URL for the router. Pure; exported for tests.
 * @returns {'local'|'supabase'|'font'|'image'|'other'}
 */
export function classifyUrl(url, supabaseOrigin) {
  const { origin, hostname } = new URL(url);
  if (origin === LOCAL_ORIGIN) return 'local';
  if (origin === supabaseOrigin) return 'supabase';
  if (/^fonts\.(googleapis|gstatic)\.com$/.test(hostname)) return 'font';
  // example.test is a reserved name: fixture image and file links point there.
  if (hostname === 'cdn.jsdelivr.net' || hostname === 'sdo.gsfc.nasa.gov' || hostname === 'example.test' || hostname.endsWith('.example.test')) return 'image';
  return 'other';
}

/**
 * Installs the offline layer on a browser context, and seeds the fake
 * session before any page script runs.
 *
 * @param {import('@playwright/test').BrowserContext} context
 * @param {{ session?: 'none'|'aal1'|'aal2', tables?: Record<string, object[]> }} options
 */
export async function installAdminFixtures(context, { session = 'aal2', tables: overrides = {} } = {}) {
  const supabaseUrl = discoverSupabaseUrl();
  const supabaseOrigin = new URL(supabaseUrl).origin;
  const unexpected = [];
  const writes = [];
  const reads = [];
  const calls = [];
  let seq = 0;
  const seen = [];
  const handled = new Set();
  const tables = new Map();

  const tableRows = (name) => {
    if (!tables.has(name)) {
      const rows = overrides[name] ?? readFixture('tables', name, supabaseOrigin);
      tables.set(name, rows === undefined ? undefined : structuredClone(rows));
    }
    return tables.get(name);
  };

  if (session !== 'none') {
    const stored = buildFakeSession({ aal: session });
    await context.addInitScript(([key, value]) => {
      try { window.localStorage.setItem(key, value); } catch { /* storage blocked */ }
    }, [storageKeyFor(supabaseUrl), JSON.stringify(stored)]);
  }

  context.on('request', (request) => {
    const url = request.url();
    if (/^https?:/.test(url) && classifyUrl(url, supabaseOrigin) !== 'local') seen.push(request);
  });

  const fail = async (route, note) => {
    const request = route.request();
    unexpected.push(`${request.method()} ${new URL(request.url()).pathname}${note ? ` (${note})` : ''}`);
    await route.fulfill({ status: 500, contentType: 'application/json', body: '{"message":"unexpected request in admin fixture mode"}' });
  };

  const json = (route, status, body, headers = {}) =>
    route.fulfill({ status, headers: { 'content-type': 'application/json; charset=utf-8', ...headers }, body: body === '' ? '' : JSON.stringify(body) });

  async function handleSupabase(route) {
    const request = route.request();
    const method = request.method();
    const url = request.url();
    const { pathname } = new URL(url);
    const headers = request.headers();

    if (method === 'OPTIONS') return route.fulfill({ status: 204 });

    if (pathname.startsWith('/auth/v1/')) {
      if (pathname === '/auth/v1/user' && method === 'GET') {
        return session === 'none' ? json(route, 401, { code: 401, msg: 'no session' }) : json(route, 200, buildFakeUser());
      }
      if (pathname === '/auth/v1/logout') return route.fulfill({ status: 204 });
      return fail(route);
    }

    if (pathname.startsWith('/functions/v1/')) {
      const name = pathname.slice('/functions/v1/'.length);
      const fixture = readFixture('functions', name, supabaseOrigin);
      if (fixture === undefined) return fail(route);
      calls.push({ kind: 'function', name, body: safeJson(request) });
      return json(route, 200, fixture);
    }

    if (pathname.startsWith('/storage/v1/object/public/')) {
      return route.fulfill({ status: 200, contentType: 'image/png', body: PLACEHOLDER_PNG });
    }

    // Listing a bucket is a read (the media chapter and the media snapshot): every bucket is empty offline.
    if (/^\/storage\/v1\/object\/list\/[a-z0-9_-]+$/.test(pathname) && method === 'POST') {
      return json(route, 200, []);
    }

    const rpc = /^\/rest\/v1\/rpc\/([a-z0-9_]+)$/.exec(pathname);
    if (rpc) {
      const fixture = readFixture('rpc', rpc[1], supabaseOrigin);
      if (fixture === undefined) return fail(route);
      calls.push({ kind: 'rpc', name: rpc[1], body: safeJson(request) });
      return json(route, 200, fixture);
    }

    const rest = /^\/rest\/v1\/([a-z0-9_]+)$/.exec(pathname);
    if (rest) {
      const table = rest[1];
      const rows = tableRows(table);
      if (rows === undefined) return fail(route, 'no fixture');
      if (method === 'GET' || method === 'HEAD') {
        reads.push({ seq: seq += 1, table, method, query: new URL(url).search });
        return route.fulfill(readResponse(rows, { method, url, accept: headers.accept, prefer: headers.prefer }));
      }
      if (['POST', 'PATCH', 'DELETE'].includes(method)) {
        const body = safeJson(request);
        writes.push({ seq: seq += 1, table, method, query: new URL(url).search, body });
        const result = applyWrite(rows, { method, url, body });
        tables.set(table, result.rows);
        return route.fulfill(writeResponse(result.touched, { method, accept: headers.accept, prefer: headers.prefer }));
      }
    }

    return fail(route);
  }

  await context.route(() => true, async (route) => {
    const request = route.request();
    const url = request.url();
    const kind = classifyUrl(url, supabaseOrigin);
    if (kind !== 'local') handled.add(request);
    switch (kind) {
      case 'local': return route.continue();
      case 'supabase': return handleSupabase(route);
      case 'font': return route.fulfill({ status: 200, contentType: 'text/css', body: '' });
      case 'image': return route.fulfill({ status: 200, contentType: 'image/png', body: PLACEHOLDER_PNG });
      default:
        unexpected.push(`${request.method()} ${new URL(url).origin} (unknown host)`);
        return route.abort('blockedbyclient');
    }
  });

  await context.routeWebSocket(() => true, (socket) => {
    if (!socket.url().startsWith(supabaseOrigin.replace(/^https/, 'wss'))) {
      unexpected.push(`WS ${new URL(socket.url()).origin} (unknown host)`);
      socket.close();
      return;
    }
    socket.onMessage((message) => {
      let frame;
      try { frame = JSON.parse(String(message)); } catch { return; }
      if (!Array.isArray(frame)) return;
      const [joinRef, ref, topic, event, payload] = frame;
      if (ref === null || ref === undefined) return;
      const response = event === 'phx_join'
        ? { postgres_changes: (payload?.config?.postgres_changes ?? []).map((binding, index) => ({ ...binding, id: index + 1 })) }
        : {};
      socket.send(JSON.stringify([joinRef, ref, topic, 'phx_reply', { status: 'ok', response }]));
    });
  });

  return {
    unexpected,
    /** REST writes (POST, PATCH, DELETE on a table), in order. */
    writes,
    /** REST reads (GET, HEAD on a table), in order; `seq` is shared with `writes` so the two can be ordered. */
    reads,
    /** RPC and Edge Function calls, in order. */
    calls,
    /** Non-local requests no intercept handled: must be empty. */
    escaped: () => seen.filter((request) => !handled.has(request)).map((request) => `${request.method()} ${new URL(request.url()).origin}`),
    /** The current in-memory rows of a table (after any writes). */
    rows: (table) => tableRows(table),
    /** Total non-local requests seen, for the zero-escape assertion's context. */
    seenCount: () => seen.length,
  };
}

function safeJson(request) {
  try { return request.postDataJSON(); } catch { return request.postData(); }
}
