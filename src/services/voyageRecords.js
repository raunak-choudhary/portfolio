// src/services/voyageRecords.js
//
// Records for the voyage's decks: list, save, delete, reorder and images for
// any manager schema. Writes go through `saveAdminData` (session-bound, typed
// errors, session facts, public refresh) so the new sheet and the classic
// managers share one write path. Deleting a project goes through the data
// service's `deleteProject`, which also clears its images from storage.

import { getAdminSupabaseClient, removeAdminStorageFiles, saveAdminData, uploadAdminPublicFile } from './adminDataService';
import { deleteProject } from './dataService';

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

/** Deletes one row (and, for projects, its stored images). */
export async function deleteRecord(schema, id) {
  if (schema.table === 'projects') {
    const result = await deleteProject(id);
    if (!result?.success) throw new Error('The project could not be deleted.');
    return;
  }
  const { error } = await getAdminSupabaseClient().from(schema.table).delete().eq('id', id);
  if (error) throw new Error(`The ${schema.singular} could not be deleted.`);
}

/**
 * Writes a new order column: each entry's order_index. All writes run
 * together; the first failure fails the call.
 * @param {Array<{id: string, order_index: number}>} writes
 */
export async function reorderRecords(schema, writes) {
  const client = getAdminSupabaseClient();
  const stamp = new Date().toISOString();
  const results = await Promise.all(writes.map((w) => client.from(schema.table).update({ [schema.orderKey]: w.order_index, updated_at: stamp }).eq('id', w.id)));
  if (results.some((r) => r.error)) throw new Error('The new order could not be saved.');
}

/** Checks files before upload; returns a fixed sentence or null. */
export function imageProblem(files, { existing = 0, max = 10 } = {}) {
  if (!files.length) return 'Choose at least one image.';
  if (existing + files.length > max) return `At most ${max} images per record.`;
  for (const f of files) {
    if (!IMAGE_TYPES.includes(f.type)) return 'Images must be JPEG, PNG or WebP.';
    if (f.size > IMAGE_MAX_BYTES) return 'Each image must be under 5 MB.';
  }
  return null;
}

/** Uploads images for a saved record and returns their public URLs, in order. */
export async function uploadImages(schema, id, files) {
  const stamp = Date.now();
  const uploads = files.map((file, i) => {
    const ext = (file.name.split('.').pop() || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '') || 'bin';
    return uploadAdminPublicFile({ bucket: schema.images.bucket, filePath: `${schema.images.folder}/${id}/${schema.singular}-${stamp}-${i + 1}.${ext}`, file });
  });
  const results = await Promise.all(uploads);
  return results.map((r) => r.publicUrl);
}

/** Removes one stored image file; the record's list is saved separately by the sheet. Storage misses are not errors. */
export async function removeImage(schema, url) {
  try { await removeAdminStorageFiles(schema.images.bucket, url); } catch { /* the row no longer points at it, which is what matters */ }
}
