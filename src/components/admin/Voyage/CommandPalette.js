// src/components/admin/Voyage/CommandPalette.js
//
// Cmd+K: jump to any chapter or run an action. Built on cmdk (MIT), which
// gives the filtering, keyboard model and ARIA; the look is ours.

import React, { useEffect } from 'react';
import { Command } from 'cmdk';
import { CHAPTERS, chapterPlace } from './chapters';

/**
 * @param {object} props
 * @param {boolean} props.open
 * @param {(open: boolean) => void} props.onOpenChange
 * @param {(index: number) => void} props.onJump
 * @param {Array<{id: string, label: string, hint?: string, run: () => void}>} [props.actions]
 * @param {Record<string, string>} [props.names]
 */
export default function CommandPalette({ open, onOpenChange, onJump, actions = [], names = {} }) {
  useEffect(() => {
    const onKey = (e) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); onOpenChange(!open); } };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onOpenChange]);

  if (!open) return null;
  const close = () => onOpenChange(false);
  return (
    <div className="voyage-palette" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}>
      <Command label="Jump anywhere" className="voyage-palette__box" loop>
        <Command.Input autoFocus placeholder="Jump to a chapter or run an action…" className="voyage-palette__input" />
        <Command.List className="voyage-palette__list">
          <Command.Empty className="voyage-palette__empty">Nothing matches.</Command.Empty>
          <Command.Group heading="Chapters">
            {CHAPTERS.map((c, i) => (
              <Command.Item key={c.id} value={`${c.name} ${chapterPlace(c, names)}`} onSelect={() => { onJump(i); close(); }} className="voyage-palette__item">
                <span>{c.name}</span><span className="voyage-palette__hint">{chapterPlace(c, names)}</span>
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
