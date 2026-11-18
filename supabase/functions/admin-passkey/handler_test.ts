// Request-level tests for the passkey bridge. Auth, the database and the
// WebAuthn library are in-memory fakes; the TOTP and AES code is real, so a
// sign-in proves the function computes the code Auth expects from the
// secret it stored encrypted.

import { assert, assertEquals, assertFalse, assertMatch, assertNotEquals } from 'jsr:@std/assert@1';
import {
  type AuthFactor,
  type BridgeRow,
  type HandlerDeps,
  handleRequest,
  type NewPasskey,
  type PasskeyRow,
} from './handler.ts';
import { BRIDGE_FACTOR_NAME, RATE_LIMIT_MAX, toBase64Url, totpCode } from './lib.ts';

const BRIDGE_NAME = new RegExp(`^${BRIDGE_FACTOR_NAME} [0-9a-f]{8}$`);

const ORIGIN = 'http://localhost:3000';
const SITE = 'https://www.raunakchoudhary.com';
const ORIGINS = `${SITE},https://raunakchoudhary.com,${ORIGIN}`;
const USER_ID = '7a3c3c55-6f0e-4b8e-9d4c-0f6b1e2a9c11';
const EMAIL = 'owner@example.com';
const BRIDGE_SECRET = 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP';
const NOW = new Date('2026-11-18T12:00:10Z');
const WRAP_KEY = btoa(String.fromCharCode(...new Uint8Array(32).fill(7)));

// Access tokens are built at runtime so no JWT-shaped literal sits in the repo.
const token = (aal: string, sub = USER_ID) =>
  ['h', toBase64Url(new TextEncoder().encode(JSON.stringify({ sub, aal }))), 's'].join('.');

interface ChallengeRow {
  id: string;
  user_id: string;
  kind: string;
  challenge: string;
  rp_id: string;
  expires_at: string;
  used_at: string | null;
  created_at: string;
}

