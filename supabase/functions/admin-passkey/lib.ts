// supabase/functions/admin-passkey/lib.ts
//
// Pure helpers for the passkey bridge: TOTP codes (RFC 6238), AES-256-GCM
// wrapping of the bridge secret, the origin to relying-party mapping, the
// challenge and rate-limit rules, and reading claims from an access token
// that Auth has already verified. Nothing here touches the network or the
// database, so every rule is unit tested. WebCrypto is used for HMAC and AES.

/** Friendly name of the server-held TOTP factor. The client hides it from typed-code lists. */
export const BRIDGE_FACTOR_NAME = 'Passkey bridge';

/** Registration challenges live five minutes, sign-in challenges two. */
export const REGISTER_CHALLENGE_TTL_MS = 5 * 60 * 1000;
export const AUTH_CHALLENGE_TTL_MS = 2 * 60 * 1000;

/** At most this many challenges per user in the rolling window. */
export const RATE_LIMIT_MAX = 10;
export const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;

/** Largest request body accepted. A WebAuthn response is a few kilobytes. */
export const MAX_BODY_BYTES = 32 * 1024;

/** Device labels: 1 to 60 characters after trimming, no control characters. */
export const DEVICE_NAME_MAX = 60;

/** TOTP parameters Supabase Auth uses for app authenticators. */
export const TOTP_STEP_SECONDS = 30;
export const TOTP_DIGITS = 6;

const encoder = new TextEncoder();

// ---------------------------------------------------------------------------
// Encoding

/** Bytes to unpadded base64url. */
export function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Base64url (padded or not) to bytes. Throws on characters outside the alphabet. */
export function fromBase64Url(text: string): Uint8Array<ArrayBuffer> {
  if (!/^[A-Za-z0-9_-]*={0,2}$/.test(text)) throw new Error('invalid base64url');
  const base64 = text.replace(/=+$/, '').replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

/** Standard base64 to bytes (the key format `openssl rand -base64 32` prints). */
export function fromBase64(text: string): Uint8Array<ArrayBuffer> {
  const binary = atob(text.trim());
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/** RFC 4648 base32 (the TOTP secret format) to bytes. Spaces and padding are ignored, case is folded. */
export function fromBase32(text: string): Uint8Array<ArrayBuffer> {
  const clean = text.replace(/[\s=]/g, '').toUpperCase();
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const char of clean) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index < 0) throw new Error('invalid base32');
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return new Uint8Array(out);
}

// ---------------------------------------------------------------------------
// TOTP (RFC 4226 HOTP over RFC 6238 time steps), HMAC-SHA1

/** HOTP value for a raw key and counter, zero-padded to `digits`. */
export async function hotp(key: Uint8Array<ArrayBuffer>, counter: number, digits = TOTP_DIGITS): Promise<string> {
  const message = new Uint8Array(8);
  // Counter as a big-endian 64-bit integer. Time-step counters fit in 53 bits.
  let rest = counter;
  for (let index = 7; index >= 0; index -= 1) {
    message[index] = rest % 256;
    rest = Math.floor(rest / 256);
  }
  const hmacKey = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', hmacKey, message));
  const offset = mac[mac.length - 1] & 0x0f;
  const binary = ((mac[offset] & 0x7f) << 24) | (mac[offset + 1] << 16) | (mac[offset + 2] << 8) | mac[offset + 3];
  return String(binary % 10 ** digits).padStart(digits, '0');
}

/** The time step that contains `timeMs`. */
export const timeStep = (timeMs: number, stepSeconds = TOTP_STEP_SECONDS) => Math.floor(timeMs / 1000 / stepSeconds);

/**
 * The TOTP code for a base32 secret at a moment. `stepOffset` moves to the
 * previous (-1) or next (+1) step, which Auth also accepts (skew 1).
 */
export async function totpCode(
  secretBase32: string,
  timeMs: number,
  { stepOffset = 0, digits = TOTP_DIGITS }: { stepOffset?: number; digits?: number } = {},
): Promise<string> {
  return await hotp(fromBase32(secretBase32), timeStep(timeMs) + stepOffset, digits);
}

// ---------------------------------------------------------------------------
// AES-256-GCM wrapping of the bridge secret

const CIPHERTEXT_VERSION = 'v1';

