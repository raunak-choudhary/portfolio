// src/components/admin/Voyage/ConfirmDialog.js
//
// A small in-page confirmation on glass: one sentence, a quiet cancel and
// one decisive button. Used by the sheet for discard and delete.

import React, { useEffect, useRef } from 'react';

export default function ConfirmDialog({ open, title, body, confirmLabel, tone = 'default', onConfirm, onCancel }) {
  const confirmRef = useRef(null);
  useEffect(() => { if (open) confirmRef.current?.focus(); }, [open]);
  if (!open) return null;
  return (
    <div className="dialog-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
      <div className="dialog voyage-pane" role="alertdialog" aria-modal="true" aria-labelledby="dialog-title" aria-describedby="dialog-body">
        <h4 id="dialog-title">{title}</h4>
        <p id="dialog-body">{body}</p>
        <div className="dialog__actions">
          <button type="button" className="voyage-bar__button voyage-bar__button--quiet" onClick={onCancel}>Cancel</button>
          <button type="button" ref={confirmRef} className={`voyage-bar__button${tone === 'danger' ? ' voyage-bar__button--danger' : ''}`} onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}
