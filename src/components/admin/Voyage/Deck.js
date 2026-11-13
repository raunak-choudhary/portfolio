// src/components/admin/Voyage/Deck.js
//
// A chapter's records as a deck of glass cards beside its constellation:
// newest first, a "new" card at the front, drag to reorder, search when the
// deck grows. A card opens the sheet. Create rises into the deck and delete
// dims and drops (CSS on the card's state classes); the deck itself stays
// quiet because this is where the owner works.

import React, { useMemo, useState } from 'react';
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, arrayMove, rectSortingStrategy, sortableKeyboardCoordinates, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Award, EyeOff, Plus, Search, Star } from 'lucide-react';

const FLAG_ICON = { starred: Star, award: Award, hidden: EyeOff };
const FLAG_TEXT = { starred: 'Starred on the public page', award: 'Has an award', hidden: 'Hidden from the public page' };
export const SEARCH_FROM = 9;

function Card({ schema, row, onOpen, sortable, leaving, fresh }) {
  const card = schema.card(row);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: row.id, disabled: !sortable });
  const style = { transform: CSS.Transform.toString(transform), transition };
  return (
    <article ref={setNodeRef} style={style} className={`card voyage-pane${isDragging ? ' is-dragging' : ''}${leaving ? ' is-leaving' : ''}${fresh ? ' is-new' : ''}`} {...attributes} {...listeners}>
      <button type="button" className="card__open" onClick={() => onOpen(row)} aria-label={`Open ${card.title}`}>
        <div className={`card__media${card.image ? '' : ' card__media--empty'}`}>{card.image ? <img src={card.image} alt="" loading="lazy" /> : null}</div>
        <div className="card__body">
          <h4>{card.title}</h4>
          {card.subtitle && <p className="card__sub">{card.subtitle}</p>}
          {card.chips?.length ? <div className="card__chips">{card.chips.map((c) => <span key={c}>{c}</span>)}</div> : null}
        </div>
        {card.flags?.length ? <div className="card__flags">{card.flags.map((f) => { const Icon = FLAG_ICON[f]; return Icon ? <span key={f} title={FLAG_TEXT[f]} aria-label={FLAG_TEXT[f]}><Icon size={13} /></span> : null; })}</div> : null}
      </button>
    </article>
  );
}

/**
 * @param {object} props
 * @param {object} props.schema
 * @param {object[]} props.records in deck order (newest first).
 * @param {boolean} props.loading
 * @param {string|null} props.error
 * @param {(row: object) => void} props.onOpen
 * @param {() => void} props.onCreate
 * @param {(ids: string[]) => void} props.onReorder new order of ids after a drag.
 * @param {Set<string>} [props.leaving] ids mid-removal.
 * @param {string|null} [props.freshId] the id just added.
 */
export default function Deck({ schema, records, loading, error, onOpen, onCreate, onReorder, leaving = new Set(), freshId = null }) {
  const [query, setQuery] = useState('');
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const q = query.trim().toLowerCase();
  const shown = useMemo(() => (q ? records.filter((r) => schema.searchText(r).includes(q)) : records), [records, q, schema]);
  const sortable = !q && records.length > 1;
  const onDragEnd = ({ active, over }) => {
    if (!over || active.id === over.id) return;
    const ids = records.map((r) => r.id);
    const next = arrayMove(ids, ids.indexOf(active.id), ids.indexOf(over.id));
    onReorder(next);
  };
  return (
    <section className="deck" aria-label={`${schema.plural} deck`} data-testid="deck">
      <div className="deck__bar">
        <span className="deck__count">{loading ? 'Loading' : `${records.length} ${records.length === 1 ? schema.singular : schema.plural}`}{sortable && !loading ? ' · drag to reorder' : ''}</span>
        {records.length >= SEARCH_FROM && (
          <label className="deck__search"><Search size={14} aria-hidden="true" /><input type="search" value={query} placeholder={`Search ${schema.plural}`} onChange={(e) => setQuery(e.target.value)} aria-label={`Search ${schema.plural}`} /></label>
        )}
      </div>
      {error && <p className="deck__error" role="alert">{error}</p>}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={shown.map((r) => r.id)} strategy={rectSortingStrategy}>
          <div className="deck__grid">
            {!q && (
              <button type="button" className="card card--new voyage-pane" onClick={onCreate} disabled={loading}>
                <Plus size={22} /><span>New {schema.singular}</span>
              </button>
            )}
            {loading && !records.length ? [0, 1, 2].map((i) => <div key={i} className="card card--skeleton voyage-pane" aria-hidden="true" />) : null}
            {shown.map((row) => <Card key={row.id} schema={schema} row={row} onOpen={onOpen} sortable={sortable} leaving={leaving.has(row.id)} fresh={row.id === freshId} />)}
          </div>
        </SortableContext>
      </DndContext>
      {!loading && !records.length && !error && <p className="deck__empty">No {schema.plural} yet. The first one goes here.</p>}
      {!loading && q && !shown.length && <p className="deck__empty">Nothing matches "{query}".</p>}
    </section>
  );
}
