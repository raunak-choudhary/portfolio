// scripts/lib/write-proof.test.mjs
//
// Unit tests for the pure half of the Unit 4.4 write proof. The guard tests
// matter most: in live mode classifyRequest is all that stands between the
// proof and the owner's real rows, so each kind of write that must be stopped
// has a case here, next to the narrow window that lets the proof's own writes
// through.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CLEANUP_TABLES, SECTIONS, TEST_PREFIX, TINY_PNG,
  classifyRequest, compareOrderSnapshots, decodeJwtPayload, editedTitle, fieldValues, idTarget, idTargets, isTestTitle,
  makeRunId, mergeSessionBack, orderRewrite, orderRewriteImpact, recordTitle, remapStorageState, renderReport as reportMarkdown,
  reportPasses, rowDiff, sessionLevel, storagePath, storagePaths,
} from './write-proof.mjs';

const SB = 'https://abcdefghijklmnopqrst.supabase.co';
const BASE = 'http://localhost:4174';
const RUN = 'k3x9a7q2';

const jwt = (payload) => `e30.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.sig`;
const stateWith = (payload, origin = 'http://localhost:3000') => ({
  cookies: [],
  origins: [{ origin, localStorage: [{ name: 'theme', value: 'dark' }, { name: 'sb-abcdefghijklmnopqrst-auth-token', value: JSON.stringify({ access_token: jwt(payload), refresh_token: 'r1' }) }] }],
});

const ctx = (over = {}) => ({
  baseOrigin: BASE,
  supabaseOrigin: SB,
  runId: RUN,
  created: { projects: new Set(['p-1']), internships: new Set(), contact_messages: new Set(['m-1']) },
  titleKeys: { projects: 'title', internships: 'title', skills: 'skill_name' },
  reorder: null,
  singleton: null,
  ...over,
});
const classify = (method, path, postData, over) => classifyRequest({ method, url: /^[a-z]+:/.test(path) ? path : `${SB}${path}`, postData }, ctx(over));

// ---- names and titles

test('makeRunId gives eight lower-case letters or digits', () => {
  const id = makeRunId(1_763_650_000_000, () => 0.5);
  assert.match(id, /^[a-z0-9]{8}$/);
  assert.notEqual(makeRunId(1, () => 0.1), makeRunId(1, () => 0.9));
});

test('titles carry the prefix, the section and the run id', () => {
  const projects = SECTIONS.find((s) => s.key === 'projects');
  assert.equal(recordTitle(projects, RUN), `${TEST_PREFIX} Projects ${RUN}`);
  assert.equal(editedTitle(projects, RUN), `${TEST_PREFIX} Projects ${RUN} edited`);
  assert.ok(isTestTitle(recordTitle(projects, RUN), RUN));
  assert.ok(isTestTitle(recordTitle(projects, RUN)));
  assert.ok(!isTestTitle(recordTitle(projects, RUN), 'zzzzzzzz'));
  assert.ok(!isTestTitle('My real project'));
  assert.ok(!isTestTitle(null));
});

test('fieldValues fills every required field, and every non-title field is marked as a test value too', () => {
  for (const section of SECTIONS) {
    const values = fieldValues(section, RUN);
    assert.equal(values[section.titleLabel], recordTitle(section, RUN), section.key);
    for (const text of Object.values(values)) {
      assert.ok(text.startsWith(TEST_PREFIX), `${section.key}: ${text}`);
      assert.ok(text.includes(RUN), `${section.key}: ${text}`);
    }
  }
});

test('the cleanup sweeps every section table and the inbox', () => {
  const tables = CLEANUP_TABLES.map((t) => t.table);
  for (const section of SECTIONS) assert.ok(tables.includes(section.table));
  assert.deepEqual(CLEANUP_TABLES.at(-1), { table: 'contact_messages', titleKey: 'name' });
});

// ---- the saved session

