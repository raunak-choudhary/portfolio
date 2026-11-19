// src/components/admin/Voyage/ActivityPane.js
//
// The activity log on Mission Control: what changed, when, and where it came
// from, grouped into New York days. Field names only, never values. Rows that
// name a record still in the portfolio open it through `onOpen(table, id)`;
// a record whose latest action is a delete is struck through and stays put.
//
// The data lives in `useActivityFeed` so Mission Control can load it once and
// hand the newest rows to the Recent activity tile as well. States: loading
// (skeleton rows), not set up yet (the table is missing), failed (one fixed
// sentence and Try again), nothing yet, and the log itself with filters and
// "Show earlier" paging.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowUpDown, ChevronDown, FileX, Fingerprint, History, Inbox, Info, LogIn, LogOut, Pencil, Plus, RefreshCw, Smartphone, Trash2, UploadCloud } from 'lucide-react';
import { isActivityAvailable, listActivity } from '../../../services/activityService';
import { FILTERS, TILE_ROWS, activityFailure, canOpen, describe, goneRecords, groupByDay, isGone, isOutside, mergeRows, nyTime, paneSummary, subLine, toneFor } from './activityModel';
import './Activity.css';

/** Rows per page; "Show earlier" asks for the next page before the oldest row shown. */
export const PAGE_SIZE = 50;
/** The pane's element id, which the tile's "See all activity" scrolls to. */
export const ACTIVITY_PANE_ID = 'activity-pane';

const ICONS = {
  create: Plus, edit: Pencil, delete: Trash2, reorder: ArrowUpDown, upload: UploadCloud, 'remove-file': FileX,
  'sign-in': LogIn, 'sign-out-all': LogOut, 'factor-add': Smartphone, 'factor-remove': Smartphone,
  'passkey-add': Fingerprint, 'passkey-remove': Fingerprint, inbox: Inbox,
};

/**
 * Loads the log and its pages. `latest` holds the newest rows of the
 * unfiltered log for the tile, kept while a filter is on.
 * @returns {{status: 'loading'|'ready'|'missing'|'error', rows: object[], hasMore: boolean, filter: string, error: string,
 *   more: boolean, moreError: string, seen: boolean, latest: object[]|null, setFilter: Function, loadMore: Function, retry: Function}}
 */
export function useActivityFeed({ pageSize = PAGE_SIZE } = {}) {
  const [state, setState] = useState({ status: 'loading', rows: [], hasMore: false, filter: 'all', error: '', more: false, moreError: '', seen: false });
  const [latest, setLatest] = useState(null);
  const request = useRef(0);
  const stateRef = useRef(state); stateRef.current = state;

  const load = useCallback(async (filter) => {
    const ticket = ++request.current;
    setState((s) => ({ ...s, status: 'loading', filter, rows: [], hasMore: false, error: '', more: false, moreError: '' }));
    try {
      const available = await isActivityAvailable();
      if (ticket !== request.current) return;
      if (!available) { setState((s) => ({ ...s, status: 'missing' })); return; }
      const page = await listActivity({ limit: pageSize, filter });
      if (ticket !== request.current) return;
      const rows = Array.isArray(page?.rows) ? page.rows : [];
      setState((s) => ({ ...s, status: 'ready', rows, hasMore: Boolean(page?.hasMore), seen: s.seen || rows.length > 0 || filter !== 'all' }));
      if (filter === 'all') setLatest(rows.slice(0, TILE_ROWS));
    } catch (err) {
      if (ticket === request.current) setState((s) => ({ ...s, status: 'error', error: activityFailure(err) }));
    }
  }, [pageSize]);

  useEffect(() => { load('all'); return () => { request.current += 1; }; }, [load]);

  const setFilter = useCallback((filter) => { if (filter !== stateRef.current.filter || stateRef.current.status === 'error') load(filter); }, [load]);
  const retry = useCallback(() => load(stateRef.current.filter), [load]);
  const loadMore = useCallback(async () => {
    const { rows, hasMore, more, filter, status } = stateRef.current;
    if (more || !hasMore || status !== 'ready' || !rows.length) return;
    const ticket = request.current;
    setState((s) => ({ ...s, more: true, moreError: '' }));
    try {
      const page = await listActivity({ before: rows[rows.length - 1].at, limit: pageSize, filter });
      if (ticket !== request.current) return;
      setState((s) => ({ ...s, rows: mergeRows(s.rows, page?.rows), hasMore: Boolean(page?.hasMore), more: false }));
    } catch (err) {
      if (ticket === request.current) setState((s) => ({ ...s, more: false, moreError: activityFailure(err) }));
    }
  }, [pageSize]);

  return { ...state, latest, setFilter, loadMore, retry };
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
  const { status, rows, filter, hasMore, more, moreError, error, seen } = feed;
  // "Today" is read again whenever the rows change (a reload, a filter, a page)
  const clock = useMemo(() => now || new Date(), [now, rows]); // eslint-disable-line react-hooks/exhaustive-deps
  const gone = useMemo(() => goneRecords(rows), [rows]);
  const days = useMemo(() => groupByDay(rows, clock), [rows, clock]);
  const summary = status === 'ready' ? paneSummary(rows, clock) : '';
  const showFilters = seen && status !== 'missing';

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
          ? days.map((day) => (
            <div key={day.key} className="act-day">
              <h4>{day.label}</h4>
              <ul className="act-list">{day.items.map((row) => <ActivityRow key={row.id} row={row} gone={gone} onOpen={onOpen} />)}</ul>
            </div>
          ))
          : <p className="v5-note">Nothing under {FILTERS.find((f) => f.id === filter)?.label || 'this filter'} yet.</p>}
        <div className="act-foot">
          <span className="v5-note">Kept for a year. Field names only, never what was typed.</span>
          {hasMore ? <button type="button" className="voyage-bar__button voyage-bar__button--small" onClick={feed.loadMore} disabled={more}><ChevronDown size={15} aria-hidden="true" /><span>{more ? 'Loading' : 'Show earlier'}</span></button> : null}
          {moreError ? <p className="v5-note act-foot__error" role="alert">{moreError}</p> : null}
        </div>
      </>
    );
  }

  return (
    <section id={ACTIVITY_PANE_ID} className="voyage-pane v5-pane act-pane" aria-labelledby="act-title" aria-busy={status === 'loading'} data-testid="activity-pane">
      <div className="v5-head">
        <h3 id="act-title"><History size={16} aria-hidden="true" />Activity</h3>
        {summary ? <span className="v5-head__sum">{summary}</span> : null}
      </div>
      {showFilters ? (
        <div className="v5-seg" role="group" aria-label="Filter activity">
          {FILTERS.map((f) => <button key={f.id} type="button" aria-pressed={filter === f.id} onClick={() => feed.setFilter(f.id)}>{f.label}</button>)}
        </div>
      ) : null}
      {body}
    </section>
  );
}
