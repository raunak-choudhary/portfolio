// src/components/admin/Voyage/recordIntent.js
//
// A request to open one record somewhere in the voyage, kept in a tiny
// external store (the signal.js pattern) so the page, the chapters and the
// record dialog can react to it without lifting state through every layer.
//
// Intent: { table, recordId, mode: 'edit'|'read', field, walk }
//   table, recordId  the record to open; the page scrolls to the table's chapter
//                    and that chapter's deck (or singleton panel) opens it
//   mode             'edit' opens the form straight away
//   field            the form field to ring and focus (the fix walk's target)
//   walk             null, or the fix walk: { ruleKey, ids, index, items, title, why, score, fixed }
//
// A plain open (no walk) is consumed by the chapter that opens it; a walk
// stays in the store while the owner moves through its items, and leaves it
// on Stop fixing, Back to the queue, or when the dialog closes.
//
// Two counters ride beside it: `queueRequests` asks the page to show the fix
// queue, `fixesChanged` tells it the content changed under the queue so the
// health and the queue reload.

import { createSignal, useSignal } from './signal';
import { contentVersion, noteContentChanged } from './contentChanged';

export const recordIntent = createSignal(null);
export const queueRequests = createSignal(0);
/** The shared content signal (contentChanged.js) under the name the queue code uses. */
export const fixesChanged = contentVersion;

/** Start a walk or any other intent. */
export const setIntent = (intent) => recordIntent.set(intent || null);

/** Open one record (activity rows and other callers use this one function). */
export const openRecord = (table, recordId, { mode = 'read', field = null } = {}) => recordIntent.set({ table, recordId, mode, field, walk: null });

/** Forget the current intent. */
export const clearIntent = () => recordIntent.set(null);

/** The content changed: reload the health and the queue. */
export const noteFixesChanged = noteContentChanged;

/** End any walk, reload, and bring the queue into view. */
export function backToQueue() {
  recordIntent.set(null);
  noteFixesChanged();
  queueRequests.set(queueRequests.get() + 1);
}

/** Ask for the queue without touching an intent (the bento tile). */
export const showQueue = () => queueRequests.set(queueRequests.get() + 1);

/** Read the current intent in a component. */
export const useRecordIntent = () => useSignal(recordIntent);

/**
 * Back to a clean slate when the voyage unmounts: no intent and no pending
 * queue request survive into the next visit (the content version is left
 * alone; readers only compare it with what they last loaded).
 */
export function resetRecordIntent() {
  recordIntent.set(null);
  queueRequests.set(0);
}
