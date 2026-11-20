// e2e/support/fake-session.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  FAKE_EMAIL,
  buildFakeAccessToken,
  buildFakeSession,
  buildFakeUser,
  decodeTokenPayload,
  storageKeyFor,
} from './fake-session.mjs';

// The same check auth-js runs on every token segment before decoding it.
const BASE64URL = /^([a-z0-9_-]{4})*($|[a-z0-9_-]{3}$|[a-z0-9_-]{2}$)$/i;

test('storageKeyFor uses the first host label, like supabase-js', () => {
  assert.equal(storageKeyFor('https://abcdefghij.supabase.co'), 'sb-abcdefghij-auth-token');
});

test('the token has three base64url parts and carries the requested level', () => {
  for (const aal of ['aal1', 'aal2']) {
    const token = buildFakeAccessToken({ aal, now: Date.UTC(2026, 10, 19) });
    const parts = token.split('.');
    assert.equal(parts.length, 3);
    for (const part of parts) assert.match(part, BASE64URL);
    const payload = decodeTokenPayload(token);
    assert.equal(payload.aal, aal);
    assert.equal(payload.email, FAKE_EMAIL);
    assert.equal(payload.exp - payload.iat, 3600);
  }
});

test('the token is visibly unsigned', () => {
  const [header, , signature] = buildFakeAccessToken({ aal: 'aal2' }).split('.');
  assert.deepEqual(JSON.parse(Buffer.from(header, 'base64url').toString()), { alg: 'none', typ: 'JWT' });
  assert.match(Buffer.from(signature, 'base64url').toString(), /^unsigned test token/);
});

test('a level 2 token lists the authenticator in amr, a level 1 token does not', () => {
  const methods = (aal) => decodeTokenPayload(buildFakeAccessToken({ aal })).amr.map((entry) => entry.method);
  assert.deepEqual(methods('aal2'), ['totp', 'otp']);
  assert.deepEqual(methods('aal1'), ['otp']);
});

test('the stored session passes the shape check supabase-js applies and does not need a refresh', () => {
  const now = Date.UTC(2026, 10, 19, 12);
  const session = buildFakeSession({ aal: 'aal2', now });
  for (const key of ['access_token', 'refresh_token', 'expires_at']) assert.ok(key in session, key);
  // supabase-js refreshes when fewer than 90 seconds remain.
  assert.ok(session.expires_at * 1000 - now > 90_000);
  assert.equal(session.user.email, FAKE_EMAIL);
});

test('the user carries one verified TOTP factor unless asked not to', () => {
  const [factor] = buildFakeUser().factors;
  assert.equal(factor.factor_type, 'totp');
  assert.equal(factor.status, 'verified');
  assert.deepEqual(buildFakeUser({ withFactor: false }).factors, []);
});

test('decodeTokenPayload refuses malformed tokens', () => {
  assert.equal(decodeTokenPayload('not-a-token'), null);
  assert.equal(decodeTokenPayload('a.%%%.c'), null);
});