function setup(
  options: {
    factors?: AuthFactor[];
    admin?: boolean;
    codeAccepted?: (code: string, step: number) => boolean;
    env?: Record<string, string | undefined>;
  } = {},
) {
  let ids = 0;
  const uuid = () => `00000000-0000-4000-8000-${String(++ids).padStart(12, '0')}`;
  const factors: AuthFactor[] = options.factors ??
    [{ id: 'totp-phone', friendly_name: 'Primary authenticator', factor_type: 'totp', status: 'verified' }];
  const challenges: ChallengeRow[] = [];
  const passkeys: Array<PasskeyRow & { device_name: string; last_used_at?: string }> = [];
  let bridge: (BridgeRow & { user_id: string }) | null = null;
  const authCalls: string[] = [];
  const authChallenges = new Map<string, string>();
  const logs: string[] = [];
  const secrets = new Map<string, string>();
  const enrolledNames: string[] = [];
  let enrolments = 0;

  const deps: HandlerDeps = {
    env: options.env ??
      { PASSKEY_BRIDGE_KEY: WRAP_KEY, PASSKEY_ALLOWED_ORIGINS: ORIGINS, PASSKEY_ALLOW_LOCALHOST: '1' },
    now: () => NOW,
    log: (message) => logs.push(message),
    auth: {
      getUser: (bearer) => {
        const claims = JSON.parse(
          new TextDecoder().decode(
            Uint8Array.from(atob(bearer.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0)),
          ),
        );
        return Promise.resolve(
          claims.sub === USER_ID ? { id: USER_ID, email: EMAIL, isAnonymous: false, factors } : null,
        );
      },
      enrollTotp: (_bearer, friendlyName) => {
        authCalls.push('enroll');
        enrolledNames.push(friendlyName);
        // Auth keeps friendly names unique per user.
        if (factors.some((factor) => factor.friendly_name === friendlyName)) {
          return Promise.resolve({ ok: false, status: 422, code: 'mfa_factor_name_conflict' });
        }
        enrolments += 1;
        const factorId = enrolments === 1 ? 'bridge-factor' : `bridge-factor-${enrolments}`;
        factors.push({ id: factorId, friendly_name: friendlyName, factor_type: 'totp', status: 'unverified' });
        secrets.set(factorId, BRIDGE_SECRET);
        return Promise.resolve({ ok: true, data: { factorId, secret: BRIDGE_SECRET } });
      },
      challenge: (_bearer, factorId) => {
        authCalls.push(`challenge:${factorId}`);
        const challengeId = `gc-${authCalls.length}`;
        authChallenges.set(challengeId, factorId);
        return Promise.resolve({ ok: true, data: { challengeId } });
      },
      verify: async (_bearer, factorId, challengeId, code) => {
        authCalls.push(`verify:${factorId}`);
        if (authChallenges.get(challengeId) !== factorId) {
          return { ok: false, status: 422, code: 'mfa_ip_address_mismatch' };
        }
        const secret = secrets.get(factorId) ?? '';
        const step = Math.floor(NOW.getTime() / 30000);
        const accepts = options.codeAccepted ?? (() => true);
        for (const offset of [-1, 0, 1]) {
          if (code === await totpCode(secret, NOW.getTime(), { stepOffset: offset }) && accepts(code, step + offset)) {
            const factor = factors.find((item) => item.id === factorId);
            if (factor) factor.status = 'verified';
            return { ok: true, data: { access_token: 'new-access', refresh_token: 'new-refresh' } };
          }
        }
        return { ok: false, status: 422, code: 'mfa_verification_failed' };
      },
      unenroll: (_bearer, factorId) => {
        authCalls.push(`unenroll:${factorId}`);
        const index = factors.findIndex((factor) => factor.id === factorId);
        if (index < 0) return Promise.resolve({ ok: false, status: 404 });
        factors.splice(index, 1);
        return Promise.resolve({ ok: true, data: {} });
      },
    },
    store: {
      isAdminEmail: (email) => Promise.resolve(options.admin !== false && email === EMAIL),
      issueChallenge: async (row, windowStart, max) => {
        // Like the SQL function: count and insert with no await in between, so
        // concurrent callers in this single-threaded fake are serialised too.
        await Promise.resolve();
        const recent = challenges.filter((item) => item.user_id === row.user_id && item.created_at >= windowStart);
        if (recent.length >= max) return null;
        const id = uuid();
        challenges.push({ ...row, id, used_at: null, created_at: NOW.toISOString() });
        return id;
      },
      consumeChallenge: (id, userId, kind, rpId, nowIso) => {
        const row = challenges.find((item) =>
          item.id === id && item.user_id === userId && item.kind === kind && item.rp_id === rpId && !item.used_at &&
          item.expires_at > nowIso
        );
        if (!row) return Promise.resolve(null);
        row.used_at = nowIso;
        return Promise.resolve(row.challenge);
      },
      listPasskeys: (userId, rpId) =>
        Promise.resolve(passkeys.filter((row) => row.user_id === userId && row.rp_id === rpId)),
      countAllPasskeys: (userId) => Promise.resolve(passkeys.filter((row) => row.user_id === userId).length),
      findPasskey: (credentialId, userId, rpId) =>
        Promise.resolve(
          passkeys.find((row) => row.credential_id === credentialId && row.user_id === userId && row.rp_id === rpId) ??
            null,
        ),
      insertPasskey: (row: NewPasskey) => {
        if (passkeys.some((item) => item.credential_id === row.credential_id)) {
          return Promise.resolve({ duplicate: true as const });
        }
        const id = uuid();
        passkeys.push({ id, ...row });
        return Promise.resolve({ id });
      },
      updatePasskeyUse: (id, signCount, lastUsed) => {
        const row = passkeys.find((item) => item.id === id);
        if (row) Object.assign(row, { sign_count: signCount, last_used_at: lastUsed });
        return Promise.resolve();
      },
      deletePasskey: (id, userId, refuseRpId) => {
        const index = passkeys.findIndex((row) => row.id === id && row.user_id === userId && row.rp_id !== refuseRpId);
        if (index >= 0) passkeys.splice(index, 1);
        return Promise.resolve(index >= 0);
      },
      getBridge: () => Promise.resolve(bridge),
      insertBridge: (row) => {
        // user_id is the primary key: a second row is a conflict.
        if (bridge) return Promise.resolve(false);
        bridge = row;
        return Promise.resolve(true);
      },
      deleteBridge: (userId, factorId) => {
        if (bridge && bridge.user_id === userId && bridge.factor_id === factorId) bridge = null;
        return Promise.resolve();
      },
    },
    webauthn: {
      registrationOptions: () => Promise.resolve({ challenge: `reg-${challenges.length}`, rp: { id: 'localhost' } }),
      verifyRegistration: ({ response, expectedChallenge, expectedOrigin, expectedRPID }) => {
        const r = response as { id: string; challenge: string; origin: string };
        const ok = r.challenge === expectedChallenge && r.origin === expectedOrigin && expectedRPID === 'localhost';
        return Promise.resolve(
          ok
            ? { verified: true, credential: { id: r.id, publicKey: 'pk', counter: 0, transports: ['internal'] } }
            : { verified: false },
        );
      },
      authenticationOptions: ({ allow }) =>
        Promise.resolve({ challenge: `auth-${challenges.length}`, allowCredentials: allow }),
      verifyAuthentication: ({ response, expectedChallenge, credential }) => {
        const r = response as { challenge: string; counter: number };
        if (r.challenge !== expectedChallenge) return Promise.resolve({ verified: false, newCounter: 0 });
        if ((r.counter > 0 || credential.counter > 0) && r.counter <= credential.counter) throw new Error('counter');
        return Promise.resolve({ verified: true, newCounter: r.counter });
      },
    },
  };

  const call = async (body: Record<string, unknown>, aal = 'aal1', headers: Record<string, string> = {}) => {
    const response = await handleRequest(
      new Request('https://x.functions.supabase.co/admin-passkey', {
        method: 'POST',
        headers: {
          origin: ORIGIN,
          authorization: `Bearer ${token(aal)}`,
          'content-type': 'application/json',
          ...headers,
        },
        body: JSON.stringify(body),
      }),
      deps,
    );
    return { status: response.status, body: await response.json(), headers: response.headers };
  };

  /** Registers a passkey at aal2 the way the browser would. */
  const register = async (credentialId = 'cred-1', name = 'MacBook') => {
    const options = await call({ action: 'register-options' }, 'aal2');
    return call({
      action: 'register-verify',
      challengeId: options.body.data.challengeId,
      device_name: name,
      response: { id: credentialId, challenge: options.body.data.options.challenge, origin: ORIGIN },
    }, 'aal2');
  };

  return {
    deps,
    call,
    register,
    factors,
    challenges,
    passkeys,
    bridge: () => bridge,
    setBridge: (row: (BridgeRow & { user_id: string }) | null) => {
      bridge = row;
    },
    authCalls,
    enrolledNames,
    logs,
  };
}