test('decodeJwtPayload reads a payload and rejects anything else', () => {
  assert.deepEqual(decodeJwtPayload(jwt({ aal: 'aal2' })), { aal: 'aal2' });
  assert.equal(decodeJwtPayload('not-a-token'), null);
  assert.equal(decodeJwtPayload('a.%%%.c'), null);
  assert.equal(decodeJwtPayload(undefined), null);
});

test('sessionLevel accepts only an aal2 session', () => {
  const ok = sessionLevel(stateWith({ aal: 'aal2', role: 'authenticated' }));
  assert.equal(ok.ok, true);
  assert.equal(ok.key, 'sb-abcdefghijklmnopqrst-auth-token');
  assert.equal(ok.origin, 'http://localhost:3000');
  const low = sessionLevel(stateWith({ aal: 'aal1' }));
  assert.equal(low.ok, false);
  assert.match(low.message, /aal1/);
  assert.equal(sessionLevel({ origins: [] }).ok, false);
  assert.equal(sessionLevel(null).ok, false);
});

test('remapStorageState moves local storage to the opened origin and keeps cookies', () => {
  const saved = { ...stateWith({ aal: 'aal2' }), cookies: [{ name: 'c', value: '1' }] };
  const moved = remapStorageState(saved, BASE);
  assert.equal(moved.origins.length, 1);
  assert.equal(moved.origins[0].origin, BASE);
  assert.deepEqual(moved.origins[0].localStorage.map((i) => i.name), ['theme', 'sb-abcdefghijklmnopqrst-auth-token']);
  assert.deepEqual(moved.cookies, saved.cookies);
});

test('mergeSessionBack writes the rotated session back at the saved origin only', () => {
  const saved = stateWith({ aal: 'aal2' });
  const key = 'sb-abcdefghijklmnopqrst-auth-token';
  const fresh = { origins: [{ origin: BASE, localStorage: [{ name: key, value: '{"refresh_token":"r2"}' }] }] };
  const merged = mergeSessionBack(saved, fresh, key);
  assert.equal(merged.origins[0].origin, 'http://localhost:3000');
  assert.equal(merged.origins[0].localStorage.find((i) => i.name === key).value, '{"refresh_token":"r2"}');
  assert.equal(merged.origins[0].localStorage.find((i) => i.name === 'theme').value, 'dark');
  assert.equal(mergeSessionBack(saved, { origins: [] }, key), saved);
});

// ---- the guard

test('idTarget accepts only a single id=eq filter', () => {
  assert.equal(idTarget('?id=eq.p-1'), 'p-1');
  assert.equal(idTarget('?id=eq.p-1&select=*'), 'p-1');
  assert.equal(idTarget('?id=in.(p-1,p-2)'), null);
  assert.equal(idTarget('?id=in.(p-1)'), null);
  assert.equal(idTarget('?id=eq.p-1&id=eq.p-2'), null);
  assert.equal(idTarget('?title=like.TEST*'), null);
  assert.equal(idTarget('?id=eq.p-1&title=eq.x'), null);
  assert.equal(idTarget(''), null);
});

test('idTargets reads an eq or an in list, and nothing else', () => {
  assert.deepEqual(idTargets('?id=eq.p-1'), ['p-1']);
  assert.deepEqual(idTargets('?id=in.(p-1,p-2)&select=*'), ['p-1', 'p-2']);
  assert.deepEqual(idTargets('?id=in.("p-1","p 2")'), ['p-1', 'p 2']);
  assert.equal(idTargets('?id=in.()'), null);
  assert.equal(idTargets('?id=in.(p-1,)'), null);
  assert.equal(idTargets('?id=neq.p-1'), null);
  assert.equal(idTargets('?id=in.(p-1)&status=eq.unread'), null);
  assert.equal(idTargets('?id=eq.p-1&id=eq.p-2'), null);
});

