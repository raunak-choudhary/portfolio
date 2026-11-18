// supabase/functions/admin-passkey/handler.ts
//
// The passkey bridge. Supabase Auth offers TOTP and phone as MFA factors, so
// a passkey reaches assurance level 2 through a TOTP factor named "Passkey
// bridge" whose secret never leaves the server: this function verifies a
// WebAuthn assertion, then runs the MFA challenge and verify for that factor
// with the caller's own access token, back to back in one invocation (Auth
// refuses a verify from a different IP than its challenge). The six-digit
// code exists only here.
//
// Actions (POST JSON, field `action`):
//   status            any admin session: { available } for this site
//   register-options  aal2: WebAuthn creation options
//   register-verify   aal2: stores the credential; creates the bridge factor
//                     the first time and returns the upgraded session
//   auth-options      aal1 with a second factor pending: request options
//   auth-verify       aal1: checks the assertion, completes the bridge factor,
//                     returns { access_token, refresh_token }
//   remove            aal2: deletes a passkey; with the last one goes the
//                     bridge factor
//
// Every action re-reads the user from Auth with the bearer token, checks the
// admin list, and takes the assurance level from that verified token. The
// relying party comes from the allow-listed Origin header, never the body.
// Secrets, codes, tokens and challenges are never logged; errors are fixed
// sentences with a short code the client maps to its own words.
//
// Network, database and WebAuthn library calls are injected (HandlerDeps) so
// the flow is unit tested without any of them; index.ts wires the real ones.

import { corsHeadersFor } from '../send-contact-email/lib.ts';
import {
  AUTH_CHALLENGE_TTL_MS,
  BRIDGE_FACTOR_NAME,
  cleanDeviceName,
  importWrapKey,
  isRateLimited,
  isUuid,
  MAX_BODY_BYTES,
  passkeyOriginsFrom,
  rateWindowStart,
  readClaims,
  REGISTER_CHALLENGE_TTL_MS,
  relyingPartyFor,
  totpCode,
  unwrapSecret,
  wrapSecret,
} from './lib.ts';

export interface AuthFactor {
  id: string;
  friendly_name?: string;
  factor_type: string;
  status: string;
}

export interface AuthUser {
  id: string;
  email: string | null;
  isAnonymous: boolean;
  factors: AuthFactor[];
}

export interface Session {
  access_token: string;
  refresh_token: string;
}

/** Result of an Auth REST call: data, or the HTTP status and Auth's error code. */
export type AuthResult<T> = { ok: true; data: T } | { ok: false; status: number; code?: string };

export interface AuthApi {
  getUser(token: string): Promise<AuthUser | null>;
  enrollTotp(token: string, friendlyName: string): Promise<AuthResult<{ factorId: string; secret: string }>>;
  challenge(token: string, factorId: string): Promise<AuthResult<{ challengeId: string }>>;
  verify(token: string, factorId: string, challengeId: string, code: string): Promise<AuthResult<Session>>;
  unenroll(token: string, factorId: string): Promise<AuthResult<unknown>>;
}

export interface PasskeyRow {
  id: string;
  user_id: string;
  credential_id: string;
  public_key: string;
  sign_count: number;
  transports: string[] | null;
  rp_id: string;
}

export interface NewPasskey {
  user_id: string;
  credential_id: string;
  public_key: string;
  sign_count: number;
  transports: string[] | null;
  device_name: string;
  rp_id: string;
}

export interface BridgeRow {
  factor_id: string;
  secret_ciphertext: string;
}