Deno.test('preflight and origin: allowed origins get CORS, others are refused', async () => {
  const { deps } = setup();
  const preflight = await handleRequest(
    new Request('https://x/admin-passkey', { method: 'OPTIONS', headers: { origin: ORIGIN } }),
    deps,
  );
  assertEquals(preflight.status, 204);
  assertEquals(preflight.headers.get('access-control-allow-origin'), ORIGIN);
  const foreign = await handleRequest(
    new Request('https://x/admin-passkey', { method: 'POST', headers: { origin: 'https://evil.example' }, body: '{}' }),
    deps,
  );
  assertEquals(foreign.status, 403);
  assertEquals(foreign.headers.get('access-control-allow-origin'), null);
});

Deno.test('callers without a valid admin token are refused', async () => {
  const t = setup();
  const noToken = await t.call({ action: 'status' }, 'aal1', { authorization: '' });
  assertEquals(noToken.status, 401);
  const stranger = await handleRequest(
    new Request('https://x/admin-passkey', {
      method: 'POST',
      headers: { origin: ORIGIN, authorization: `Bearer ${token('aal2', 'someone-else')}` },
      body: '{"action":"status"}',
    }),
    t.deps,
  );
  assertEquals(stranger.status, 401);
  const notAdmin = setup({ admin: false });
  assertEquals((await notAdmin.call({ action: 'status' })).status, 403);
  assertEquals((await t.call({ action: 'nonsense' })).status, 400);
});

