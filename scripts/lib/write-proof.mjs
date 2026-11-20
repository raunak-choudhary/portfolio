// scripts/lib/write-proof.mjs
//
// The pure half of scripts/admin-write-proof.mjs (Unit 4.4): which sections
// the proof drives and what it types into them, the request guard that keeps
// a run against the real project to its own TEST- rows, the order-column
// safety check, and the report. No Playwright and no network here, so every
// rule is unit tested in write-proof.test.mjs.
//
// The guard is the part that matters. In live mode the proof runs with the
// owner's real session against the production database, so every request the
// page makes is classified before it leaves the browser:
//   allow      reads, the session refresh, and writes that touch only rows
//              and files this run created (plus the two order rewrites and
//              the singleton round trip, each only inside its own window);
//   block      requests that must never happen during a proof but are not
//              a fault of the run (analytics, e-mail sending functions):
//              aborted and listed in the report;
//   violation  any other write: aborted, and the run stops at once.

/** Every row the proof creates carries this prefix in its title column. */
export const TEST_PREFIX = 'TEST- 4.4';

/**
 * The sections the proof drives, in run order. `fields` are the visible
 * labels of the required inputs and the text typed into each (`{title}` and
 * `{run}` are filled in by `fieldValues`); `upload` is the field the tiny PNG
 * goes into after the first save, with the column and bucket that prove it
 * landed. `reorder` marks the drag decks.
 */
export const SECTIONS = Object.freeze([
  { key: 'projects', chapter: 'projects', table: 'projects', titleKey: 'title', singular: 'project', label: 'Projects',
    fields: { Title: '{title}' }, titleLabel: 'Title',
    upload: { label: 'Images', column: 'image_urls', bucket: 'project-images' }, reorder: { orderKey: 'order_index', direction: 'desc' } },
  { key: 'internships', chapter: 'internships', table: 'internships', titleKey: 'title', singular: 'internship', label: 'Internships',
    fields: { 'Internship title': '{title}', Company: 'TEST- 4.4 Company {run}' }, titleLabel: 'Internship title',
    upload: { label: 'Company logo', column: 'company_logo_url', bucket: 'organization-logos' }, reorder: { orderKey: 'order_index', direction: 'asc' } },
  { key: 'education', chapter: 'education', table: 'education', titleKey: 'degree', singular: 'education entry', label: 'Education',
    fields: { Degree: '{title}', 'College or school': 'TEST- 4.4 College {run}' }, titleLabel: 'Degree',
    upload: { label: 'Institution logo', column: 'institution_logo_url', bucket: 'organization-logos' } },
  { key: 'workExperience', chapter: 'work', table: 'work_experience', titleKey: 'title', singular: 'role', label: 'Work',
    fields: { 'Job title': '{title}', Company: 'TEST- 4.4 Company {run}' }, titleLabel: 'Job title',
    upload: { label: 'Company logo', column: 'company_logo_url', bucket: 'organization-logos' } },
  { key: 'skills', chapter: 'skills', table: 'skills', titleKey: 'skill_name', singular: 'skill', label: 'Skills',
    fields: { 'Skill name': '{title}', Category: 'TEST- 4.4 Category {run}' }, titleLabel: 'Skill name',
    upload: { label: 'Icon', column: 'icon_url', bucket: 'skill-icons' } },
  { key: 'certifications', chapter: 'certifications', table: 'certifications', titleKey: 'title', singular: 'certification', label: 'Certifications',
    fields: { 'Certification title': '{title}', 'Issuing organization': 'TEST- 4.4 Issuer {run}' }, titleLabel: 'Certification title',
    upload: { label: 'Badge', column: 'badge_image_url', bucket: 'certification-badges' } },
  { key: 'recommendations', chapter: 'recommendations', table: 'recommendations', titleKey: 'recommender_name', singular: 'recommendation', label: 'Recommendations',
    fields: { 'Recommender name': '{title}', Recommendation: 'TEST- 4.4 recommendation text written by the write proof {run}.' }, titleLabel: 'Recommender name',
    upload: { label: 'Photo', column: 'profile_image_url', bucket: 'profile-images' } },
  { key: 'achievements', chapter: 'achievements', table: 'achievements', titleKey: 'title', singular: 'achievement', label: 'Achievements',
    fields: { 'Achievement title': '{title}' }, titleLabel: 'Achievement title',
    upload: { label: 'Certificate', column: 'certificate_url', bucket: 'achievement-images' } },
  { key: 'leadership', chapter: 'leadership', table: 'leadership', titleKey: 'title', singular: 'leadership role', label: 'Leadership',
    fields: { 'Position title': '{title}', Organization: 'TEST- 4.4 Organization {run}' }, titleLabel: 'Position title',
    upload: null },
]);

