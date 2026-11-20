// scripts/lib/admin-open-path.mjs
//
// The route check for scripts/admin-open.mjs. That script opens the REAL
// dashboard with the owner's saved session, so a route that acts on the
// session must never be opened with it: /adminsignout really signs the owner
// out and kills the saved session, and /adminlogin is pointless with one.
// Pure, so the check is tested without a browser (admin-open-path.test.mjs).

/** Routes admin-open refuses, in the normalised form `normaliseRoute` returns. */
export const REFUSED_ROUTES = new Map([
  ['/adminsignout', 'it signs the owner out for real and ends the saved session'],
  ['/adminlogin', 'the saved session already signs in, so the login page has nothing to show'],
]);

/**
 * The pathname the app's router would match for a `--path` value: the query
 * and hash dropped, percent escapes decoded, trailing slashes removed and
 * lower case (react-router matches routes case-insensitively).
 */
export function normaliseRoute(value) {
  const raw = String(value ?? '').trim();
  // a leading "//" would parse as a host name, so leading slashes collapse first
  const relative = raw.startsWith('/') ? raw.replace(/^\/+/, '/') : /^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `/${raw}`;
  const { pathname } = new URL(relative, 'http://localhost');
  let decoded = pathname;
  try { decoded = decodeURIComponent(pathname); } catch { /* keep the raw path */ }
  return (decoded.replace(/\/{2,}/g, '/').replace(/\/+$/, '') || '/').toLowerCase();
}

/**
 * Checks a `--path` value (or the path of the whole address, named by
 * `flag` in the message) before any browser starts.
 * @returns {{ ok: true, route: string } | { ok: false, route: string, message: string }}
 */
export function checkAdminOpenPath(value, flag = '--path') {
  const route = normaliseRoute(value);
  const reason = REFUSED_ROUTES.get(route);
  if (!reason) return { ok: true, route };
  return { ok: false, route, message: `admin-open refuses ${flag} ${value}: ${reason}. Open /admindashboard (the default) instead.` };
}