Deno.test('status says false until a passkey and a working bridge exist', async () => {
  const t = setup();
  assertEquals((await t.call({ action: 'status' })).body, {
    success: true,
    data: { available: false, bridgeFactorId: null, passkeyCount: 0 },
  });
  await t.register();
  assertEquals((await t.call({ action: 'status' })).body.data, {
    available: true,
    bridgeFactorId: 'bridge-factor',
    passkeyCount: 1,
  });
});

Deno.test('registration needs level 2 and a sensible device name', async () => {
  const t = setup();
  assertEquals((await t.call({ action: 'register-options' }, 'aal1')).body.code, 'insufficient_aal');
  const options = await t.call({ action: 'register-options' }, 'aal2');
  const bad = await t.call({
    action: 'register-verify',
    challengeId: options.body.data.challengeId,
    device_name: '   ',
    response: { id: 'x' },
  }, 'aal2');
  assertEquals(bad.status, 400);
  assertEquals(bad.body.code, 'bad_device_name');
});

Deno.test('first registration creates, stores encrypted and verifies the bridge factor, then returns the session', async () => {
  const t = setup();
  const result = await t.register();
  assertEquals(result.status, 200);
  assertEquals(result.body.data.session, { access_token: 'new-access', refresh_token: 'new-refresh' });
  assertEquals(t.authCalls, ['enroll', 'challenge:bridge-factor', 'verify:bridge-factor']);
  assertMatch(t.enrolledNames[0], BRIDGE_NAME);
  const stored = t.bridge();
  assert(stored);
  assertEquals(stored.factor_id, 'bridge-factor');
  assertFalse(stored.secret_ciphertext.includes(BRIDGE_SECRET), 'the secret is stored encrypted');
  assertEquals(t.factors.find((factor) => factor.id === 'bridge-factor')?.status, 'verified');
  assertEquals(t.passkeys.length, 1);
  assertEquals(t.passkeys[0].device_name, 'MacBook');

  // A second device reuses the bridge and needs no new session.
  const second = await t.register('cred-2', 'Galaxy S25 Ultra');
  assertEquals(second.body.data.session, null);
  assertEquals(t.authCalls.filter((call) => call.startsWith('enroll')).length, 1);
});

Deno.test('a registration challenge is single use and a duplicate credential is refused', async () => {
  const t = setup();
  const options = await t.call({ action: 'register-options' }, 'aal2');
  const body = {
    action: 'register-verify',
    challengeId: options.body.data.challengeId,
    device_name: 'Mac',
    response: { id: 'cred-1', challenge: options.body.data.options.challenge, origin: ORIGIN },
  };
  assertEquals((await t.call(body, 'aal2')).status, 200);
  const replay = await t.call(body, 'aal2');
  assertEquals(replay.body.code, 'challenge_invalid');
  assertEquals((await t.register('cred-1')).body.code, 'already_registered');
});

Deno.test('a failed bridge verify rolls back the half-made factor and stores nothing', async () => {
  const t = setup({ codeAccepted: () => false });
  const result = await t.register();
  assertEquals(result.status, 503);
  assertEquals(result.body.code, 'try_again');
  assertEquals(t.bridge(), null);
  assertEquals(t.passkeys.length, 0);
  assertFalse(t.factors.some((factor) => factor.id === 'bridge-factor'));
  assert(t.authCalls.includes('unenroll:bridge-factor'));
});

