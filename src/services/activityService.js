// src/services/activityService.js
//
// The admin activity log (table admin_activity, migration
// 20261120120000_admin_activity.sql). Content rows are written by a database
// trigger; this module only reads them, and records the security events the
// trigger cannot see (sign-in, sign out everywhere, authenticators and
// passkeys) through the admin-only RPC log_admin_event.
//
// Reads fail with the same typed errors as the record dialog
// (`failureKind` in voyageRecords.js): code SESSION_EXPIRED or
// SECOND_FACTOR_REQUIRED, a fetch TypeError for the network, and
// ACTIVITY_NOT_SET_UP while the migration has not been run. Logging a
// security event is best effort: it never throws and never holds up the
// action it records for more than a few seconds.

import { describeAdminWriteError } from './adminDataService';
import { supabase } from './supabaseClient';
import { PASSKEY_MATCH_SECONDS } from '../components/admin/Security/securityModel';

export const ACTIVITY_TABLE = 'admin_activity';
export const ACTIVITY_COLUMNS = 'id, at, action, section, record_id, record_title, fields, detail, source';
export const ACTIVITY_NOT_SET_UP = 'ACTIVITY_NOT_SET_UP';

/** Kinds the RPC accepts; anything else is dropped before a request is made. */
export const SECURITY_EVENT_KINDS = Object.freeze(['sign-in', 'sign-out-all', 'factor-add', 'factor-remove', 'passkey-add', 'passkey-remove']);
const SECURITY_KINDS = new Set(SECURITY_EVENT_KINDS);

/** Longest label the RPC keeps (a device or app name). */
export const SECURITY_LABEL_MAX = 60;

/** How long a security action waits for its log entry before going on without it. */
export const LOG_TIMEOUT_MS = 4000;

/** sessionStorage key: the auth session whose sign-in has been logged in this tab. */
export const SIGN_IN_FLAG = 'admin-activity-sign-in';

const FILE_ACTIONS = ['upload', 'remove-file'];

/** Postgres "undefined table" and PostgREST "table not in the schema cache". */
const MISSING_TABLE_CODES = new Set(['42P01', 'PGRST205']);

/** True when a Supabase error says the table does not exist (migration not run). */
export const isMissingTableError = (error) => Boolean(error && MISSING_TABLE_CODES.has(String(error.code ?? '')));

/**
 * Wraps a Supabase read or write error as an Error with a `code` the admin
 * screens branch on (see failureKind). Shared with fixDismissalsService.
 * @param {object} error the Supabase error
 * @param {string} fallback sentence for an error that fits no kind
 * @param {string} [missingCode] code for a table that does not exist yet
 */
export function toServiceError(error, fallback, missingCode = ACTIVITY_NOT_SET_UP) {
  if (isMissingTableError(error)) {
    const missing = new Error('This is not set up yet.');
    missing.code = missingCode;
    missing.cause = error;
    return missing;
  }
  const described = describeAdminWriteError(error);
  const typed = new Error(described.code === 'WRITE_FAILED' ? fallback : described.message);
  typed.code = described.code === 'WRITE_FAILED' ? 'LOAD_FAILED' : described.code;
  typed.cause = error;
  return typed;
}

/**
 * One stored row in the shape the UI uses.
 * @returns {{id: number, at: string, action: string, section: string, recordId: string|null, recordTitle: string|null, fields: string[], detail: object, source: 'admin'|'outside'}}
 */
export const toActivityRow = (row) => ({
  id: row.id,
  at: row.at,
  action: row.action,
  section: row.section,
  recordId: row.record_id ?? null,
  recordTitle: row.record_title ?? null,
  fields: Array.isArray(row.fields) ? row.fields : [],
  detail: row.detail && typeof row.detail === 'object' ? row.detail : {},
  source: row.source === 'admin' ? 'admin' : 'outside',
});

/** Narrows a query to one of the pane's filters; an unknown filter shows everything. */
const applyFilter = (query, filter) => {
  if (filter === 'security') return query.eq('section', 'security');
  if (filter === 'files') return query.in('action', FILE_ACTIONS);
  if (filter === 'content') return query.neq('section', 'security').not('action', 'in', `(${FILE_ACTIONS.join(',')})`);
  return query;
};

