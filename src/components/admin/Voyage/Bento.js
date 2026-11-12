// src/components/admin/Voyage/Bento.js
//
// Mission control: a grid of glass tiles with real data, draggable into any
// order (remembered per browser). Each tile answers one question. Data comes
// in as props so the page can load it once and the tiles stay simple.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { DndContext, PointerSensor, KeyboardSensor, closestCenter, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, arrayMove, rectSortingStrategy, sortableKeyboardCoordinates, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Activity, Inbox, ListChecks, Moon, Pencil, Sparkles, TrendingUp, Wrench } from 'lucide-react';
import { moonPhase } from '../SkyBackground/skyModel';
import { relativeTime } from '../../../services/voyageData';
import { BENTO_ORDER_KEY, percentChange, sanitizeOrder, sectionTallies, topIssues, weakestSections } from './bentoModel';

const readOrder = () => { try { return sanitizeOrder(JSON.parse(localStorage.getItem(BENTO_ORDER_KEY))); } catch { return sanitizeOrder(null); } };
const writeOrder = (order) => { try { localStorage.setItem(BENTO_ORDER_KEY, JSON.stringify(order)); } catch { /* cosmetic */ } };

const Ring = ({ value }) => { const r = 40, c = 2 * Math.PI * r; return (
  <svg className="tile__ring" viewBox="0 0 100 100" aria-hidden="true">
    <circle cx="50" cy="50" r={r} fill="none" stroke="rgba(127,140,170,.25)" strokeWidth="8" />
    <circle cx="50" cy="50" r={r} fill="none" stroke="var(--voyage-accent)" strokeWidth="8" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - Math.min(100, Math.max(0, value)) / 100)} transform="rotate(-90 50 50)" />
    <text x="50" y="57" textAnchor="middle" fontFamily="Oswald, sans-serif" fontSize="26" fontWeight="700" fill="currentColor">{value}</text>
  </svg>
); };

const Sparkline = ({ values }) => {
  if (!values.length) return <p className="tile__empty">No visits recorded yet.</p>;
  const w = 300, h = 64, max = Math.max(1, ...values);
  const pts = values.map((v, i) => `${(i / Math.max(1, values.length - 1)) * w},${h - (v / max) * (h - 6) - 3}`).join(' ');
  return <svg className="tile__spark" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden="true"><polyline points={pts} fill="none" stroke="var(--voyage-accent)" strokeWidth="2" /><polygon points={`0,${h} ${pts} ${w},${h}`} fill="var(--voyage-accent)" opacity=".12" /></svg>;
};

const Bars = ({ rows }) => (
  <div className="tile__bars">
    {rows.map((r) => (
      <div key={r.label}><span>{r.label}</span><i><b style={{ width: `${Math.min(100, r.value)}%`, background: r.tone === 'bad' ? 'var(--voyage-bad)' : undefined }} /></i><span>{r.text ?? r.value}</span></div>
    ))}
  </div>
);

