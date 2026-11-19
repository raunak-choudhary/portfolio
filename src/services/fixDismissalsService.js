// src/services/fixDismissalsService.js
//
// Fix-queue items the owner marked "not needed" (table admin_fix_dismissals,
// migration 20261120120000_admin_activity.sql). A dismissal names a rule
// (`<table>:<group or field>`, e.g. projects:images) and either one record
// or, with recordId null, the whole group. Row level security lets only the
// admin read, add or remove them.
//
// Failures are typed errors like the rest of the admin (`failureKind` in
// voyageRecords.js): SESSION_EXPIRED, SECOND_FACTOR_REQUIRED, a fetch
// TypeError for the network, DISMISSALS_NOT_SET_UP before the migration.

import { supabase } from './supabaseClient';
import { toServiceError } from './activityService';

export const DISMISSALS_TABLE = 'admin_fix_dismissals';
export const DISMISSALS_NOT_SET_UP = 'DISMISSALS_NOT_SET_UP';
export const DISMISSAL_COLUMNS = 'id, rule_key, record_id, note, created_at';

/** Longest reason the table accepts. */
export const NOTE_MAX = 140;

/** Postgres unique violation: this item is already dismissed. */
const UNIQUE_VIOLATION = '23505';

/** A stored row in the shape the fix queue uses. */
export const toDismissal = (row) => ({
  id: row.id,
  ruleKey: row.rule_key,
  recordId: row.record_id ?? null,
  note: row.note ?? null,
  createdAt: row.created_at,
});

const fail = (error, fallback) => toServiceError(error, fallback, DISMISSALS_NOT_SET_UP);

/** A refusal that row level security reports as "nothing matched". */
const refused = () => {
  const err = new Error('This needs your authenticator code. Open the admin area in a new tab, enter the code, then try again.');
  err.code = 'SECOND_FACTOR_REQUIRED';
  return err;
};

/** The reason as stored: trimmed, single-spaced, at most 140 characters, null when empty. */
export const cleanNote = (note) => {
  const text = String(note ?? '').replace(/\s+/g, ' ').trim().slice(0, NOTE_MAX).trim();
  return text || null;
};

/** Every dismissal, newest first. */
export async function listDismissals() {
  const { data, error } = await supabase.from(DISMISSALS_TABLE).select(DISMISSAL_COLUMNS).order('created_at', { ascending: false });
  if (error) throw fail(error, 'The items marked not needed could not be loaded.');
  return (Array.isArray(data) ? data : []).map(toDismissal);
}

/** The existing dismissal of a rule and record, for a repeated "Not needed". */
async function findDismissal(ruleKey, recordId) {
  const base = supabase.from(DISMISSALS_TABLE).select(DISMISSAL_COLUMNS).eq('rule_key', ruleKey);
  const { data, error } = await (recordId === null ? base.is('record_id', null) : base.eq('record_id', recordId)).maybeSingle();
  if (error) throw fail(error, 'The item could not be marked not needed.');
  return data ? toDismissal(data) : null;
}

/**
 * Marks an item, or with recordId null the whole group, as not needed.
 * Dismissing something already dismissed returns the stored row.
 * @param {string} ruleKey e.g. 'projects:images'
 * @param {string|number|null} recordId
 * @param {string} [note] optional reason, at most 140 characters
 */
export async function dismiss(ruleKey, recordId = null, note = null) {
  const key = String(ruleKey ?? '').trim();
  if (!key) throw new Error('A fix rule is required.');
  const record = recordId === null || recordId === undefined || recordId === '' ? null : String(recordId);
  const { data, error } = await supabase
    .from(DISMISSALS_TABLE)
    .insert([{ rule_key: key, record_id: record, note: cleanNote(note) }])
    .select(DISMISSAL_COLUMNS)
    .single();
  if (error && String(error.code ?? '') === UNIQUE_VIOLATION) {
    const existing = await findDismissal(key, record);
    if (existing) return existing;
  }
  if (error) throw fail(error, 'The item could not be marked not needed.');
  return toDismissal(data);
}

/**
 * Brings a dismissed item back into the queue. An item already brought back
 * (another tab) counts as done; a row that is still there after the delete
 * was refused by row level security.
 */
export async function restore(id) {
  if (!id) throw new Error('No item selected.');
  const { data, error } = await supabase.from(DISMISSALS_TABLE).delete().eq('id', id).select('id');
  if (error) throw fail(error, 'The item could not be brought back.');
  if (Array.isArray(data) && data.length > 0) return;
  const check = await supabase.from(DISMISSALS_TABLE).select('id').eq('id', id).maybeSingle();
  if (check.error) throw fail(check.error, 'The item could not be brought back.');
  if (check.data) throw refused();
}

const fixDismissalsService = { listDismissals, dismiss, restore };

export default fixDismissalsService;
