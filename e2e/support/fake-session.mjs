// e2e/support/fake-session.mjs
//
// A fake, unsigned Supabase session for the admin browser tests. Pure
// functions only (no Playwright), so they are unit tested in
// fake-session.test.mjs.
//
// How the app decides it is signed in (supabase-js 2.106, authService.js):
//   1. supabase.auth.getSession() reads the session object stored in
//      localStorage under `sb-<project ref>-auth-token`. It only checks the
//      object has access_token, refresh_token and expires_at, and that
//      expires_at is not within 90 seconds; a fresh expiry means no refresh
//      call is made. Nothing verifies the token's signature in the browser.
//   2. mfa.getAuthenticatorAssuranceLevel() decodes the access token locally
//      (three base64url parts, JSON header and payload) and reads its `aal`
//      and `amr` claims.
//   3. mfa.listFactors() calls GET /auth/v1/user and reads `factors`.
//   4. verifyAdminSession() reads admin_users for the session's email.
// The admin test fixtures answer 3 and 4; this module builds 1 and 2.
//
// The token is assembled at runtime from plain JSON, its header says
// alg "none" and its signature segment is the base64url of a fixed English
// phrase, so no key-like literal sits in the source and the token could never
// pass a real server's verification.

export const FAKE_USER_ID = '00000000-0000-4000-8000-00000000test';
export const FAKE_EMAIL = 'test-admin@example.test';
export const FAKE_FACTOR_ID = '00000000-0000-4000-8000-0000000factor';

const SIGNATURE_TEXT = 'unsigned test token, not valid anywhere';

/** Encodes text as base64url without padding. */
export const base64Url = (text) => Buffer.from(text, 'utf8').toString('base64url');

/**
 * The storage key supabase-js uses by default for a project URL: the first
 * label of the host, e.g. https://abc.supabase.co -> sb-abc-auth-token.
 */
export const storageKeyFor = (supabaseUrl) => `sb-${new URL(supabaseUrl).hostname.split('.')[0]}-auth-token`;

/**
 * Builds the fake access token.
 * @param {{ aal: 'aal1'|'aal2', now?: number, expiresIn?: number }} options
 */
export function buildFakeAccessToken({ aal, now = Date.now(), expiresIn = 3600 }) {
  const issuedAt = Math.floor(now / 1000);
  const amr = [{ method: 'otp', timestamp: issuedAt - 120 }];
  if (aal === 'aal2') amr.unshift({ method: 'totp', timestamp: issuedAt - 60 });
  const header = { alg: 'none', typ: 'JWT' };
  const payload = {
    iss: 'e2e-fake-auth',
    sub: FAKE_USER_ID,
    aud: 'authenticated',
    role: 'authenticated',
    email: FAKE_EMAIL,
    aal,
    amr,
    session_id: 'e2e-fake-session',
    iat: issuedAt,
    exp: issuedAt + expiresIn,
  };
  return [base64Url(JSON.stringify(header)), base64Url(JSON.stringify(payload)), base64Url(SIGNATURE_TEXT)].join('.');
}

/** The verified authenticator-app factor the fake user carries. */
export const fakeFactor = () => ({
  id: FAKE_FACTOR_ID,
  friendly_name: 'TEST- authenticator',
  factor_type: 'totp',
  status: 'verified',
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
});

/** The user object, as GET /auth/v1/user returns it. */
export function buildFakeUser({ withFactor = true } = {}) {
  return {
    id: FAKE_USER_ID,
    aud: 'authenticated',
    role: 'authenticated',
    email: FAKE_EMAIL,
    email_confirmed_at: '2026-01-01T00:00:00.000Z',
    app_metadata: { provider: 'email', providers: ['email'] },
    user_metadata: {},
    identities: [],
    factors: withFactor ? [fakeFactor()] : [],
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  };
}

/**
 * The session object supabase-js stores in localStorage.
 * @param {{ aal: 'aal1'|'aal2', withFactor?: boolean, now?: number }} options
 */
export function buildFakeSession({ aal, withFactor = true, now = Date.now() }) {
  const expiresIn = 3600;
  return {
    access_token: buildFakeAccessToken({ aal, now, expiresIn }),
    token_type: 'bearer',
    expires_in: expiresIn,
    expires_at: Math.floor(now / 1000) + expiresIn,
    refresh_token: 'e2e-fake-refresh',
    user: buildFakeUser({ withFactor }),
  };
}

/** Decodes a token's payload, for tests and for checking request headers. */
export function decodeTokenPayload(token) {
  const parts = String(token).split('.');
  if (parts.length !== 3) return null;
  try {
    return JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
  } catch {
    return null;
  }
}
