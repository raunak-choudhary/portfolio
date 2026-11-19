// src/components/admin/Voyage/ActivityPane.js
//
// The activity log on Mission Control: what changed, when, and where it came
// from, grouped into New York days. Field names only, never values. Rows that
// name a record still in the portfolio open it through `onOpen(table, id)`;
// a deleted record is struck through and stays put. Whether a record was
// deleted is asked of the server for the records shown, because a filtered
// list or a delete on a later page cannot tell by itself.
//
// The data lives in `useActivityFeed` so Mission Control can load it once and
// hand the newest rows to the Recent activity tile as well. States: loading
// (skeleton rows), not set up yet (the table is missing), failed (one fixed
// sentence and Try again), nothing yet, and the log itself with filters and
// "Show earlier" paging. A quiet refresh (Mission Control coming back into
// view, a new New York day) reloads without blanking what is on screen.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowUpDown, ChevronDown, FileX, Fingerprint, History, Inbox, Info, LogIn, LogOut, Pencil, Plus, RefreshCw, Smartphone, Trash2, UploadCloud } from 'lucide-react';
import { ACTIVITY_NOT_SET_UP, listActivity, listDeletedRecords } from '../../../services/activityService';
import {
  FILTERS, TILE_ROWS, activityFailure, canOpen, collapseBulk, describe, filterAnnouncement, goneRecords, groupByDay, isGone, isOutside,
  mergeRows, moreAnnouncement, msUntilNextNyDay, nyDayKey, nyTime, paneSummary, recordKey, recordsToCheck, subLine, toneFor,
} from './activityModel';
import './Activity.css';

/** Rows per page, first load and each "Show earlier": enough for a few days without making the pane a wall. */
export const PAGE_SIZE = 20;
/** Most rows a quiet refresh asks for at once (the service's own ceiling). */
const MAX_PAGE = 200;
/** The pane's element id, which the tile's "See all activity" scrolls to. */
export const ACTIVITY_PANE_ID = 'activity-pane';
/** The pane heading's id; "See all activity" moves focus here. */
export const ACTIVITY_TITLE_ID = 'act-title';

const NO_KEYS = new Set();

const ICONS = {
  create: Plus, edit: Pencil, delete: Trash2, reorder: ArrowUpDown, upload: UploadCloud, 'remove-file': FileX,
  'sign-in': LogIn, 'sign-out-all': LogOut, 'factor-add': Smartphone, 'factor-remove': Smartphone,
  'passkey-add': Fingerprint, 'passkey-remove': Fingerprint, inbox: Inbox,
};

/**
 * Loads the log and its pages. `latest` holds the newest rows of the
 * unfiltered log for the tile, kept while a filter is on. `deleted` holds the
 * keys of shown records the server says were deleted. `announce` is the last
 * sentence for the pane's polite live region.
 * @returns {{status: 'loading'|'ready'|'missing'|'error', rows: object[], hasMore: boolean, filter: string, error: string,
 *   more: boolean, moreError: string, seen: boolean, deleted: Set<string>, announce: string, day: string, latest: object[]|null,
 *   setFilter: Function, loadMore: Function, retry: Function, refresh: Function}}
 */