/** Tile contents by id; each receives the loaded data and the navigation callbacks. */
function TileBody({ id, data, onGo }) {
  const health = data.health, sections = health?.sections || [];
  switch (id) {
    case 'health': {
      const t = sectionTallies(sections);
      return <><h5><Activity size={14} /> Health</h5><div className="tile__row"><Ring value={health?.summary?.score ?? 0} /><div><div className="tile__big">{health?.summary?.score ?? '…'}<small>/100</small></div><div className="tile__muted">{health ? `${t.strong} strong · ${t.attention} need attention` : 'Checking…'}</div></div></div></>;
    }
    case 'visitors': {
      const v = data.visitors; const change = v ? percentChange(v.totalVisitors, v.previousVisitors) : null;
      return <><h5><TrendingUp size={14} /> Visitors · 30 days</h5><div className="tile__big">{v ? v.totalVisitors.toLocaleString() : '…'}{change !== null && <small>{change >= 0 ? '+' : ''}{change}%</small>}</div><Sparkline values={(v?.days || []).map((d) => d.views)} /></>;
    }
    case 'inbox':
      return <><h5><Inbox size={14} /> Inbox</h5><div className="tile__big">{data.inbox ? data.inbox.count : '…'}<small>unread</small></div><div className="tile__muted">{data.inbox?.latest?.[0] ? `${data.inbox.latest[0].name} · ${relativeTime(data.inbox.latest[0].createdAt)}` : 'Nothing waiting.'}</div><button type="button" className="tile__link" onClick={() => onGo('inbox')}>Open the inbox</button></>;
    case 'fixes': {
      const issues = topIssues(sections, 4);
      return <><h5><Wrench size={14} /> Fix next</h5>{issues.length ? <div className="tile__queue">{issues.map((i, k) => <div key={k}><b className={i.severity}>{i.severity}</b><span>{i.section} · {i.message}</span></div>)}</div> : <p className="tile__empty">{health ? 'Nothing to fix. Well played.' : 'Checking…'}</p>}</>;
    }
    case 'sections':
      return <><h5><ListChecks size={14} /> Sections</h5><Bars rows={weakestSections(sections, 5).map((s) => ({ label: s.name, value: s.completeness || 0, tone: (s.completeness || 0) < 50 ? 'bad' : undefined }))} /></>;
    case 'edits':
      return <><h5><Pencil size={14} /> Recent edits</h5>{data.edits?.length ? <div className="tile__feed">{data.edits.map((e, k) => <div key={k}><time>{relativeTime(e.at)}</time>{e.section} · {e.label}</div>)}</div> : <p className="tile__empty">No edits recorded yet.</p>}</>;
    case 'pages':
      return <><h5><Sparkles size={14} /> Top pages · 30 days</h5>{data.pages?.length ? <Bars rows={data.pages.map((p) => ({ label: p.page, value: (p.views / data.pages[0].views) * 100, text: p.views }))} /> : <p className="tile__empty">No page views yet.</p>}</>;
    case 'tonight': {
      const { lit, waxing } = moonPhase(new Date());
      return <><h5><Moon size={14} /> Tonight</h5><div className="tile__row"><img src={`${data.assetBase}moon.webp`} alt="" className="tile__moon" /><div><div className="tile__big">{Math.round(lit * 100)}%</div><div className="tile__muted">{waxing ? 'waxing' : 'waning'} · {lit > 0.97 ? 'full moon' : lit < 0.03 ? 'new moon' : waxing ? 'filling out' : 'thinning'}</div></div></div></>;
    }
    default: return null;
  }
}

const SPANS = { health: 'w2 h2', visitors: 'w2', inbox: 'w2', fixes: 'w2 h2', sections: 'w2', edits: 'w2', pages: 'w2', tonight: 'w2' };

function SortableTile({ id, children }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className={`voyage-pane tile ${SPANS[id]}${isDragging ? ' is-dragging' : ''}`} {...attributes} {...listeners}>
      {children}
    </div>
  );
}

/**
 * @param {object} props
 * @param {object} props.data { health, visitors, inbox, edits, pages, assetBase }
 * @param {(chapterId: string) => void} props.onGo
 */
export default function Bento({ data, onGo }) {
  const [order, setOrder] = useState(readOrder);
  useEffect(() => { writeOrder(order); }, [order]);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const onDragEnd = useCallback((event) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setOrder((prev) => arrayMove(prev, prev.indexOf(active.id), prev.indexOf(over.id)));
  }, []);
  const items = useMemo(() => order, [order]);
  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={items} strategy={rectSortingStrategy}>
        <div className="voyage-bento" data-testid="bento">
          {items.map((id) => <SortableTile key={id} id={id}><TileBody id={id} data={data} onGo={onGo} /></SortableTile>)}
        </div>
      </SortableContext>
    </DndContext>
  );
}
