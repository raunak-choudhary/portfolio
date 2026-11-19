// src/components/admin/Voyage/fixWalk.js
//
// The chapter side of the record intent (recordIntent.js), shared by the deck
// and the singleton chapter: once a chapter's records are loaded it opens the
// record an intent names, and while a fix walk is on it builds the `fix` prop
// the record dialog shows as its banner. Moving through the walk replaces the
// intent (the next record opens through the same path); Stop fixing, Back to
// the queue and closing the dialog end it and ask the queue to reload.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { checkItem, stepIntent } from './fixQueueModel';
import { backToQueue, clearIntent, noteFixesChanged, setIntent, useRecordIntent } from './recordIntent';

const sameId = (a, b) => a != null && b != null && String(a) === String(b);

/**
 * @param {object} args
 * @param {string} args.table the chapter's table.
 * @param {Array<object>} args.records the loaded rows.
 * @param {boolean} args.ready the rows are loaded (no error).
 * @param {(state: {open: boolean, record: object|null}) => void} args.open opens or closes the chapter's dialog.
 * @param {(text: string, tone?: string) => void} args.notify
 * @param {{open: boolean, record: object|null}} args.current the dialog's state.
 * @returns {{fix: object|null, startInEdit: boolean, onCloseDialog: () => void}}
 */
export function useFixWalk({ table, records, ready, open, notify, current }) {
  const intent = useRecordIntent();
  const handled = useRef(null);
  const [startInEdit, setStartInEdit] = useState(false);
  const mine = intent && intent.table === table ? intent : null;

  // open the record an intent names, once per intent
  useEffect(() => {
    if (!mine || !ready || handled.current === mine) return;
    handled.current = mine;
    const record = records.find((r) => sameId(r.id, mine.recordId));
    if (!record) {
      notify('That record is no longer here. It may have been deleted; the queue reloads.', 'bad');
      clearIntent(); noteFixesChanged();
      return;
    }
    setStartInEdit(mine.mode === 'edit');
    open({ open: true, record });
    if (!mine.walk) clearIntent();   // a plain open is consumed here; a walk stays until it ends
  }, [mine, ready, records, open, notify]);

  const end = useCallback(({ toQueue = false } = {}) => {
    open({ open: false, record: null });
    setStartInEdit(false);
    if (toQueue) backToQueue(); else { clearIntent(); noteFixesChanged(); }
  }, [open]);

  const walking = Boolean(mine?.walk) && current.open && sameId(current.record?.id, mine.recordId);
  const fix = useMemo(() => {
    if (!walking) return null;
    const { walk } = mine;
    const item = walk.items[walk.index] || {};
    const advance = (fixedGain) => { const next = stepIntent(mine, { fixedGain }); if (next) setIntent(next); else end({ toQueue: true }); };
    return {
      field: mine.field, task: item.task, state: item.state, gain: item.gain || 0, score: walk.score,
      step: walk.index + 1, total: walk.ids.length, next: walk.items[walk.index + 1] || null, fieldLabel: walk.fieldLabel || 'field',
      check: (row) => checkItem(walk.ruleKey, row),
      onSkip: () => advance(0), onNext: advance, onStop: () => end(), onQueue: () => end({ toQueue: true }),
    };
  }, [walking, mine, end]);

  // closing the dialog in any other way (X, Escape, Cancel) ends a walk too
  const onCloseDialog = useCallback(() => {
    setStartInEdit(false);
    if (mine?.walk) { clearIntent(); noteFixesChanged(); }
  }, [mine]);

  return { fix, startInEdit, onCloseDialog };
}