/** The two one-row sections: run only with --singletons, because their one row is live content. */
export const SINGLETONS = Object.freeze([
  { key: 'hero', chapter: 'hero', table: 'hero_content', label: 'Hero', fieldLabel: 'Main title', column: 'title' },
  { key: 'about', chapter: 'about', table: 'about_content', label: 'About', fieldLabel: 'About me title', column: 'about_me_title' },
]);

/** Tables whose title column the cleanup sweeps for TEST- 4.4 rows. */
export const CLEANUP_TABLES = Object.freeze([
  ...SECTIONS.map(({ table, titleKey }) => ({ table, titleKey })),
  { table: 'contact_messages', titleKey: 'name' },
]);

/** Hosts the page may read static files from (fonts, icons, the live Sun): GET only. */
export const STATIC_HOSTS = Object.freeze(['fonts.googleapis.com', 'fonts.gstatic.com', 'cdn.jsdelivr.net', 'sdo.gsfc.nasa.gov']);

/** Edge Functions that send e-mail or reports: always aborted during a proof. */
export const BLOCKED_FUNCTIONS = Object.freeze(['admin-login-alert', 'send-contact-email', 'quarterly-report']);

/** RPCs the dashboard calls that only read or log; any other RPC is a violation. */
export const ALLOWED_RPCS = Object.freeze(['log_admin_event', 'calculate_portfolio_completeness']);

/** A short lower-case run id (letters and digits only, so it survives slugging into storage paths). */
export const makeRunId = (now = Date.now(), random = Math.random) =>
  `${now.toString(36).slice(-5)}${Math.floor(random() * 36 ** 3).toString(36).padStart(3, '0')}`;

/** The title a section's record starts with in this run. */
export const recordTitle = (section, runId) => `${TEST_PREFIX} ${section.label} ${runId}`;

/** The same record after the edit step. */
export const editedTitle = (section, runId) => `${recordTitle(section, runId)} edited`;

/** The label -> text map typed into a new record of `section`. */
export function fieldValues(section, runId) {
  const title = recordTitle(section, runId);
  return Object.fromEntries(Object.entries(section.fields).map(([label, text]) => [label, text.replace('{title}', title).replace('{run}', runId)]));
}

/** True when a value is a title this proof wrote (any run, or the given one). */
export const isTestTitle = (value, runId = null) =>
  typeof value === 'string' && value.startsWith(TEST_PREFIX) && (runId === null || value.includes(runId));

