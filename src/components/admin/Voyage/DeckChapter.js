// src/components/admin/Voyage/DeckChapter.js
//
// Ties a manager schema to its deck and record dialog inside a chapter
// stage: loads the records (with a retry when the load fails), opens the
// dialog for a card or for a new record, merges saves back into the deck,
// drops deleted cards, and writes a new order after a drag or a group move
// (optimistically; if the write fails the deck reloads what the database holds). For a grouped schema a
// saved record takes its group's priority, so a new skill joins its group
// where the group already sits instead of at the default position.
//
// A record intent for this chapter's table (recordIntent.js) opens that
// record once the list has loaded: in the form when the intent asks for
// edit, and with the fix banner when it carries a fix walk. The walk moves
// on by replacing the intent; closing the dialog ends it.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Deck from './Deck';
import RecordDialog from './RecordDialog';
import { useFixWalk } from './fixWalk';
import { groupMoveWrites, nextOrderValue, orderWritesFor, priorityForGroup, sortRows } from './managers/schemaModel';
import { listRecords, reorderGroups, reorderRecords } from '../../../services/voyageRecords';
import { noteContentChanged } from './contentChanged';

const LEAVE_MS = 420;

/**
 * @param {object} props
 * @param {object} props.schema
 * @param {(text: string, tone?: string) => void} props.notify
 */