export interface Store {
  isAdminEmail(email: string): Promise<boolean>;
  countChallengesSince(userId: string, sinceIso: string): Promise<number>;
  insertChallenge(
    row: { user_id: string; kind: string; challenge: string; rp_id: string; expires_at: string },
  ): Promise<string>;
  /** Marks the challenge used if it is this user's, of this kind and site, unused and unexpired; returns its text, else null. Atomic. */
  consumeChallenge(id: string, userId: string, kind: string, rpId: string, nowIso: string): Promise<string | null>;
  listPasskeys(userId: string, rpId: string): Promise<PasskeyRow[]>;
  countAllPasskeys(userId: string): Promise<number>;
  findPasskey(credentialId: string, userId: string, rpId: string): Promise<PasskeyRow | null>;
  /** Inserts a credential; `duplicate` when the credential id already exists. */
  insertPasskey(row: NewPasskey): Promise<{ id: string } | { duplicate: true }>;
  updatePasskeyUse(id: string, signCount: number, lastUsedIso: string): Promise<void>;
  deletePasskey(id: string, userId: string): Promise<boolean>;
  getBridge(userId: string): Promise<BridgeRow | null>;
  insertBridge(row: { user_id: string; factor_id: string; secret_ciphertext: string }): Promise<void>;
  deleteBridge(userId: string): Promise<void>;
}

/** A credential as the registration check reports it; publicKey in base64url (COSE). */
export interface VerifiedCredential {
  id: string;
  publicKey: string;
  counter: number;
  transports?: string[];
}

export interface WebAuthnApi {
  registrationOptions(input: {
    rpId: string;
    userId: string;
    userName: string;
    exclude: Array<{ id: string; transports?: string[] }>;
  }): Promise<{ challenge: string } & Record<string, unknown>>;
  /** Throws or returns verified false when the response does not check out. */
  verifyRegistration(input: {
    response: unknown;
    expectedChallenge: string;
    expectedOrigin: string;
    expectedRPID: string;
  }): Promise<{ verified: boolean; credential?: VerifiedCredential }>;
  authenticationOptions(input: {
    rpId: string;
    allow: Array<{ id: string; transports?: string[] }>;
  }): Promise<{ challenge: string } & Record<string, unknown>>;
  /** Throws (counter regression, bad signature, wrong origin) or returns verified false. */
  verifyAuthentication(input: {
    response: unknown;
    expectedChallenge: string;
    expectedOrigin: string;
    expectedRPID: string;
    credential: { id: string; publicKey: string; counter: number; transports?: string[] };
  }): Promise<{ verified: boolean; newCounter: number }>;
}

export interface HandlerDeps {
  env: Record<string, string | undefined>;
  auth: AuthApi;
  store: Store | null;
  webauthn: WebAuthnApi;
  now?: () => Date;
  log?: (message: string) => void;
}

/** Thrown inside an action to answer with a fixed status, code and sentence. */
class Refusal extends Error {
  constructor(readonly status: number, readonly code: string, message: string) {
    super(message);
  }
}

const refuse = (status: number, code: string, message: string) => new Refusal(status, code, message);

const MESSAGES = {
  unauthorized: 'Sign in again to continue.',
  forbidden: 'This action is not available.',
  needsAal2: 'Confirm your second factor first.',
  notPending: 'This session does not need a second factor.',
  badRequest: 'The request was not understood.',
  noPasskey: 'No passkey is registered for this site.',
  challenge: 'That passkey request expired. Try again.',
  verification: 'The passkey could not be verified.',
  duplicate: 'This passkey is already registered.',
  rateLimited: 'Too many passkey attempts. Wait a few minutes and try again.',
  notConfigured: 'Passkey sign-in is not switched on yet.',
  bridgeMissing: 'Passkey sign-in needs setting up again. Enter a code, then add this device on the Security screen.',
  tryAgain: 'The passkey worked but the sign-in could not finish. Try again in a few seconds.',
  notFound: 'That passkey no longer exists.',
  server: 'Something went wrong. Try again, or enter a code.',
};

/** Context shared by every action once the caller is known. */
interface Caller {
  token: string;
  user: AuthUser;
  aal: string;
  rp: { origin: string; rpId: string };
  body: Record<string, unknown>;
}

