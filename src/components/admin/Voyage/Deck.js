// src/components/admin/Voyage/Deck.js
//
// A chapter's records as a deck of glass cards beside its constellation:
// in the schema's order, a "new" card at the front, drag to reorder when the
// schema owns an order column (no handle otherwise), search when the deck
// grows. A grouped schema (skills by type) shows one titled section per group,
// each collapsible, with Up and Down buttons that move the whole group.
// A card opens the record dialog. A failed load says so and
// offers a retry instead of showing an empty deck as if nothing existed. Create rises into the deck and delete
// dims and drops (CSS on the card's state classes); the deck itself stays
// quiet because this is where the owner works.

import React, { useMemo, useState } from 'react';
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, arrayMove, rectSortingStrategy, sortableKeyboardCoordinates, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { AlertCircle, ArrowDown, ArrowUp, Award, CalendarX, ChevronDown, Clock, EyeOff, Plus, RefreshCw, Search, Star } from 'lucide-react';
import { canDrag, cardFlags, groupRows } from './managers/schemaModel';

const FLAG_ICON = { starred: Star, featured: Star, award: Award, current: Clock, expired: CalendarX, hidden: EyeOff };
const FLAG_TEXT = { starred: 'Starred on the public page', featured: 'Featured', award: 'Has an award', current: 'Current', expired: 'Expired', hidden: 'Hidden from the public page' };
export const SEARCH_FROM = 9;

function CardFace({ schema, row, onOpen }) {
  const card = schema.card(row);
  const flags = cardFlags(schema, row, card);
  const compact = schema.cardStyle === 'compact';
  return (
    <button type="button" className="card__open" onClick={() => onOpen(row)} aria-label={`Open ${card.title}`}>
      {compact
        ? (card.image ? <div className="card__icon"><img src={card.image} alt="" loading="lazy" /></div> : null)
        : <div className={`card__media${card.image ? '' : ' card__media--empty'}`}>{card.image ? <img src={card.image} alt="" loading="lazy" /> : null}</div>}
      <div className="card__body">
        <h4>{card.title}</h4>
        {card.subtitle && <p className="card__sub">{card.subtitle}</p>}
        {card.chips?.length ? <div className="card__chips">{card.chips.map((c) => <span key={c}>{c}</span>)}</div> : null}
      </div>
      {flags.length ? <div className="card__flags">{flags.map((f) => { const Icon = FLAG_ICON[f]; return Icon ? <span key={f} title={FLAG_TEXT[f]} aria-label={FLAG_TEXT[f]}><Icon size={13} /></span> : null; })}</div> : null}
    </button>
  );
}

const cardClass = (schema, { dragging, leaving, fresh }) => `card voyage-pane${schema.cardStyle === 'compact' ? ' card--compact' : ''}${dragging ? ' is-dragging' : ''}${leaving ? ' is-leaving' : ''}${fresh ? ' is-new' : ''}`;

/** A card that never moves: no sortable wiring, so no drag affordance and no keyboard pick-up. */
function StillCard({ schema, row, onOpen, leaving, fresh }) {
  return <article className={cardClass(schema, { leaving, fresh })}><CardFace schema={schema} row={row} onOpen={onOpen} /></article>;
}

function Card({ schema, row, onOpen, sortable, leaving, fresh }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: row.id, disabled: !sortable });
  const style = { transform: CSS.Transform.toString(transform), transition };
  return (
    <article ref={setNodeRef} style={style} className={cardClass(schema, { dragging: isDragging, leaving, fresh })} {...attributes} {...listeners}>
      <CardFace schema={schema} row={row} onOpen={onOpen} />
    </article>
  );
}

function Group({ schema, group, index, total, onOpen, onMove, leaving, freshId, searching }) {
  const [open, setOpen] = useState(true);
  const bodyId = `deck-group-${schema.table}-${index}`;
  return (
    <section className="deck__group" aria-label={group.label}>
      <header className="deck__group-head">
        <button type="button" className="deck__group-toggle" aria-expanded={open} aria-controls={bodyId} onClick={() => setOpen((o) => !o)}>
          <ChevronDown size={16} aria-hidden="true" className={open ? '' : 'is-closed'} />
          <h3>{group.label}</h3>
          <span className="deck__group-count">{group.rows.length}</span>
        </button>
        {onMove && !searching && (
          <span className="deck__group-tools">
            <button type="button" className="pairs__tool" aria-label={`Move ${group.label} up`} disabled={index === 0} onClick={() => onMove(index, -1)}><ArrowUp size={14} /></button>
            <button type="button" className="pairs__tool" aria-label={`Move ${group.label} down`} disabled={index === total - 1} onClick={() => onMove(index, 1)}><ArrowDown size={14} /></button>
          </span>
        )}
      </header>
      <div id={bodyId} className="deck__grid" hidden={!open}>
        {group.rows.map((row) => <StillCard key={row.id} schema={schema} row={row} onOpen={onOpen} leaving={leaving.has(row.id)} fresh={row.id === freshId} />)}
      </div>
    </section>
  );
}

