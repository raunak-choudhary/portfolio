// src/components/admin/Voyage/ExplainDialog.js
//
// The one pattern for every "i" in the voyage: a small button that opens a
// glass dialog explaining one thing in a few numbered blocks instead of a
// paragraph. Blocks rise in one after another (none of it under reduced
// motion) and each carries a picture of the idea (a bar, dots, a chip)
// above one or two short lines.
//
//   <InfoButton label="How the score works" onClick={open} />
//   <ExplainDialog open title="How the score works" lead="..." onClose={close}>
//     <ExplainStep n={1} title="...">picture and lines</ExplainStep>
//   </ExplainDialog>
//
// The dialog owns the keyboard while open (useModalFocus): Tab stays inside,
// Escape and the backdrop close it, focus goes back to the button. Like the
// record dialog it is portalled into <body>: inside a chapter it would sit in
// the chapter's stacking context, under the fixed top bar, with the page
// showing through. The record-backdrop class carries the voyage tokens there.

import React, { useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Info, X } from 'lucide-react';
import useModalFocus from './useModalFocus';
import './Explain.css';

/** The "i" trigger: an icon and a short label, styled as a quiet link. */
export function InfoButton({ label, onClick, className = '' }) {
  return (
    <button type="button" className={`explain-trigger${className ? ` ${className}` : ''}`} onClick={onClick} aria-haspopup="dialog">
      <Info size={14} aria-hidden="true" /><span>{label}</span>
    </button>
  );
}

/** One numbered block; `n` (from 1) is its number and its place in the rise-in order. */
export function ExplainStep({ n, title, children }) {
  return (
    <li className="explain-step" style={{ '--i': n - 1 }}>
      <span className="explain-step__n" aria-hidden="true">{n}</span>
      <div className="explain-step__body">
        <h5>{title}</h5>
        {children}
      </div>
    </li>
  );
}

/**
 * @param {object} props
 * @param {boolean} props.open
 * @param {string} props.title
 * @param {React.ReactNode} [props.lead] one line under the title.
 * @param {React.ReactNode} [props.foot] a quiet note under the blocks.
 * @param {() => void} props.onClose
 */
export default function ExplainDialog({ open, title, lead, foot, onClose, children }) {
  const panelRef = useRef(null), closeRef = useRef(null);
  const id = useId();
  useModalFocus(open, panelRef, { onEscape: onClose, initialFocus: () => closeRef.current });
  if (!open) return null;
  return createPortal(
    <div className="record-backdrop explain-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={panelRef} className="explain" role="dialog" aria-modal="true" aria-labelledby={`${id}-title`} aria-describedby={lead ? `${id}-lead` : undefined}>
        <div className="explain__head">
          <div>
            <h4 id={`${id}-title`}>{title}</h4>
            {lead ? <p id={`${id}-lead`} className="explain__lead">{lead}</p> : null}
          </div>
          <button type="button" ref={closeRef} className="record-dialog__close" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </div>
        <ol className="explain__steps">{children}</ol>
        {foot ? <p className="explain__foot">{foot}</p> : null}
      </div>
    </div>,
    document.body,
  );
}