export async function handleRequest(request: Request, deps: HandlerDeps): Promise<Response> {
  const origin = request.headers.get('origin');
  const rp = relyingPartyFor(origin, passkeyOriginsFrom(deps.env.PASSKEY_ALLOWED_ORIGINS));
  const cors = rp ? corsHeadersFor(rp.origin, request.headers.get('access-control-request-headers')) : {};
  const reply = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...cors } });
  const fail = (status: number, code: string, message: string) =>
    reply(status, { success: false, code, error: message });

  if (request.method === 'OPTIONS') return new Response(null, { status: rp ? 204 : 403, headers: cors });
  if (!rp) return fail(403, 'origin_not_allowed', MESSAGES.forbidden);
  if (request.method !== 'POST') return fail(405, 'method_not_allowed', MESSAGES.badRequest);

  const log = deps.log ?? ((message: string) => console.error(message));
  let action = 'unknown';
  try {
    if (!deps.store) throw refuse(503, 'not_configured', MESSAGES.notConfigured);

    const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim() ?? '';
    const claims = token ? readClaims(token) : null;
    if (!claims) throw refuse(401, 'unauthorized', MESSAGES.unauthorized);

    if (Number(request.headers.get('content-length') ?? 0) > MAX_BODY_BYTES) {
      throw refuse(413, 'too_large', MESSAGES.badRequest);
    }
    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) throw refuse(413, 'too_large', MESSAGES.badRequest);
    let body: Record<string, unknown>;
    try {
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('not an object');
      body = parsed;
    } catch {
      throw refuse(400, 'bad_request', MESSAGES.badRequest);
    }
    action = typeof body.action === 'string' ? body.action.slice(0, 40) : 'unknown';

    // Auth checks the token's signature, expiry and session; only then are
    // its claims trusted.
    const user = await deps.auth.getUser(token);
    if (!user || claims.sub !== user.id) throw refuse(401, 'unauthorized', MESSAGES.unauthorized);
    if (user.isAnonymous || !user.email || !(await deps.store.isAdminEmail(user.email))) {
      throw refuse(403, 'forbidden', MESSAGES.forbidden);
    }
    const caller: Caller = { token, user, aal: String(claims.aal ?? 'aal1'), rp, body };

    switch (action) {
      case 'status':
        return reply(200, { success: true, data: await status(caller, deps) });
      case 'register-options':
        return reply(200, { success: true, data: await registerOptions(caller, deps) });
      case 'register-verify':
        return reply(200, { success: true, data: await registerVerify(caller, deps) });
      case 'auth-options':
        return reply(200, { success: true, data: await authOptions(caller, deps) });
      case 'auth-verify':
        return reply(200, { success: true, data: await authVerify(caller, deps) });
      case 'remove':
        return reply(200, { success: true, data: await remove(caller, deps) });
      default:
        throw refuse(400, 'bad_request', MESSAGES.badRequest);
    }
  } catch (thrown) {
    if (thrown instanceof Refusal) {
      if (thrown.status >= 500) log(`admin-passkey: ${action} refused with ${thrown.code}`);
      return fail(thrown.status, thrown.code, thrown.message);
    }
    // Only the error's class reaches the log; messages may quote input.
    log(`admin-passkey: ${action} failed (${thrown instanceof Error ? thrown.name : typeof thrown})`);
    return fail(500, 'server_error', MESSAGES.server);
  }
}

// ---------------------------------------------------------------------------
// Shared steps

const requireAal2 = (caller: Caller) => {
  if (caller.aal !== 'aal2') throw refuse(403, 'insufficient_aal', MESSAGES.needsAal2);
};

const verifiedFactors = (user: AuthUser) =>
  user.factors.filter((factor) => factor.status === 'verified' && factor.factor_type === 'totp');

const bridgeFactorOf = (user: AuthUser, factorId: string | undefined) =>
  factorId ? verifiedFactors(user).find((factor) => factor.id === factorId) : undefined;

/** Sign-in actions run only on a level-1 session that has a second factor to pass. */
const requirePendingSecondFactor = (caller: Caller) => {
  if (caller.aal === 'aal2') throw refuse(409, 'not_pending', MESSAGES.notPending);
  if (verifiedFactors(caller.user).length === 0) throw refuse(403, 'forbidden', MESSAGES.forbidden);
};

const nowOf = (deps: HandlerDeps) => (deps.now ?? (() => new Date()))();

