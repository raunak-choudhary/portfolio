// src/hooks/useMediaQuery.js
//
// Tracks a CSS media query from React, so a component can render a compact
// layout on phones instead of hiding duplicate controls with CSS. Safe when
// matchMedia is missing (tests, old browsers): it then reports `fallback`.

import { useEffect, useState } from 'react';

const query = (q) => { try { return typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(q) : null; } catch { return null; } };

/**
 * @param {string} q a media query, e.g. "(max-width: 767px)".
 * @param {boolean} [fallback] value when the query cannot be evaluated.
 * @returns {boolean}
 */
export default function useMediaQuery(q, fallback = false) {
  const [matches, setMatches] = useState(() => query(q)?.matches ?? fallback);
  useEffect(() => {
    const list = query(q);
    if (!list) return undefined;
    const onChange = (event) => setMatches(event.matches);
    setMatches(list.matches);
    if (list.addEventListener) list.addEventListener('change', onChange); else list.addListener(onChange);
    return () => { if (list.removeEventListener) list.removeEventListener('change', onChange); else list.removeListener(onChange); };
  }, [q]);
  return matches;
}

/** Breakpoints the admin header uses: a phone gets the compact menu, a tablet keeps icon-only buttons. */
export const PHONE_QUERY = '(max-width: 767px)';