test('reads from the app, the project and the static hosts are allowed', () => {
  assert.equal(classify('GET', `${BASE}/admindashboard`).verdict, 'allow');
  assert.equal(classify('GET', '/rest/v1/projects?select=*').verdict, 'allow');
  assert.equal(classify('GET', '/storage/v1/object/public/project-images/a.png').verdict, 'allow');
  assert.equal(classify('GET', 'https://fonts.gstatic.com/s/x.woff2').verdict, 'allow');
  assert.equal(classify('GET', 'https://sdo.gsfc.nasa.gov/assets/img/latest/latest_512_0171.jpg').verdict, 'allow');
  assert.equal(classify('OPTIONS', '/rest/v1/projects').verdict, 'allow');
  assert.equal(classify('GET', 'wss://abcdefghijklmnopqrst.supabase.co/realtime/v1/websocket').verdict, 'allow');
  assert.equal(classify('GET', 'data:image/png;base64,AAAA').verdict, 'allow');
});

test('other hosts are blocked, and writes to the app or a static host are violations', () => {
  assert.equal(classify('GET', 'https://evil.example.com/x').verdict, 'block');
  assert.equal(classify('POST', `${BASE}/api`).verdict, 'violation');
  assert.equal(classify('POST', 'https://fonts.googleapis.com/x').verdict, 'violation');
});

test('auth: only the refresh grant may write', () => {
  assert.equal(classify('POST', '/auth/v1/token?grant_type=refresh_token', '{}').kind, 'refresh');
  assert.equal(classify('POST', '/auth/v1/token?grant_type=password', '{}').verdict, 'violation');
  assert.equal(classify('POST', '/auth/v1/logout').verdict, 'violation');
  assert.equal(classify('POST', '/auth/v1/factors/x/challenge').verdict, 'violation');
  assert.equal(classify('GET', '/auth/v1/user').verdict, 'allow');
});

test('functions: mail and report senders are blocked, the passkey status read is allowed, the rest stop the run', () => {
  for (const name of ['admin-login-alert', 'send-contact-email', 'quarterly-report']) {
    const v = classify('POST', `/functions/v1/${name}`, '{}');
    assert.equal(v.verdict, 'block', name);
    assert.equal(v.kind, 'function');
  }
  assert.equal(classify('POST', '/functions/v1/admin-passkey', '{"action":"status"}').verdict, 'allow');
  assert.equal(classify('POST', '/functions/v1/admin-passkey', '{"action":"remove"}').verdict, 'violation');
  assert.equal(classify('POST', '/functions/v1/admin-passkey', '{"action":"register"}').verdict, 'violation');
  assert.equal(classify('POST', '/functions/v1/something-new', '{}').verdict, 'violation');
});

test('analytics events are blocked, never sent', () => {
  const v = classify('POST', '/rest/v1/analytics_events', '{"event_type":"page_view"}');
  assert.equal(v.verdict, 'block');
  assert.equal(v.kind, 'analytics');
});

test('rpc: the two logging and reading calls pass, the metrics writer does not', () => {
  assert.equal(classify('POST', '/rest/v1/rpc/log_admin_event', '{}').verdict, 'allow');
  assert.equal(classify('POST', '/rest/v1/rpc/calculate_portfolio_completeness', '{}').verdict, 'allow');
  assert.equal(classify('POST', '/rest/v1/rpc/generate_daily_portfolio_metrics', '{}').verdict, 'violation');
});

test('insert: only rows titled for this run, in a known table', () => {
  assert.equal(classify('POST', '/rest/v1/projects', JSON.stringify({ title: `${TEST_PREFIX} Projects ${RUN}` })).kind, 'insert');
  assert.equal(classify('POST', '/rest/v1/projects', JSON.stringify([{ title: `${TEST_PREFIX} Projects ${RUN}` }])).kind, 'insert');
  assert.equal(classify('POST', '/rest/v1/projects', JSON.stringify({ title: `${TEST_PREFIX} Projects other123` })).verdict, 'violation');
  assert.equal(classify('POST', '/rest/v1/projects', JSON.stringify({ title: 'A real project' })).verdict, 'violation');
  assert.equal(classify('POST', '/rest/v1/projects', JSON.stringify([{ title: `${TEST_PREFIX} Projects ${RUN}` }, { title: 'real' }])).verdict, 'violation');
  assert.equal(classify('POST', '/rest/v1/hero_content', JSON.stringify({ title: `${TEST_PREFIX} ${RUN}` })).verdict, 'violation');
  assert.equal(classify('POST', '/rest/v1/skills', JSON.stringify({ skill_name: `${TEST_PREFIX} Skills ${RUN}` })).kind, 'insert');
});