async function issueChallenge(caller: Caller, deps: HandlerDeps, kind: 'register' | 'authenticate', challenge: string) {
  const store = deps.store as Store;
  const now = nowOf(deps);
  const ttl = kind === 'register' ? REGISTER_CHALLENGE_TTL_MS : AUTH_CHALLENGE_TTL_MS;
  return await store.insertChallenge({
    user_id: caller.user.id,
    kind,
    challenge,
    rp_id: caller.rp.rpId,
    expires_at: new Date(now.getTime() + ttl).toISOString(),
  });
}

async function enforceRateLimit(caller: Caller, deps: HandlerDeps) {
  const store = deps.store as Store;
  const recent = await store.countChallengesSince(caller.user.id, rateWindowStart(nowOf(deps)).toISOString());
  if (isRateLimited(recent)) throw refuse(429, 'rate_limited', MESSAGES.rateLimited);
}

/** Consumes the challenge named in the body before anything is verified, so it can never be replayed. */
async function takeChallenge(caller: Caller, deps: HandlerDeps, kind: 'register' | 'authenticate') {
  const id = caller.body.challengeId;
  if (!isUuid(id)) throw refuse(400, 'bad_request', MESSAGES.badRequest);
  const challenge = await (deps.store as Store).consumeChallenge(
    id,
    caller.user.id,
    kind,
    caller.rp.rpId,
    nowOf(deps).toISOString(),
  );
  if (!challenge) throw refuse(400, 'challenge_invalid', MESSAGES.challenge);
  return challenge;
}

const responseIdOf = (response: unknown) => {
  const id = (response as { id?: unknown } | null)?.id;
  if (typeof id !== 'string' || id.length < 1 || id.length > 1024 || !/^[A-Za-z0-9_-]+$/.test(id)) {
    throw refuse(400, 'bad_request', MESSAGES.badRequest);
  }
  return id;
};

async function wrapKey(deps: HandlerDeps) {
  try {
    return await importWrapKey(deps.env.PASSKEY_BRIDGE_KEY);
  } catch {
    throw refuse(503, 'not_configured', MESSAGES.notConfigured);
  }
}

/**
 * Passes the bridge factor: code for this step, challenge, verify, all within
 * this invocation. Auth accepts the neighbouring steps too, so a refusal is
 * retried once with the next step (a clock edge); a second refusal asks the
 * owner to try again shortly.
 */
async function completeBridge(token: string, factorId: string, secret: string, deps: HandlerDeps): Promise<Session> {
  for (const stepOffset of [0, 1]) {
    const code = await totpCode(secret, nowOf(deps).getTime(), { stepOffset });
    const challenge = await deps.auth.challenge(token, factorId);
    if (!challenge.ok) {
      if (challenge.status === 401) throw refuse(401, 'unauthorized', MESSAGES.unauthorized);
      if (challenge.status === 429) throw refuse(429, 'rate_limited', MESSAGES.rateLimited);
      throw refuse(502, 'bridge_challenge_failed', MESSAGES.tryAgain);
    }
    const verified = await deps.auth.verify(token, factorId, challenge.data.challengeId, code);
    if (verified.ok) return verified.data;
    if (verified.status === 401) throw refuse(401, 'unauthorized', MESSAGES.unauthorized);
    if (verified.status === 429) throw refuse(429, 'rate_limited', MESSAGES.rateLimited);
    if (verified.code !== 'mfa_verification_failed') {
      throw refuse(502, `bridge_${verified.code ?? 'verify_failed'}`.slice(0, 60), MESSAGES.tryAgain);
    }
  }
  throw refuse(503, 'try_again', MESSAGES.tryAgain);
}

// ---------------------------------------------------------------------------
// Actions

async function status(caller: Caller, deps: HandlerDeps) {
  const store = deps.store as Store;
  const [passkeys, bridge] = await Promise.all([
    store.listPasskeys(caller.user.id, caller.rp.rpId),
    store.getBridge(caller.user.id),
  ]);
  const available = passkeys.length > 0 && Boolean(bridgeFactorOf(caller.user, bridge?.factor_id));
  return { available };
}

