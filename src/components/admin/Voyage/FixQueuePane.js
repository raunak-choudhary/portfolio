// src/components/admin/Voyage/FixQueuePane.js
//
// The fix queue on Mission Control: health issues as ranked work. Each group
// is one gap in one section with the reason a recruiter notices it and the
// points it is worth; "Fix" walks its records one by one in the record
// dialog (through the record intent store), "Not needed" hides a group or a
// single record with an optional reason, and "Marked not needed" brings any
// of them back. Below the queue: sections nobody has touched for over 90
// days (no score effect) and how the score is worked out, from the real
// rule weights.
//
// The data and its actions live in useFixQueue, so the page can feed the
// bento tile and this pane from one load. The numbers come from
// fixQueueModel.js; nothing here does arithmetic of its own.

import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { AlertCircle, ArrowRight, CalendarX, Check, ChevronDown, CircleSlash, Info, Pencil, Undo2, Wrench } from 'lucide-react';
import { dismiss, restore } from '../../../services/fixDismissalsService';
import { loadFixQueueData } from '../../../services/fixQueueData';
import { NOTE_MAX, SEVERITY_LABEL, availableFilters, buildFixQueue, filterGroups, gainText, resolveTargetField, round1, scoreExplainer, staleSections, walkIntent } from './fixQueueModel';
import { fixesChanged, setIntent } from './recordIntent';
import { useSignal } from './signal';
import { schemaForTable } from './managers';
import './FixQueue.css';

/** Items listed under an open group before "Show N more". */
export const SHOWN_ITEMS = 6;
/** The id the page scrolls to when the queue is asked for. */
export const FIX_QUEUE_ID = 'fix-queue';

/**
 * Loads the queue's data once, again whenever the content changes under it
 * (a fix walk ended), and keeps dismissals in step without a reload.
 */
export function useFixQueue() {
  const [input, setInput] = useState(null);
  const [failed, setFailed] = useState(false);
  const changed = useSignal(fixesChanged);
  useEffect(() => {
    let alive = true;
    loadFixQueueData().then((data) => { if (alive) { setInput(data); setFailed(false); } }, () => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, [changed]);
  const model = useMemo(() => (input ? buildFixQueue({ rowsByTable: input.rowsByTable, dismissals: input.dismissals }) : null), [input]);
  const stale = useMemo(() => (input ? staleSections(input.freshness, new Date()) : []), [input]);
  const dismissItem = useCallback(async (ruleKey, recordId, note) => {
    const row = await dismiss(ruleKey, recordId, note);
    setInput((prev) => ({ ...prev, dismissals: [row, ...prev.dismissals] }));
  }, []);
  const restoreItem = useCallback(async (id) => {
    await restore(id);
    setInput((prev) => ({ ...prev, dismissals: prev.dismissals.filter((d) => d.id !== id) }));
  }, []);
  return { model, stale, loading: !input && !failed, failed, dismissalsAvailable: Boolean(input?.dismissalsAvailable), dismissalsProblem: input?.dismissalsProblem || null, dismissItem, restoreItem };
}

/** Starts the walk through a group, at its first record or at the chosen one. */
export function startWalk(group, model, startId = null) {
  setIntent(walkIntent(group, { startId, field: resolveTargetField(schemaForTable(group.table), group.fields), score: model.scoreWithDismissals }));
}

const Gain = ({ value }) => <span className={`fx-gain${round1(value) ? '' : ' is-zero'}`}>{gainText(value)}<small>points</small></span>;
const Btn = ({ icon: Icon, kind, children, ...rest }) => (
  <button type="button" className={`voyage-bar__button voyage-bar__button--small${kind ? ` voyage-bar__button--${kind}` : ''}`} {...rest}>{Icon ? <Icon size={15} aria-hidden="true" /> : null}<span>{children}</span></button>
);

/** "Not needed": an optional reason, asked in place. */
function DismissForm({ target, onSave, onCancel }) {
  const id = useId();
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const inputRef = useRef(null);
  useEffect(() => { inputRef.current?.focus(); }, []);
  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true); setError(null);
    try { await onSave(note); } catch (err) { setError(err?.message || 'It could not be saved.'); setBusy(false); }
  };
  return (
    <form className="fx-dismiss" onSubmit={submit} onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); onCancel(); } }} data-testid="fx-dismiss">
      <label htmlFor={id}>Why is this not needed? <span className="fx-dismiss__optional">(optional)</span></label>
      <input ref={inputRef} id={id} type="text" maxLength={NOTE_MAX} value={note} onChange={(e) => setNote(e.target.value)} aria-describedby={`${id}-help`} />
      <p id={`${id}-help`}>{target.recordId == null ? 'The group leaves the queue' : `${target.label} leaves the queue`} and stops counting against the score. You can bring it back any time.</p>
      {error && <p className="fx-dismiss__error" role="alert"><AlertCircle size={14} aria-hidden="true" /><span>{error}</span></p>}
      <div className="fx-dismiss__acts">
        <button type="submit" className="voyage-bar__button voyage-bar__button--small voyage-bar__button--primary" disabled={busy}><Check size={15} aria-hidden="true" /><span>{busy ? 'Saving' : 'Save'}</span></button>
        <Btn kind="quiet" onClick={onCancel} disabled={busy}>Cancel</Btn>
      </div>
    </form>
  );
}

