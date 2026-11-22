// src/services/reportsService.js
//
// The admin's side of the quarterly report: the archive (table
// analytics_reports, readable only by an admin at aal2 through row level
// security), "Generate now", which calls the quarterly-report Edge
// Function, and deleting one stored report. supabase-js attaches the session's access token to the call; the
// function itself checks admin and aal2 again.
//
// Every failure comes back as { success: false, error: { code, message } }
// with one fixed sentence, never a server or library message.

import { supabase } from './supabaseClient';

export const REPORT_FUNCTION = 'quarterly-report';

/** Columns the archive shows; the report itself is opened from body_html or body_text. */
export const REPORT_COLUMNS =
  'id, period_label, quarter, period_start, period_end, partial, trigger, email_status, created_at, body_html, body_text, summary';

export const REPORT_MESSAGES = {
  SESSION_EXPIRED: 'Your session expired. Sign in again, then make the report.',
  SECOND_FACTOR_REQUIRED: 'Enter your authenticator code first, then make the report.',
  FORBIDDEN: 'This account cannot make reports.',
  NOT_CONFIGURED: 'The report is not set up yet.',
  NETWORK: 'The report service could not be reached. Check the connection and try again.',
  LOAD_FAILED: 'The reports could not be loaded. Try again later.',
  DELETE_FAILED: 'The report could not be deleted. Try again later.',
  DELETE_NOT_ALLOWED: 'The report was kept: deleting reports is not set up in the database yet.',
  UNKNOWN: 'The report could not be made. Try again later.'
};

const failure = (code) => ({ success: false, error: { code, message: REPORT_MESSAGES[code] || REPORT_MESSAGES.UNKNOWN } });

/** Server codes from the function, mapped to the codes the admin screens branch on. */
const SERVER_CODES = {
  unauthorized: 'SESSION_EXPIRED',
  insufficient_aal: 'SECOND_FACTOR_REQUIRED',
  forbidden: 'FORBIDDEN',
  origin_not_allowed: 'FORBIDDEN',
  not_configured: 'NOT_CONFIGURED'
};

/** Turns a functions.invoke error into a failure result. */
const describeInvokeError = async (error) => {
  const response = error?.context;
  const status = typeof response?.status === 'number' ? response.status : 0;
  if (error?.name === 'FunctionsFetchError' || (!status && error?.name !== 'FunctionsHttpError')) return failure('NETWORK');
  let code = '';
  try {
    const body = await response.clone().json();
    code = typeof body?.code === 'string' ? body.code : '';
  } catch {
    // Not JSON: the gateway answered, not the function.
  }
  if (SERVER_CODES[code]) return failure(SERVER_CODES[code]);
  if (status === 404) return failure('NOT_CONFIGURED');
  if (status === 401) return failure('SESSION_EXPIRED');
  return failure('UNKNOWN');
};

/** Sorts a PostgREST error the same way the other admin reads do. */
const describeReadError = (error) => {
  const status = Number(error?.status ?? error?.statusCode ?? 0);
  const text = `${error?.message ?? ''} ${error?.code ?? ''}`.toLowerCase();
  if (status === 401 || text.includes('jwt')) return failure('SESSION_EXPIRED');
  if (status === 403 || text.includes('42501') || text.includes('permission denied')) return failure('SECOND_FACTOR_REQUIRED');
  return failure('LOAD_FAILED');
};

/** Every stored report, newest first. */
export async function listReports() {
  try {
    const { data, error } = await supabase.from('analytics_reports').select(REPORT_COLUMNS).order('created_at', { ascending: false });
    if (error) return describeReadError(error);
    return { success: true, data: data || [] };
  } catch {
    return failure('NETWORK');
  }
}

/**
 * Makes a report of the quarter so far, stores it and emails it.
 * On success `data` is { id, quarter, partial, email_status }.
 */
export async function generateReport() {
  try {
    const { data, error } = await supabase.functions.invoke(REPORT_FUNCTION, { body: {} });
    if (error) return describeInvokeError(error);
    if (!data?.success || !data.data?.id) return failure('UNKNOWN');
    return { success: true, data: data.data };
  } catch {
    return failure('NETWORK');
  }
}

/** Report ids are Postgres uuids; anything else is refused before a request is made. */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A refused delete: a missing grant (42501) or a 403 from the gateway. */
const isPermissionError = (error) => {
  const status = Number(error?.status ?? error?.statusCode ?? 0);
  const text = `${error?.message ?? ''} ${error?.code ?? ''}`.toLowerCase();
  return status === 403 || text.includes('42501') || text.includes('permission denied');
};

/**
 * Deletes one stored report. On success `data` is { id } (in lower case).
 *
 * The delete asks for the deleted ids back. Row level security does not
 * raise an error for rows a policy hides; it deletes nothing and answers
 * 200 with an empty list. Without the returned ids, a database that has no
 * delete policy yet (migration 20261122120000 not run) or a session below
 * the second factor would look like a successful delete. Zero rows, or a
 * refused grant, therefore come back as DELETE_NOT_ALLOWED.
 * @param {string} id
 */
export async function deleteReport(id) {
  if (typeof id !== 'string' || !UUID_PATTERN.test(id)) return failure('DELETE_FAILED');
  // Postgres prints uuids in lower case, so the returned id is compared in that form.
  const target = id.toLowerCase();
  try {
    const { data, error } = await supabase.from('analytics_reports').delete().eq('id', target).select('id');
    if (error) return failure(isPermissionError(error) ? 'DELETE_NOT_ALLOWED' : 'DELETE_FAILED');
    if (!Array.isArray(data) || !data.some((row) => String(row?.id ?? '').toLowerCase() === target)) return failure('DELETE_NOT_ALLOWED');
    return { success: true, data: { id: target } };
  } catch {
    return failure('DELETE_FAILED');
  }
}
