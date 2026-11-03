// scripts/lib/bundle-scan.mjs
//
// Inspects a production build for secrets and leftovers that must never ship
// to visitors. Everything in build/ is public: anyone can download and read it.
//
// Checks:
//   service-role-jwt   a Supabase JWT whose role claim is service_role (bypasses RLS)
//   legacy-jwt-key     any Supabase JWT key at all (only after the key cutover,
//                      when the bundle must carry the publishable key instead)
//   secret-key         an sb_secret_ API key
//   forbidden-string   names and libraries from the retired 2025 browser-side
//                      admin login (password hashes, OTP codes, crypto)
//   inline-script      executable inline <script> in index.html (blocked by
//                      the Content Security Policy once script-src is 'self')
//   analytics-flag     production build did not compile analytics as enabled

const JWT_PATTERN = /eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g;
const SECRET_KEY_PATTERN = /sb_secret_[A-Za-z0-9_-]{8,}/g;

/** Strings that only the retired 2025 browser-side admin login ever used. */
export const FORBIDDEN_STRINGS = Object.freeze([
  'REACT_APP_SUPABASE_SERVICE_ROLE_KEY',
  'REACT_APP_ADMIN_SECRET',
  'REACT_APP_JWT_SECRET',
  'REACT_APP_SALT_KEY',
  'REACT_APP_ROUTE_ENCRYPTION',
  'password_hash',
  'otp_code',
  'crypto-js',
  'bcryptjs',
  'hasServiceKey',
  'supabaseServiceRoleKey',
]);

/**
 * Decodes the payload of a JWT without verifying it.
 * @returns {object|null} claims, or null if the token is not decodable JSON.
 */
export function decodeJwtPayload(token) {
  const [, payload] = token.split('.');
  try {
    return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
}

/**
 * Finds executable inline scripts in an HTML document. Scripts with a `src`
 * and data blocks such as JSON-LD are not executable inline code.
 * @returns {string[]} the first 80 characters of each inline script.
 */
export function findInlineScripts(html) {
  const scripts = [];
  for (const match of String(html).matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    const [, attributes, body] = match;
    if (/\bsrc\s*=/i.test(attributes)) continue;
    const type = /\btype\s*=\s*["']?([^"'\s>]+)/i.exec(attributes)?.[1]?.toLowerCase();
    if (type && !['text/javascript', 'module', 'application/javascript'].includes(type)) continue;
    if (!body.trim()) continue;
    scripts.push(body.trim().replace(/\s+/g, ' ').slice(0, 80));
  }
  return scripts;
}

/** Reads the analytics value stamped into index.html by public/index.html. */
export function readAnalyticsStamp(html) {
  return /<meta\s+name="portfolio-analytics"\s+content="([^"]*)"/i.exec(String(html))?.[1] ?? null;
}

/**
 * Scans a build.
 *
 * @param {{ html: string, scripts: { name: string, text: string }[] }} build
 *   index.html contents and every JavaScript file in the build.
 * @param {{ rejectAnyJwt?: boolean, rejectInlineScripts?: boolean, requireAnalytics?: boolean }} [policy]
 * @returns {{ check: string, file: string, detail: string }[]} problems found.
 */
export function scanBuild({ html, scripts }, policy = {}) {
  const problems = [];

  for (const { name, text } of scripts) {
    for (const token of new Set(text.match(JWT_PATTERN) ?? [])) {
      const claims = decodeJwtPayload(token);
      if (!claims || claims.iss !== 'supabase') continue;
      if (claims.role === 'service_role') {
        problems.push({ check: 'service-role-jwt', file: name, detail: `service_role key for project ${claims.ref}` });
      } else if (policy.rejectAnyJwt) {
        problems.push({ check: 'legacy-jwt-key', file: name, detail: `${claims.role} JWT key for project ${claims.ref}` });
      }
    }

    if (SECRET_KEY_PATTERN.test(text)) {
      problems.push({ check: 'secret-key', file: name, detail: 'sb_secret_ API key' });
    }
    SECRET_KEY_PATTERN.lastIndex = 0;

    for (const forbidden of FORBIDDEN_STRINGS) {
      if (text.includes(forbidden)) {
        problems.push({ check: 'forbidden-string', file: name, detail: forbidden });
      }
    }
  }

  if (policy.rejectInlineScripts) {
    for (const snippet of findInlineScripts(html)) {
      problems.push({ check: 'inline-script', file: 'index.html', detail: snippet });
    }
  }

  if (policy.requireAnalytics) {
    const stamp = readAnalyticsStamp(html);
    if (stamp !== 'true') {
      problems.push({ check: 'analytics-flag', file: 'index.html', detail: `analytics compiled as ${JSON.stringify(stamp)}, expected "true"` });
    }
  }

  return problems;
}
