// src/services/voyageRecords.js
//
// Records for the voyage's decks: list, save, delete, reorder and images for
// any manager schema. Writes go through `saveAdminData` (session-bound, typed
// errors, session facts, public refresh) so the new sheet and the classic
// managers share one write path. Deleting a project goes through the data
// service's `deleteProject`, which also clears its images from storage.
//
// Failures leave this module as errors the record dialog can sort into a
// small set of kinds (`failureKind`), so the owner always reads one fixed,
// actionable sentence and never loses what was typed.

import { describeAdminWriteError, getAdminSupabaseClient, removeAdminStorageFiles, saveAdminData, uploadAdminPublicFile } from './adminDataService';
import { deleteProject } from './dataService';
import { cleanupTargets, fileExtension } from '../components/admin/Voyage/managers/schemaModel';

const IMAGE_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
export const IMAGE_MAX_BYTES = 5 * 1024 * 1024;

/** All rows of a schema's table, every status, newest order first. */
export async function listRecords(schema) {
  const { data, error } = await getAdminSupabaseClient().from(schema.table).select('*').order(schema.orderKey || 'created_at', { ascending: false }).order('created_at', { ascending: false });
  if (error) throw new Error('The list could not be loaded.');
  return data || [];
}

/** Inserts or updates one row from a normalised payload. Returns the saved row. */
export async function saveRecord(schema, payload, id = null) {
  const result = await saveAdminData(schema.table, payload, id);
  return result.data;
}

/** A write the database accepted but applied to no row: under row level security that is a refusal, not a success. */
function refusedError(message) {
  const refused = new Error(message);
  refused.code = 'SECOND_FACTOR_REQUIRED';
  return refused;
}

/**
 * Deletes one row, then the stored files it owned (`schema.cleanup`).
 * Projects go through the data service, which clears their images itself.
 * The row goes first: if the delete is refused, its files are still there
 * for it; a file left behind by a failed cleanup is only an orphan, which
 * the media library lists, never a broken record.
 *
 * The delete asks for the removed id back. Row level security refuses a
 * delete by matching no row and reporting no error, so an empty answer is
 * checked: a row that is still there means the delete was refused; a row
 * that is gone was already deleted elsewhere, which is the outcome asked for.
 * @param {object} [row] the saved row, needed to know its files.
 */
export async function deleteRecord(schema, id, row = null) {
  if (schema.table === 'projects') {
    const result = await deleteProject(id);
    if (!result?.success) throw new Error('The project could not be deleted.');
    return;
  }
  const client = getAdminSupabaseClient();
  const { data, error } = await client.from(schema.table).delete().eq('id', id).select('id');
  if (error) throw new Error(`The ${schema.singular} could not be deleted.`);
  if (Array.isArray(data) && data.length === 0) {
    const { data: still } = await client.from(schema.table).select('id').eq('id', id).maybeSingle();
    if (still) throw refusedError(`The ${schema.singular} could not be deleted.`);
  }
  if (!row) return;
  await Promise.all(cleanupTargets(schema, row).map(({ bucket, urls }) => removeAdminStorageFiles(bucket, urls).catch(() => null)));
}

/**
 * Moves whole groups (skills by type): writes each group's new priority to
 * every row of that group. A missing group value is matched with IS NULL
 * (`eq(col, null)` matches nothing in PostgREST) or the empty string, the
 * two values the deck shows as one group.
 *
 * Every write asks for the rows it touched. A write that touched none was
 * refused (row level security answers a refused update with no rows and no
 * error), so the call fails instead of reporting an order that was never
 * stored. The returned stamps let the deck keep each row's `updated_at`
 * current, so the next Save of a moved record does not see a false conflict.
 * @param {Array<{value: string|null, priority: number}>} writes
 * @returns {Promise<Array<{id: string, updated_at: string}>>} the rows written.
 */
export async function reorderGroups(schema, writes) {
  const client = getAdminSupabaseClient();
  const { key, priorityKey } = schema.group;
  const stamp = new Date().toISOString();
  const results = await Promise.all(writes.map((w) => {
    const query = client.from(schema.table).update({ [priorityKey]: w.priority, updated_at: stamp });
    // The deck files rows with an empty string under the same "no group" heading as rows with a null,
    // so the write must reach both, or it would touch no row and read as a refusal.
    return (w.value === null ? query.or(`${key}.is.null,${key}.eq.""`) : query.eq(key, w.value)).select('id, updated_at');
  }));
  if (results.some((r) => r.error || !Array.isArray(r.data) || r.data.length === 0)) throw new Error('The new group order could not be saved.');
  return results.flatMap((r) => r.data);
}