export default function DeckChapter({ schema, notify }) {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [dialog, setDialog] = useState({ open: false, record: null });
  const [leaving, setLeaving] = useState(() => new Set());
  const [freshId, setFreshId] = useState(null);
  const alive = useRef(true);

  const load = useCallback(() => {
    setLoading(true); setError(null);
    listRecords(schema).then((rows) => { if (alive.current) { setRecords(sortRows(schema, rows)); setLoading(false); } }).catch((err) => { if (alive.current) { setError(err.message || 'The list could not be loaded.'); setLoading(false); } });
  }, [schema]);

  useEffect(() => {
    alive.current = true;
    load();
    return () => { alive.current = false; };
  }, [load]);

  const open = useCallback((record) => setDialog({ open: true, record }), []);
  const create = useCallback(() => setDialog({ open: true, record: null }), []);
  const { fix, startInEdit, onCloseDialog, onDeleted: walkDeleted } = useFixWalk({ table: schema.table, records, ready: !loading && !error, open: setDialog, notify, current: dialog });
  const close = useCallback(() => { setDialog((s) => ({ ...s, open: false })); onCloseDialog(); }, [onCloseDialog]);

  const saved = useCallback((row, isNew) => {
    setRecords((rows) => sortRows(schema, isNew ? [row, ...rows] : rows.map((r) => (r.id === row.id ? { ...r, ...row } : r))));
    setDialog({ open: true, record: row });
    if (isNew) { setFreshId(row.id); setTimeout(() => alive.current && setFreshId(null), 1200); }
  }, [schema]);

  const deleted = useCallback((id) => {
    setDialog({ open: false, record: null });
    walkDeleted();
    setLeaving((s) => new Set([...s, id]));
    setTimeout(() => { if (!alive.current) return; setRecords((rows) => rows.filter((r) => r.id !== id)); setLeaving((s) => { const n = new Set(s); n.delete(id); return n; }); }, LEAVE_MS);
  }, [walkDeleted]);

  // Order writes run one after another. Two quick drags used to send their writes together, and whichever
  // request landed last decided each row's order. An idle queue starts its task at once.
  const orderQueue = useRef(null);
  const inOrder = useCallback((task) => {
    const run = orderQueue.current ? orderQueue.current.then(task) : task();
    const tracked = run.finally(() => { if (orderQueue.current === tracked) orderQueue.current = null; });
    orderQueue.current = tracked;
    return tracked;
  }, []);

  // The reorder writes stamp updated_at on every row they touch. The deck takes those stamps, and so
  // does the record the dialog holds (it may have been opened while the write was in flight), or the
  // next Save of a moved record would compare against the old one and report a change "somewhere else".
  // `apply` also puts the written order back on the rows: when an earlier queued write failed and the
  // deck reloaded from the database, that reload predates this write, and without it the deck would
  // show an order the database no longer holds.
  const landed = useCallback((written, apply) => {
    const byId = new Map((written || []).filter((w) => w && w.id).map((w) => [w.id, w.updated_at]));
    const stamp = (r) => (byId.has(r.id) ? { ...r, updated_at: byId.get(r.id) } : r);
    setRecords((rows) => sortRows(schema, rows.map((r) => stamp(apply(r)))));
    setDialog((d) => (d.record && byId.has(d.record.id) ? { ...d, record: stamp(apply(d.record)) } : d));
  }, [schema]);

  // A failed order write may have stored part of the new order (the writes are separate requests), so
  // the deck goes back to what the database holds; the optimistic copy is only the fallback.
  const restore = useCallback(async (before) => {
    try { const rows = await listRecords(schema); if (alive.current) setRecords(sortRows(schema, rows)); } catch { if (alive.current) setRecords(before); }
  }, [schema]);

  // Both reorders raise the shared content signal only once the write lands, so the activity pane and the
  // fix queue reload after a saved order and never for the optimistic step or a rolled-back one.
  const reorder = useCallback((ids) => {
    const before = records;
    const writes = orderWritesFor(schema, ids);
    const byId = Object.fromEntries(writes.map((w) => [w.id, w[schema.orderKey]]));
    const apply = (r) => (r.id in byId ? { ...r, [schema.orderKey]: byId[r.id] } : r);
    setRecords(sortRows(schema, records.map(apply)));
    return inOrder(async () => {
      try { const written = await reorderRecords(schema, writes); if (alive.current) landed(written, apply); noteContentChanged(); notify('Order saved.'); } catch (err) { notify(err.message || 'The new order could not be saved.', 'bad'); await restore(before); }
    });
  }, [records, schema, notify, inOrder, landed, restore]);

  const moveGroup = useCallback((index, delta, groups) => {
    const { key, priorityKey } = schema.group;
    const writes = groupMoveWrites(groups, index, delta);
    if (!writes.length) return undefined;
    const before = records;
    const byValue = new Map(writes.map((w) => [w.value, w.priority]));
    const valueOf = (r) => (r[key] === undefined || r[key] === null || r[key] === '' ? null : String(r[key]));
    const apply = (r) => (byValue.has(valueOf(r)) ? { ...r, [priorityKey]: byValue.get(valueOf(r)) } : r);
    setRecords(sortRows(schema, records.map(apply)));
    return inOrder(async () => {
      try { const written = await reorderGroups(schema, writes); if (alive.current) landed(written, apply); noteContentChanged(); notify('Group order saved.'); } catch (err) { notify(err.message || 'The new group order could not be saved.', 'bad'); await restore(before); }
    });
  }, [records, schema, notify, inOrder, landed, restore]);

  // a new record, or one moved into another group, takes that group's priority
  const prepare = useMemo(() => (schema.group?.priorityKey ? (payload, { isNew, base }) => {
    const { key, priorityKey } = schema.group;
    if (!isNew && base && String(base[key] ?? '') === String(payload[key] ?? '')) return payload;
    const others = records.filter((r) => r.id !== base?.id);
    return { ...payload, [priorityKey]: priorityForGroup(schema, others, payload[key]) };
  } : undefined), [schema, records]);

  const nextOrder = useMemo(() => (schema.orderKey ? nextOrderValue(schema, records) : 1), [schema, records]);

  return (
    <>
      <Deck schema={schema} records={records} loading={loading} error={error} onRetry={load} onOpen={open} onCreate={create} onReorder={reorder} onMoveGroup={schema.group ? moveGroup : undefined} leaving={leaving} freshId={freshId} />
      <RecordDialog schema={schema} record={dialog.record} open={dialog.open} onClose={close} onSaved={saved} onDeleted={deleted} notify={notify} nextOrder={nextOrder} prepare={prepare} fix={fix} startInEdit={startInEdit} />
    </>
  );
}
