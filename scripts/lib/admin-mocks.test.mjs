import assert from 'node:assert/strict';
import path from 'node:path';
import { describe, it } from 'node:test';
import { buildFakeAdminSession, buildFileFor, rowsForTable, supabaseReply } from './admin-mocks.mjs';

const session = buildFakeAdminSession(1_800_000_000);
const claimsOf = (token) => JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));

describe('buildFakeAdminSession', () => {
  it('carries a second-factor (aal2) claim with an expiry two hours out', () => {
    const claims = claimsOf(session.access_token);
    assert.equal(claims.aal, 'aal2');
    assert.equal(claims.exp, 1_800_000_000 + 7200);
    assert.equal(session.expires_at, claims.exp);
    assert.equal(session.user.factors[0].status, 'verified');
  });

  it('uses an example.com address and a placeholder signature, never a real credential', () => {
    assert.equal(session.user.email, 'admin@example.com');
    assert.equal(Buffer.from(session.access_token.split('.')[2], 'base64url').toString(), 'placeholder-signature');
  });
});

describe('supabaseReply', () => {
  it('answers the user lookup and token refresh from the fake session', () => {
    assert.equal(JSON.parse(supabaseReply({ method: 'GET', pathname: '/auth/v1/user' }, session).body).email, 'admin@example.com');
    assert.equal(supabaseReply({ method: 'POST', pathname: '/auth/v1/token' }, session).status, 200);
  });

  it('answers table reads from the recorded fixtures with a count header', () => {
    const reply = supabaseReply({ method: 'GET', pathname: '/rest/v1/projects', accept: 'application/json' }, session);
    assert.equal(reply.status, 200);
    assert.ok(JSON.parse(reply.body).length > 0);
    assert.match(reply.headers['content-range'], /^0-\d+\/\d+$/);
  });

  it('gives admin-only tables without fixtures an empty list', () => {
    const reply = supabaseReply({ method: 'GET', pathname: '/rest/v1/contact_messages' }, session);
    assert.deepEqual(JSON.parse(reply.body), []);
  });

  it('refuses writes and marks them so a run can report the attempt', () => {
    for (const method of ['POST', 'PATCH', 'DELETE']) {
      const reply = supabaseReply({ method, pathname: '/rest/v1/projects' }, session);
      assert.equal(reply.status, 403);
      assert.equal(reply.write, true);
    }
    assert.equal(supabaseReply({ method: 'POST', pathname: '/storage/v1/object/project-images/x.png' }, session).write, true);
  });

  it('answers preflight requests with permissive CORS', () => {
    const reply = supabaseReply({ method: 'OPTIONS', pathname: '/rest/v1/projects' }, session);
    assert.equal(reply.status, 204);
    assert.equal(reply.headers['access-control-allow-origin'], '*');
  });
});

describe('rowsForTable', () => {
  it('returns the fake admin row for admin_users', () => {
    assert.deepEqual(rowsForTable('admin_users', session), [{ id: 1, email: 'admin@example.com', is_active: true }]);
  });
});

describe('buildFileFor', () => {
  const root = path.resolve('public');
  it('serves existing files and falls back to index.html for app routes', () => {
    assert.equal(buildFileFor('public', '/robots.txt'), path.join(root, 'robots.txt'));
    assert.equal(buildFileFor('public', '/admindashboard'), path.join(root, 'index.html'));
  });

  it('refuses paths that climb out of the folder', () => {
    assert.equal(buildFileFor('public', '/../package.json'), null);
    assert.equal(buildFileFor('public', '/%2e%2e/package.json'), null);
  });
});
