import { assert, assertEquals, assertFalse, assertRejects, assertThrows } from 'jsr:@std/assert@1';
import {
  challengeProblem,
  cleanDeviceName,
  DEFAULT_PASSKEY_ORIGINS,
  fromBase32,
  fromBase64Url,
  hotp,
  importWrapKey,
  isRateLimited,
  isUuid,
  passkeyOriginsFrom,
  RATE_LIMIT_MAX,
  RATE_LIMIT_WINDOW_MS,
  rateWindowStart,
  readClaims,
  relyingPartyFor,
  toBase64Url,
  totpCode,
  unwrapSecret,
  wrapSecret,
} from './lib.ts';

// RFC 6238 appendix B uses the ASCII seed "12345678901234567890" for SHA-1.
const RFC_SEED = new TextEncoder().encode('12345678901234567890');
const RFC_SEED_BASE32 = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';

// A key generated for the tests only: 32 bytes of 0x01, base64.
const TEST_KEY = btoa(String.fromCharCode(...new Uint8Array(32).fill(1)));
const OTHER_KEY = btoa(String.fromCharCode(...new Uint8Array(32).fill(2)));
const USER = '7a3c3c55-6f0e-4b8e-9d4c-0f6b1e2a9c11';

Deno.test('base32 decodes the RFC seed and refuses foreign characters', () => {
  assertEquals(fromBase32(RFC_SEED_BASE32), RFC_SEED);
  assertEquals(fromBase32('gezd gnbv gy3t qojq gezd gnbv gy3t qojq'), RFC_SEED);
  assertThrows(() => fromBase32('GEZD1'));
});

Deno.test('base64url round-trips and refuses foreign characters', () => {
  const bytes = Uint8Array.from([0, 251, 255, 62, 63, 1, 2]);
  assertEquals(fromBase64Url(toBase64Url(bytes)), bytes);
  assertThrows(() => fromBase64Url('ab+/'));
});

Deno.test('TOTP matches the RFC 6238 SHA-1 test vectors (8 digits)', async () => {
  const vectors: Array<[number, string]> = [
    [59, '94287082'],
    [1111111109, '07081804'],
    [1111111111, '14050471'],
    [1234567890, '89005924'],
    [2000000000, '69279037'],
    [20000000000, '65353130'],
  ];
  for (const [seconds, expected] of vectors) {
    assertEquals(await totpCode(RFC_SEED_BASE32, seconds * 1000, { digits: 8 }), expected, `T=${seconds}`);
  }
});

Deno.test('TOTP six-digit codes are the low digits, and offsets move one step', async () => {
  assertEquals(await totpCode(RFC_SEED_BASE32, 59_000), '287082');
  assertEquals(await totpCode(RFC_SEED_BASE32, 1111111109_000), '081804');
  // the next step at T=1111111109 is the step of T=1111111111 (both 30 s apart at most)
  assertEquals(
    await totpCode(RFC_SEED_BASE32, 1111111080_000, { stepOffset: 1 }),
    await totpCode(RFC_SEED_BASE32, 1111111110_000),
  );
  assertEquals(await hotp(RFC_SEED, 0), '755224'); // RFC 4226 appendix D, count 0
  assertEquals(await hotp(RFC_SEED, 9), '520489');
});

Deno.test('AES-GCM wrap round-trips with a fresh IV each time', async () => {
  const key = await importWrapKey(TEST_KEY);
  const first = await wrapSecret(key, RFC_SEED_BASE32, USER);
  const second = await wrapSecret(key, RFC_SEED_BASE32, USER);
  assert(first.startsWith('v1.'));
  assert(first !== second, 'two encryptions must differ');
  assertFalse(first.includes(RFC_SEED_BASE32));
  assertEquals(await unwrapSecret(key, first, USER), RFC_SEED_BASE32);
});