async function registerOptions(caller: Caller, deps: HandlerDeps) {
  requireAal2(caller);
  await enforceRateLimit(caller, deps);
  const existing = await (deps.store as Store).listPasskeys(caller.user.id, caller.rp.rpId);
  const options = await deps.webauthn.registrationOptions({
    rpId: caller.rp.rpId,
    userId: caller.user.id,
    userName: caller.user.email as string,
    exclude: existing.map((row) => ({ id: row.credential_id, transports: row.transports ?? undefined })),
  });
  const challengeId = await issueChallenge(caller, deps, 'register', options.challenge);
  return { challengeId, options };
}

async function registerVerify(caller: Caller, deps: HandlerDeps) {
  requireAal2(caller);
  const store = deps.store as Store;
  const deviceName = cleanDeviceName(caller.body.device_name);
  if (!deviceName) throw refuse(400, 'bad_device_name', 'Give the device a name of 1 to 60 characters.');
  const key = await wrapKey(deps);
  responseIdOf(caller.body.response);
  const expectedChallenge = await takeChallenge(caller, deps, 'register');

  let result: Awaited<ReturnType<WebAuthnApi['verifyRegistration']>>;
  try {
    result = await deps.webauthn.verifyRegistration({
      response: caller.body.response,
      expectedChallenge,
      expectedOrigin: caller.rp.origin,
      expectedRPID: caller.rp.rpId,
    });
  } catch {
    throw refuse(400, 'verification_failed', MESSAGES.verification);
  }
  if (!result.verified || !result.credential) throw refuse(400, 'verification_failed', MESSAGES.verification);
  const credential = result.credential;

  // The bridge factor: reuse a healthy one, otherwise clear leftovers and make one.
  let session: Session | null = null;
  let createdFactorId: string | null = null;
  const bridge = await store.getBridge(caller.user.id);
  if (!bridgeFactorOf(caller.user, bridge?.factor_id)) {
    if (bridge) await store.deleteBridge(caller.user.id);
    for (const leftover of caller.user.factors.filter((factor) => factor.friendly_name === BRIDGE_FACTOR_NAME)) {
      await deps.auth.unenroll(caller.token, leftover.id);
    }
    const enrolled = await deps.auth.enrollTotp(caller.token, BRIDGE_FACTOR_NAME);
    if (!enrolled.ok) {
      throw enrolled.status === 401
        ? refuse(401, 'unauthorized', MESSAGES.unauthorized)
        : refuse(502, 'bridge_enroll_failed', MESSAGES.server);
    }
    createdFactorId = enrolled.data.factorId;
    try {
      await store.insertBridge({
        user_id: caller.user.id,
        factor_id: createdFactorId,
        secret_ciphertext: await wrapSecret(key, enrolled.data.secret, caller.user.id),
      });
      session = await completeBridge(caller.token, createdFactorId, enrolled.data.secret, deps);
    } catch (thrown) {
      await rollbackBridge(caller, deps, createdFactorId);
      throw thrown;
    }
  }

  let inserted: Awaited<ReturnType<Store['insertPasskey']>>;
  try {
    inserted = await store.insertPasskey({
      user_id: caller.user.id,
      credential_id: credential.id,
      public_key: credential.publicKey,
      sign_count: credential.counter,
      transports: credential.transports?.length ? credential.transports.slice(0, 8) : null,
      device_name: deviceName,
      rp_id: caller.rp.rpId,
    });
  } catch (thrown) {
    if (createdFactorId) await rollbackBridge(caller, deps, createdFactorId);
    throw thrown;
  }
  if ('duplicate' in inserted) {
    if (createdFactorId) await rollbackBridge(caller, deps, createdFactorId);
    throw refuse(409, 'already_registered', MESSAGES.duplicate);
  }
  // A new bridge factor upgrades the session in Auth; the browser adopts it.
  return { id: inserted.id, session };
}

