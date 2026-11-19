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

import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

const FOCUSABLE = 'button, [href], iframe, [tabindex]:not([tabindex="-1"])';

/**
 * @param {object} props
 * @param {{id: string, period_label: string, quarter: string, partial: boolean, body_html: string, body_text: string}|null} props.report
 *   the archive row to show (the archive read already carries the report body); null closes.
 * @param {() => void} props.onClose
 */
export default function ReportDialog({ report, onClose }) {
  const panelRef = useRef(null), openerRef = useRef(null), keyRef = useRef(null);
  const open = Boolean(report);

  keyRef.current = (e) => {
    if (e.key === 'Escape') { e.stopPropagation(); onClose(); return; }
    if (e.key !== 'Tab' || !panelRef.current) return;
    const nodes = [...panelRef.current.querySelectorAll(FOCUSABLE)].filter((n) => !n.disabled);
    if (!nodes.length) return;
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
    return () => { document.removeEventListener('keydown', onKey, true); document.body.style.overflow = previousOverflow; openerRef.current?.focus?.(); };
  }, [open]);

  if (!open) return null;
  const title = `${report.period_label}${report.partial ? ' (partial)' : ''}`;
  return createPortal(
    <div className="record-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={panelRef} className="record-dialog report-dialog" role="dialog" aria-modal="true" aria-labelledby="report-dialog-title" data-testid="report-dialog">
        <header className="record-dialog__head">
          <div className="record-dialog__titles">
            <div className="voyage-chapter__kicker">Quarterly report · {report.quarter}</div>
            <h3 id="report-dialog-title">{title}</h3>
          </div>
          <button type="button" className="record-dialog__close" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </header>
        <div className="record-dialog__body report-dialog__body">
          {report.body_html ? (
            <iframe className="report-dialog__frame" title={`Report for ${report.period_label}`} sandbox="" srcDoc={String(report.body_html)} referrerPolicy="no-referrer" />
          ) : (
            // a row without HTML still has the plain text the email carried
            <pre className="report-dialog__text">{String(report.body_text || 'This report has no body.')}</pre>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
