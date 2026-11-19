// src/components/admin/Voyage/useModalFocus.js
//
// The keyboard contract of a modal dialog, for dialogs that do not live
// inside the record dialog (which has its own): while open, Tab and
// Shift+Tab cycle inside the panel, Escape calls onEscape, the page behind
// does not scroll, and when the dialog closes focus goes back to whatever
// opened it. The handlers read the latest callbacks through a ref, so the
// effect runs once per opening and never steals focus while the owner types.

import { useEffect, useRef } from 'react';

export const FOCUSABLE = 'input:not([type="hidden"]), textarea, select, button, [href], [tabindex]:not([tabindex="-1"])';

/** The enabled, visible focusable elements inside a node, in order. */
export const focusablesIn = (node) => (node ? [...node.querySelectorAll(FOCUSABLE)].filter((n) => !n.disabled && !n.closest('[hidden]')) : []);

/**
 * @param {boolean} open
 * @param {{current: HTMLElement|null}} panelRef the dialog panel.
 * @param {{onEscape?: () => void, initialFocus?: () => HTMLElement|null, returnTo?: () => HTMLElement|null, lockScroll?: boolean}} [options]
 *   initialFocus picks the element focused on opening (default: the first focusable);
 *   returnTo picks where focus goes when the opener has left the page (a removed row's button).
 */
export default function useModalFocus(open, panelRef, { onEscape, initialFocus, returnTo, lockScroll = true } = {}) {
  const latest = useRef({ onEscape, initialFocus, returnTo });
  latest.current = { onEscape, initialFocus, returnTo };

  useEffect(() => {
    if (!open) return undefined;
    const opener = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    if (lockScroll) document.body.style.overflow = 'hidden';
    const first = latest.current.initialFocus?.() || focusablesIn(panelRef.current)[0];
    first?.focus();
    const onKey = (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); latest.current.onEscape?.(); return; }
      if (e.key !== 'Tab' || !panelRef.current) return;
      const nodes = focusablesIn(panelRef.current);
      if (!nodes.length) { e.preventDefault(); return; }
      const head = nodes[0], tail = nodes[nodes.length - 1];
      const inside = panelRef.current.contains(document.activeElement);
      if (e.shiftKey && (document.activeElement === head || !inside)) { e.preventDefault(); tail.focus(); } else if (!e.shiftKey && (document.activeElement === tail || !inside)) { e.preventDefault(); head.focus(); }
    };
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      if (lockScroll) document.body.style.overflow = previousOverflow;
      const back = opener && document.contains(opener) && !opener.disabled ? opener : latest.current.returnTo?.();
      if (back && typeof back.focus === 'function') back.focus();
    };
  }, [open, panelRef, lockScroll]);
}