/** Imports the 32-byte key from its base64 form. Throws when the length is wrong. */
export async function importWrapKey(base64Key: string | undefined): Promise<CryptoKey> {
  if (!base64Key) throw new Error('wrap key missing');
  const raw = fromBase64(base64Key);
  if (raw.length !== 32) throw new Error('wrap key must be 32 bytes');
  return await crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

/**
 * Encrypts a secret. Output: "v1.<iv>.<ciphertext+tag>" in base64url, with a
 * fresh random 12-byte IV each time. The user id is bound in as additional
 * authenticated data, so a row copied to another user does not decrypt.
 */
export async function wrapSecret(key: CryptoKey, plaintext: string, userId: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const sealed = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv, additionalData: encoder.encode(userId) },
      key,
      encoder.encode(plaintext),
    ),
  );
  return `${CIPHERTEXT_VERSION}.${toBase64Url(iv)}.${toBase64Url(sealed)}`;
}

/** Reverses wrapSecret. Throws on any tampering, a wrong key or a wrong user. */
export async function unwrapSecret(key: CryptoKey, wrapped: string, userId: string): Promise<string> {
  const [version, ivText, sealedText, extra] = String(wrapped).split('.');
  if (version !== CIPHERTEXT_VERSION || !ivText || !sealedText || extra !== undefined) {
    throw new Error('bad ciphertext');
  }
  const iv = fromBase64Url(ivText);
  if (iv.length !== 12) throw new Error('bad ciphertext');
  const opened = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv, additionalData: encoder.encode(userId) },
    key,
    fromBase64Url(sealedText),
  );
  return new TextDecoder().decode(opened);
}

// ---------------------------------------------------------------------------
// Origins and relying party

/** Origins allowed when PASSKEY_ALLOWED_ORIGINS is not set. */
export const DEFAULT_PASSKEY_ORIGINS = [
  'https://www.raunakchoudhary.com',
  'https://raunakchoudhary.com',
  'http://localhost:3000',
];

/** Parses the comma-separated origin list, or falls back to the defaults. */
export function passkeyOriginsFrom(setting: string | undefined): string[] {
  const parsed = (setting ?? '').split(',').map((item) => item.trim()).filter(Boolean);
  return parsed.length > 0 ? parsed : DEFAULT_PASSKEY_ORIGINS;
}

/**
 * The relying party for a request origin, or null when the origin is not
 * allowed. The RP ID is the host without a leading "www.", so a passkey made
 * on www.raunakchoudhary.com also works on raunakchoudhary.com. Plain http is
 * accepted only for localhost (browsers allow WebAuthn there).
 */
export function relyingPartyFor(origin: string | null, allowed: string[]): { origin: string; rpId: string } | null {
  if (!origin || !allowed.includes(origin)) return null;
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    return null;
  }
  if (url.origin !== origin) return null; // no paths, credentials or trailing slashes
  const host = url.hostname;
  if (url.protocol === 'http:' && host !== 'localhost') return null;
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  return { origin, rpId: host.replace(/^www\./, '') };
}

// ---------------------------------------------------------------------------
// Challenges and rate limit

export interface StoredChallenge {
  kind: string;
  rp_id: string;
  expires_at: string;
  used_at: string | null;
}

/**
 * Why a stored challenge may not be used, or null when it may. The database
 * consume step applies the same rule atomically; this is the reference
 * version, shared with the tests.
 */
export function challengeProblem(
  row: StoredChallenge | null,
  expected: { kind: 'register' | 'authenticate'; rpId: string },
  now: Date,
): 'missing' | 'used' | 'expired' | 'mismatch' | null {
  if (!row) return 'missing';
  if (row.used_at) return 'used';
  if (Date.parse(row.expires_at) <= now.getTime()) return 'expired';
  if (row.kind !== expected.kind || row.rp_id !== expected.rpId) return 'mismatch';
  return null;
}

/** Start of the rate-limit window that ends now. */
export const rateWindowStart = (now: Date) => new Date(now.getTime() - RATE_LIMIT_WINDOW_MS);

/** True when another challenge would exceed the limit. */
export const isRateLimited = (recentCount: number) => recentCount >= RATE_LIMIT_MAX;

// ---------------------------------------------------------------------------
// Tokens and input

/**
 * Reads the claims of an access token. Only call this after Auth has accepted
 * the token (GET /auth/v1/user); it does not check the signature.
 */
export function readClaims(token: string): Record<string, unknown> | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const claims = JSON.parse(new TextDecoder().decode(fromBase64Url(parts[1])));
    return claims && typeof claims === 'object' ? claims : null;
  } catch {
    return null;
  }
}

/** A clean device label, or null when it is empty, too long or carries control characters. */
export function cleanDeviceName(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().replace(/\s+/g, ' ');
  if (trimmed.length < 1 || trimmed.length > DEVICE_NAME_MAX) return null;
  if (Array.from(trimmed).some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)) return null;
  return trimmed;
}

/** True for a canonical UUID string (row ids the client sends back). */
export const isUuid = (value: unknown): value is string =>
  typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
