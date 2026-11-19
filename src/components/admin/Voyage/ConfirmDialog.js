// src/components/admin/Voyage/ConfirmDialog.js
//
// A small in-page confirmation on glass: one sentence, a quiet cancel and
// one decisive button. Used by the record dialog for discard and delete,
// where the record dialog already owns the keyboard. A confirmation that
// stands on its own (the Security chapter's removals) passes `trapFocus`:
// it then traps Tab, closes on Escape, and gives focus back on closing.

import React, { useEffect, useRef } from 'react';
import useModalFocus from './useModalFocus';

/**
 * @param {object} props
 * @param {string} [props.more] a second, quieter sentence under the consequence.
 * @param {string} [props.className] extra class on the panel (wider variants).
 * @param {React.ComponentType} [props.confirmIcon] an icon before the confirm label.
 * @param {boolean} [props.trapFocus] own the keyboard (standalone use).
 * @param {'confirm'|'cancel'} [props.initialFocus] which button takes focus on opening.
 * @param {() => HTMLElement|null} [props.returnTo] where focus goes if the opener is gone.
 */
export default function ConfirmDialog({ open, title, body, more, confirmLabel, tone = 'default', onConfirm, onCancel, className = '', confirmIcon: ConfirmIcon, trapFocus = false, initialFocus = 'confirm', returnTo, busy = false }) {
  const panelRef = useRef(null), confirmRef = useRef(null), cancelRef = useRef(null);
  const pick = () => (initialFocus === 'cancel' ? cancelRef.current : confirmRef.current);
  // Standalone: the full modal contract. Inside the record dialog only the first focus, as before.
  useModalFocus(open && trapFocus, panelRef, { onEscape: () => { if (!busy) onCancel(); }, initialFocus: pick, returnTo, lockScroll: false });
  useEffect(() => { if (open && !trapFocus) confirmRef.current?.focus(); }, [open, trapFocus]);
  if (!open) return null;
  return (
    <div className="dialog-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onCancel(); }}>
      <div ref={panelRef} className={`dialog voyage-pane${className ? ` ${className}` : ''}`} role="alertdialog" aria-modal="true" aria-labelledby="dialog-title" aria-describedby="dialog-body">
        <h4 id="dialog-title">{title}</h4>
        <p id="dialog-body">{body}</p>
        {more ? <p className="dialog__more">{more}</p> : null}
        <div className="dialog__actions">
          <button type="button" ref={cancelRef} className="voyage-bar__button voyage-bar__button--quiet" onClick={onCancel} disabled={busy}>Cancel</button>
          <button type="button" ref={confirmRef} className={`voyage-bar__button${tone === 'danger' ? ' voyage-bar__button--danger' : ''}`} onClick={onConfirm} disabled={busy}>{ConfirmIcon ? <ConfirmIcon size={15} aria-hidden="true" /> : null}{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}
