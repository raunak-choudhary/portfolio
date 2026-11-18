// supabase/functions/admin-passkey/index.ts
//
// Entry point: wires the passkey bridge handler to Supabase Auth's REST API
// (always with the caller's own access token), to the three passkey tables
// through the service key (never exposed to the browser), and to
// @simplewebauthn/server. See handler.ts for the flow and its rules.
//
// Configuration:
//   SUPABASE_URL, SUPABASE_SECRET_KEYS, SUPABASE_PUBLISHABLE_KEYS  injected
//   PASSKEY_BRIDGE_KEY        32 random bytes, base64; encrypts the bridge secret
//   PASSKEY_ALLOWED_ORIGINS   comma list; required, every request is refused without it
//   PASSKEY_ALLOW_LOCALHOST   "1" lets http://localhost:3000 through (temporary, pre-deploy)
// Deploy with gateway JWT verification off (supabase/config.toml): the
// handler verifies the bearer token with Auth itself.

import { createClient } from 'npm:@supabase/supabase-js@2.106.2';
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from 'npm:@simplewebauthn/server@14.0.3';
import { acceptedPublicKeys, selectServiceKey } from '../send-contact-email/lib.ts';
import { type AuthApi, type AuthResult, handleRequest, type Store, type WebAuthnApi } from './handler.ts';
import { fromBase64Url, toBase64Url } from './lib.ts';

const env = Deno.env.toObject();
const serviceKey = selectServiceKey(env);
const publicKey = acceptedPublicKeys(env).values().next().value as string | undefined;
const authUrl = `${env.SUPABASE_URL}/auth/v1`;
const db = serviceKey && env.SUPABASE_URL
  ? createClient(env.SUPABASE_URL, serviceKey.key, { auth: { persistSession: false, autoRefreshToken: false } })
  : null;

const RP_NAME = 'RC Portfolio Admin';
const REGISTER_TIMEOUT_MS = 5 * 60 * 1000;
const AUTH_TIMEOUT_MS = 2 * 60 * 1000;

