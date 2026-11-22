// src/components/admin/Voyage/ReportsPanel.js
//
// The Reports tab: when the next scheduled report runs (computed from today
// in New York time), "Generate now" for a partial report of the quarter so
// far, the archive read from analytics_reports, and how the job runs.
// The report table and function come from the report unit, through the
// shared reportsService ({ success, data } or { success: false, error }).
// Until the table exists the archive says so and Generate now stays off: a
// LOAD_FAILED from the archive read is followed by one narrow probe, and only
// a server answer of "no such table" counts as not set up.
// A report is deleted from its dialog (ReportDialog); the panel then drops
// the row at once and reads the archive again, so the list shows the
// server's truth without a page reload.

import React, { useCallback, useEffect, useState } from 'react';
import { AlertCircle, Check, ExternalLink, FileText, RefreshCw } from 'lucide-react';
import ConfirmDialog from './ConfirmDialog';
import ReportDialog from './ReportDialog';
import { longDay, nyDate, quarterOf, nextReportAt, shortDate, stampOf } from './insightsTime';
import { REPORT_MESSAGES, generateReport, listReports } from '../../../services/reportsService';
import { reportsTableMissing } from '../../../services/reportsTableProbe';

/** The archive's own sentences per failure code; generate failures use the service's fixed sentences. */
export const LIST_FAILURE = {
  SESSION_EXPIRED: 'Your session has expired. Sign in again in a new tab, then try again.',
  SECOND_FACTOR_REQUIRED: 'The archive could not be read. Enter your authenticator code in a new tab, then try again.',
  NETWORK: 'The archive did not load. Check the connection and try again.',
  LOAD_FAILED: 'The report archive could not be loaded.',
};
const EMAIL_NOTE = { sent: 'saved below and emailed to you', failed: 'saved below, but the email did not send', skipped: 'saved below; no email was sent' };

// stampOf lives in insightsTime so the report dialog can use it without importing this panel.
export { stampOf };

/** The archive row's second line: quarter, how it was made, when, and a failed email. */
export function reportLine(r) {
  const made = r.partial ? `partial, generated ${stampOf(r.created_at)}` : r.trigger === 'schedule' ? `sent ${stampOf(r.created_at)}` : `generated ${stampOf(r.created_at)}`;
  const mail = r.email_status === 'failed' ? ' · email failed' : r.email_status === 'skipped' && r.trigger === 'schedule' ? ' · not emailed' : '';
  return `${r.quarter} · ${made}${mail}`;
}

/**
 * @param {object} props
 * @param {number} props.now ms
 * @param {(text: string, tone?: string) => void} props.notify
 */