test('update and delete: only by id, only rows this run created', () => {
  assert.equal(classify('PATCH', '/rest/v1/projects?id=eq.p-1', '{"title":"x"}').kind, 'update');
  assert.equal(classify('DELETE', '/rest/v1/projects?id=eq.p-1').kind, 'delete');
  assert.equal(classify('DELETE', '/rest/v1/contact_messages?id=eq.m-1').kind, 'delete');
  assert.equal(classify('PATCH', '/rest/v1/projects?id=eq.real-1', '{"title":"x"}').verdict, 'violation');
  assert.equal(classify('DELETE', '/rest/v1/projects?id=eq.real-1').verdict, 'violation');
  assert.equal(classify('DELETE', '/rest/v1/projects?title=like.TEST*').verdict, 'violation');
  assert.equal(classify('DELETE', '/rest/v1/projects?id=in.(p-1,real-1)').verdict, 'violation');
  assert.equal(classify('PATCH', '/rest/v1/contact_messages?id=in.%28m-1%29&select=*', '{"status":"read"}').kind, 'update');
  assert.equal(classify('PATCH', '/rest/v1/contact_messages?id=in.(m-1,real-9)', '{"status":"read"}').verdict, 'violation');
  assert.equal(classify('PATCH', '/rest/v1/contact_messages?status=eq.unread', '{"status":"read"}').verdict, 'violation');
  assert.equal(classify('PATCH', '/rest/v1/projects?id=in.(real-1)', '{"order_index":1}', { reorder: { table: 'projects', orderKey: 'order_index' } }).verdict, 'violation');
  assert.equal(classify('PATCH', '/rest/v1/internships?id=eq.p-1', '{"title":"x"}').verdict, 'violation');
  assert.equal(classify('PUT', '/rest/v1/projects?id=eq.p-1', '{}').verdict, 'violation');
});

test('order rewrites pass only inside the window, only on the order column', () => {
  const window = { reorder: { table: 'projects', orderKey: 'order_index' } };
  assert.equal(classify('PATCH', '/rest/v1/projects?id=eq.real-1', '{"order_index":3,"updated_at":"t"}', window).kind, 'order-rewrite');
  assert.equal(classify('PATCH', '/rest/v1/projects?id=eq.real-1', '{"order_index":3}').verdict, 'violation');
  assert.equal(classify('PATCH', '/rest/v1/projects?id=eq.real-1', '{"order_index":3,"title":"x"}', window).verdict, 'violation');
  assert.equal(classify('PATCH', '/rest/v1/projects?id=eq.real-1', '{"updated_at":"t"}', window).verdict, 'violation');
  assert.equal(classify('PATCH', '/rest/v1/internships?id=eq.real-1', '{"order_index":3}', window).verdict, 'violation');
});

test('the singleton round trip passes only for its one row, only inside its window', () => {
  const window = { singleton: { table: 'hero_content', id: 'h-1' } };
  assert.equal(classify('PATCH', '/rest/v1/hero_content?id=eq.h-1', '{"title":"x"}', window).kind, 'singleton');
  assert.equal(classify('PATCH', '/rest/v1/hero_content?id=eq.h-1', '{"title":"x"}').verdict, 'violation');
  assert.equal(classify('PATCH', '/rest/v1/hero_content?id=eq.h-2', '{"title":"x"}', window).verdict, 'violation');
  assert.equal(classify('DELETE', '/rest/v1/hero_content?id=eq.h-1', null, window).verdict, 'violation');
});

