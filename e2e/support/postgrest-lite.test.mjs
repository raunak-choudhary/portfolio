// e2e/support/postgrest-lite.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyWrite, filterRows, pageRows, readResponse, writeResponse } from './postgrest-lite.mjs';

const BASE = 'https://project.example.test/rest/v1/items';
const rows = [
  { id: 'a', status: 'active', n: 3, tag: null, at: '2026-11-01' },
  { id: 'b', status: 'inactive', n: 1, tag: 'x', at: '2026-11-03' },
  { id: 'c', status: 'active', n: 2, tag: 'y', at: '2026-11-02' },
];
const params = (query) => new URL(`${BASE}?${query}`).searchParams;

test('filters by eq, neq, is, in and their negation', () => {
  assert.deepEqual(filterRows(rows, params('status=eq.active')).map((r) => r.id), ['a', 'c']);
  assert.deepEqual(filterRows(rows, params('status=neq.active')).map((r) => r.id), ['b']);
  assert.deepEqual(filterRows(rows, params('tag=is.null')).map((r) => r.id), ['a']);
  assert.deepEqual(filterRows(rows, params('id=in.(a,"c")')).map((r) => r.id), ['a', 'c']);
  assert.deepEqual(filterRows(rows, params('id=not.in.(a,c)')).map((r) => r.id), ['b']);
});

test('filters by range and ignores select, unknown columns and or', () => {
  assert.deepEqual(filterRows(rows, params('at=gte.2026-11-02&select=id')).map((r) => r.id), ['b', 'c']);
  assert.equal(filterRows(rows, params('missing=eq.1')).length, 3);
  assert.equal(filterRows(rows, params('or=(id.eq.a,id.eq.b)')).length, 3);
});

test('orders, offsets and limits', () => {
  assert.deepEqual(pageRows(rows, params('order=n.desc')).map((r) => r.id), ['a', 'c', 'b']);
  assert.deepEqual(pageRows(rows, params('order=at.asc&offset=1&limit=1')).map((r) => r.id), ['c']);
});

test('a read answers counts, HEAD and single-object requests like PostgREST', () => {
  const counted = readResponse(rows, { method: 'HEAD', url: `${BASE}?status=eq.active`, prefer: 'count=exact' });
  assert.equal(counted.headers['content-range'], '0-1/2');
  assert.equal(counted.body, '');

  const one = readResponse(rows, { method: 'GET', url: `${BASE}?id=eq.b`, accept: 'application/vnd.pgrst.object+json' });
  assert.equal(one.status, 200);
  assert.equal(JSON.parse(one.body).id, 'b');

  const none = readResponse(rows, { method: 'GET', url: `${BASE}?id=eq.z`, accept: 'application/vnd.pgrst.object+json' });
  assert.equal(none.status, 406);
});

test('a PATCH changes only the matching rows and stamps updated_at', () => {
  const { rows: next, touched } = applyWrite(rows, { method: 'PATCH', url: `${BASE}?id=eq.a`, body: { n: 9 }, now: 'T' });
  assert.deepEqual(touched, [{ ...rows[0], n: 9, updated_at: 'T' }]);
  assert.equal(next[1], rows[1]);
  assert.equal(rows[0].n, 3, 'the input is not mutated');
});

test('a POST appends with an id and timestamps, a DELETE removes', () => {
  const inserted = applyWrite(rows, { method: 'POST', url: BASE, body: [{ status: 'new' }], now: 'T' });
  assert.equal(inserted.rows.length, 4);
  assert.match(inserted.touched[0].id, /^TEST-new-/);
  assert.equal(inserted.touched[0].created_at, 'T');

  const removed = applyWrite(rows, { method: 'DELETE', url: `${BASE}?id=eq.b`, body: null });
  assert.deepEqual(removed.rows.map((r) => r.id), ['a', 'c']);
  assert.deepEqual(removed.touched.map((r) => r.id), ['b']);
});

test('a write answers return=representation, single objects and minimal returns', () => {
  const touched = [{ id: 'a' }];
  assert.equal(writeResponse(touched, { method: 'PATCH' }).status, 204);
  assert.equal(writeResponse(touched, { method: 'POST' }).status, 201);
  assert.deepEqual(JSON.parse(writeResponse(touched, { method: 'PATCH', prefer: 'return=representation' }).body), touched);
  const single = writeResponse(touched, { method: 'POST', prefer: 'return=representation', accept: 'application/vnd.pgrst.object+json' });
  assert.deepEqual(JSON.parse(single.body), { id: 'a' });
});
