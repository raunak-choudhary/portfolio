// src/components/admin/Voyage/DeckChapter.js
//
// Ties a manager schema to its deck and sheet inside a chapter stage: loads
// the records, opens the sheet for a card or for a new record, merges saves
// back into the deck, drops deleted cards, and writes a new order after a
// drag (optimistically, rolled back if the write fails).

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Deck from './Deck';
import Sheet from './Sheet';
import { deckOrder, nextOrderIndex, orderWrites } from './managers/projects.schema';
import { listRecords, reorderRecords } from '../../../services/voyageRecords';

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
  const [sheet, setSheet] = useState({ open: false, record: null });
  const [leaving, setLeaving] = useState(() => new Set());
  const [freshId, setFreshId] = useState(null);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    listRecords(schema).then((rows) => { if (alive.current) { setRecords(deckOrder(rows)); setLoading(false); } }).catch((err) => { if (alive.current) { setError(err.message); setLoading(false); } });
    return () => { alive.current = false; };
  }, [schema]);

  const open = useCallback((record) => setSheet({ open: true, record }), []);
  const create = useCallback(() => setSheet({ open: true, record: null }), []);
  const close = useCallback(() => setSheet((s) => ({ ...s, open: false })), []);

  const saved = useCallback((row, isNew) => {
    setRecords((rows) => deckOrder(isNew ? [row, ...rows] : rows.map((r) => (r.id === row.id ? { ...r, ...row } : r))));
    setSheet({ open: true, record: row });
    if (isNew) { setFreshId(row.id); setTimeout(() => alive.current && setFreshId(null), 1200); }
  }, []);

  const deleted = useCallback((id) => {
    setSheet({ open: false, record: null });
    setLeaving((s) => new Set([...s, id]));
    setTimeout(() => { if (!alive.current) return; setRecords((rows) => rows.filter((r) => r.id !== id)); setLeaving((s) => { const n = new Set(s); n.delete(id); return n; }); }, LEAVE_MS);
  }, []);

  const reorder = useCallback(async (ids) => {
    const before = records;
    const writes = orderWrites(ids);
    const byId = Object.fromEntries(writes.map((w) => [w.id, w.order_index]));
    setRecords(deckOrder(records.map((r) => ({ ...r, [schema.orderKey]: byId[r.id] ?? r[schema.orderKey] }))));
    try { await reorderRecords(schema, writes); notify('Order saved.'); } catch (err) { setRecords(before); notify(err.message || 'The new order could not be saved.', 'bad'); }
  }, [records, schema, notify]);

  const nextOrder = useMemo(() => nextOrderIndex(records), [records]);

  return (
    <>
      <Deck schema={schema} records={records} loading={loading} error={error} onOpen={open} onCreate={create} onReorder={reorder} leaving={leaving} freshId={freshId} />
      <Sheet schema={schema} record={sheet.record} open={sheet.open} onClose={close} onSaved={saved} onDeleted={deleted} notify={notify} nextOrder={nextOrder} />
    </>
  );
}