Deno.test('AES-GCM unwrap fails on tampering, the wrong key or the wrong user', async () => {
  const key = await importWrapKey(TEST_KEY);
  const wrapped = await wrapSecret(key, 'SECRETSECRET', USER);
  const [version, iv, sealed] = wrapped.split('.');
  const flipped = sealed.slice(0, 5) + (sealed[5] === 'A' ? 'B' : 'A') + sealed.slice(6);
  await assertRejects(() => unwrapSecret(key, `${version}.${iv}.${flipped}`, USER));
  await assertRejects(() => unwrapSecret(key, `${version}.${iv}.${sealed}.x`, USER));
  await assertRejects(() => unwrapSecret(key, `v0.${iv}.${sealed}`, USER));
  await assertRejects(async () => unwrapSecret(await importWrapKey(OTHER_KEY), wrapped, USER));
  await assertRejects(() => unwrapSecret(key, wrapped, '00000000-0000-0000-0000-000000000000'));
});

Deno.test('the wrap key must be present and exactly 32 bytes', async () => {
  await assertRejects(() => importWrapKey(undefined));
  await assertRejects(() => importWrapKey(btoa('short')));
});

Deno.test('origins map to the relying party; unknown or malformed origins do not', () => {
  const allowed = passkeyOriginsFrom(undefined);
  assertEquals(allowed, DEFAULT_PASSKEY_ORIGINS);
  assertEquals(relyingPartyFor('https://www.raunakchoudhary.com', allowed)?.rpId, 'raunakchoudhary.com');
  assertEquals(relyingPartyFor('https://raunakchoudhary.com', allowed)?.rpId, 'raunakchoudhary.com');
  assertEquals(relyingPartyFor('http://localhost:3000', allowed)?.rpId, 'localhost');
  assertEquals(relyingPartyFor('https://evil.example', allowed), null);
  assertEquals(relyingPartyFor(null, allowed), null);
  assertEquals(relyingPartyFor('https://raunakchoudhary.com/', ['https://raunakchoudhary.com/']), null);
  assertEquals(relyingPartyFor('http://example.com', ['http://example.com']), null);
  assertEquals(passkeyOriginsFrom(' https://a.test , http://localhost:3000 '), [
    'https://a.test',
    'http://localhost:3000',
  ]);
});

Deno.test('a challenge is refused when missing, used, expired or for another ceremony', () => {
  const now = new Date('2026-11-18T12:00:00Z');
  const fresh = { kind: 'authenticate', rp_id: 'localhost', expires_at: '2026-11-18T12:01:00Z', used_at: null };
  const expected = { kind: 'authenticate' as const, rpId: 'localhost' };
  assertEquals(challengeProblem(fresh, expected, now), null);
  assertEquals(challengeProblem(null, expected, now), 'missing');
  assertEquals(challengeProblem({ ...fresh, used_at: '2026-11-18T11:59:00Z' }, expected, now), 'used');
  assertEquals(challengeProblem({ ...fresh, expires_at: '2026-11-18T12:00:00Z' }, expected, now), 'expired');
  assertEquals(challengeProblem({ ...fresh, kind: 'register' }, expected, now), 'mismatch');
  assertEquals(challengeProblem({ ...fresh, rp_id: 'raunakchoudhary.com' }, expected, now), 'mismatch');
});

Deno.test('the rate limit allows ten challenges per fifteen minutes', () => {
  assertFalse(isRateLimited(RATE_LIMIT_MAX - 1));
  assert(isRateLimited(RATE_LIMIT_MAX));
  const now = new Date('2026-11-18T12:00:00Z');
  assertEquals(now.getTime() - rateWindowStart(now).getTime(), RATE_LIMIT_WINDOW_MS);
});

Deno.test('claims are read from a token and junk gives null', () => {
  const payload = toBase64Url(new TextEncoder().encode(JSON.stringify({ aal: 'aal1', sub: USER })));
  assertEquals(readClaims(`h.${payload}.s`)?.aal, 'aal1');
  assertEquals(readClaims('not-a-token'), null);
  assertEquals(readClaims('a.%%%.c'), null);
});

Deno.test('device names are trimmed and limited', () => {
  assertEquals(cleanDeviceName('  Galaxy   S25 Ultra '), 'Galaxy S25 Ultra');
  assertEquals(cleanDeviceName(''), null);
  assertEquals(cleanDeviceName('x'.repeat(61)), null);
  assertEquals(cleanDeviceName('bad\u0007name'), null);
  assertEquals(cleanDeviceName(42), null);
  assert(isUuid(USER));
  assertFalse(isUuid('1; drop table'));
});