/**
 * Writes a new order column: each entry's value under `schema.orderKey`.
 * All writes run together; the first failure fails the call, and so does a
 * write that touched no row (refused, or the row was deleted elsewhere).
 * @param {Array<{id: string}>} writes
 * @returns {Promise<Array<{id: string, updated_at: string}>>} the rows written, with their new stamps.
 */
export async function reorderRecords(schema, writes) {
  const client = getAdminSupabaseClient();
  const stamp = new Date().toISOString();
  const results = await Promise.all(writes.map((w) => client.from(schema.table).update({ [schema.orderKey]: w[schema.orderKey], updated_at: stamp }).eq('id', w.id).select('id, updated_at')));
  if (results.some((r) => r.error || !Array.isArray(r.data) || r.data.length !== 1)) throw new Error('The new order could not be saved.');
  return results.flatMap((r) => r.data);
}

/**
 * Sorts a failed write into the few kinds the dialog explains differently.
 * `saveAdminData` already tags session and permission errors with a code;
 * a request that never reached the server surfaces as a fetch TypeError
 * (Chromium "Failed to fetch", Safari "Load failed", Firefox "NetworkError").
 * @param {Error} err
 * @param {boolean} [online] navigator.onLine at the time of the failure.
 * @returns {'session'|'permission'|'network'|'unknown'}
 */
export function failureKind(err, online = typeof navigator === 'undefined' ? true : navigator.onLine) {
  if (err?.code === 'SESSION_EXPIRED') return 'session';
  if (err?.code === 'SECOND_FACTOR_REQUIRED') return 'permission';
  const text = `${err?.message ?? ''} ${err?.cause?.message ?? ''}`;
  if (!online || NETWORK_TEXT.test(text)) return 'network';
  return 'unknown';
}
// word boundaries matter: "Upload failed" (a storage refusal) must not read as Safari's "Load failed"
const NETWORK_TEXT = /failed to fetch|networkerror|network request failed|\bload failed|fetch failed|network error/i;

/** Wraps a raw Supabase error the way `saveAdminData` does, so reads share the same failure kinds. */
function typedError(error, fallback) {
  const described = describeAdminWriteError(error);
  const typed = new Error(described.code === 'WRITE_FAILED' ? (error?.message || fallback) : described.message);
  typed.code = described.code;
  typed.cause = error;
  return typed;
}

/**
 * The row's current `updated_at`, read just before an update so a change
 * made elsewhere (another tab, the classic dashboard) is not overwritten
 * blindly. Resolves to undefined when the row no longer exists.
 */
export async function fetchUpdatedAt(schema, id) {
  const { data, error } = await getAdminSupabaseClient().from(schema.table).select('updated_at').eq('id', id).maybeSingle();
  if (error) throw typedError(error, 'The latest version could not be checked.');
  return data ? data.updated_at ?? null : undefined;
}

/** One full row, for "Reload latest" after a conflict. */
export async function getRecord(schema, id) {
  const { data, error } = await getAdminSupabaseClient().from(schema.table).select('*').eq('id', id).maybeSingle();
  if (error) throw typedError(error, 'The latest version could not be loaded.');
  if (!data) throw new Error(`This ${schema.singular} no longer exists. It may have been deleted elsewhere.`);
  return data;
}

/**
 * Checks chosen files before upload, one verdict per file, so a single bad
 * file does not hide which others were fine. A count over the limit rejects
 * the whole choice, because which files to drop is the owner's call.
 * @returns {{accepted: File[], problems: Array<{name: string|null, message: string}>}}
 */
export function imageProblems(files, { existing = 0, max = 10 } = {}) {
  if (!files.length) return { accepted: [], problems: [{ name: null, message: 'Choose at least one image.' }] };
  if (existing + files.length > max) {
    const room = Math.max(0, max - existing);
    return { accepted: [], problems: [{ name: null, message: `At most ${max} images per record. ${room === 0 ? 'Remove one first.' : `There is room for ${room} more; ${files.length} were chosen.`}` }] };
  }
  const accepted = [], problems = [];
  for (const f of files) {
    if (!IMAGE_TYPES.includes(f.type)) problems.push({ name: f.name, message: 'is not a JPEG, PNG or WebP image.' });
    else if (f.size > IMAGE_MAX_BYTES) problems.push({ name: f.name, message: `is ${(f.size / 1048576).toFixed(1)} MB; the limit is 5 MB.` });
    else accepted.push(f);
  }
  return { accepted, problems };
}

