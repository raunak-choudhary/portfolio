// src/components/admin/Voyage/CommandPalette.js
//
// Cmd+K: jump to any chapter or run an action. Built on cmdk (MIT), which
// gives the filtering, the arrow-key model and the list's ARIA; the look is
// ours. cmdk's plain Command is not a dialog, so this file adds what a modal
// needs: Escape closes it, Tab stays inside it, focus goes back to where it
// was, and the shortcut stands down while another dialog is open.

import React, { useEffect, useRef } from 'react';
import { Command } from 'cmdk';
import { CHAPTERS, chapterPlace } from './chapters';

/** True while a modal dialog other than the palette is open (a record, a confirmation, the score guide). */
const anotherDialogOpen = () => typeof document !== 'undefined' && Boolean(document.querySelector('.record-backdrop, [aria-modal="true"]:not(.voyage-palette)'));

/**
 * @param {object} props
 * @param {boolean} props.open
 * @param {(open: boolean) => void} props.onOpenChange
 * @param {(index: number) => void} props.onJump
 * @param {Array<{id: string, label: string, hint?: string, run: () => void}>} [props.actions]
 * @param {Record<string, string>} [props.names]
 * @param {'dark'|'light'} [props.theme] the sky's theme, for the prologue's place name.
 */
export default function CommandPalette({ open, onOpenChange, onJump, actions = [], names = {}, theme = 'dark' }) {
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        // Opening over a record dialog would put the palette above it and scroll the page behind an unsaved form.
        // Still claimed: left alone, the browser would run its own Ctrl+K (Firefox moves focus to its search bar).
        if (!open && anotherDialogOpen()) { e.preventDefault(); return; }
        e.preventDefault(); onOpenChange(!open);
      } else if (open && e.key === 'Escape') {
        e.preventDefault(); e.stopPropagation(); onOpenChange(false);
      } else if (open && e.key === 'Tab') {
        e.preventDefault();   // the input is the palette's only tab stop; the list is driven with the arrow keys
      }
    };
    // capture, so Escape closes the palette before any handler underneath sees it
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [open, onOpenChange]);

  // Focus returns to whatever had it (the Jump button, a card) when the palette closes,
  // unless the choice itself moved focus somewhere on purpose.
  // The opener is noted while rendering the opening: by the time any effect runs, the input's
  // autoFocus has already taken focus, and the opener would be recorded as the input itself.
  const openerRef = useRef(null), wasOpen = useRef(false);
  if (open && !wasOpen.current && typeof document !== 'undefined') openerRef.current = document.activeElement;
  wasOpen.current = open;
  useEffect(() => {
    if (!open) return undefined;
    return () => {
      const opener = openerRef.current;
      openerRef.current = null;
      const lost = !document.activeElement || document.activeElement === document.body || !document.activeElement.isConnected;
      if (lost && opener?.isConnected) opener.focus?.({ preventScroll: true });
    };
  }, [open]);

  if (!open) return null;
  const close = () => onOpenChange(false);
  return (
    <div className="voyage-palette" role="dialog" aria-modal="true" aria-label="Jump anywhere" onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}>
      <Command label="Jump anywhere" className="voyage-palette__box" loop>
        <Command.Input autoFocus placeholder="Jump to a chapter or run an action…" className="voyage-palette__input" />
        <Command.List className="voyage-palette__list">
          <Command.Empty className="voyage-palette__empty">Nothing matches.</Command.Empty>
          <Command.Group heading="Chapters">
            {CHAPTERS.map((c, i) => (
              <Command.Item key={c.id} value={`${c.name} ${chapterPlace(c, names, theme)}`} onSelect={() => { onJump(i); close(); }} className="voyage-palette__item">
                <span>{c.name}</span><span className="voyage-palette__hint">{chapterPlace(c, names, theme)}</span>
              </Command.Item>
            ))}
          </Command.Group>
          {actions.length > 0 && (
            <Command.Group heading="Actions">
              {actions.map((a) => (
                <Command.Item key={a.id} value={`${a.label} ${a.hint || ''}`} onSelect={() => { a.run(); close(); }} className="voyage-palette__item">
                  <span>{a.label}</span>{a.hint && <span className="voyage-palette__hint">{a.hint}</span>}
                </Command.Item>
              ))}
            </Command.Group>
          )}
        </Command.List>
      </Command>
    </div>
  );
}