/**
 * @param {object} props
 * @param {object} props.schema
 * @param {object[]} props.records in deck order (newest first).
 * @param {boolean} props.loading
 * @param {string|null} props.error
 * @param {() => void} [props.onRetry] reloads after a failed load.
 * @param {(row: object) => void} props.onOpen
 * @param {() => void} props.onCreate
 * @param {(ids: string[]) => void} props.onReorder new order of ids after a drag.
 * @param {(index: number, delta: number, groups: object[]) => void} [props.onMoveGroup] moves a whole group (grouped schemas).
 * @param {Set<string>} [props.leaving] ids mid-removal.
 * @param {string|null} [props.freshId] the id just added.
 */
export default function Deck({ schema, records, loading, error, onRetry, onOpen, onCreate, onReorder, onMoveGroup, leaving = new Set(), freshId = null }) {
  const [query, setQuery] = useState('');
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const q = query.trim().toLowerCase();
  const shown = useMemo(() => (q ? records.filter((r) => schema.searchText(r).includes(q)) : records), [records, q, schema]);
  const sortable = canDrag(schema) && !q && records.length > 1;
  const groups = useMemo(() => (schema.group ? groupRows(schema, shown) : null), [schema, shown]);
  // a failed first load knows nothing: no count, and no new record whose
  // order index would be computed from an empty list
  const unknown = !!error && !records.length;
  const onDragEnd = ({ active, over }) => {
    if (!over || active.id === over.id) return;
    const ids = records.map((r) => r.id);
    const next = arrayMove(ids, ids.indexOf(active.id), ids.indexOf(over.id));
    onReorder(next);
  };
  const newCard = !q && (
    <button type="button" className={`card card--new voyage-pane${schema.cardStyle === 'compact' ? ' card--compact' : ''}`} onClick={onCreate} disabled={loading || unknown}>
      <Plus size={22} /><span>New {schema.singular}</span>
    </button>
  );
  const skeletons = loading && !records.length ? [0, 1, 2].map((i) => <div key={i} className={`card card--skeleton voyage-pane${schema.cardStyle === 'compact' ? ' card--compact' : ''}`} aria-hidden="true" />) : null;
  return (
    <section className="deck" aria-label={`${schema.plural} deck`} data-testid="deck">
      <div className="deck__bar">
        <span className="deck__count">{loading ? 'Loading' : unknown ? 'Not loaded' : `${records.length} ${records.length === 1 ? schema.singular : schema.plural}`}{sortable && !loading ? ' · drag to reorder' : ''}</span>
        {records.length >= SEARCH_FROM && (
          <label className="deck__search"><Search size={14} aria-hidden="true" /><input type="search" value={query} placeholder={`Search ${schema.plural}`} onChange={(e) => setQuery(e.target.value)} aria-label={`Search ${schema.plural}`} /></label>
        )}
      </div>
      {error && (
        <div className="deck__error" role="alert">
          <AlertCircle size={16} aria-hidden="true" />
          <p>{error} Check the connection{onRetry ? ', then try again.' : '.'}</p>
          {onRetry && <button type="button" className="voyage-bar__button" onClick={onRetry}><RefreshCw size={14} /><span>Try again</span></button>}
        </div>
      )}
      {groups
        ? (
          <>
            <div className="deck__grid">
              {newCard}
              {skeletons}
            </div>
            {groups.map((group, i) => <Group key={group.value ?? '__none'} schema={schema} group={group} index={i} total={groups.length} onOpen={onOpen} onMove={onMoveGroup ? (index, delta) => onMoveGroup(index, delta, groups) : null} leaving={leaving} freshId={freshId} searching={!!q} />)}
          </>
        )
        : canDrag(schema)
          ? (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
              <SortableContext items={shown.map((r) => r.id)} strategy={rectSortingStrategy}>
                <div className="deck__grid">
                  {newCard}
                  {skeletons}
                  {shown.map((row) => <Card key={row.id} schema={schema} row={row} onOpen={onOpen} sortable={sortable} leaving={leaving.has(row.id)} fresh={row.id === freshId} />)}
                </div>
              </SortableContext>
            </DndContext>
          )
          : (
            <div className="deck__grid">
              {newCard}
              {skeletons}
              {shown.map((row) => <StillCard key={row.id} schema={schema} row={row} onOpen={onOpen} leaving={leaving.has(row.id)} fresh={row.id === freshId} />)}
            </div>
          )}
      {!loading && !records.length && !error && <p className="deck__empty">No {schema.plural} yet. The first one goes here.</p>}
      {!loading && q && !shown.length && <p className="deck__empty">Nothing matches "{query}".</p>}
    </section>
  );
}
