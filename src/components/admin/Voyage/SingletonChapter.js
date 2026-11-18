// src/components/admin/Voyage/SingletonChapter.js
//
// A chapter for a table that holds one record (hero, about). There is no
// deck: the chapter shows the record itself as a read panel with an Edit
// button, and Edit opens the record dialog as a form only. No delete, no
// reorder, no new card.
//
// Which row is "the" row matters. The classic managers loaded the row with
// is_active = true; once that row was switched off they found nothing, showed
// an empty form, and the next save inserted a second row. Here every row is
// loaded and `pickSingleton` prefers the active one, then the latest, so a
// save always updates the existing row. Only an empty table offers to create
// one.

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AlertCircle, EyeOff, Pencil, Plus, RefreshCw } from 'lucide-react';
import RecordDialog from './RecordDialog';
import RecordView from './RecordView';
import { isPublic, pickSingleton } from './managers/schemaModel';
import { listRecords } from '../../../services/voyageRecords';

/**
 * @param {object} props
 * @param {object} props.schema a schema with mode 'singleton'.
 * @param {(text: string, tone?: string) => void} props.notify
 */
export default function SingletonChapter({ schema, notify }) {
  const [row, setRow] = useState(null);
  const [extra, setExtra] = useState(0);            // rows beyond the one shown, reported, never edited
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(false);
  const alive = useRef(true);

  const load = useCallback(() => {
    setLoading(true); setError(null);
    listRecords(schema)
      .then((rows) => { if (!alive.current) return; setRow(pickSingleton(rows)); setExtra(Math.max(0, rows.length - 1)); setLoading(false); })
      .catch((err) => { if (!alive.current) return; setError(err.message || 'The record could not be loaded.'); setLoading(false); });
  }, [schema]);

  useEffect(() => {
    alive.current = true;
    load();
    return () => { alive.current = false; };
  }, [load]);

  const saved = useCallback((next) => setRow((r) => ({ ...(r || {}), ...next })), []);
  const card = row ? schema.card(row) : null;
  const hidden = row && !isPublic(schema, row);

  return (
    <section className="singleton voyage-pane" aria-label={schema.plural} data-testid="singleton" aria-busy={loading || undefined}>
      {error && (
        <div className="deck__error" role="alert">
          <AlertCircle size={16} aria-hidden="true" />
          <p>{error} Check the connection, then try again.</p>
          <button type="button" className="voyage-bar__button" onClick={load}><RefreshCw size={14} /><span>Try again</span></button>
        </div>
      )}
      {loading && !row ? <div className="singleton__skeleton" aria-hidden="true" /> : null}
      {!loading && !error && !row && (
        <div className="singleton__empty">
          <p>Nothing here yet. The public page shows its built-in text until this is filled in.</p>
          <button type="button" className="voyage-bar__button voyage-bar__button--primary" onClick={() => setEditing(true)}><Plus size={14} /><span>Write it</span></button>
        </div>
      )}
      {row && (
        <>
          <header className="singleton__head">
            <div className="singleton__titles">
              <h3 className="singleton__title">{card.title}</h3>
              {card.subtitle ? <p className="singleton__sub">{card.subtitle}</p> : null}
              {hidden ? <p className="singleton__hidden"><EyeOff size={14} aria-hidden="true" /><span>Hidden from visitors. Switch it on in Edit to show it.</span></p> : null}
            </div>
            <button type="button" data-action="edit" className="voyage-bar__button voyage-bar__button--primary" onClick={() => setEditing(true)} disabled={loading}><Pencil size={14} /><span>Edit</span></button>
          </header>
          <RecordView schema={schema} row={row} />
          {extra > 0 && <p className="singleton__note">The table holds {extra + 1} rows; this one is shown and saved. The others are left untouched.</p>}
        </>
      )}
      <RecordDialog schema={schema} record={row} open={editing} editOnly onClose={() => setEditing(false)} onSaved={saved} onDeleted={() => {}} notify={notify} />
    </section>
  );
}
