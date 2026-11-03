// e2e/support/supabase-fixtures.mjs
//
// Answers every Supabase request a page makes from recorded fixtures, so the
// browser suite never reads or writes the live database.
//
//   /rest/v1/<public table>   -> e2e/fixtures/<table>.json (array or single object)
//   /storage/v1/object/public -> a 1x1 placeholder image
//   /realtime/v1/websocket    -> a mock that acknowledges joins and heartbeats
//   anything else on /rest, /auth, /functions -> recorded as unexpected and
//                                                answered with 500
//
// Tests assert that `unexpected` stays empty. That turns any new table read,
// any analytics write, any auth call or any Edge Function call on a public
// page into a visible failure instead of a silent hit on production.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { PUBLIC_TABLES } from './site-map.mjs';

const FIXTURE_DIR = path.resolve('e2e/fixtures');

/** Smallest valid transparent PNG, used for every storage image. */
const PLACEHOLDER_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64',
);

/** PostgREST's media type for single-row responses (supabase-js `.single()`). */
const SINGLE_OBJECT_MEDIA_TYPE = 'application/vnd.pgrst.object+json';

const fixtureCache = new Map();

/** Loads and caches the fixture rows for one table. */
export function loadFixture(table) {
  if (!fixtureCache.has(table)) {
    const file = path.join(FIXTURE_DIR, `${table}.json`);
    fixtureCache.set(table, JSON.parse(readFileSync(file, 'utf8')));
  }
  return fixtureCache.get(table);
}

/**
 * Extracts the table name from a PostgREST URL, or null if the path is not a
 * plain table read (RPC calls and unknown shapes return null).
 */
export function tableFromRestUrl(url) {
  const match = /^\/rest\/v1\/([a-z_]+)$/.exec(new URL(url).pathname);
  if (!match || match[1] === 'rpc') return null;
  return match[1];
}

/**
 * Builds the PostgREST response for a fixture read.
 *
 * @param {object[]} rows fixture rows for the table.
 * @param {{ method: string, accept: string, prefer: string }} request request properties.
 * @returns {{ status: number, headers: Record<string,string>, body: string }}
 */
export function buildRestResponse(rows, { method, accept = '', prefer = '' }) {
  const headers = { 'content-type': 'application/json; charset=utf-8' };
  if (/count=(exact|planned|estimated)/.test(prefer)) {
    headers['content-range'] = rows.length ? `0-${rows.length - 1}/${rows.length}` : `*/0`;
  }

  if (method === 'HEAD') {
    return { status: 200, headers, body: '' };
  }

  if (accept.includes(SINGLE_OBJECT_MEDIA_TYPE)) {
    if (rows.length !== 1) {
      // Mirrors PostgREST's behaviour for `.single()` with zero or many rows.
      return {
        status: 406,
        headers,
        body: JSON.stringify({ code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' }),
      };
    }
    return { status: 200, headers, body: JSON.stringify(rows[0]) };
  }

  return { status: 200, headers, body: JSON.stringify(rows) };
}

/**
 * Builds the realtime server's reply to one client frame (protocol 2.0.0,
 * frames are `[joinRef, ref, topic, event, payload]`). Returns null when the
 * frame needs no reply.
 */
export function realtimeReplyFor(frame) {
  if (!Array.isArray(frame)) return null;
  const [joinRef, ref, topic, event, payload] = frame;
  if (ref === null || ref === undefined) return null;

  let response = {};
  if (event === 'phx_join') {
    // The client verifies the server echoes its postgres_changes bindings in
    // order, each with an id; a mismatch puts the channel in error.
    const bindings = payload?.config?.postgres_changes ?? [];
    response = { postgres_changes: bindings.map((binding, index) => ({ ...binding, id: index + 1 })) };
  }
  return [joinRef, ref, topic, 'phx_reply', { status: 'ok', response }];
}

/**
 * Installs fixture routing on a Playwright browser context.
 *
 * @param {import('@playwright/test').BrowserContext} context
 * @returns {Promise<{ unexpected: string[] }>} requests that were not allowed.
 */
export async function installSupabaseFixtures(context) {
  const unexpected = [];
  const publicTables = new Set(PUBLIC_TABLES);

  await context.route(/\/rest\/v1\//, async (route) => {
    const request = route.request();
    const table = tableFromRestUrl(request.url());

    if (request.method() === 'OPTIONS') {
      await route.fulfill({ status: 204 });
      return;
    }

    if (!table || !publicTables.has(table) || !['GET', 'HEAD'].includes(request.method())) {
      unexpected.push(`${request.method()} ${request.url()}`);
      await route.fulfill({ status: 500, contentType: 'application/json', body: '{"message":"unexpected request in fixture mode"}' });
      return;
    }

    const headers = request.headers();
    const response = buildRestResponse(loadFixture(table), {
      method: request.method(),
      accept: headers.accept,
      prefer: headers.prefer,
    });
    await route.fulfill(response);
  });

  await context.route(/\/(auth|functions)\/v1\//, async (route) => {
    const request = route.request();
    if (request.method() !== 'OPTIONS') unexpected.push(`${request.method()} ${request.url()}`);
    await route.fulfill({ status: request.method() === 'OPTIONS' ? 204 : 500, body: '' });
  });

  await context.route(/\/storage\/v1\/object\/public\//, (route) =>
    route.fulfill({ status: 200, contentType: 'image/png', body: PLACEHOLDER_PNG }),
  );

  // Third-party images (skill icons) and web fonts: answered locally so CI
  // runs are deterministic and never depend on another site being up.
  await context.route(/^https:\/\/cdn\.jsdelivr\.net\//, (route) =>
    route.fulfill({ status: 200, contentType: 'image/png', body: PLACEHOLDER_PNG }),
  );
  await context.route(/^https:\/\/fonts\.(googleapis|gstatic)\.com\//, (route) =>
    route.fulfill({ status: 200, contentType: 'text/css', body: '' }),
  );

  await context.routeWebSocket(/\/realtime\/v1\/websocket/, (socket) => {
    socket.onMessage((message) => {
      let frame;
      try {
        frame = JSON.parse(typeof message === 'string' ? message : message.toString());
      } catch {
        return;
      }
      const reply = realtimeReplyFor(frame);
      if (reply) socket.send(JSON.stringify(reply));
    });
  });

  return { unexpected };
}
