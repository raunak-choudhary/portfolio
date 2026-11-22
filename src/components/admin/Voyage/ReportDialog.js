// src/components/admin/Voyage/ReportDialog.js
//
// Shows one stored quarterly report inside the voyage dialog. The report's
// HTML was written by the report function, but the dashboard still treats it
// as untrusted: it is rendered through `srcdoc` in an iframe with an empty
// `sandbox` attribute, so it runs no script, cannot navigate this page, has
// an opaque origin (no cookies, no storage, no session) and submits no forms.
// Its inline styles work because the CSP allows inline styles.
//
// Same dialog mechanics as InboxDialog: portal, scroll lock, Escape, focus
// trap, focus returned to the opener.
//
// Delete follows the record dialog: a quiet Delete in the footer, then a
// confirmation naming the report. Cancel takes focus first because the
// delete cannot be undone. The confirmation stays up, busy, while the request
// runs; on success the panel closes the dialog and reloads the archive, and
// on failure the confirmation closes and a banner says why in one fixed
// sentence from reportsService (never the server's own words), with the
// dialog and its Delete button still there to try again.

import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertCircle, Trash2, X } from 'lucide-react';
import ConfirmDialog from './ConfirmDialog';
import { stampOf } from './insightsTime';
import { REPORT_MESSAGES, deleteReport } from '../../../services/reportsService';

const FOCUSABLE = 'button, [href], iframe, [tabindex]:not([tabindex="-1"])';

/**
 * @param {object} props
 * @param {{id: string, period_label: string, quarter: string, partial: boolean, body_html: string, body_text: string}|null} props.report
 *   the archive row to show (the archive read already carries the report body); null closes.
 * @param {() => void} props.onClose
 * @param {(report: object) => void} [props.onDeleted] called once the server confirmed the row is gone;
 *   the owner closes the dialog and refreshes its list. Without it the dialog offers no Delete.
 * @param {() => HTMLElement|null} [props.returnTo] where focus goes on closing when the opener has left
 *   the page (the deleted report's own Open button).
 */