/** Decodes a JWT payload without verifying it; null when it is not one. */
export function decodeJwtPayload(token) {
  const parts = String(token ?? '').split('.');
  if (parts.length !== 3) return null;
  try { return JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')); } catch { return null; }
}

/**
 * Finds the Supabase session in a Playwright storage state and reads its
 * assurance level. The proof refuses to start below aal2: without the
 * second factor every admin write is refused, and the run would prove
 * nothing.
 * @returns {{ ok: boolean, aal: string|null, origin: string|null, key: string|null, message?: string }}
 */
export function sessionLevel(state) {
  for (const origin of state?.origins ?? []) {
    for (const item of origin.localStorage ?? []) {
      if (!/^sb-[a-z0-9]+-auth-token$/.test(item.name)) continue;
      let session;
      try { session = JSON.parse(item.value); } catch { continue; }
      const payload = decodeJwtPayload(session?.access_token);
      const aal = payload?.aal ?? null;
      if (aal === 'aal2') return { ok: true, aal, origin: origin.origin, key: item.name };
      return { ok: false, aal, origin: origin.origin, key: item.name, message: `The saved session is at ${aal ?? 'an unknown level'}, not aal2. Rerun: npm run admin:login` };
    }
  }
  return { ok: false, aal: null, origin: null, key: null, message: 'The saved state holds no Supabase session. Rerun: npm run admin:login' };
}

/**
 * Copies the saved state's local storage to the origin the proof opens, so
 * a session saved on the dev server (port 3000) works on the static
 * production build (another port). Cookies are kept as they are.
 */
export function remapStorageState(state, toOrigin) {
  const merged = new Map();
  for (const origin of state?.origins ?? []) for (const item of origin.localStorage ?? []) merged.set(item.name, item.value);
  return { cookies: state?.cookies ?? [], origins: [{ origin: toOrigin, localStorage: [...merged].map(([name, value]) => ({ name, value })) }] };
}

/**
 * Writes a refreshed session back into the saved state, at its original
 * origin. supabase-js rotates the refresh token when the access token is
 * renewed, so without this the next run would start from a spent token.
 */
export function mergeSessionBack(saved, fresh, key) {
  const value = fresh?.origins?.flatMap((o) => o.localStorage ?? []).find((item) => item.name === key)?.value;
  if (!value) return saved;
  return {
    ...saved,
    origins: (saved.origins ?? []).map((origin) => ({
      ...origin,
      localStorage: (origin.localStorage ?? []).map((item) => (item.name === key ? { ...item, value } : item)),
    })),
  };
}

/** The `id=eq.<id>` target of a PostgREST write, or null when it filters on anything else. */
export function idTarget(search) {
  const ids = idTargets(search);
  return ids && ids.length === 1 && /^eq\./.test(new URLSearchParams(search).get('id')) ? ids[0] : null;
}

/**
 * Every id a PostgREST write names through its only filter, `id=eq.<id>` or
 * `id=in.(<a>,<b>)` (the inbox marks messages read in bulk); null when the
 * write filters on anything else, so it could reach rows by another column.
 */
export function idTargets(search) {
  const params = new URLSearchParams(search);
  const filters = [...params.keys()].filter((k) => !['select', 'columns', 'on_conflict'].includes(k));
  if (filters.length !== 1 || filters[0] !== 'id' || params.getAll('id').length !== 1) return null;
  const value = params.get('id') ?? '';
  const eq = /^eq\.(.+)$/.exec(value);
  if (eq) return [eq[1]];
  const list = /^in\.\((.+)\)$/.exec(value);
  if (!list) return null;
  const ids = list[1].split(',').map((id) => id.trim().replace(/^"(.*)"$/, '$1'));
  return ids.length && ids.every(Boolean) ? ids : null;
}

const parseBody = (postData) => {
  if (postData === null || postData === undefined || postData === '') return null;
  if (typeof postData === 'object') return postData;
  try { return JSON.parse(postData); } catch { return postData; }
};

/** A storage path this run made: it carries the run id or the id of a row this run created. */
const ownedPath = (path, ctx) => {
  const text = String(path ?? '').toLowerCase();
  if (!text) return false;
  if (text.includes(ctx.runId.toLowerCase())) return true;
  for (const ids of Object.values(ctx.created)) for (const id of ids) if (text.includes(String(id).toLowerCase())) return true;
  return false;
};

/**
 * Classifies one request. `ctx` carries what the run knows at that moment:
 *   { baseOrigin, supabaseOrigin, runId,
 *     created: { [table]: Set<id> },
 *     tables: Set<string> section tables a new row may be posted to (with titleKey),
 *     titleKeys: { [table]: column },
 *     reorder: { table, orderKey } | null,     the order-rewrite window
 *     singleton: { table, id } | null }        the singleton round-trip window
 * @param {{ method: string, url: string, postData?: unknown }} request
 * @returns {{ verdict: 'allow'|'block'|'violation', reason: string, kind?: string }}
 */
export function classifyRequest({ method, url, postData = null }, ctx) {
  const verb = String(method).toUpperCase();
  let parsed;
  try { parsed = new URL(url); } catch { return { verdict: 'block', reason: 'not a web address' }; }
  if (!/^(https?|wss?):$/.test(parsed.protocol)) return { verdict: 'allow', reason: 'browser-internal address' };
  const reading = verb === 'GET' || verb === 'HEAD' || verb === 'OPTIONS';

  if (parsed.origin === ctx.baseOrigin) return reading ? { verdict: 'allow', reason: 'the app' } : { verdict: 'violation', reason: `${verb} to the app server` };

  if (parsed.origin !== ctx.supabaseOrigin && parsed.origin !== ctx.supabaseOrigin?.replace(/^https/, 'wss')) {
    if (STATIC_HOSTS.includes(parsed.hostname)) return reading ? { verdict: 'allow', reason: 'static file host' } : { verdict: 'violation', reason: `${verb} to a static file host` };
    return { verdict: 'block', reason: `host ${parsed.hostname} is not on the allow list` };
  }

  const path = parsed.pathname;
  if (parsed.protocol.startsWith('ws')) return { verdict: 'allow', reason: 'realtime' };
  if (verb === 'OPTIONS') return { verdict: 'allow', reason: 'preflight' };
  const body = parseBody(postData);

  if (path.startsWith('/auth/v1/')) {
    if (reading) return { verdict: 'allow', reason: 'auth read' };
    if (verb === 'POST' && path === '/auth/v1/token' && parsed.searchParams.get('grant_type') === 'refresh_token') return { verdict: 'allow', reason: 'session refresh', kind: 'refresh' };
    return { verdict: 'violation', reason: `${verb} ${path}: only the session refresh may write to auth` };
  }

  if (path.startsWith('/functions/v1/')) {
    const name = path.slice('/functions/v1/'.length).split('/')[0];
    if (BLOCKED_FUNCTIONS.includes(name)) return { verdict: 'block', reason: `function ${name} (sends e-mail or reports)`, kind: 'function' };
    if (name === 'admin-passkey' && body && typeof body === 'object' && body.action === 'status') return { verdict: 'allow', reason: 'passkey status read' };
    return { verdict: 'violation', reason: `function ${name}${body?.action ? ` action ${body.action}` : ''}` };
  }

  if (path.startsWith('/storage/v1/')) {
    if (reading) return { verdict: 'allow', reason: 'storage read' };
    const list = /^\/storage\/v1\/object\/list\/[^/]+$/.test(path);
    const sign = /^\/storage\/v1\/object\/sign\//.test(path);
    if (verb === 'POST' && (list || sign)) return { verdict: 'allow', reason: list ? 'storage list' : 'signed link' };
    const upload = /^\/storage\/v1\/object\/([^/]+)\/(.+)$/.exec(path);
    if ((verb === 'POST' || verb === 'PUT') && upload) {
      const filePath = decodeURIComponent(upload[2]);
      return ownedPath(filePath, ctx)
        ? { verdict: 'allow', reason: `upload ${upload[1]}/${filePath}`, kind: 'upload' }
        : { verdict: 'violation', reason: `upload to ${upload[1]}/${filePath}, a path this run does not own` };
    }
    const remove = /^\/storage\/v1\/object\/([^/]+)$/.exec(path);
    if (verb === 'DELETE' && remove) {
      const prefixes = Array.isArray(body?.prefixes) ? body.prefixes : [];
      const foreign = prefixes.filter((p) => !ownedPath(p, ctx));
      if (prefixes.length && !foreign.length) return { verdict: 'allow', reason: `remove ${prefixes.length} file(s) from ${remove[1]}`, kind: 'storage-delete' };
      return { verdict: 'violation', reason: `storage delete in ${remove[1]} of ${foreign.length ? foreign.join(', ') : 'an unnamed set'}` };
    }
    return { verdict: 'violation', reason: `${verb} ${path}` };
  }

  const rpc = /^\/rest\/v1\/rpc\/([a-z0-9_]+)$/.exec(path);
  if (rpc) {
    if (reading || ALLOWED_RPCS.includes(rpc[1])) return { verdict: 'allow', reason: `rpc ${rpc[1]}` };
    return { verdict: 'violation', reason: `rpc ${rpc[1]}` };
  }

  const rest = /^\/rest\/v1\/([a-z0-9_]+)$/.exec(path);
  if (!rest) return reading ? { verdict: 'allow', reason: 'read' } : { verdict: 'violation', reason: `${verb} ${path}` };
  const table = rest[1];
  if (reading) return { verdict: 'allow', reason: `read ${table}` };
  if (table === 'analytics_events' && verb === 'POST') return { verdict: 'block', reason: 'analytics event', kind: 'analytics' };

  if (verb === 'POST') {
    const titleKey = ctx.titleKeys?.[table];
    const rows = Array.isArray(body) ? body : [body];
    if (titleKey && rows.length && rows.every((row) => row && isTestTitle(row[titleKey], ctx.runId))) return { verdict: 'allow', reason: `insert into ${table}`, kind: 'insert' };
    return { verdict: 'violation', reason: `insert into ${table} that is not a ${TEST_PREFIX} row of this run` };
  }

  if (verb === 'PATCH' || verb === 'DELETE') {
    const ids = idTargets(parsed.search);
    const id = idTarget(parsed.search); // the order rewrite and the round trip touch one row each
    if (ids && ids.every((x) => ctx.created?.[table]?.has(x))) return { verdict: 'allow', reason: `${verb} ${table} row of this run`, kind: verb === 'PATCH' ? 'update' : 'delete' };
    if (verb === 'PATCH' && id !== null && ctx.reorder?.table === table && body && typeof body === 'object'
      && Object.keys(body).every((k) => k === ctx.reorder.orderKey || k === 'updated_at') && ctx.reorder.orderKey in body) {
      return { verdict: 'allow', reason: `order rewrite of ${table} ${id}`, kind: 'order-rewrite' };
    }
    if (verb === 'PATCH' && id !== null && ctx.singleton?.table === table && ctx.singleton.id === id) return { verdict: 'allow', reason: `${table} round trip`, kind: 'singleton' };
    return { verdict: 'violation', reason: `${verb} ${table}${ids ? ` id ${ids.join(', ')}` : ` ${parsed.search}`}, not a row of this run` };
  }

  return { verdict: 'violation', reason: `${verb} ${table}` };
}

/**
 * The order values a drag would write, the way the deck computes them
 * (orderWritesFor in managers/schemaModel.js): ascending decks number from 1
 * at the top, descending decks give the top card the highest number.
 */
export function orderRewrite(orderedIds, direction) {
  const asc = direction === 'asc';
  return new Map(orderedIds.map((id, i) => [id, asc ? i + 1 : orderedIds.length - i]));
}

/**
 * Which rows that are not this run's would change if the deck rewrote its
 * order column with the cards in `orderedRows` order. The drag test runs only
 * when this is empty, because a drag rewrites every row.
 * @param {Array<{id: string, value: number|null, title?: string}>} orderedRows deck order, top first
 * @returns {Array<{id: string, title?: string, before: number|null, after: number}>}
 */
export function orderRewriteImpact(orderedRows, direction, testIds) {
  const next = orderRewrite(orderedRows.map((r) => r.id), direction);
  return orderedRows
    .filter((r) => !testIds.has(r.id) && r.value !== next.get(r.id))
    .map((r) => ({ id: r.id, title: r.title, before: r.value, after: next.get(r.id) }));
}

/** Rows whose order value differs between two snapshots ({id, value, title}); rows missing on either side count too. */
export function compareOrderSnapshots(before, after) {
  const later = new Map(after.map((r) => [r.id, r]));
  const diffs = [];
  for (const row of before) {
    const now = later.get(row.id);
    if (!now) diffs.push({ id: row.id, title: row.title, before: row.value, after: 'missing' });
    else if (now.value !== row.value) diffs.push({ id: row.id, title: row.title, before: row.value, after: now.value });
  }
  const known = new Set(before.map((r) => r.id));
  for (const row of after) if (!known.has(row.id)) diffs.push({ id: row.id, title: row.title, before: 'missing', after: row.value });
  return diffs;
}

/** Columns that differ between two versions of one row, ignoring the timestamps a save sets. */
export function rowDiff(before, after, ignore = ['updated_at']) {
  const keys = new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})]);
  return [...keys].filter((k) => !ignore.includes(k) && JSON.stringify(before?.[k] ?? null) !== JSON.stringify(after?.[k] ?? null));
}

