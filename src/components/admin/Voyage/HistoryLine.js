// src/components/admin/Voyage/HistoryLine.js
//
// One quiet line at the top of a saved record's read view: when it last
// changed and how many changes are recorded. "History" opens the record's
// own timeline in place (field names only). When no create event exists the
// timeline ends with "Before tracking began", because the log knows nothing
// older than its own table.
//
// The line is a courtesy, never a blocker: while the activity table is
// missing it renders nothing (the Activity pane explains why), and a failed
// read says so in one line without a retry loop.

import React, { useEffect, useId, useState } from 'react';
import { ChevronDown, History } from 'lucide-react';
import { ACTIVITY_NOT_SET_UP, recordHistory } from '../../../services/activityService';
import { historyEntries, historySummary } from './activityModel';
import './Activity.css';

/** How many rows of a record's history are asked for. */
export const HISTORY_LIMIT = 20;

/**
 * @param {object} props
 * @param {string} props.table the record's table.
 * @param {string|number} props.recordId
 * @param {Date} [props.now] the clock, for tests.
 */
export default function HistoryLine({ table, recordId, now }) {
  const [state, setState] = useState({ status: 'loading', rows: [] });
  const [open, setOpen] = useState(false);
  const listId = useId();

  useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading', rows: [] }); setOpen(false);
    (async () => {
      try {
        const rows = await recordHistory(table, String(recordId), HISTORY_LIMIT);
        if (!cancelled) setState({ status: 'ready', rows: Array.isArray(rows) ? rows : [] });
      } catch (err) {
        if (!cancelled) setState({ status: err?.code === ACTIVITY_NOT_SET_UP ? 'missing' : 'error', rows: [] });
      }
    })();
    return () => { cancelled = true; };
  }, [table, recordId]);

  if (state.status === 'missing') return null;
  if (state.status === 'loading') return <div className="hist" aria-hidden="true" data-testid="history-loading"><div className="v5-skel hist__skel" /></div>;
  if (state.status === 'error') {
    return <div className="hist" data-testid="history-line"><div className="hist__line"><History size={15} aria-hidden="true" /><span>History could not be loaded.</span></div></div>;
  }
  const clock = now || new Date();
  const summary = historySummary(state.rows, HISTORY_LIMIT, clock);
  if (!summary.count) {
    return <div className="hist" data-testid="history-line"><div className="hist__line"><History size={15} aria-hidden="true" /><span>No changes recorded since tracking began.</span></div></div>;
  }
  return (
    <div className="hist" data-testid="history-line">
      <div className="hist__line">
        <History size={15} aria-hidden="true" />
        <span>Last edited <b>{summary.last}</b> · {summary.countText}</span>
        <button type="button" className="hist__toggle" aria-expanded={open} aria-controls={listId} onClick={() => setOpen((o) => !o)}>
          {open ? 'Hide history' : 'History'}<ChevronDown size={14} aria-hidden="true" />
        </button>
      </div>
      {open ? (
        <ol className="hist__list" id={listId}>
          {historyEntries(state.rows, clock).map((e) => <li key={e.id}><time>{e.when}</time><span className={e.outside ? 'is-outside' : undefined}>{e.what}</span></li>)}
          {/* a full page may stop short of the create event, so only a short history can claim it predates tracking */}
          {summary.created ? null : summary.count >= HISTORY_LIMIT
            ? <li><time>Earlier</time><span>Older changes are not listed here.</span></li>
            : <li><time>Created</time><span>Before tracking began</span></li>}
        </ol>
      ) : null}
    </div>
  );
}