test('storage: uploads and removals only under paths this run owns', () => {
  assert.equal(classify('POST', `/storage/v1/object/organization-logos/internships/test-4-4-internships-${RUN}-logo-1.png`).kind, 'upload');
  assert.equal(classify('POST', '/storage/v1/object/project-images/projects/p-1/1.png').kind, 'upload');
  assert.equal(classify('PUT', '/storage/v1/object/project-images/projects/real-1/1.png').verdict, 'violation');
  assert.equal(classify('POST', '/storage/v1/object/list/project-images', '{"prefix":"projects/real-1"}').verdict, 'allow');
  assert.equal(classify('POST', '/storage/v1/object/sign/documents/a.pdf', '{}').verdict, 'allow');
  assert.equal(classify('DELETE', '/storage/v1/object/project-images', JSON.stringify({ prefixes: ['projects/p-1/1.png'] })).kind, 'storage-delete');
  assert.equal(classify('DELETE', '/storage/v1/object/project-images', JSON.stringify({ prefixes: ['projects/p-1/1.png', 'projects/real-1/1.png'] })).verdict, 'violation');
  assert.equal(classify('DELETE', '/storage/v1/object/project-images', '{}').verdict, 'violation');
  assert.equal(classify('POST', '/storage/v1/bucket', '{}').verdict, 'violation');
});

// ---- the order check

test('orderRewrite numbers the way the deck does', () => {
  assert.deepEqual([...orderRewrite(['a', 'b', 'c'], 'asc')], [['a', 1], ['b', 2], ['c', 3]]);
  assert.deepEqual([...orderRewrite(['a', 'b', 'c'], 'desc')], [['a', 3], ['b', 2], ['c', 1]]);
});

test('orderRewriteImpact is empty only when no live row would be renumbered', () => {
  const tests = new Set(['t1', 't2']);
  const consecutive = [{ id: 't2', value: 4 }, { id: 't1', value: 3 }, { id: 'a', value: 2 }, { id: 'b', value: 1 }];
  assert.deepEqual(orderRewriteImpact(consecutive, 'desc', tests), []);
  const gappy = [{ id: 't2', value: 11 }, { id: 't1', value: 10 }, { id: 'a', value: 9, title: 'A' }, { id: 'b', value: 1 }];
  assert.deepEqual(orderRewriteImpact(gappy, 'desc', tests), [{ id: 'a', title: 'A', before: 9, after: 2 }]);
  const asc = [{ id: 'a', value: 1 }, { id: 'b', value: 2 }, { id: 't1', value: 3 }, { id: 't2', value: 4 }];
  assert.deepEqual(orderRewriteImpact(asc, 'asc', tests), []);
  assert.equal(orderRewriteImpact([{ id: 'a', value: null }], 'asc', tests).length, 1);
});

test('compareOrderSnapshots reports moved, missing and new rows', () => {
  const before = [{ id: 'a', value: 1, title: 'A' }, { id: 'b', value: 2, title: 'B' }, { id: 'c', value: 3, title: 'C' }];
  assert.deepEqual(compareOrderSnapshots(before, before.map((r) => ({ ...r }))), []);
  const after = [{ id: 'a', value: 2, title: 'A' }, { id: 'b', value: 2, title: 'B' }, { id: 'd', value: 9, title: 'D' }];
  assert.deepEqual(compareOrderSnapshots(before, after), [
    { id: 'a', title: 'A', before: 1, after: 2 },
    { id: 'c', title: 'C', before: 3, after: 'missing' },
    { id: 'd', title: 'D', before: 'missing', after: 9 },
  ]);
});

test('rowDiff ignores updated_at and compares arrays and objects by value', () => {
  const row = { id: 1, title: 'x', tags: ['a'], meta: { k: 1 }, updated_at: 't1' };
  assert.deepEqual(rowDiff(row, { ...row, tags: ['a'], meta: { k: 1 }, updated_at: 't2' }), []);
  assert.deepEqual(rowDiff(row, { ...row, title: 'y' }), ['title']);
  assert.deepEqual(rowDiff(row, { ...row, extra: null }), []);
  assert.deepEqual(rowDiff(row, { ...row, extra: 1 }), ['extra']);
});

// ---- storage paths

