// src/services/inboxService.js
//
// Reads and writes for the voyage's inbox (table contact_messages). The
// inbox does not use `saveAdminData`: that path records every call as a
// saved change in the session facts, and marking a message read is not an
// edit the exit credits should count.
//
// Two traps this module exists to avoid:
// - Row level security answers a refused UPDATE or DELETE with success and
//   zero rows, not an error. Every write therefore asks for the rows back
//   (`select`) and treats "none came back" as a permission refusal.
// - Attachments are stored as `contact-attachments/contact-<ts>-<i>-<name>`
//   INSIDE the bucket of the same name (see emailService). The shared
//   `removeAdminStorageFiles` strips a leading `bucket/` and would aim at a
//   path that does not exist, so files are removed here by their raw paths.

import { createContactAttachmentSignedUrl, describeAdminWriteError, getAdminSupabaseClient } from './adminDataService';
import { attachmentsOf } from '../components/admin/Voyage/inboxModel';

export const ATTACHMENT_BUCKET = 'contact-attachments';
export const SIGNED_URL_SECONDS = 300;

/** Wraps a Supabase error so `failureKind` can sort it (session, permission, network, unknown). */
function typedError(error, fallback) {
  const described = describeAdminWriteError(error);
  const typed = new Error(described.code === 'WRITE_FAILED' ? (error?.message || fallback) : described.message);
  typed.code = described.code;
  typed.cause = error;
  return typed;
}

/** A refusal RLS reported as "nothing matched". */
function refused(message) {
  const err = new Error(message);
  err.code = 'SECOND_FACTOR_REQUIRED';
  return err;
}

/** Every message, newest first; the inbox filters and sorts on the client. */
export async function listMessages() {
  const { data, error } = await getAdminSupabaseClient().from('contact_messages').select('*').order('created_at', { ascending: false });
  if (error) throw typedError(error, 'The inbox could not be loaded.');
  return data || [];
}

/**
 * Writes one patch to every listed message and returns the saved rows.
 * @param {string[]} ids
 * @param {object} patch columns from `patchFor` (inboxModel)
 */
export async function updateMessages(ids, patch) {
  if (!ids?.length) return [];
  const { data, error } = await getAdminSupabaseClient().from('contact_messages')
    .update({ ...patch, updated_at: new Date().toISOString() }).in('id', ids).select();
  if (error) throw typedError(error, 'The change could not be saved.');
  if (!data?.length) throw refused('The change was refused. Enter your authenticator code in a new tab, then try again.');
  return data;
}

/**
 * Deletes messages and the files they carried.
 *
 * Files go first: a message whose row is gone can no longer tell anyone
 * where its files are, which is how the classic manager left orphans in a
 * private bucket. If the storage call fails, nothing is deleted. If the row
 * delete then fails, the files are already gone; the error says so plainly
 * (`filesRemoved: true`) so the view can reload rather than pretend.
 *
 * @param {object[]} messages the full rows, needed for their attachment paths
 * @returns {Promise<{deletedIds: string[], filesRemoved: number, filesExpected: number}>}
 */
export async function deleteMessages(messages) {
  const client = getAdminSupabaseClient();
  const ids = messages.map((m) => m.id);
  const paths = [...new Set(messages.flatMap((m) => attachmentsOf(m).map((a) => a.path)))];

  let filesRemoved = 0;
  if (paths.length) {
    const { data, error } = await client.storage.from(ATTACHMENT_BUCKET).remove(paths);
    if (error) {
      const err = typedError(error, 'The attachments could not be removed, so nothing was deleted.');
      err.message = err.code === 'WRITE_FAILED' ? 'The attachments could not be removed, so nothing was deleted.' : err.message;
      err.filesRemoved = false;
      throw err;
    }
    // storage under RLS also answers a refusal with an empty list
    filesRemoved = data?.length ?? 0;
  }

  const { data, error } = await client.from('contact_messages').delete().in('id', ids).select('id');
  if (error || !data?.length) {
    const err = error ? typedError(error, 'The messages could not be deleted.') : refused('The delete was refused.');
    if (paths.length && filesRemoved > 0) {
      err.message = `${filesRemoved === 1 ? 'Its attachment was' : 'The attachments were'} removed, but the message could not be deleted. ${err.message}`;
      err.filesRemoved = true;
    }
    throw err;
  }
  return { deletedIds: data.map((r) => r.id), filesRemoved, filesExpected: paths.length };
}

/** A five-minute link to one private attachment. */
export async function signedAttachmentUrl(path) {
  const result = await createContactAttachmentSignedUrl(path, SIGNED_URL_SECONDS);
  return result.signedUrl;
}
