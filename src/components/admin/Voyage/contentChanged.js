// src/components/admin/Voyage/contentChanged.js
//
// One shared "the content changed" signal for the voyage. Anything that saves
// or deletes portfolio content bumps it (the record dialog, for every chapter
// that edits through it, a saved deck or group order, and each inbox update
// or delete); anything that shows numbers derived from
// the content (the fix queue, the Health tile, the activity pane)
// reloads quietly when it moves. A plain counter, so readers compare
// versions and never need the payload.

import { createSignal, useSignal } from './signal';

export const contentVersion = createSignal(0);

/** A save, an upload or a delete landed. */
export const noteContentChanged = () => contentVersion.set(contentVersion.get() + 1);

/** The current version in a component; it re-renders when the content changes. */
export const useContentVersion = () => useSignal(contentVersion);
