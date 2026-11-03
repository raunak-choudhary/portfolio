import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildRestResponse, realtimeReplyFor, tableFromRestUrl } from './supabase-fixtures.mjs';

const rows = [{ id: 'a' }, { id: 'b' }];

describe('tableFromRestUrl', () => {
  it('returns the table for a plain read', () => {
    assert.equal(tableFromRestUrl('https://x.supabase.co/rest/v1/projects?select=*&status=eq.active'), 'projects');
  });

  it('returns null for RPC calls and nested paths', () => {
    assert.equal(tableFromRestUrl('https://x.supabase.co/rest/v1/rpc/increment_content_performance'), null);
    assert.equal(tableFromRestUrl('https://x.supabase.co/rest/v1/'), null);
  });
});

describe('buildRestResponse', () => {
  it('returns the rows as a JSON array by default', () => {
    const response = buildRestResponse(rows, { method: 'GET' });
    assert.equal(response.status, 200);
    assert.deepEqual(JSON.parse(response.body), rows);
  });

  it('returns a single object for .single() with exactly one row', () => {
    const response = buildRestResponse([{ id: 'only' }], { method: 'GET', accept: 'application/vnd.pgrst.object+json' });
    assert.deepEqual(JSON.parse(response.body), { id: 'only' });
  });

  it('returns PGRST116 for .single() with zero or several rows, like PostgREST', () => {
    for (const set of [[], rows]) {
      const response = buildRestResponse(set, { method: 'GET', accept: 'application/vnd.pgrst.object+json' });
      assert.equal(response.status, 406);
      assert.equal(JSON.parse(response.body).code, 'PGRST116');
    }
  });

  it('adds a content-range header when a count is requested', () => {
    assert.equal(buildRestResponse(rows, { method: 'GET', prefer: 'count=exact' }).headers['content-range'], '0-1/2');
    assert.equal(buildRestResponse([], { method: 'HEAD', prefer: 'count=exact' }).headers['content-range'], '*/0');
  });

  it('sends no body for HEAD requests', () => {
    assert.equal(buildRestResponse(rows, { method: 'HEAD' }).body, '');
  });
});

describe('realtimeReplyFor', () => {
  it('acknowledges a channel join and echoes its postgres_changes bindings with ids', () => {
    const binding = { event: '*', schema: 'public', table: 'projects' };
    const reply = realtimeReplyFor(['1', '1', 'realtime:public:projects', 'phx_join', { config: { postgres_changes: [binding] } }]);
    assert.deepEqual(reply, ['1', '1', 'realtime:public:projects', 'phx_reply', {
      status: 'ok',
      response: { postgres_changes: [{ ...binding, id: 1 }] },
    }]);
  });

  it('acknowledges heartbeats with an empty response', () => {
    assert.deepEqual(realtimeReplyFor([null, '7', 'phoenix', 'heartbeat', {}]), [null, '7', 'phoenix', 'phx_reply', { status: 'ok', response: {} }]);
  });

  it('ignores frames without a ref and non-array frames', () => {
    assert.equal(realtimeReplyFor(['1', null, 'topic', 'broadcast', {}]), null);
    assert.equal(realtimeReplyFor({ event: 'phx_join' }), null);
  });
});