function GroupRow({ group, model, open, onToggle, canDismiss, dismissing, setDismissing, onDismiss }) {
  const listId = useId();
  const [all, setAll] = useState(false);
  const items = all ? group.items : group.items.slice(0, SHOWN_ITEMS);
  const many = group.items.length > 1;
  const formHere = dismissing?.ruleKey === group.ruleKey;
  return (
    <li className={`fx-row${open ? ' is-open' : ''}`} data-rule={group.ruleKey}>
      <span className="fx-row__rank" aria-hidden="true" />
      <div className="fx-row__top"><span className="fx-row__title">{group.title}</span><Gain value={group.gain} /></div>
      <p className="fx-row__why">{group.why}</p>
      <div className="fx-row__meta">
        <span className={`fx-sev fx-sev--${group.severity}`}>{SEVERITY_LABEL[group.severity]}</span>
        <span className="fx-chip">{group.section}</span>
        <span>Field: {group.fieldLabel}</span>
        <button type="button" className="fx-toggle" aria-expanded={open} aria-controls={listId} onClick={onToggle}>
          {open ? 'Hide' : many ? `Show all ${group.items.length}` : 'Show it'}<ChevronDown size={14} aria-hidden="true" />
        </button>
      </div>
      <div className="fx-row__actions">
        <Btn kind="primary" icon={ArrowRight} onClick={() => startWalk(group, model)}>{many ? `Fix ${group.items.length}, one by one` : 'Fix it'}</Btn>
        {canDismiss && <Btn kind="quiet" icon={CircleSlash} onClick={() => setDismissing({ ruleKey: group.ruleKey, recordId: null })} aria-label={`Not needed: ${group.title}`}>Not needed</Btn>}
      </div>
      <ul className="fx-items" id={listId} hidden={!open}>
        {open && items.map((item) => (
          <li key={item.recordId}>
            <span>{item.label}<small>{item.task} · {gainText(item.gain)}</small></span>
            <div className="fx-items__acts">
              <Btn icon={Pencil} onClick={() => startWalk(group, model, item.recordId)} aria-label={`Fix ${item.label}`}>Fix</Btn>
              {canDismiss && <Btn kind="quiet" onClick={() => setDismissing({ ruleKey: group.ruleKey, recordId: item.recordId, label: item.label })} aria-label={`Not needed: ${item.label}`}>Not needed</Btn>}
            </div>
          </li>
        ))}
        {open && group.items.length > SHOWN_ITEMS && (
          <li className="fx-items__more"><button type="button" className="fx-toggle" onClick={() => setAll((v) => !v)}>{all ? 'Show fewer' : `Show ${group.items.length - SHOWN_ITEMS} more`}</button></li>
        )}
      </ul>
      {formHere && <DismissForm target={dismissing} onSave={(note) => onDismiss(dismissing, note)} onCancel={() => setDismissing(null)} />}
    </li>
  );
}

