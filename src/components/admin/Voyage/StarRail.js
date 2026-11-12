// src/components/admin/Voyage/StarRail.js
//
// The position rail: one small mark per chapter, lit at the current one,
// named on hover, a click flies there. Vertical on the right of wide screens,
// a row along the bottom on phones (CSS).

import React from 'react';
import { CHAPTERS } from './chapters';

/**
 * @param {object} props
 * @param {number} props.active index of the live chapter.
 * @param {(index: number) => void} props.onJump
 * @param {Record<string, string>} [props.names] constellation id to display name (from figures.json).
 */
export default function StarRail({ active, onJump, names = {} }) {
  return (
    <nav className="voyage-rail" aria-label="Chapters">
      {CHAPTERS.map((chapter, i) => (
        <button
          key={chapter.id}
          type="button"
          className={`voyage-rail__dot${i === active ? ' is-active' : ''}`}
          aria-label={`${chapter.name} (${names[chapter.constellation] || chapter.constellation})`}
          aria-current={i === active ? 'true' : undefined}
          data-name={`${chapter.name} · ${names[chapter.constellation] || chapter.constellation}`}
          onClick={() => onJump(i)}
        >
          {chapter.constellation}
        </button>
      ))}
    </nav>
  );
}