test('storagePath reads public, signed and bare values', () => {
  assert.equal(storagePath(`${SB}/storage/v1/object/public/project-images/projects/p-1/a%20b.png`, 'project-images'), 'projects/p-1/a b.png');
  assert.equal(storagePath(`${SB}/storage/v1/object/sign/documents/x.pdf?token=t`, 'documents'), 'x.pdf');
  assert.equal(storagePath('project-images/projects/p-1/a.png', 'project-images'), 'projects/p-1/a.png');
  assert.equal(storagePath('projects/p-1/a.png', 'project-images'), 'projects/p-1/a.png');
  assert.equal(storagePath(`${SB}/storage/v1/object/public/other/a.png`, 'project-images'), null);
  assert.equal(storagePath('https://cdn.example.com/a.png', 'project-images'), null);
  assert.equal(storagePath('', 'project-images'), null);
  assert.equal(storagePath(null, 'project-images'), null);
});

test('storagePaths reads a single value or a list', () => {
  const url = (p) => `${SB}/storage/v1/object/public/project-images/${p}`;
  assert.deepEqual(storagePaths({ image_urls: [url('a.png'), url('b.png')] }, 'image_urls', 'project-images'), ['a.png', 'b.png']);
  assert.deepEqual(storagePaths({ logo: url('a.png') }, 'logo', 'project-images'), ['a.png']);
  assert.deepEqual(storagePaths({ logo: null }, 'logo', 'project-images'), []);
  assert.deepEqual(storagePaths(null, 'logo', 'project-images'), []);
});

test('TINY_PNG is a PNG', () => {
  assert.deepEqual([...TINY_PNG.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
});

// ---- the report

const cleanReport = () => ({
  runId: RUN, mode: 'offline', base: BASE, startedAt: 's', finishedAt: 'f', passed: true,
  steps: [{ section: 'Projects', step: 'create', status: 'pass', detail: 'ok' }, { section: 'Hero', step: 'save round trip', status: 'skipped', detail: 'not run (live content)' }],
  order: [{ table: 'projects', status: 'pass', detail: '3 live rows unchanged', diffs: [] }],
  violations: [], blocked: [{ method: 'POST', url: '<project>/rest/v1/analytics_events', reason: 'analytics event' }], orderRewrites: 4,
  csp: [], pageErrors: [], failedResponses: [], cleanup: { status: 'pass', detail: 'none left' },
});

test('reportPasses needs clean steps, guard, browser, order and cleanup', () => {
  assert.equal(reportPasses(cleanReport()), true);
  const breaks = [
    (r) => { r.steps[0].status = 'fail'; },
    (r) => { r.violations.push({ method: 'DELETE', url: 'u', reason: 'x' }); },
    (r) => { r.csp.push({ directive: 'img-src', blocked: 'https://x' }); },
    (r) => { r.pageErrors.push('pageerror: x'); },
    (r) => { r.failedResponses.push({ status: 500, method: 'GET', url: 'u' }); },
    (r) => { r.order[0].status = 'fail'; },
    (r) => { r.cleanup.status = 'fail'; },
  ];
  for (const brk of breaks) { const r = cleanReport(); brk(r); assert.equal(reportPasses(r), false, brk.toString()); }
});

test('renderReport lists the steps, the guard and the order diffs, and escapes table cells', () => {
  const r = cleanReport();
  r.steps.push({ section: 'Skills', step: 'edit', status: 'fail', detail: 'a | b\nc' });
  r.order.push({ table: 'internships', status: 'fail', detail: '1 live row(s) changed', diffs: [{ id: 'i1', title: 'Real job', before: 2, after: 3 }] });
  const markdown = reportMarkdown(r);
  assert.match(markdown, /^# Admin write proof, run k3x9a7q2/);
  assert.match(markdown, /\| Skills \| edit \| fail \| a \\\| b c \|/);
  assert.match(markdown, /Real job: 2 -> 3/);
  assert.match(markdown, /analytics_events: analytics event/);
  assert.match(markdown, /Order rewrites allowed: 4/);
  assert.match(markdown, /CSP violations: none/);
});
