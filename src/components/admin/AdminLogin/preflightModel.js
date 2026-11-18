// src/components/admin/AdminLogin/preflightModel.js
//
// Pure helpers for the admin login, the "pre-flight" before the voyage:
// the three checklist steps and their states, the readout line of true
// facts, and the quiet starfield behind the panel. Kept free of React and
// the DOM so every rule is unit tested directly.

import { moonPhase, seededRandom, clamp } from '../SkyBackground/skyModel';

/** The checklist, in order. Labels are set in condensed caps by the stylesheet. */
export const STEPS = Object.freeze([
  Object.freeze({ id: 'identity', numeral: '01', label: 'Identity' }),
  Object.freeze({ id: 'second', numeral: '02', label: 'Second key' }),
  Object.freeze({ id: 'launch', numeral: '03', label: 'Launch' })
]);

/**
 * State of one step given the current one: steps before it are done, the
 * current one is lit, later ones wait. An unknown current id lights nothing,
 * which is the safe reading.
 * @returns {'done'|'current'|'pending'}
 */
export function stepState(stepId, currentId) {
  const at = STEPS.findIndex((step) => step.id === currentId);
  const index = STEPS.findIndex((step) => step.id === stepId);
  if (at < 0 || index < 0 || index > at) return 'pending';
  return index < at ? 'done' : 'current';
}

const NEW_YORK_CLOCK = (() => {
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
      timeZoneName: 'short'
    });
  } catch {
    return null;
  }
})();

/** "21:14 EST" in New York, whatever the visitor's own zone; empty if Intl lacks zone data. */
export function newYorkClock(date) {
  if (!NEW_YORK_CLOCK) return '';
  const parts = NEW_YORK_CLOCK.formatToParts(date);
  const pick = (type) => parts.find((part) => part.type === type)?.value || '';
  const hour = pick('hour') === '24' ? '00' : pick('hour');
  return `${hour}:${pick('minute')} ${pick('timeZoneName')}`.trim();
}

/** "MOON 65% WAXING", or NEW and FULL at the ends of the cycle, from the shared sky model. */
export function moonLabel(date) {
  const { lit, waxing } = moonPhase(date);
  const percent = Math.round(lit * 100);
  if (percent <= 1) return 'MOON NEW';
  if (percent >= 99) return 'MOON FULL';
  return `MOON ${percent}% ${waxing ? 'WAXING' : 'WANING'}`;
}

/**
 * The one readout line under the checklist. Only facts the page can know:
 * the owner's city clock and tonight's Moon. Nothing invented.
 * @returns {string[]} the parts, joined by the component with a thin separator.
 */
export function readoutParts(date = new Date()) {
  const clock = newYorkClock(date);
  return [clock ? `NEW YORK ${clock}` : 'NEW YORK', moonLabel(date)];
}

// ---------------------------------------------------------------------------
// Starfield
// ---------------------------------------------------------------------------

/** Horizontal drift of the whole field, in CSS pixels per second: slow enough to notice only when looking. */
export const DRIFT_PX_PER_SECOND = 1.6;

/** How far a twinkling star dims at the bottom of its cycle (0 = none, 1 = out). */
export const TWINKLE_DEPTH = 0.3;

/** Star colours: mostly white, a few cool blue-white and warm, as in a real sky. */
export const STAR_TINTS = Object.freeze({
  night: Object.freeze(['232,238,248', '196,220,255', '255,236,214']),
  dawn: Object.freeze(['255,243,232', '255,226,200', '226,232,255'])
});

/**
 * A field of stars for a viewport, the same for the same seed and size.
 * Density follows the area with a floor for phones and a ceiling for very
 * large screens, so the sky looks alike at every width.
 */