/**
 * Uploads images for a saved record. Each file settles on its own, so one
 * failed upload is reported by name while the others still land.
 * @returns {Promise<{urls: string[], failed: Array<{name: string, message: string}>}>}
 */
export async function uploadImages(schema, id, files) {
  const stamp = Date.now();
  const settled = await Promise.allSettled(files.map((file, i) => {
    const ext = (file.name.split('.').pop() || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '') || 'bin';
    return uploadAdminPublicFile({ bucket: schema.images.bucket, filePath: `${schema.images.folder}/${id}/${schema.singular}-${stamp}-${i + 1}.${ext}`, file });
  }));
  const urls = [], failed = [];
  settled.forEach((r, i) => {
    if (r.status === 'fulfilled') urls.push(r.value.publicUrl);
    else failed.push({ name: files[i].name, message: failureKind(r.reason) === 'network' ? 'did not upload: the connection dropped.' : 'did not upload: storage refused it.' });
  });
  return { urls, failed };
}

/** Removes one stored image file; the record's list is saved separately by the dialog. Storage misses are not errors. */
export async function removeImage(schema, url) {
  try { await removeAdminStorageFiles(schema.images.bucket, url); } catch { /* the row no longer points at it, which is what matters */ }
}

/** "5 MB", "2 MB", "512 KB": a limit as the owner reads it. */
export const sizeLabel = (bytes) => (bytes >= 1048576 ? `${Math.round((bytes / 1048576) * 10) / 10} MB` : `${Math.round(bytes / 1024)} KB`);

/**
 * Checks chosen files against a field's upload rules (`field.upload`):
 * accepted types, size per file, files per choice (`perBatch`) and the
 * field's total (`maxCount`, counting what is already there). One verdict
 * per file, like `imageProblems`.
 * @returns {{accepted: File[], problems: Array<{name: string|null, message: string}>}}
 */
export function fileProblems(files, upload, { existing = 0 } = {}) {
  if (!files.length) return { accepted: [], problems: [{ name: null, message: 'Choose at least one file.' }] };
  const max = upload.maxCount ?? 1;
  if (upload.perBatch && files.length > upload.perBatch) return { accepted: [], problems: [{ name: null, message: `At most ${upload.perBatch} files at a time; ${files.length} were chosen.` }] };
  if (max > 1 && existing + files.length > max) {
    const room = Math.max(0, max - existing);
    return { accepted: [], problems: [{ name: null, message: `At most ${max} entries here. ${room === 0 ? 'Remove one first.' : `There is room for ${room} more; ${files.length} were chosen.`}` }] };
  }
  if (max === 1 && files.length > 1) return { accepted: [], problems: [{ name: null, message: 'Choose one file.' }] };
  const accepted = [], problems = [];
  for (const f of files) {
    if (!upload.accept.includes(f.type)) problems.push({ name: f.name, message: `is not ${upload.typesLabel}.` });
    else if (f.size > upload.maxBytes) problems.push({ name: f.name, message: `is ${(f.size / 1048576).toFixed(1)} MB; the limit is ${sizeLabel(upload.maxBytes)}.` });
    else accepted.push(f);
  }
  return { accepted, problems };
}

/**
 * Uploads files for one field of a saved record into the field's bucket at
 * the path its schema builds (`upload.path({ id, form, file, index, stamp, ext })`).
 * Each file settles on its own, so one failure is reported by name.
 * @returns {Promise<{urls: string[], failed: Array<{name: string, message: string}>}>}
 */
export async function uploadFieldFiles(upload, { id, form }, files) {
  const stamp = Date.now();
  const settled = await Promise.allSettled(files.map((file, index) => uploadAdminPublicFile({ bucket: upload.bucket, filePath: upload.path({ id, form, file, index, stamp, ext: fileExtension(file.name) }), file })));
  const urls = [], failed = [];
  settled.forEach((r, i) => {
    if (r.status === 'fulfilled') urls.push(r.value.publicUrl);
    else failed.push({ name: files[i].name, message: failureKind(r.reason) === 'network' ? 'did not upload: the connection dropped.' : 'did not upload: storage refused it.' });
  });
  return { urls, failed };
}

/** Removes stored files from a bucket after the row stopped pointing at them; misses and failures are not errors. */
export async function removeStoredFiles(bucket, urls) {
  try { await removeAdminStorageFiles(bucket, urls); } catch { /* an orphan at worst; the row is already right */ }
}