Deno.test('passkey sign-in completes the bridge factor and returns only the two tokens', async () => {
  const t = setup();
  await t.register();
  const options = await t.call({ action: 'auth-options' });
  assertEquals(options.status, 200);
  assertEquals(options.body.data.options.allowCredentials, [{ id: 'cred-1', transports: ['internal'] }]);
  const signedIn = await t.call({
    action: 'auth-verify',
    challengeId: options.body.data.challengeId,
    response: { id: 'cred-1', challenge: options.body.data.options.challenge, counter: 3 },
  });
  assertEquals(signedIn.status, 200);
  assertEquals(signedIn.body.data, { access_token: 'new-access', refresh_token: 'new-refresh' });
  assertEquals(t.passkeys[0].sign_count, 3);
  assertEquals(t.passkeys[0].last_used_at, NOW.toISOString());
  // challenge and verify ran back to back in this invocation
  assertEquals(t.authCalls.slice(-2), ['challenge:bridge-factor', 'verify:bridge-factor']);
});

Deno.test('sign-in retries once with the next step when Auth refuses the current code', async () => {
  const currentStep = Math.floor(NOW.getTime() / 30000);
  const t = setup({ codeAccepted: (_code, step) => step !== currentStep });
  await t.register();
  const options = await t.call({ action: 'auth-options' });
  const before = t.authCalls.length;
  const signedIn = await t.call({
    action: 'auth-verify',
    challengeId: options.body.data.challengeId,
    response: { id: 'cred-1', challenge: options.body.data.options.challenge, counter: 1 },
  });
  assertEquals(signedIn.status, 200);
  assertEquals(t.authCalls.slice(before).length, 4); // two challenge and verify pairs
});

Deno.test('sign-in refuses a consumed challenge, a foreign credential and a counter that went backwards', async () => {
  const t = setup();
  await t.register();
  const options = await t.call({ action: 'auth-options' });
  const good = { id: 'cred-1', challenge: options.body.data.options.challenge, counter: 5 };
  assertEquals(
    (await t.call({ action: 'auth-verify', challengeId: options.body.data.challengeId, response: good })).status,
    200,
  );
  const replay = await t.call({ action: 'auth-verify', challengeId: options.body.data.challengeId, response: good });
  assertEquals(replay.body.code, 'challenge_invalid');

  const second = await t.call({ action: 'auth-options' });
  const foreign = await t.call({
    action: 'auth-verify',
    challengeId: second.body.data.challengeId,
    response: { id: 'someone-elses', challenge: second.body.data.options.challenge, counter: 9 },
  });
  assertEquals(foreign.body.code, 'verification_failed');

  const third = await t.call({ action: 'auth-options' });
  const cloned = await t.call({
    action: 'auth-verify',
    challengeId: third.body.data.challengeId,
    response: { id: 'cred-1', challenge: third.body.data.options.challenge, counter: 4 },
  });
  assertEquals(cloned.body.code, 'verification_failed');
  assertEquals(t.passkeys[0].sign_count, 5);
});

Deno.test('an expired sign-in challenge is refused', async () => {
  const t = setup();
  await t.register();
  const options = await t.call({ action: 'auth-options' });
  const row = t.challenges.find((item) => item.id === options.body.data.challengeId);
  if (row) row.expires_at = NOW.toISOString();
  const late = await t.call({
    action: 'auth-verify',
    challengeId: options.body.data.challengeId,
    response: { id: 'cred-1', challenge: options.body.data.options.challenge, counter: 1 },
  });
  assertEquals(late.body.code, 'challenge_invalid');
});

Deno.test('sign-in actions are only for a level-1 session with a second factor pending', async () => {
  const t = setup();
  await t.register();
  assertEquals((await t.call({ action: 'auth-options' }, 'aal2')).body.code, 'not_pending');
  const none = setup({ factors: [] });
  assertEquals((await none.call({ action: 'auth-options' })).status, 403);
  const empty = setup();
  assertEquals((await empty.call({ action: 'auth-options' })).body.code, 'no_passkey');
});

Deno.test('more than ten challenges in fifteen minutes is refused with 429', async () => {
  const t = setup();
  for (let index = 0; index < RATE_LIMIT_MAX; index += 1) {
    assertEquals((await t.call({ action: 'register-options' }, 'aal2')).status, 200);
  }
  const limited = await t.call({ action: 'register-options' }, 'aal2');
  assertEquals(limited.status, 429);
  assertEquals(limited.body.code, 'rate_limited');
  assertEquals(t.challenges.length, RATE_LIMIT_MAX, 'a refused request stores nothing');
});