/** Best effort: removes a half-made bridge so a later registration starts clean. */
async function rollbackBridge(caller: Caller, deps: HandlerDeps, factorId: string) {
  try {
    await deps.auth.unenroll(caller.token, factorId);
  } catch {
    // Leftover factors named "Passkey bridge" are cleared on the next registration.
  }
  try {
    await (deps.store as Store).deleteBridge(caller.user.id);
  } catch {
    // A row without its factor is detected and replaced on the next registration.
  }
}

async function authOptions(caller: Caller, deps: HandlerDeps) {
  requirePendingSecondFactor(caller);
  const store = deps.store as Store;
  const passkeys = await store.listPasskeys(caller.user.id, caller.rp.rpId);
  if (passkeys.length === 0) throw refuse(404, 'no_passkey', MESSAGES.noPasskey);
  await enforceRateLimit(caller, deps);
  const options = await deps.webauthn.authenticationOptions({
    rpId: caller.rp.rpId,
    allow: passkeys.map((row) => ({ id: row.credential_id, transports: row.transports ?? undefined })),
  });
  const challengeId = await issueChallenge(caller, deps, 'authenticate', options.challenge);
  return { challengeId, options };
}

async function authVerify(caller: Caller, deps: HandlerDeps) {
  requirePendingSecondFactor(caller);
  const store = deps.store as Store;
  const key = await wrapKey(deps);
  const credentialId = responseIdOf(caller.body.response);
  const expectedChallenge = await takeChallenge(caller, deps, 'authenticate');

  // The credential must be the caller's and registered for this site.
  const passkey = await store.findPasskey(credentialId, caller.user.id, caller.rp.rpId);
  if (!passkey) throw refuse(400, 'verification_failed', MESSAGES.verification);

  let result: Awaited<ReturnType<WebAuthnApi['verifyAuthentication']>>;
  try {
    result = await deps.webauthn.verifyAuthentication({
      response: caller.body.response,
      expectedChallenge,
      expectedOrigin: caller.rp.origin,
      expectedRPID: caller.rp.rpId,
      credential: {
        id: passkey.credential_id,
        publicKey: passkey.public_key,
        counter: Number(passkey.sign_count) || 0,
        transports: passkey.transports ?? undefined,
      },
    });
  } catch {
    throw refuse(400, 'verification_failed', MESSAGES.verification);
  }
  if (!result.verified) throw refuse(400, 'verification_failed', MESSAGES.verification);
  await store.updatePasskeyUse(passkey.id, result.newCounter, nowOf(deps).toISOString());

  const bridge = await store.getBridge(caller.user.id);
  if (!bridge || !bridgeFactorOf(caller.user, bridge.factor_id)) {
    throw refuse(409, 'bridge_missing', MESSAGES.bridgeMissing);
  }
  let secret: string;
  try {
    secret = await unwrapSecret(key, bridge.secret_ciphertext, caller.user.id);
  } catch {
    throw refuse(503, 'not_configured', MESSAGES.notConfigured);
  }
  const session = await completeBridge(caller.token, bridge.factor_id, secret, deps);
  return { access_token: session.access_token, refresh_token: session.refresh_token };
}

async function remove(caller: Caller, deps: HandlerDeps) {
  requireAal2(caller);
  const store = deps.store as Store;
  const id = caller.body.id;
  if (!isUuid(id)) throw refuse(400, 'bad_request', MESSAGES.badRequest);
  if (!(await store.deletePasskey(id, caller.user.id))) throw refuse(404, 'not_found', MESSAGES.notFound);

  // With the last passkey gone the bridge has no purpose; unenrol it so no
  // server-held factor outlives the passkeys. Auth then lowers sessions that
  // used it to level 1.
  let bridgeRemoved = false;
  if ((await store.countAllPasskeys(caller.user.id)) === 0) {
    const bridge = await store.getBridge(caller.user.id);
    if (bridge) {
      const unenrolled = await deps.auth.unenroll(caller.token, bridge.factor_id);
      if (!unenrolled.ok && unenrolled.status !== 404) throw refuse(502, 'bridge_unenroll_failed', MESSAGES.server);
      await store.deleteBridge(caller.user.id);
      bridgeRemoved = true;
    }
  }
  return { removed: id, bridgeRemoved };
}
