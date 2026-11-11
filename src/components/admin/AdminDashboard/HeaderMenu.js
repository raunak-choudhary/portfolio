// src/components/admin/AdminDashboard/HeaderMenu.js
//
// The phone version of the header actions: one "more" button that opens a
// menu with Preview, Refresh, Save (when there is something to save) and
// Sign Out. Rendered into <body> like the Sky panel, because the header
// clips anything positioned inside it.

import React, { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import './HeaderMenu.css';

/**
 * @param {object} props
 * @param {Array<{id: string, label: string, icon: string, onSelect: () => void, disabled?: boolean, tone?: 'danger'|'accent'}>} props.items
 * @param {string} [props.label] accessible name of the button.
 */
export default function HeaderMenu({ items, label = 'More actions' }) {
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState({ top: 78, right: 12 });
  const buttonRef = useRef(null), menuRef = useRef(null);
  const menuId = useId();

  const place = () => {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (rect) setAnchor({ top: Math.round(rect.bottom + 8), right: Math.max(8, Math.round(window.innerWidth - rect.right)) });
  };
  const toggle = () => { if (!open) place(); setOpen((v) => !v); };

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => { if (event.key === 'Escape') { setOpen(false); buttonRef.current?.focus(); } };
    const onPointer = (event) => { if (!buttonRef.current?.contains(event.target) && !menuRef.current?.contains(event.target)) setOpen(false); };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointer);
    window.addEventListener('resize', place);
    return () => { document.removeEventListener('keydown', onKey); document.removeEventListener('pointerdown', onPointer); window.removeEventListener('resize', place); };
  }, [open]);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className={`header-menu__button${open ? ' is-open' : ''}`}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={toggle}
      >
        <span aria-hidden="true">⋮</span>
      </button>
      {open && createPortal(
        <div
          ref={menuRef}
          id={menuId}
          className="header-menu"
          role="menu"
          aria-label={label}
          style={{ '--header-menu-top': `${anchor.top}px`, '--header-menu-right': `${anchor.right}px` }}
        >
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              role="menuitem"
              className={`header-menu__item${item.tone ? ` header-menu__item--${item.tone}` : ''}`}
              disabled={item.disabled}
              onClick={() => { setOpen(false); item.onSelect(); }}
            >
              <span className="header-menu__icon" aria-hidden="true">{item.icon}</span>
              <span>{item.label}</span>
            </button>
          ))}
        </div>,
        document.body,
      )}
    </>
  );
}