Deno.test('concurrent requests cannot overshoot the limit', async () => {
  const t = setup();
  await t.register();
  const results = await Promise.all(
    Array.from({ length: RATE_LIMIT_MAX + 5 }, () => t.call({ action: 'auth-options' })),
  );
  const issued = results.filter((result) => result.status === 200).length;
  // register-options already used one challenge in this window
  assertEquals(issued, RATE_LIMIT_MAX - 1);
  assert(results.every((result) => result.status === 200 || result.body.code === 'rate_limited'));
  assertEquals(t.challenges.length, RATE_LIMIT_MAX);
});

Deno.test('a missing bridge key reads as not switched on, and nothing secret is logged', async () => {
  const t = setup();
  delete t.deps.env.PASSKEY_BRIDGE_KEY;
  const result = await t.register();
  assertEquals(result.status, 503);
  assertEquals(result.body.code, 'not_configured');
  for (const line of t.logs) {
    assertFalse(line.includes(BRIDGE_SECRET));
    assertFalse(line.includes('reg-'));
  }
});

Deno.test('removing the last passkey unenrolls the bridge factor and deletes its row', async () => {
  const t = setup();
  await t.register('cred-1');
  await t.register('cred-2', 'Phone');
  assertEquals((await t.call({ action: 'remove', id: t.passkeys[0].id }, 'aal1')).body.code, 'insufficient_aal');
  const first = await t.call({ action: 'remove', id: t.passkeys[0].id }, 'aal2');
  assertEquals(first.body.data.bridgeRemoved, false);
  assert(t.bridge());
  const last = await t.call({ action: 'remove', id: t.passkeys[0].id }, 'aal2');
  assertEquals(last.body.data.bridgeRemoved, true);
  assertEquals(t.bridge(), null);
  assertFalse(t.factors.some((factor) => factor.id === 'bridge-factor'));
  assertEquals((await t.call({ action: 'remove', id: '00000000-0000-4000-8000-000000000999' }, 'aal2')).status, 404);
});

Deno.test('without PASSKEY_ALLOWED_ORIGINS every request is refused, even from the site', async () => {
  const t = setup({ env: { PASSKEY_BRIDGE_KEY: WRAP_KEY, PASSKEY_ALLOW_LOCALHOST: '1' } });
  for (const origin of [SITE, ORIGIN]) {
    const result = await t.call({ action: 'status' }, 'aal1', { origin });
    assertEquals(result.status, 403);
    assertEquals(result.body.code, 'origin_not_allowed');
  }
});

Deno.test('localhost is refused at every action unless PASSKEY_ALLOW_LOCALHOST=1', async () => {
  const t = setup({ env: { PASSKEY_BRIDGE_KEY: WRAP_KEY, PASSKEY_ALLOWED_ORIGINS: ORIGINS } });
  const preflight = await handleRequest(
    new Request('https://x/admin-passkey', { method: 'OPTIONS', headers: { origin: ORIGIN } }),
    t.deps,
  );
  assertEquals(preflight.status, 403);
  for (const action of ['status', 'register-options', 'register-verify', 'auth-options', 'auth-verify', 'remove']) {
    const result = await t.call({ action }, 'aal2');
    assertEquals(result.status, 403, action);
    assertEquals(result.body.code, 'origin_not_allowed', action);
  }
  // The site itself still answers.
  assertEquals((await t.call({ action: 'status' }, 'aal1', { origin: SITE })).status, 200);
});

Deno.test('with the switch off a localhost credential cannot be used or removed from the site', async () => {
  const t = setup();
  await t.register('cred-local');
  assertEquals(t.passkeys[0].rp_id, 'localhost');
  delete t.deps.env.PASSKEY_ALLOW_LOCALHOST;
  // Sign-in from the site: the localhost credential is not offered or accepted.
  assertEquals((await t.call({ action: 'auth-options' }, 'aal1', { origin: SITE })).body.code, 'no_passkey');
  const removal = await t.call({ action: 'remove', id: t.passkeys[0].id }, 'aal2', { origin: SITE });
  assertEquals(removal.status, 404);
  assertEquals(t.passkeys.length, 1);
});