/**
 * @param {object} props
 * @param {ReturnType<typeof useFixQueue>} props.fixes
 * @param {(chapterId: string) => void} props.onReview opens a chapter from the stale list.
 * @param {(text: string, tone?: string) => void} [props.notify]
 */
export default function FixQueuePane({ fixes, onReview, notify = () => {} }) {
  const { model, stale, loading, failed, dismissalsAvailable, dismissalsProblem, dismissItem, restoreItem } = fixes;
  const [filter, setFilter] = useState('all');
  const [openKey, setOpenKey] = useState(null);
  const [dismissing, setDismissing] = useState(null);
  const [showHidden, setShowHidden] = useState(false);
  const [restoring, setRestoring] = useState(null);
  const [restoreError, setRestoreError] = useState(null);
  const headRef = useRef(null);
  const groups = useMemo(() => (model ? filterGroups(model.groups, filter) : []), [model, filter]);
  const filters = useMemo(() => (model ? availableFilters(model.groups) : []), [model]);
  useEffect(() => { if (!filters.some((f) => f.id === filter)) setFilter('all'); }, [filters, filter]);

  const onDismiss = async (target, note) => {
    await dismissItem(target.ruleKey, target.recordId, note);
    setDismissing(null);
    notify('Marked not needed.');
    headRef.current?.focus();
  };
  const onRestore = async (d) => {
    setRestoring(d.id); setRestoreError(null);
    try { await restoreItem(d.id); notify('Back in the queue.'); } catch (err) { setRestoreError(err?.message || 'It could not be brought back.'); } finally { setRestoring(null); }
  };

  const hiddenCount = model ? model.dismissed.length : 0;
  const counted = model ? model.dismissed.reduce((s, d) => s + d.covers, 0) : 0;
  const now = model ? round1(model.scoreWithDismissals) : 0;
  const after = model ? round1(model.afterEveryFix) : 0;

  return (
    <section className="voyage-pane fx-pane" id={FIX_QUEUE_ID} aria-labelledby="fx-title" aria-busy={loading || undefined} data-testid="fix-queue">
      <div className="fx-head">
        <h3 id="fx-title" ref={headRef} tabIndex={-1}><Wrench size={16} aria-hidden="true" />Fix queue</h3>
        {model && model.groups.length > 0 && <span className="fx-head__sum"><b>{model.groups.length}</b> {model.groups.length === 1 ? 'thing' : 'things'}, worth <b>{gainText(model.totalGain)}</b> points</span>}
      </div>

      {loading && <div className="fx-skeletons" aria-hidden="true">{[0, 1, 2].map((i) => <div key={i} className="fx-skel fx-skel--tall" />)}</div>}
      {failed && <p className="fx-note" role="alert">The queue could not be loaded. It tries again after the next save.</p>}

      {model && (model.groups.length ? (
        <>
          <div className="fx-score">
            <div className="fx-score__track" aria-hidden="true">
              <span className="fx-score__now" style={{ width: `${now}%` }} />
              <span className="fx-score__gain" style={{ left: `${now}%`, width: `${Math.max(0, Math.min(after - now, 100 - now))}%` }} />
            </div>
            <div className="fx-score__labels"><span>Now <b>{now.toFixed(1)}</b></span><span>After every fix <b>{after.toFixed(1)}</b></span></div>
            {counted > 0 && <p className="fx-note">Counts {counted} {counted === 1 ? 'item' : 'items'} marked not needed as passing. Without them the score is {round1(model.preciseScore).toFixed(1)}.</p>}
          </div>
          {filters.length > 1 && (
            <div className="fx-seg" role="group" aria-label="Filter the queue">
              {filters.map((f) => <button key={f.id} type="button" aria-pressed={filter === f.id} onClick={() => setFilter(f.id)}>{f.label}</button>)}
            </div>
          )}
          <ol className="fx-list">
            {groups.map((g) => (
              <GroupRow key={g.ruleKey} group={g} model={model} open={openKey === g.ruleKey} onToggle={() => setOpenKey((k) => (k === g.ruleKey ? null : g.ruleKey))}
                canDismiss={dismissalsAvailable} dismissing={dismissing} setDismissing={setDismissing} onDismiss={onDismiss} />
            ))}
          </ol>
        </>
      ) : (
        <div className="fx-empty"><b>Nothing to fix.</b><p className="fx-note">Every section passes its checks. New issues appear here as soon as a save creates one.</p></div>
      ))}
      {model?.unavailable.length > 0 && <p className="fx-note fx-note--warn"><AlertCircle size={14} aria-hidden="true" /> Could not check {model.unavailable.join(', ')}. They count as zero until they load.</p>}

      {!loading && stale.length > 0 && (
        <div className="fx-sub">
          <h4><CalendarX size={14} aria-hidden="true" />Not touched for a while</h4>
          <p className="fx-note">Old is not wrong, so these do not change the score. A recruiter does notice a section that stops in last year.</p>
          <ul className="fx-plain">
            {stale.map((s) => (
              <li key={s.table}><span>{s.section}<small>Last edit <span className="fx-days">{s.days} days</span> ago</small></span>
                {s.chapterId && <Btn icon={ArrowRight} onClick={() => onReview(s.chapterId)} aria-label={`Review ${s.section}`}>Review</Btn>}</li>
            ))}
          </ul>
        </div>
      )}

      {model && (
        <div className="fx-sub" data-testid="fx-hidden">
          <h4><CircleSlash size={14} aria-hidden="true" />Marked not needed</h4>
          {!dismissalsAvailable ? <p className="fx-note">{dismissalsProblem === 'failed' ? 'The items marked not needed could not be loaded, so Not needed is off for now. It comes back with the next reload.' : 'Not needed starts working once the activity migration has been run. Every fix still counts until then.'}</p>
            : !hiddenCount ? <p className="fx-note">Nothing yet. Use Not needed on a fix that does not apply.</p>
              : showHidden ? (
                <>
                  <ul className="fx-plain">
                    {model.dismissed.map((d) => (
                      <li key={d.id}>
                        <span>{d.title}<small>{d.note ? `“${d.note}” · ` : ''}{formatDay(d.createdAt)}{d.covers === 0 ? ' · nothing to hide now' : ''}</small></span>
                        <Btn icon={Undo2} onClick={() => onRestore(d)} disabled={restoring === d.id} aria-label={`Bring back: ${d.title}`}>{restoring === d.id ? 'Bringing back' : 'Bring back'}</Btn>
                      </li>
                    ))}
                  </ul>
                  {restoreError && <p className="fx-dismiss__error" role="alert"><AlertCircle size={14} aria-hidden="true" /><span>{restoreError}</span></p>}
                  <button type="button" className="fx-toggle fx-toggle--start" onClick={() => setShowHidden(false)}>Hide them</button>
                </>
              ) : <p className="fx-note">{hiddenCount} {hiddenCount === 1 ? 'item' : 'items'} · <button type="button" className="fx-toggle" onClick={() => setShowHidden(true)}>Show them</button></p>}
        </div>
      )}

      {model && (
        <details className="fx-sub fx-how">
          <summary className="fx-toggle"><Info size={14} aria-hidden="true" />How the score works</summary>
          <p className="fx-note">{scoreExplainer()} The Health tile rounds each section before averaging, so it can differ from the figure here by a point.</p>
        </details>
      )}
    </section>
  );
}

/** "12 Nov" in New York time. */
export const formatDay = (iso) => {
  const t = Date.parse(iso);
  return Number.isFinite(t) ? new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'America/New_York' }) : '';
};
