// src/services/voyagePosition.js
//
// Where the voyage's camera was when the admin signed out, so the sign-out
// film can play over the same sky. Kept in sessionStorage, like the session
// facts, because the move to /adminsignout is a full page load; it dies with
// the tab and is cleared when the film ends. Nothing personal: a route
// coordinate, a chapter id and a theme name.

import { CHAPTERS, chapterIndex } from '../components/admin/Voyage/chapters';

export const VOYAGE_POSITION_KEY = 'rc-admin-voyage-position';

const THEMES = new Set(['dark', 'light']);
const lastIndex = () => CHAPTERS.length - 1;
const defaultStorage = () => (typeof window !== 'undefined' ? window.sessionStorage : null);

/**
 * Records the camera's route coordinate (0 at the prologue, one per chapter)
 * and the theme in use. Out-of-range coordinates are clamped; a non-number is
 * not recorded.
 * @param {{f: number, theme?: 'dark'|'light'}} position
 */
export function recordVoyagePosition({ f, theme } = {}, storage = defaultStorage()) {
  if (!Number.isFinite(f)) return;
  const clamped = Math.min(lastIndex(), Math.max(0, f));
  const record = { f: Math.round(clamped * 1000) / 1000, chapter: CHAPTERS[Math.round(clamped)].id };
  if (THEMES.has(theme)) record.theme = theme;
  try { storage?.setItem(VOYAGE_POSITION_KEY, JSON.stringify(record)); } catch { /* storage unavailable: the film opens on the prologue */ }
}

/**
 * The recorded position, or null when there is none or it does not parse.
 * A missing or broken coordinate falls back to the chapter id when that names
 * a real chapter.
 * @returns {{f: number, chapter: string, theme: ('dark'|'light'|null)}|null}
 */
export function readVoyagePosition(storage = defaultStorage()) {
  try {
    const raw = storage?.getItem(VOYAGE_POSITION_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if (!parsed || typeof parsed !== 'object') return null;
    let f = Number.isFinite(parsed.f) && parsed.f >= 0 && parsed.f <= lastIndex() ? parsed.f : null;
    if (f === null && typeof parsed.chapter === 'string' && chapterIndex(parsed.chapter) >= 0) f = chapterIndex(parsed.chapter);
    if (f === null) return null;
    return { f, chapter: CHAPTERS[Math.round(f)].id, theme: THEMES.has(parsed.theme) ? parsed.theme : null };
  } catch {
    return null;
  }
}

/** Forgets the position; called when the film ends. */
export function clearVoyagePosition(storage = defaultStorage()) {
  try { storage?.removeItem(VOYAGE_POSITION_KEY); } catch { /* nothing to clear */ }
}