export function makeStars(width, height, seed = 2026) {
  const random = seededRandom(seed);
  const count = Math.round(clamp((width * height) / 2600, 120, 650));
  const stars = [];
  for (let i = 0; i < count; i += 1) {
    const size = random();
    const glow = random();
    stars.push({
      x: random() * width,
      y: random() * height,
      // most stars are pinpricks; a cubic curve keeps the bright ones rare
      r: 0.35 + size * size * size * 1.25,
      alpha: 0.22 + glow * glow * 0.68,
      phase: random() * Math.PI * 2,
      speed: 0.25 + random() * 0.9,
      tint: random() < 0.78 ? 0 : random() < 0.6 ? 1 : 2
    });
  }
  return stars;
}

/** Opacity of a star at a time in seconds; time 0 is the still frame. */
export function starAlpha(star, seconds) {
  if (!seconds) return star.alpha;
  const wave = 0.5 + 0.5 * Math.sin(star.phase + seconds * star.speed);
  return star.alpha * (1 - TWINKLE_DEPTH * wave);
}

/** Where a star sits after drifting for some seconds, wrapped around the width. */
export function driftedX(star, seconds, width) {
  if (!seconds || width <= 0) return star.x;
  const x = (star.x + seconds * DRIFT_PX_PER_SECOND) % width;
  return x < 0 ? x + width : x;
}

/**
 * Draws one frame of the field. `seconds` 0 gives the still frame used under
 * reduced motion. The canvas is cleared to transparent: the page colour and
 * the Earth's limb sit behind and in front of it in CSS.
 */
export function drawStars(ctx, stars, { width, height, seconds = 0, palette = 'night' }) {
  const tints = STAR_TINTS[palette] || STAR_TINTS.night;
  ctx.clearRect(0, 0, width, height);
  for (const star of stars) {
    ctx.fillStyle = `rgba(${tints[star.tint]},${starAlpha(star, seconds).toFixed(3)})`;
    ctx.beginPath();
    ctx.arc(driftedX(star, seconds, width), star.y, star.r, 0, Math.PI * 2);
    ctx.fill();
  }
}

// ---------------------------------------------------------------------------
// The Earth's night limb
// ---------------------------------------------------------------------------

/** Limb colours: the voyage blue by night, a low warm glow for the dawn theme. */
export const LIMB_COLOURS = Object.freeze({
  night: Object.freeze({ rim: '124,199,255', body: '#010309' }),
  dawn: Object.freeze({ rim: '255,178,122', body: '#060201' })
});

/**
 * The planet as a very large circle whose top just shows above the bottom
 * edge: `rise` is how high the limb stands at the centre, `sag` how far it
 * falls by the screen edges. The radius follows from those two, so the curve
 * reads the same on a phone and on a wide monitor.
 * @returns {{cx: number, cy: number, radius: number, rise: number}}
 */
export function limbGeometry(width, height) {
  const rise = clamp(height * 0.11, 44, 120);
  const sag = Math.min(rise * 0.7, Math.max(18, width * 0.035));
  const half = width / 2;
  const radius = (half * half + sag * sag) / (2 * sag);
  return { cx: half, cy: height - rise + radius, radius, rise };
}

/**
 * Draws the limb: the dark planet hides the stars behind it, then one thin
 * lit rim with a soft halo of atmosphere. Static, so it costs the same in the
 * still frame and in motion.
 */
export function drawLimb(ctx, { width, height, palette = 'night' }) {
  const { cx, cy, radius } = limbGeometry(width, height);
  const { rim, body } = LIMB_COLOURS[palette] || LIMB_COLOURS.night;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fillStyle = body;
  ctx.fill();
  // halo first, rim last, so the bright line sits on top
  const strokes = [[28, 0.035], [12, 0.07], [5, 0.16], [1.4, 0.85]];
  for (const [lineWidth, alpha] of strokes) {
    ctx.beginPath();
    ctx.arc(cx, cy, radius, Math.PI, Math.PI * 2);
    ctx.lineWidth = lineWidth;
    ctx.strokeStyle = `rgba(${rim},${alpha})`;
    ctx.stroke();
  }
}

/** One full frame: stars, then the limb in front of them. */
export function drawFrame(ctx, stars, options) {
  drawStars(ctx, stars, options);
  drawLimb(ctx, options);
}