export function useActivityFeed({ pageSize = PAGE_SIZE } = {}) {
  const [state, setState] = useState({ status: 'loading', rows: [], hasMore: false, filter: 'all', error: '', more: false, moreError: '', seen: false, deleted: NO_KEYS, announce: '' });
  const [latest, setLatest] = useState(null);
  const [day, setDay] = useState(() => nyDayKey(new Date()));
  const request = useRef(0);
  const deleteRequest = useRef(0);
  const stateRef = useRef(state); stateRef.current = state;

  // Best effort: without an answer the loaded rows still strike what they can.
  const checkDeleted = useCallback(async (rows) => {
    const ticket = ++deleteRequest.current;
    const records = recordsToCheck(collapseBulk(rows));
    if (!records.length) { setState((s) => ({ ...s, deleted: NO_KEYS })); return; }
    try {
      const found = await listDeletedRecords(records);
      if (ticket === deleteRequest.current) setState((s) => ({ ...s, deleted: new Set((found || []).map(recordKey)) }));
    } catch {
      // keep the previous answer
    }
  }, []);

  // The tile follows the unfiltered log; while a filter is on it needs its own read.
  const refreshLatest = useCallback(async (ticket) => {
    try {
      const page = await listActivity({ limit: pageSize, filter: 'all' });
      if (ticket === request.current) setLatest(collapseBulk(Array.isArray(page?.rows) ? page.rows : []).slice(0, TILE_ROWS));
    } catch {
      // the tile keeps its rows
    }
  }, [pageSize]);

  /**
   * Loads the first page of `filter`. Quiet keeps the rows on screen while it
   * reads, asks for as many rows as are shown, and on failure leaves them.
   */
  const load = useCallback(async (filter, { quiet = false, announce = false } = {}) => {
    const ticket = ++request.current;
    const shown = quiet ? stateRef.current.rows.length : 0;
    if (!quiet) setState((s) => ({ ...s, status: 'loading', filter, rows: [], hasMore: false, error: '', more: false, moreError: '', announce: '' }));
    try {
      const page = await listActivity({ limit: Math.min(MAX_PAGE, Math.max(pageSize, shown)), filter });
      if (ticket !== request.current) return;
      const rows = Array.isArray(page?.rows) ? page.rows : [];
      setState((s) => ({
        ...s, status: 'ready', filter, rows, hasMore: Boolean(page?.hasMore), error: '', moreError: '',
        seen: s.seen || rows.length > 0 || filter !== 'all',
        announce: announce ? filterAnnouncement(filter, collapseBulk(rows).length) : s.announce,
      }));
      checkDeleted(rows);
      if (filter === 'all') setLatest(collapseBulk(rows).slice(0, TILE_ROWS));
      else if (quiet) refreshLatest(ticket);
    } catch (err) {
      if (ticket !== request.current) return;
      if (quiet && stateRef.current.status === 'ready') return;
      if (err?.code === ACTIVITY_NOT_SET_UP) setState((s) => ({ ...s, status: 'missing' }));
      else setState((s) => ({ ...s, status: 'error', error: activityFailure(err) }));
    }
  }, [pageSize, checkDeleted, refreshLatest]);

  useEffect(() => { load('all'); return () => { request.current += 1; deleteRequest.current += 1; }; }, [load]);

  const setFilter = useCallback((filter) => {
    if (filter !== stateRef.current.filter || stateRef.current.status === 'error') load(filter, { announce: true });
  }, [load]);
  const retry = useCallback(() => load(stateRef.current.filter), [load]);
  /** Reloads quietly; skipped while a load or a page is already on its way. */
  const refresh = useCallback(() => {
    const { status, more, filter } = stateRef.current;
    if (status === 'loading' || more) return;
    load(filter, { quiet: true });
  }, [load]);

  const loadMore = useCallback(async () => {
    const { rows, hasMore, more, filter, status } = stateRef.current;
    if (more || !hasMore || status !== 'ready' || !rows.length) return;
    const ticket = request.current;
    setState((s) => ({ ...s, more: true, moreError: '' }));
    try {
      // the last row itself, not only its time, so rows sharing an instant are not skipped
      const last = rows[rows.length - 1];
      const page = await listActivity({ before: { at: last.at, id: last.id }, limit: pageSize, filter });
      if (ticket !== request.current) return;
      const merged = mergeRows(stateRef.current.rows, page?.rows);
      const added = merged.length - stateRef.current.rows.length;
      const done = !page?.hasMore;
      setState((s) => ({ ...s, rows: merged, hasMore: !done, more: false, announce: moreAnnouncement(added, done) }));
      checkDeleted(merged);
    } catch (err) {
      if (ticket === request.current) setState((s) => ({ ...s, more: false, moreError: activityFailure(err) }));
    }
  }, [pageSize, checkDeleted]);

  // A new New York day turns "Today" into "Yesterday": reload quietly when the date changes.
  const refreshRef = useRef(refresh); refreshRef.current = refresh;
  const dayRef = useRef(day);
  useEffect(() => {
    let timer;
    const arm = () => {
      timer = setTimeout(() => {
        const key = nyDayKey(new Date());
        if (key !== dayRef.current) { dayRef.current = key; setDay(key); refreshRef.current(); }
        arm();
      }, msUntilNextNyDay(new Date()));
    };
    arm();
    return () => clearTimeout(timer);
  }, []);

  return { ...state, day, latest, setFilter, loadMore, retry, refresh };
}

/** One row: a button when it opens a record, plain otherwise. */
function ActivityRow({ row, gone, onOpen }) {
  const Icon = ICONS[row.action] || Info;
  const tone = toneFor(row);
  const struck = isGone(row, gone);
  const { lead, title } = describe(row);
  const inner = (
    <>
      <time dateTime={row.at}>{nyTime(row.at)}</time>
      <span className={`act-row__icon${tone ? ` is-${tone}` : ''}`}><Icon size={15} aria-hidden="true" /></span>
      <span className="act-row__text">
        <b>{lead}{title ? <> {struck ? <s>{title}</s> : title}</> : null}</b>
        <span>{subLine(row)}{struck ? ' · record no longer exists' : ''}</span>
      </span>
      {isOutside(row) ? <span className="act-tag" title="Made in the Supabase dashboard, SQL or an import">Outside the admin</span> : null}
    </>
  );
  return <li>{canOpen(row, gone) ? <button type="button" className="act-row" onClick={() => onOpen(row.section, row.recordId)}>{inner}</button> : <div className="act-row">{inner}</div>}</li>;
}