export default function ReportDialog({ report, onClose, onDeleted, returnTo }) {
  const panelRef = useRef(null), openerRef = useRef(null), keyRef = useRef(null), deleteRef = useRef(null);
  const lock = useRef(false);                    // one delete request at a time, even on a double click
  const returnRef = useRef(returnTo);
  returnRef.current = returnTo;
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [failure, setFailure] = useState(null);   // the fixed sentence of a failed delete
  const open = Boolean(report);
  const id = report?.id;

  // every report opens clean: no confirmation or banner left from the one before
  useEffect(() => { setConfirming(false); setFailure(null); }, [id]);

  // after a failed delete the confirmation is gone; Delete, the way to try again, takes focus once enabled
  useEffect(() => { if (failure && !deleting) deleteRef.current?.focus(); }, [failure, deleting]);

  // Cancel (and Escape) put focus back on Delete, which stays in the dialog behind the confirmation.
  const cancelDelete = () => { setConfirming(false); deleteRef.current?.focus(); };

  keyRef.current = (e) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      if (deleting) return;                       // the request is out; closing now would hide its answer
      if (confirming) cancelDelete(); else onClose();
      return;
    }
    if (e.key !== 'Tab' || !panelRef.current) return;
    // While the confirmation is open, Tab stays inside it, as in the record dialog.
    const scope = panelRef.current.querySelector('.dialog') || panelRef.current;
    const nodes = [...scope.querySelectorAll(FOCUSABLE)].filter((n) => !n.disabled);
    if (!nodes.length) { e.preventDefault(); return; }
    const [head, tail] = [nodes[0], nodes[nodes.length - 1]];
    if (e.shiftKey && document.activeElement === head) { e.preventDefault(); tail.focus(); } else if (!e.shiftKey && document.activeElement === tail) { e.preventDefault(); head.focus(); }
  };

  useEffect(() => {
    if (!open) return undefined;
    openerRef.current = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e) => keyRef.current(e);
    document.addEventListener('keydown', onKey, true);
    panelRef.current?.querySelector('.record-dialog__close')?.focus();
    return () => {
      document.removeEventListener('keydown', onKey, true);
      document.body.style.overflow = previousOverflow;
      // After a delete the opener may be the removed row's Open button, and Safari leaves focus on the
      // body when a button is clicked; in both cases the panel's stand-in takes focus.
      const opener = openerRef.current;
      const usable = opener && opener !== document.body && document.contains(opener) && !opener.disabled;
      const back = usable ? opener : returnRef.current?.() || opener;
      back?.focus?.();
    };
  }, [open]);

  if (!open) return null;

  const remove = async () => {
    if (lock.current) return;
    lock.current = true;
    setDeleting(true); setFailure(null);
    const out = await deleteReport(report.id);
    lock.current = false;
    setDeleting(false); setConfirming(false);
    if (out.success) { onDeleted?.(report); return; }
    setFailure(out.error?.message || REPORT_MESSAGES.DELETE_FAILED);
  };

  const title = `${report.period_label}${report.partial ? ' (partial)' : ''}`;
  const made = stampOf(report.created_at);
  return createPortal(
    <div className="record-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget && !deleting) onClose(); }}>
      <div ref={panelRef} className="record-dialog report-dialog" role="dialog" aria-modal="true" aria-labelledby="report-dialog-title" data-testid="report-dialog">
        <header className="record-dialog__head">
          <div className="record-dialog__titles">
            <div className="voyage-chapter__kicker">Quarterly report · {report.quarter}</div>
            <h3 id="report-dialog-title">{title}</h3>
          </div>
          <button type="button" className="record-dialog__close" onClick={onClose} aria-label="Close" disabled={deleting}><X size={18} /></button>
        </header>
        <div className="record-dialog__banners">
          {failure && (
            <div className="record-banner record-banner--bad" role="alert">
              <AlertCircle size={16} aria-hidden="true" className="record-banner__icon" />
              <div className="record-banner__text">
                <p className="record-banner__title">{failure}</p>
                <div className="record-banner__actions">
                  <button type="button" className="voyage-bar__button voyage-bar__button--plain" onClick={() => { setFailure(null); deleteRef.current?.focus(); }}><span>Dismiss</span></button>
                </div>
              </div>
            </div>
          )}
        </div>
        <div className="record-dialog__body report-dialog__body">
          {report.body_html ? (
            <iframe className="report-dialog__frame" title={`Report for ${report.period_label}`} sandbox="" srcDoc={String(report.body_html)} referrerPolicy="no-referrer" />
          ) : (
            // a row without HTML still has the plain text the email carried
            <pre className="report-dialog__text">{String(report.body_text || 'This report has no body.')}</pre>
          )}
        </div>
        {onDeleted && (
          <footer className="record-dialog__foot">
            <button type="button" ref={deleteRef} className="voyage-bar__button voyage-bar__button--quiet" onClick={() => setConfirming(true)} disabled={deleting}><Trash2 size={15} /><span>Delete</span></button>
            <div className="record-dialog__actions">
              <button type="button" className="voyage-bar__button voyage-bar__button--plain" onClick={onClose} disabled={deleting}><span>Close</span></button>
            </div>
          </footer>
        )}
        <ConfirmDialog
          open={confirming}
          title="Delete this report?"
          body={`The report for ${title}${made ? `, made ${made}` : ''}, is removed from the archive for good. An email already sent stays in your inbox, and the visit numbers it was built from are kept.`}
          confirmLabel={deleting ? 'Deleting' : 'Delete'}
          tone="danger"
          initialFocus="cancel"
          busy={deleting}
          onConfirm={remove}
          onCancel={cancelDelete}
        />
      </div>
    </div>,
    document.body,
  );
}