export default function ReportsPanel({ now, notify }) {
  const [list, setList] = useState({ status: 'loading', reports: [], missing: false, error: null });
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState(null);   // { tone, text } under the buttons
  const [viewing, setViewing] = useState(null);

  const load = useCallback(async () => {
    setList((l) => ({ ...l, status: 'loading', error: null }));
    const out = await listReports();
    if (out.success) { setList({ status: 'ready', reports: out.data, missing: false, error: null }); return; }
    const code = out.error?.code;
    if (code === 'LOAD_FAILED' && await reportsTableMissing()) { setList({ status: 'ready', reports: [], missing: true, error: null }); return; }
    setList({ status: 'error', reports: [], missing: false, error: code });
  }, []);
  useEffect(() => { load(); }, [load]);

  const next = nextReportAt(now);
  const quarter = quarterOf(now);
  const from = longDay(quarter.start);
  const today = longDay(nyDate(now));

  const generate = async () => {
    setConfirming(false);
    setBusy(true);
    setStatus(null);
    const out = await generateReport();
    if (out.success) {
      const mail = out.data.email_status;
      const text = `Report for ${from} to ${today} ${EMAIL_NOTE[mail] || EMAIL_NOTE.sent}.`;
      setStatus({ tone: mail === 'failed' ? 'warn' : 'good', text });
      notify?.(text, mail === 'failed' ? 'warn' : 'ok');
      setBusy(false);
      await load();
      return;
    }
    const code = out.error?.code;
    // the function is not deployed: the panel shows "not set up" instead of a red line
    if (code === 'NOT_CONFIGURED') setList((l) => ({ ...l, status: 'ready', missing: true }));
    setStatus({ tone: 'bad', text: out.error?.message || REPORT_MESSAGES.UNKNOWN });
    setBusy(false);
  };

  // The server confirmed the delete: close the dialog, drop the row now, then re-read the archive.
  const deleted = (r) => {
    setViewing(null);
    setList((l) => ({ ...l, reports: l.reports.filter((x) => x.id !== r.id) }));
    notify?.(`Report for ${r.period_label}${r.partial ? ' (partial)' : ''} deleted.`);
    load();
  };
  // the deleted row's Open button is gone, so focus lands on the archive heading instead
  const archiveHeading = () => document.getElementById('ins-archive-h');

  const latest = list.reports[0] || null;
  const canGenerate = list.status === 'ready' && !list.missing && !busy;

  return (
    <div className="ins-grid ins-grid--split">
      <section className="voyage-pane orion-pane" aria-labelledby="ins-next-h">
        <div className="orion-pane__head"><h3 id="ins-next-h">Next report</h3></div>
        <div className="ins-next">
          <div className="ins-next__when"><time dateTime={new Date(next.at).toISOString()}>{shortDate(next.date)} · 9:00 AM New York</time></div>
          <p>Covers {next.covers.label}. It is saved here and emailed to you. The analysis is written by fixed rules from the same numbers as this page, compared with the quarter before and the same quarter a year earlier. No AI writes it.</p>
          <div className="ins-actions">
            <button type="button" className="voyage-bar__button" onClick={() => setConfirming(true)} disabled={!canGenerate} aria-busy={busy}>
              <RefreshCw size={14} aria-hidden="true" className={busy ? 'ins-spin' : undefined} /><span>{busy ? 'Generating' : 'Generate now'}</span>
            </button>
            {latest && (
              <button type="button" className="voyage-bar__button" onClick={() => setViewing(latest)}>
                <FileText size={14} aria-hidden="true" /><span>Open the latest report</span>
              </button>
            )}
          </div>
          <p className={`ins-status${status ? ` is-on is-${status.tone}` : ''}`} role="status">
            {status && (status.tone === 'bad' ? <AlertCircle size={14} aria-hidden="true" /> : <Check size={14} aria-hidden="true" />)}
            {status && <span>{status.text}</span>}
          </p>
          <p>Generate now covers the quarter so far ({from} to today) and is marked as partial.</p>
        </div>
      </section>

      <section className="voyage-pane orion-pane" aria-labelledby="ins-archive-h">
        <div className="orion-pane__head"><h3 id="ins-archive-h" tabIndex={-1}>Archive</h3></div>
        {list.status === 'loading' && <div className="ins-skel-list" role="status" aria-label="Loading the archive">{[0, 1, 2].map((i) => <div key={i} className="orion-skel" />)}</div>}
        {list.status === 'error' && (
          <div className="deck__error" role="alert">
            <AlertCircle size={16} aria-hidden="true" />
            <p>{LIST_FAILURE[list.error] || LIST_FAILURE.LOAD_FAILED}</p>
            <button type="button" className="voyage-bar__button" onClick={load}><RefreshCw size={14} /><span>Try again</span></button>
          </div>
        )}
        {list.status === 'ready' && list.missing && (
          <div className="orion-empty"><h4>Not set up yet</h4><p>Reports start after the report job is set up. Once it runs, every quarter's report is kept here.</p></div>
        )}
        {list.status === 'ready' && !list.missing && !list.reports.length && (
          <div className="orion-empty"><h4>No reports yet</h4><p>The first scheduled report arrives on {shortDate(next.date)}. Generate now makes a partial one today.</p></div>
        )}
        {list.status === 'ready' && list.reports.length > 0 && (
          <ul className="ins-reports">
            {list.reports.map((r) => (
              <li key={r.id}>
                <b>{r.period_label}</b>
                <span>{reportLine(r)}</span>
                <button type="button" className="voyage-bar__button" onClick={() => setViewing(r)} aria-label={`Open the report for ${r.period_label}${r.partial ? ', partial' : ''}`}>
                  <ExternalLink size={14} aria-hidden="true" /><span>Open</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="voyage-pane orion-pane ins-wide" aria-labelledby="ins-how-h">
        <div className="orion-pane__head"><h3 id="ins-how-h">How it runs</h3></div>
        <dl className="ins-facts">
          <div><dt>Schedule</dt><dd>1 Jan, 1 Apr, 1 Jul and 1 Oct at 9:00 AM New York time<small>A scheduled database job calls one server function.</small></dd></div>
          <div><dt>Delivery</dt><dd>Email to your address, with a copy saved in this archive<small>Sent through the same mail service as the contact form.</small></dd></div>
          <div><dt>Data</dt><dd>Visit events stay in the database; nothing is deleted when a quarter ends<small>The report is a snapshot. The cards on this page reset; the history does not.</small></dd></div>
        </dl>
      </section>

      <ConfirmDialog
        open={confirming}
        title="Generate a partial report?"
        body={`It covers ${from} to ${today}, only part of ${quarter.short}, so every number is lower than a full quarter's. It is saved in the archive marked partial and emailed to you.`}
        confirmLabel="Generate now"
        onConfirm={generate}
        onCancel={() => setConfirming(false)}
      />
      <ReportDialog report={viewing} onClose={() => setViewing(null)} onDeleted={deleted} returnTo={archiveHeading} />
    </div>
  );
}