/**
 * Narrows a query to rows older than the last one shown. `before` is that
 * row's `at`, or the row itself ({ at, id }): with the id, rows that share
 * the same instant (one bulk change writes several in the same transaction)
 * are not skipped at the page boundary.
 */
const applyCursor = (query, before) => {
  if (!before) return query;
  if (typeof before === 'object' && before.at && Number.isFinite(Number(before.id))) {
    const at = new Date(before.at).toISOString();
    return query.or(`at.lt.${at},and(at.eq.${at},id.lt.${Number(before.id)})`);
  }
  const at = typeof before === 'object' ? before.at : before;
  return at ? query.lt('at', new Date(at).toISOString()) : query;
};

/**
 * A page of the log, newest first.
 * @param {{before?: string|{at: string, id: number}|null, limit?: number, filter?: 'all'|'content'|'files'|'security'}} [options]
 * @returns {Promise<{rows: ReturnType<typeof toActivityRow>[], hasMore: boolean}>}
 */
export async function listActivity({ before = null, limit = 50, filter = 'all' } = {}) {
  const size = Math.max(1, Math.min(200, Math.floor(Number(limit)) || 50));
  let query = supabase.from(ACTIVITY_TABLE).select(ACTIVITY_COLUMNS);
  query = applyCursor(applyFilter(query, filter), before);
  // One extra row tells whether another page exists.
  const { data, error } = await query.order('at', { ascending: false }).order('id', { ascending: false }).limit(size + 1);
  if (error) throw toServiceError(error, 'The activity could not be loaded.');
  const rows = Array.isArray(data) ? data : [];
  return { rows: rows.slice(0, size).map(toActivityRow), hasMore: rows.length > size };
}

/**
 * One record's own history, newest first.
 * @param {string} table the content table, e.g. 'projects'
 * @param {string|number} recordId
 */
export async function recordHistory(table, recordId, limit = 20) {
  if (!table || recordId === null || recordId === undefined || recordId === '') return [];
  const size = Math.max(1, Math.min(200, Math.floor(Number(limit)) || 20));
  const { data, error } = await supabase
    .from(ACTIVITY_TABLE)
    .select(ACTIVITY_COLUMNS)
    .eq('section', table)
    .eq('record_id', String(recordId))
    .order('at', { ascending: false })
    .order('id', { ascending: false })
    .limit(size);
  if (error) throw toServiceError(error, 'The history could not be loaded.');
  return (Array.isArray(data) ? data : []).map(toActivityRow);
}

/**
 * False only when the server says the table does not exist (the migration
 * has not been run), so the UI can say "not set up yet" calmly. Any other
 * answer, a network failure included, reads as true and the list call
 * reports its own error.
 */
export async function isActivityAvailable() {
  try {
    const { error } = await supabase.from(ACTIVITY_TABLE).select('id').limit(1);
    return !isMissingTableError(error);
  } catch {
    return true;
  }
}

/** A device or app name fit for the log: no control characters, single spaces, at most 60 characters. */
export const cleanSecurityLabel = (label) => {
  if (label === null || label === undefined) return null;
  // eslint-disable-next-line no-control-regex
  const text = String(label).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, SECURITY_LABEL_MAX).trim();
  return text || null;
};

/**
 * Records a security event. Best effort: resolves true when stored, false
 * otherwise (unknown kind, not admin, table missing, offline, slow), and
 * never throws.
 * @param {'sign-in'|'sign-out-all'|'factor-add'|'factor-remove'|'passkey-add'|'passkey-remove'} kind
 * @param {string|null} [label] device or app name only
 */