/** One call to Auth as the user. Auth's error code is kept; its message is not. */
async function callAuth<T>(method: string, path: string, token: string, body?: unknown): Promise<AuthResult<T>> {
  const response = await fetch(`${authUrl}${path}`, {
    method,
    headers: {
      apikey: publicKey ?? '',
      Authorization: `Bearer ${token}`,
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const code = typeof payload?.error_code === 'string'
      ? payload.error_code
      : typeof payload?.code === 'string'
      ? payload.code
      : undefined;
    return { ok: false, status: response.status, code };
  }
  return { ok: true, data: payload as T };
}

const auth: AuthApi = {
  getUser: async (token) => {
    const result = await callAuth<Record<string, unknown>>('GET', '/user', token);
    if (!result.ok || typeof result.data.id !== 'string') return null;
    const factors = Array.isArray(result.data.factors) ? result.data.factors : [];
    return {
      id: result.data.id,
      email: typeof result.data.email === 'string' ? result.data.email : null,
      isAnonymous: result.data.is_anonymous === true,
      factors: factors.map((factor: Record<string, unknown>) => ({
        id: String(factor.id),
        friendly_name: typeof factor.friendly_name === 'string' ? factor.friendly_name : undefined,
        factor_type: String(factor.factor_type),
        status: String(factor.status),
      })),
    };
  },
  enrollTotp: async (token, friendlyName) => {
    const result = await callAuth<{ id: string; totp?: { secret?: string } }>('POST', '/factors', token, {
      factor_type: 'totp',
      friendly_name: friendlyName,
      issuer: RP_NAME,
    });
    if (!result.ok) return result;
    if (!result.data.id || !result.data.totp?.secret) return { ok: false, status: 502 };
    return { ok: true, data: { factorId: result.data.id, secret: result.data.totp.secret } };
  },
  challenge: async (token, factorId) => {
    const result = await callAuth<{ id: string }>(
      'POST',
      `/factors/${encodeURIComponent(factorId)}/challenge`,
      token,
      {},
    );
    return result.ok ? { ok: true, data: { challengeId: result.data.id } } : result;
  },
  verify: async (token, factorId, challengeId, code) => {
    const result = await callAuth<{ access_token: string; refresh_token: string }>(
      'POST',
      `/factors/${encodeURIComponent(factorId)}/verify`,
      token,
      { challenge_id: challengeId, code },
    );
    if (!result.ok) return result;
    if (!result.data.access_token || !result.data.refresh_token) return { ok: false, status: 502 };
    return { ok: true, data: { access_token: result.data.access_token, refresh_token: result.data.refresh_token } };
  },
  unenroll: (token, factorId) => callAuth('DELETE', `/factors/${encodeURIComponent(factorId)}`, token),
};

const PASSKEY_COLUMNS = 'id, user_id, credential_id, public_key, sign_count, transports, rp_id';

/** Supabase errors are rethrown as plain errors so the handler logs only the class. */
const must = <T>(result: { data: T; error: unknown }): T => {
  if (result.error) throw new Error('database');
  return result.data;
};

const store: Store | null = db
  ? {
    // Same rule as app_private.is_admin_identity(): an active admin_users row
    // whose address matches, compared without case. The table holds one row.
    isAdminEmail: async (email) => {
      const rows = must(await db.from('admin_users').select('email').eq('is_active', true).not('email', 'is', null));
      return Array.isArray(rows) && rows.some((row) => String(row.email).toLowerCase() === email.toLowerCase());
    },
    countChallengesSince: async (userId, sinceIso) => {
      const { count, error } = await db.from('admin_passkey_challenges').select('id', { count: 'exact', head: true })
        .eq('user_id', userId).gte('created_at', sinceIso);
      if (error) throw new Error('database');
      return count ?? 0;
    },
    insertChallenge: async (row) => {
      // Old rows for this user are of no further use; clear them as we go.
      await db.from('admin_passkey_challenges').delete().eq('user_id', row.user_id)
        .lt('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());
      const inserted = must(await db.from('admin_passkey_challenges').insert(row).select('id').single());
      if (!inserted?.id) throw new Error('database');
      return inserted.id as string;
    },
    consumeChallenge: async (id, userId, kind, rpId, nowIso) => {
      // One conditional UPDATE: a second caller with the same id finds
      // used_at already set and gets no row back.
      const row = must(
        await db.from('admin_passkey_challenges').update({ used_at: nowIso }).eq('id', id).eq('user_id', userId)
          .eq('kind', kind).eq('rp_id', rpId).is('used_at', null).gt('expires_at', nowIso).select('challenge')
          .maybeSingle(),
      );
      return row?.challenge ?? null;
    },
    listPasskeys: async (userId, rpId) =>
      must(await db.from('admin_passkeys').select(PASSKEY_COLUMNS).eq('user_id', userId).eq('rp_id', rpId)) ?? [],
    countAllPasskeys: async (userId) => {
      const { count, error } = await db.from('admin_passkeys').select('id', { count: 'exact', head: true }).eq(
        'user_id',
        userId,
      );
      if (error) throw new Error('database');
      return count ?? 0;
    },
    findPasskey: async (credentialId, userId, rpId) =>
      must(
        await db.from('admin_passkeys').select(PASSKEY_COLUMNS).eq('credential_id', credentialId).eq('user_id', userId)
          .eq('rp_id', rpId).maybeSingle(),
      ),
    insertPasskey: async (row) => {
      const { data, error } = await db.from('admin_passkeys').insert(row).select('id').single();
      if (error?.code === '23505') return { duplicate: true };
      if (error) throw new Error('database');
      return { id: data.id as string };
    },
    updatePasskeyUse: async (id, signCount, lastUsedIso) => {
      must(await db.from('admin_passkeys').update({ sign_count: signCount, last_used_at: lastUsedIso }).eq('id', id));
    },
    deletePasskey: async (id, userId, refuseRpId) => {
      let query = db.from('admin_passkeys').delete().eq('id', id).eq('user_id', userId);
      if (refuseRpId) query = query.neq('rp_id', refuseRpId);
      const rows = must(await query.select('id'));
      return Array.isArray(rows) && rows.length > 0;
    },
    getBridge: async (userId) =>
      must(
        await db.from('admin_passkey_bridge').select('factor_id, secret_ciphertext').eq('user_id', userId)
          .maybeSingle(),
      ),
    insertBridge: async (row) => {
      must(await db.from('admin_passkey_bridge').insert(row));
    },
    deleteBridge: async (userId) => {
      must(await db.from('admin_passkey_bridge').delete().eq('user_id', userId));
    },
  }
  : null;

const webauthn: WebAuthnApi = {
  registrationOptions: ({ rpId, userId, userName, exclude }) =>
    generateRegistrationOptions({
      rpName: RP_NAME,
      rpID: rpId,
      userName,
      userID: new TextEncoder().encode(userId),
      userDisplayName: userName,
      timeout: REGISTER_TIMEOUT_MS,
      attestationType: 'none',
      excludeCredentials: exclude,
      authenticatorSelection: { residentKey: 'preferred', userVerification: 'required' },
    }) as never,
  verifyRegistration: async ({ response, expectedChallenge, expectedOrigin, expectedRPID }) => {
    const result = await verifyRegistrationResponse({
      response: response as never,
      expectedChallenge,
      expectedOrigin,
      expectedRPID,
      requireUserVerification: true,
    });
    if (!result.verified) return { verified: false };
    const { credential } = result.registrationInfo;
    return {
      verified: true,
      credential: {
        id: credential.id,
        publicKey: toBase64Url(credential.publicKey),
        counter: credential.counter,
        transports: credential.transports,
      },
    };
  },
  authenticationOptions: ({ rpId, allow }) =>
    generateAuthenticationOptions({
      rpID: rpId,
      allowCredentials: allow,
      userVerification: 'required',
      timeout: AUTH_TIMEOUT_MS,
    }) as never,
  verifyAuthentication: async ({ response, expectedChallenge, expectedOrigin, expectedRPID, credential }) => {
    const result = await verifyAuthenticationResponse({
      response: response as never,
      expectedChallenge,
      expectedOrigin,
      expectedRPID,
      requireUserVerification: true,
      credential: {
        id: credential.id,
        publicKey: fromBase64Url(credential.publicKey),
        counter: credential.counter,
        transports: credential.transports as never,
      },
    });
    return { verified: result.verified, newCounter: result.authenticationInfo.newCounter };
  },
};

Deno.serve((request) => handleRequest(request, { env, auth, store, webauthn }));