Deno.test('a credential row for another relying party is never accepted', async () => {
  const t = setup();
  await t.register('cred-1');
  const options = await t.call({ action: 'auth-options' });
  // A faulty store that ignores the site filter.
  const row = t.passkeys[0];
  t.deps.store!.findPasskey = () => Promise.resolve({ ...row, rp_id: 'raunakchoudhary.com' });
  const result = await t.call({
    action: 'auth-verify',
    challengeId: options.body.data.challengeId,
    response: { id: 'cred-1', challenge: options.body.data.options.challenge, counter: 2 },
  });
  assertEquals(result.body.code, 'verification_failed');
});

Deno.test('a broken bridge is replaced by its recorded id only; a look-alike factor is never touched', async () => {
  const lookAlike = { id: 'user-factor', friendly_name: 'Passkey bridge', factor_type: 'totp', status: 'verified' };
  const t = setup({
    factors: [
      { id: 'totp-phone', friendly_name: 'Primary authenticator', factor_type: 'totp', status: 'verified' },
      lookAlike,
    ],
  });
  await t.register('cred-1');
  // The bridge factor drops back to unverified (for example after an Auth reset).
  const first = t.factors.find((factor) => factor.id === 'bridge-factor');
  assert(first);
  first.status = 'unverified';

  const again = await t.register('cred-2', 'Phone');
  assertEquals(again.status, 200);
  assert(t.authCalls.includes('unenroll:bridge-factor'), 'the recorded factor is retired');
  assertFalse(t.authCalls.includes('unenroll:user-factor'), 'a factor is never removed by its name');
  assert(t.factors.includes(lookAlike));
  assertEquals(t.bridge()?.factor_id, 'bridge-factor-2');
  assertEquals(t.enrolledNames.length, 2);
  assertNotEquals(t.enrolledNames[0], t.enrolledNames[1]);
  for (const name of t.enrolledNames) assertMatch(name, BRIDGE_NAME);
});

Deno.test('a recorded bridge whose factor is already gone is cleared without an unenroll call', async () => {
  const t = setup();
  t.setBridge({ user_id: USER_ID, factor_id: 'vanished-factor', secret_ciphertext: 'x' });
  const result = await t.register();
  assertEquals(result.status, 200);
  assertFalse(t.authCalls.some((call) => call.startsWith('unenroll')));
  assertEquals(t.bridge()?.factor_id, 'bridge-factor');
});

Deno.test('losing a registration race rolls back only this request and keeps the winner intact', async () => {
  const t = setup();
  const winner = { user_id: USER_ID, factor_id: 'winner-factor', secret_ciphertext: 'winner-secret' };
  // A parallel registration records its bridge while this one is enrolling.
  const enroll = t.deps.auth.enrollTotp;
  t.deps.auth.enrollTotp = async (bearer, name) => {
    const result = await enroll(bearer, name);
    t.setBridge({ ...winner });
    return result;
  };
  const result = await t.register();
  assertEquals(result.status, 409);
  assertEquals(result.body.code, 'try_again');
  assertEquals(t.bridge(), winner, "the other request's row is untouched");
  assert(t.authCalls.includes('unenroll:bridge-factor'), 'our own half-made factor is removed');
  assertEquals(t.passkeys.length, 0);
});

Deno.test('rollback and removal delete the bridge row by its factor id, never by user alone', async () => {
  const t = setup({ codeAccepted: () => false });
  const deletes: Array<[string, string]> = [];
  const store = t.deps.store!;
  const original = store.deleteBridge;
  store.deleteBridge = (userId, factorId) => {
    deletes.push([userId, factorId]);
    return original(userId, factorId);
  };
  await t.register();
  assertEquals(deletes, [[USER_ID, 'bridge-factor']]);
});
