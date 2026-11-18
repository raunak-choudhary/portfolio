// src/components/admin/AdminSignOut/exitBackdrop.js
//
// Which sky the sign-out film plays over. The film follows the voyage, so its
// backdrop is the voyage's own field, held still where the camera was. Pure,
// so each case is unit tested; ExitVoyageSky applies the answer.

import { CHAPTERS } from '../Voyage/chapters';

/** The prologue (the Earth), used when no position was recorded. */
export const DEFAULT_POSITION = Object.freeze({ f: 0, chapter: CHAPTERS[0].id, theme: null });

/**
 * @param {object} input
 * @param {boolean} input.webgl whether a WebGL context is available (and did not fail).
 * @param {{f: number, chapter: string, theme: ('dark'|'light'|null)}|null} input.position the recorded voyage position, if any.
 * @param {'dark'|'light'} input.fallbackTheme the sky settings' theme, used when the record names none.
 * @returns {{kind: 'field'|'flat', scrollFraction: number, chapter: string, theme: 'dark'|'light', recorded: boolean}}
 *   `field` is the 3D voyage field frozen at `scrollFraction` (0..1 over the route, as the field expects);
 *   `flat` is the voyage's own no-WebGL fallback sky.
 */
export function chooseExitBackdrop({ webgl, position, fallbackTheme = 'dark' }) {
  const recorded = !!position;
  const at = position || DEFAULT_POSITION;
  return {
    kind: webgl ? 'field' : 'flat',
    scrollFraction: at.f / Math.max(1, CHAPTERS.length - 1),
    chapter: at.chapter,
    theme: at.theme || fallbackTheme,
    recorded,
  };
}

/** Whether the sky is hidden behind the film's opaque black (the cut, the leader and the credits), so painting it would be wasted work. */
export const skyCovered = (rootClassName = '') => /\b(black|leader|credits)\b/.test(rootClassName);
