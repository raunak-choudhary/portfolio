// scripts/lib/admin-mocks.mjs
//
// Network isolation for browser runs that need a signed-in admin (the frame
// measurement, visual checks). Every request a page makes is answered here:
//
//   - the app itself is served from a build folder through a route on a
//     made-up localhost origin (nothing listens on that port);
//   - Supabase gets a fake second-factor session, the recorded e2e fixtures
//     for table reads, empty answers for admin-only tables and refusals for
//     any write; nothing reaches the real project;
//   - realtime websockets get the e2e mock;
//   - every other host is aborted and listed, so a new external request
//     shows up in the run's output instead of leaving the laptop.
//
// The table-read answers reuse e2e/support/supabase-fixtures.mjs so the
// browser suite and these runs agree on what PostgREST looks like.

import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { buildRestResponse, loadFixture, realtimeReplyFor } from '../../e2e/support/supabase-fixtures.mjs';

/** The Supabase host the app is built against (public by design; the key is a placeholder in these runs). */
export const SUPABASE_HOST = 'emaaaeooafqawdvdreaz.supabase.co';
/** The storage key supabase-js keeps the session under for that project. */
export const SESSION_STORAGE_KEY = 'sb-emaaaeooafqawdvdreaz-auth-token';

const PLACEHOLDER_PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');
const CONTENT_TYPES = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.m4a': 'audio/mp4', '.ico': 'image/x-icon', '.txt': 'text/plain', '.md': 'text/plain' };

const b64url = (value) => Buffer.from(typeof value === 'string' ? value : JSON.stringify(value)).toString('base64url');

/**
 * A session object shaped like supabase-js's stored session, for a fake admin
 * who passed the second factor (aal2). The token has the JWT layout the
 * client decodes, assembled at run time with a placeholder signature: no real
 * server would accept it, and every request it rides on is answered locally.
 * @param {number} nowSeconds unix time.
 */