export async function logSecurityEvent(kind, label = null) {
  if (!SECURITY_KINDS.has(kind)) return false;
  let timer;
  try {
    const call = Promise.resolve(supabase.rpc('log_admin_event', { kind, label: cleanSecurityLabel(label) }));
    const late = new Promise((resolve) => { timer = setTimeout(() => resolve({ error: { message: 'timed out' } }), LOG_TIMEOUT_MS); });
    const result = await Promise.race([call, late]);
    return !result?.error;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

const FIRST_STEP_WORDS = { oauth: 'Google', otp: 'Email code', magiclink: 'Email code' };
const SECOND_STEP_METHODS = new Set(['totp', 'mfa/totp']);

/** amr entries arrive as strings or { method, timestamp }; this evens them out. */
const normaliseMethods = (methods) => (Array.isArray(methods) ? methods : [])
  .map((m) => (typeof m === 'string' ? { method: m, timestamp: null } : { method: String(m?.method || ''), timestamp: Number.isFinite(m?.timestamp) ? m.timestamp : null }))
  .filter((m) => m.method);

/**
 * The sign-in label, from the session's amr: "Google, then passkey",
 * "Email code, then authenticator code". The passkey bridge completes a TOTP
 * step, so a passkey is recognised the way the Security chapter does it: a
 * passkey used within PASSKEY_MATCH_SECONDS of the second step.
 * @param {Array<string|{method: string, timestamp: number}>} methods
 * @param {Array<{last_used_at?: string}>} [passkeys]
 * @returns {string|null}
 */
export function signInLabel(methods, passkeys = []) {
  const list = normaliseMethods(methods);
  const first = list
    .filter((m) => FIRST_STEP_WORDS[m.method])
    .sort((a, b) => (a.timestamp ?? Infinity) - (b.timestamp ?? Infinity))[0];
  const second = list.find((m) => SECOND_STEP_METHODS.has(m.method));
  let secondWords = null;
  if (second) {
    const byPasskey = Number.isFinite(second.timestamp) && (Array.isArray(passkeys) ? passkeys : []).some((p) => {
      const used = p?.last_used_at ? Date.parse(p.last_used_at) / 1000 : NaN;
      return Number.isFinite(used) && Math.abs(used - second.timestamp) <= PASSKEY_MATCH_SECONDS;
    });
    secondWords = byPasskey ? 'passkey' : 'authenticator code';
  }
  const firstWords = first ? FIRST_STEP_WORDS[first.method] : null;
  if (firstWords && secondWords) return `${firstWords}, then ${secondWords}`;
  return secondWords || firstWords;
}

/** The auth session id from an access token (the session_id claim), or null. */
export const sessionIdFromToken = (token) => {
  try {
    const part = String(token || '').split('.')[1];
    if (!part) return null;
    const json = JSON.parse(atob(part.replace(/-/g, '+').replace(/_/g, '/')));
    return typeof json?.session_id === 'string' && json.session_id ? json.session_id : null;
  } catch {
    return null;
  }
};

const browserSessionStorage = () => {
  try {
    return typeof window !== 'undefined' ? window.sessionStorage : null;
  } catch {
    return null;
  }
};

let signInInFlight = null;

/**
 * Logs 'sign-in' the first time this tab sees the session at assurance level
 * 2. The flag holds the auth session's id, so a new sign-in in the same tab
 * is logged again while reloads and repeated checks are not. The flag is set
 * before the request, so a failed log is not retried on every check.
 * Concurrent calls share one attempt. Never throws.
 * @param {{storage?: Storage|null}} [options]
 * @returns {Promise<boolean>} true when a sign-in was logged by this call
 */
export function noteSecondFactorSignIn({ storage = browserSessionStorage() } = {}) {
  if (!signInInFlight) {
    signInInFlight = recordSignIn(storage).catch(() => false).finally(() => { signInInFlight = null; });
  }
  return signInInFlight;
}

async function recordSignIn(storage) {
  const [levels, current] = await Promise.all([
    supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
    supabase.auth.getSession(),
  ]);
  if (levels?.error || levels?.data?.currentLevel !== 'aal2') return false;
  const methods = levels.data.currentAuthenticationMethods;
  const stamps = normaliseMethods(methods).map((m) => m.timestamp).filter(Number.isFinite);
  const key = sessionIdFromToken(current?.data?.session?.access_token) || (stamps.length ? `amr:${Math.min(...stamps)}` : null);
  if (!key) return false;
  try {
    if (storage?.getItem(SIGN_IN_FLAG) === key) return false;
    storage?.setItem(SIGN_IN_FLAG, key);
  } catch {
    // Storage blocked: log anyway; at worst a reload logs the sign-in twice.
  }
  let passkeys = [];
  try {
    const { data } = await supabase.from('admin_passkeys').select('last_used_at');
    passkeys = Array.isArray(data) ? data : [];
  } catch {
    // Without the rows the second step reads as an authenticator code.
  }
  return logSecurityEvent('sign-in', signInLabel(methods, passkeys));
}

const activityService = { listActivity, recordHistory, logSecurityEvent, isActivityAvailable, noteSecondFactorSignIn };

export default activityService;
