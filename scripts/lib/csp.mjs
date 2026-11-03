// scripts/lib/csp.mjs
//
// Checks the deployed security headers in public/.htaccess against what the
// site needs. The Content Security Policy is the header that can break the
// site if wrong (a blocked script leaves a blank page; a blocked image host
// leaves empty cards), so the checks are specific rather than generic:
//
//   - scripts: only our own bundle, never inline, never eval;
//   - images, frames and connections: every host the site actually uses,
//     as found by the asset-host inventory and the Supabase project URL;
//   - no CSP meta tag in index.html, so the header stays the single source;
//   - the companion headers (HSTS, nosniff, frame options, referrer policy).

import { headersForFile, parseHtaccessHeaders } from './htaccess-headers.mjs';

/** Directives every strict policy must carry, with their required sources. */
const REQUIRED_DIRECTIVES = {
  'default-src': ["'self'"],
  'script-src': ["'self'"],
  'object-src': ["'none'"],
  'base-uri': ["'self'"],
  'form-action': ["'self'"],
  'frame-ancestors': [],
};

/** Sources that must never appear in script-src: inline, eval, wildcards and whole schemes. */
const FORBIDDEN_SCRIPT_SOURCES = ["'unsafe-inline'", "'unsafe-eval'", '*', 'https:', 'http:', 'data:', 'blob:'];

/**
 * Parses a policy string into a map of directive name to source list.
 * @param {string} policy the header value.
 * @returns {Map<string, string[]>}
 */
export function parseCsp(policy) {
  const directives = new Map();
  for (const part of String(policy).split(';')) {
    const [name, ...sources] = part.trim().split(/\s+/).filter(Boolean);
    if (!name) continue;
    const key = name.toLowerCase();
    // Browsers enforce the first occurrence; a repeat is a mistake at best.
    if (directives.has(key)) throw new Error(`directive ${key} appears more than once`);
    directives.set(key, sources);
  }
  return directives;
}

/** True when the directive allows the host (exact host or scheme-host match). */
function allowsHost(sources = [], host) {
  return sources.some((source) => {
    const bare = source.replace(/^[a-z]+:\/\//i, '');
    return bare === host || bare === `*.${host.split('.').slice(1).join('.')}`;
  });
}

/**
 * Checks the policy and companion headers.
 *
 * @param {object} input
 * @param {string} input.htaccess contents of public/.htaccess.
 * @param {string} input.indexHtml contents of public/index.html.
 * @param {string} input.supabaseHost host of the Supabase project, e.g. "ref.supabase.co".
 * @param {Iterable<string>} input.imageHosts hosts that serve images.
 * @param {Iterable<string>} input.documentHosts hosts whose documents are framed.
 * @returns {string[]} problems; empty when everything is consistent.
 */
export function checkSecurityHeaders({ htaccess, indexHtml, supabaseHost, imageHosts = [], documentHosts = [] }) {
  const problems = [];
  const headers = headersForFile(parseHtaccessHeaders(htaccess), 'index.html');

  const policy = headers['Content-Security-Policy'];
  if (!policy) {
    problems.push('Content-Security-Policy header is missing from public/.htaccess');
  } else {
    let csp;
    try {
      csp = parseCsp(policy);
    } catch (error) {
      return [...problems, `Content-Security-Policy is malformed: ${error.message}`];
    }

    for (const [name, required] of Object.entries(REQUIRED_DIRECTIVES)) {
      const sources = csp.get(name);
      if (!sources) {
        problems.push(`${name} directive is missing`);
        continue;
      }
      for (const source of required) {
        if (!sources.includes(source)) problems.push(`${name} must include ${source}`);
      }
    }

    for (const directive of ['script-src', 'default-src', 'object-src']) {
      for (const forbidden of FORBIDDEN_SCRIPT_SOURCES) {
        if (csp.get(directive)?.includes(forbidden)) problems.push(`${directive} must not include ${forbidden}`);
      }
    }

    for (const host of imageHosts) {
      if (!allowsHost(csp.get('img-src'), host)) problems.push(`img-src does not allow image host ${host}`);
    }
    for (const host of documentHosts) {
      if (!allowsHost(csp.get('frame-src'), host)) problems.push(`frame-src does not allow framed document host ${host}`);
    }

    const connect = csp.get('connect-src') ?? [];
    if (!connect.includes(`https://${supabaseHost}`)) problems.push(`connect-src must include https://${supabaseHost}`);
    if (!connect.includes(`wss://${supabaseHost}`)) problems.push(`connect-src must include wss://${supabaseHost}`);
  }

  if (/<meta[^>]+http-equiv\s*=\s*["']?content-security-policy/i.test(indexHtml)) {
    problems.push('index.html must not carry a Content-Security-Policy meta tag; the header is the single source');
  }

  const hsts = headers['Strict-Transport-Security'] ?? '';
  const maxAge = Number(/max-age=(\d+)/.exec(hsts)?.[1] ?? 0);
  if (maxAge < 31536000) problems.push('Strict-Transport-Security must set max-age of at least one year');

  if (headers['X-Content-Type-Options'] !== 'nosniff') problems.push('X-Content-Type-Options must be nosniff');
  if (!headers['Referrer-Policy']) problems.push('Referrer-Policy header is missing');
  if (headers['X-Frame-Options']?.toUpperCase() === 'DENY') {
    problems.push('X-Frame-Options DENY blocks the admin preview iframe; use SAMEORIGIN');
  }

  return problems;
}

/**
 * Reads the Supabase host from the preconnect hint in index.html, which is
 * the one place the public page names the project.
 * @returns {string|null}
 */
export function supabaseHostFromIndexHtml(indexHtml) {
  const match = /<link\s+rel="preconnect"\s+href="https:\/\/([a-z0-9-]+\.supabase\.co)"/i.exec(indexHtml);
  return match ? match[1] : null;
}