/**
 * @param {object} props
 * @param {ReturnType<typeof useActivityFeed>} props.feed
 * @param {(table: string, id: string) => void} props.onOpen opens a record (Mission Control's openRecord).
 * @param {Date} [props.now] the clock, for tests.
 */
export default function ActivityPane({ feed, onOpen, now }) {
  const { status, rows: loaded, filter, hasMore, more, moreError, error, seen, deleted, announce, day } = feed;
  // a bulk inbox change reads as one sentence; paging still works on the rows as loaded
  const rows = useMemo(() => collapseBulk(loaded), [loaded]);
  // "Today" is read again whenever the rows or the New York date change
  const clock = useMemo(() => now || new Date(), [now, rows, day]); // eslint-disable-line react-hooks/exhaustive-deps
  const gone = useMemo(() => goneRecords(rows, deleted), [rows, deleted]);
  const days = useMemo(() => groupByDay(rows, clock), [rows, clock]);
  const summary = status === 'ready' ? paneSummary(rows, clock, hasMore) : '';
  const showFilters = seen && status !== 'missing';

  // When Show earlier loads the last page its button goes away; keep focus in the list instead of dropping it to the page.
  const paneRef = useRef(null);
  const footRef = useRef(null);
  const paging = useRef(false);
  useEffect(() => {
    if (more) { paging.current = true; return; }
    if (!paging.current) return;
    paging.current = false;
    if (hasMore || moreError) return;
    const shown = paneRef.current?.querySelectorAll('.act-row');
    const last = shown?.[shown.length - 1];
    (last?.tagName === 'BUTTON' ? last : footRef.current)?.focus();
  }, [more, hasMore, moreError]);

  let body;
  if (status === 'loading') {
    body = <div className="v5-skel-list" data-testid="activity-loading">{[0, 1, 2, 3, 4].map((i) => <div key={i} className="v5-skel v5-skel--row" />)}</div>;
  } else if (status === 'missing') {
    body = (
      <div className="v5-empty">
        <b>Not set up yet.</b>
        <p className="v5-note">The activity log starts once its database table is added. Until then the Recent activity tile shows the latest saves from each section.</p>
      </div>
    );
  } else if (status === 'error') {
    body = (
      <div className="v5-empty" role="alert">
        <b>Activity did not load.</b>
        <p className="v5-note">{error}</p>
        <button type="button" className="voyage-bar__button voyage-bar__button--small" onClick={feed.retry}><RefreshCw size={14} aria-hidden="true" /><span>Try again</span></button>
      </div>
    );
  } else if (!rows.length && filter === 'all') {
    body = (
      <div className="v5-empty">
        <b>Nothing yet.</b>
        <p className="v5-note">Every save, upload, delete and sign-in from now on lands here. Changes made before today are not known.</p>
      </div>
    );
  } else {
    body = (
      <>
        {rows.length
          ? days.map((d) => (
            <div key={d.key} className="act-day">
              <h4>{d.label}</h4>
              <ul className="act-list">{d.items.map((row) => <ActivityRow key={row.id} row={row} gone={gone} onOpen={onOpen} />)}</ul>
            </div>
          ))
          : <p className="v5-note">Nothing under {FILTERS.find((f) => f.id === filter)?.label || 'this filter'} yet.</p>}
        <div className="act-foot">
          <span className="v5-note act-foot__note" ref={footRef} tabIndex={-1}>Kept for a year. Field names only, never what was typed.</span>
          {/* aria-disabled, not disabled: a disabled button would drop the focus it holds */}
          {hasMore ? <button type="button" className="voyage-bar__button voyage-bar__button--small" onClick={feed.loadMore} aria-disabled={more}><ChevronDown size={15} aria-hidden="true" /><span>{more ? 'Loading' : 'Show earlier'}</span></button> : null}
          {moreError ? <p className="v5-note act-foot__error" role="alert">{moreError}</p> : null}
        </div>
      </>
    );
  }

  return (
    <section ref={paneRef} id={ACTIVITY_PANE_ID} className="voyage-pane v5-pane act-pane" aria-labelledby={ACTIVITY_TITLE_ID} aria-busy={status === 'loading'} data-testid="activity-pane">
      <div className="v5-head">
        <h3 id={ACTIVITY_TITLE_ID} tabIndex={-1}><History size={16} aria-hidden="true" />Activity</h3>
        {summary ? <span className="v5-head__sum">{summary}</span> : null}
      </div>
      {showFilters ? (
        <div className="v5-seg" role="group" aria-label="Filter activity">
          {FILTERS.map((f) => <button key={f.id} type="button" aria-pressed={filter === f.id} onClick={() => feed.setFilter(f.id)}>{f.label}</button>)}
        </div>
      ) : null}
      {body}
      <p className="sr-only" role="status" aria-live="polite" data-testid="activity-announce">{announce}</p>
    </section>
  );
}
