// src/services/reportsTableProbe.js
//
// One narrow question the shared reports service does not answer: does the
// analytics_reports table exist yet? reportsService maps every unexpected
// read error to LOAD_FAILED, which is right for the report unit, but the
// Analytics chapter wants a calm "not set up yet" instead of an error while
// the report job has not been deployed. This probe is asked only after a
// LOAD_FAILED and reads a single id; it never shows server text.

import { supabase } from './supabaseClient';

/** Postgres "undefined table" and PostgREST "table not in the schema cache". */
const MISSING_TABLE_CODES = new Set(['42P01', 'PGRST205']);

/**
 * True only when the server says the table does not exist; false for every
 * other answer, including a network failure (the caller then shows its error).
 * @returns {Promise<boolean>}
 */
export async function reportsTableMissing() {
  try {
    const { error } = await supabase.from('analytics_reports').select('id').limit(1);
    return Boolean(error && MISSING_TABLE_CODES.has(String(error.code ?? '')));
  } catch {
    return false;
  }
}