export function buildFakeAdminSession(nowSeconds) {
  const user = {
    id: '00000000-0000-4000-8000-0000000000aa', aud: 'authenticated', role: 'authenticated', email: 'admin@example.com',
    app_metadata: { provider: 'email' }, user_metadata: {}, created_at: '2026-01-01T00:00:00Z',
    factors: [{ id: '00000000-0000-4000-8000-0000000000fa', friendly_name: 'Phone', factor_type: 'totp', status: 'verified', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' }],
  };
  const claims = {
    sub: user.id, email: user.email, role: 'authenticated', aud: 'authenticated', aal: 'aal2',
    amr: [{ method: 'totp', timestamp: nowSeconds }, { method: 'otp', timestamp: nowSeconds - 60 }],
    session_id: '00000000-0000-4000-8000-000000000055', exp: nowSeconds + 7200, iat: nowSeconds,
  };
  const token = [b64url({ alg: 'HS256', typ: 'JWT' }), b64url(claims), b64url('placeholder-signature')].join('.');
  return { access_token: token, refresh_token: 'placeholder', token_type: 'bearer', expires_in: 7200, expires_at: nowSeconds + 7200, user };
}

/**
 * Rows for a table read: the recorded fixture when there is one, the fake
 * admin row for admin_users, otherwise an empty list (admin-only tables such
 * as contact_messages and analytics_events have no fixtures on purpose).
 */
export function rowsForTable(table, session) {
  if (table === 'admin_users') return [{ id: 1, email: session.user.email, is_active: true }];
  try {
    const rows = loadFixture(table);
    return Array.isArray(rows) ? rows : [rows];
  } catch {
    return [];
  }
}

/**
 * The local answer to one Supabase request.
 * @param {{method: string, pathname: string, accept?: string, prefer?: string}} request
 * @param {object} session from buildFakeAdminSession.
 * @returns {{status: number, headers?: Record<string,string>, body?: string|Buffer, contentType?: string, write?: boolean}}
 *   `write` marks a refused write, so a run can report that one was attempted.
 */
export function supabaseReply({ method, pathname, accept = '', prefer = '' }, session) {
  const cors = { 'access-control-allow-origin': '*', 'access-control-expose-headers': 'content-range' };
  const json = (status, body) => ({ status, headers: cors, contentType: 'application/json', body: body === undefined ? '' : JSON.stringify(body) });
  if (method === 'OPTIONS') return { status: 204, headers: { ...cors, 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } };
  if (pathname === '/auth/v1/user') return json(200, session.user);
  if (pathname === '/auth/v1/logout') return { status: 204, headers: cors };
  if (pathname.startsWith('/auth/v1/token')) return json(200, session);
  if (pathname.startsWith('/auth/v1/')) return json(200, {});
  if (pathname.startsWith('/storage/v1/object/public/')) return { status: 200, headers: cors, contentType: 'image/png', body: PLACEHOLDER_PNG };
  if (pathname.startsWith('/storage/v1/object/list') || pathname.startsWith('/storage/v1/bucket')) return json(200, []);
  if (pathname.startsWith('/storage/v1/')) return { ...json(403, { message: 'refused in a local run' }), write: method !== 'GET' };
  if (pathname.startsWith('/functions/v1/')) return json(200, {});
  if (pathname.startsWith('/rest/v1/rpc/')) return json(200, null);
  if (pathname.startsWith('/rest/v1/')) {
    if (method !== 'GET' && method !== 'HEAD') return { ...json(403, { message: 'refused in a local run' }), write: true };
    const table = pathname.slice('/rest/v1/'.length);
    const reply = buildRestResponse(rowsForTable(table, session), { method, accept, prefer: prefer || 'count=exact' });
    return { status: reply.status, headers: { ...cors, ...reply.headers }, body: reply.body };
  }
  return json(404, { message: 'not mocked' });
}

/** The build file for a request path, falling back to index.html for app routes; null when it would escape the folder. */
export function buildFileFor(buildDir, pathname) {
  const root = path.resolve(buildDir);
  const candidate = path.resolve(root, `.${decodeURIComponent(pathname)}`);
  if (candidate !== root && !candidate.startsWith(root + path.sep)) return null;
  if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  return path.join(root, 'index.html');
}

/**
 * Install the routes on a Playwright browser context.
 * @param {import('@playwright/test').BrowserContext} context
 * @param {{buildDir: string, origin: string, session: object}} options
 * @returns {Promise<{supabase: string[], writes: string[], aborted: string[]}>} what the page asked for, filled as it runs.
 */
export async function installAdminRoutes(context, { buildDir, origin, session }) {
  const log = { supabase: [], writes: [], aborted: [] };
  await context.route('**/*', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin === origin) {
      const file = buildFileFor(buildDir, url.pathname);
      if (!file) return route.fulfill({ status: 404, body: '' });
      return route.fulfill({ status: 200, contentType: CONTENT_TYPES[path.extname(file)] || 'application/octet-stream', body: readFileSync(file) });
    }
    if (url.host === SUPABASE_HOST) {
      const headers = request.headers();
      const reply = supabaseReply({ method: request.method(), pathname: url.pathname, accept: headers.accept, prefer: headers.prefer }, session);
      log.supabase.push(`${request.method()} ${url.pathname}`);
      if (reply.write) log.writes.push(`${request.method()} ${url.pathname}`);
      return route.fulfill({ status: reply.status, headers: reply.headers, contentType: reply.contentType, body: reply.body ?? '' });
    }
    log.aborted.push(`${request.method()} ${url.origin}${url.pathname.slice(0, 80)}`);
    return route.abort();
  });
  await context.routeWebSocket(/.*/, (socket) => {
    socket.onMessage((message) => {
      let frame;
      try { frame = JSON.parse(String(message)); } catch { return; }
      const reply = realtimeReplyFor(frame);
      if (reply) socket.send(JSON.stringify(reply));
    });
  });
  return log;
}