/**
 * The object path inside `bucket` for a stored value (public URL, signed URL
 * or bare path), the way adminDataService.extractPublicStoragePath reads it.
 */
export function storagePath(value, bucket) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const text = value.trim();
  for (const marker of [`/storage/v1/object/public/${bucket}/`, `/storage/v1/object/sign/${bucket}/`]) {
    if (text.includes(marker)) return decodeURIComponent(text.split(marker)[1].split('?')[0]);
  }
  if (text.startsWith(`${bucket}/`)) return text.slice(bucket.length + 1);
  if (!text.includes('://') && !text.startsWith('/')) return text;
  return null;
}

/** Every stored path a row holds in `column` (a URL or a list of them). */
export const storagePaths = (row, column, bucket) =>
  (Array.isArray(row?.[column]) ? row[column] : [row?.[column]]).map((v) => storagePath(v, bucket)).filter(Boolean);

/** Smallest valid PNG (1x1, transparent): the file the upload steps send. */
export const TINY_PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');

/** True when the report as a whole passes: every step passed or was skipped on purpose, and nothing went wrong around them. */
export function reportPasses(report) {
  return report.steps.every((s) => s.status !== 'fail')
    && report.violations.length === 0
    && report.csp.length === 0
    && report.pageErrors.length === 0
    && report.failedResponses.length === 0
    && report.order.every((o) => o.status !== 'fail')
    && report.cleanup.status === 'pass';
}

const cell = (text) => String(text ?? '').replace(/\|/g, '\\|').replace(/\s+/g, ' ').trim();

/** The Markdown form of the report. */
export function renderReport(report) {
  const lines = [
    `# Admin write proof, run ${report.runId}`,
    '',
    `- Mode: ${report.mode}; app at ${report.base}`,
    `- Started ${report.startedAt}, finished ${report.finishedAt}`,
    `- Result: **${report.passed ? 'PASS' : 'FAIL'}**`,
    '',
    '## Steps',
    '',
    '| Section | Step | Result | Detail |',
    '|---|---|---|---|',
    ...report.steps.map((s) => `| ${cell(s.section)} | ${cell(s.step)} | ${s.status} | ${cell(s.detail)} |`),
    '',
    '## Order columns',
    '',
    ...(report.order.length ? report.order.map((o) => `- ${o.table}: ${o.status}${o.detail ? `, ${o.detail}` : ''}${o.diffs?.length ? `\n${o.diffs.map((d) => `  - ${d.title ?? d.id}: ${d.before} -> ${d.after}`).join('\n')}` : ''}`) : ['- not run']),
    '',
    '## Guard',
    '',
    `- Violations (aborted, run stopped): ${report.violations.length ? '' : 'none'}`,
    ...report.violations.map((v) => `  - ${v.method} ${v.url}: ${v.reason}`),
    `- Blocked on purpose: ${report.blocked.length ? '' : 'none'}`,
    ...report.blocked.map((b) => `  - ${b.method} ${b.url}: ${b.reason}`),
    `- Order rewrites allowed: ${report.orderRewrites}`,
    '',
    '## Browser',
    '',
    `- CSP violations: ${report.csp.length ? '' : 'none'}`,
    ...report.csp.map((c) => `  - ${c.directive} blocked ${c.blocked}`),
    `- Page and console errors: ${report.pageErrors.length ? '' : 'none'}`,
    ...report.pageErrors.map((e) => `  - ${e}`),
    `- Failed responses (4xx, 5xx): ${report.failedResponses.length ? '' : 'none'}`,
    ...report.failedResponses.map((r) => `  - ${r.status} ${r.method} ${r.url}`),
    '',
    '## Cleanup',
    '',
    `- ${report.cleanup.status}: ${report.cleanup.detail}`,
    '',
  ];
  return lines.join('\n');
}
