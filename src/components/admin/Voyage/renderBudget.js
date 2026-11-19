// src/components/admin/Voyage/renderBudget.js
//
// How much work the voyage sky may do, as pure rules (no DOM, no Three.js,
// unit tested). Measured on the owner's M3 MacBook (scripts/measure-frames.mjs,
// 2026-11-18): the GPU, not the CPU, was the bottleneck. A live backdrop blur
// over a canvas that changes every frame re-blurs every glass surface every
// frame, and a 2880 x 1800 canvas with antialiasing is a lot of fill. So the
// sky has two modes, chosen by the existing Panels switch in the Sky menu:
//
//   working  (panels on)  the sky drifts at a lower resolution and at most
//                          30 frames a second; glass shows a still, blurred
//                          snapshot of the sky instead of a live blur.
//   showcase (panels off) the panels step aside; full resolution, every
//                          frame, every effect, no glass at all.
//
// In both modes the sky renders only when something on it moves, and an
// adaptive step lowers the resolution while frames run long.

/** Mode settings. `maxPixelRatio` caps the device pixel ratio; `frameInterval` is the shortest gap between renders in ms. */
export const MODES = Object.freeze({
  working: Object.freeze({ maxPixelRatio: 1, phoneMaxPixelRatio: 1, frameInterval: 1000 / 30 }),
  showcase: Object.freeze({ maxPixelRatio: 2, phoneMaxPixelRatio: 1.5, frameInterval: 0 }),
});

/** The Panels switch picks the mode: panels on is where the owner works. */
export const modeFor = (panels) => (panels === false ? 'showcase' : 'working');

/** Pixel-ratio factors for the adaptive steps: level 0 is the mode's full ratio. */
export const QUALITY_STEPS = Object.freeze([1, 0.85, 0.7, 0.55]);
/** The resolution never drops below this, so stars stay points rather than smears. */
export const MIN_PIXEL_RATIO = 0.6;

/**
 * Canvas pixel ratio for a mode, device and adaptive level, rounded to 0.05
 * so small changes do not resize the canvas.
 * @param {{mode: 'working'|'showcase', devicePixelRatio?: number, phone?: boolean, level?: number}} input
 */
export function pixelRatioFor({ mode, devicePixelRatio = 1, phone = false, level = 0 }) {
  const m = MODES[mode] || MODES.working;
  const cap = phone ? m.phoneMaxPixelRatio : m.maxPixelRatio;
  const base = Math.min(Math.max(devicePixelRatio || 1, 0.5), cap);
  const step = QUALITY_STEPS[Math.min(QUALITY_STEPS.length - 1, Math.max(0, level | 0))];
  return Math.max(MIN_PIXEL_RATIO, Math.round(base * step * 20) / 20);
}

/** When nothing on the sky moves, it is repainted at most this often (the deep-sky photographs drift over minutes). */
export const AMBIENT_INTERVAL_MS = 500;
/** rAF callbacks land a little before or after the ideal moment; this slack keeps a 30 fps cap from falling to 20 on a 60 Hz screen. */
const VSYNC_SLACK_MS = 4;

/**
 * Whether to render on this animation frame.
 * @param {{now: number, lastRenderAt: number, frameInterval: number, active: boolean}} input
 *   `active` is true while the camera eases, the Earth turns in view, a texture
 *   has just arrived or the size or theme changed.
 */
export function renderDue({ now, lastRenderAt, frameInterval, active }) {
  if (!Number.isFinite(lastRenderAt)) return true;
  const gap = now - lastRenderAt;
  if (!active) return gap >= AMBIENT_INTERVAL_MS;
  return gap >= frameInterval - VSYNC_SLACK_MS;
}

/** Adaptive resolution: a rolling average of frame gaps steps the level up when frames run long and back down when there is room. */
export const ADAPT = Object.freeze({
  slowMs: 24,          // average gap above this (under about 42 fps) is slow
  fastMs: 18,          // average gap under this (about 55 fps or better) has room
  slowFrames: 45,      // about three quarters of a second of slow frames before stepping down
  fastFrames: 300,     // about five seconds of fast frames before stepping back up
  smoothing: 0.1,      // weight of the newest gap in the rolling average
  maxGapMs: 100,       // longer gaps (a tab switch, a debugger pause) are clamped so one outlier cannot decide
});

export const initialAdaptState = () => ({ level: 0, average: null, slow: 0, fast: 0 });

/**
 * Feed one frame gap (ms between animation frames) into the adaptive state.
 * Only frames the page wanted at full rate should be fed: in working mode the
 * gap is measured between rAF callbacks, which still arrive every vsync.
 * @returns {{level: number, average: number, slow: number, fast: number, changed: boolean}}
 */
export function adaptQuality(state, gapMs, limits = ADAPT) {
  const gap = Math.min(Math.max(gapMs, 0), limits.maxGapMs);
  const average = state.average === null ? gap : state.average + (gap - state.average) * limits.smoothing;
  let { level } = state;
  let slow = average > limits.slowMs ? state.slow + 1 : 0;
  let fast = average < limits.fastMs ? state.fast + 1 : 0;
  let changed = false;
  if (slow >= limits.slowFrames && level < QUALITY_STEPS.length - 1) { level += 1; slow = 0; fast = 0; changed = true; }
  else if (fast >= limits.fastFrames && level > 0) { level -= 1; slow = 0; fast = 0; changed = true; }
  return { level, average, slow, fast, changed };
}

/** The glass snapshot is retaken once the camera has rested this long after travelling at least SNAPSHOT_TRAVEL chapters. */
export const SNAPSHOT_SETTLE_MS = 700;
export const SNAPSHOT_TRAVEL = 0.5;

/**
 * Whether to take a new glass snapshot now.
 * @param {{hasSnapshot: boolean, stillForMs: number, f: number, snapshotF: number|null, stale: boolean}} input
 *   `stillForMs` is how long the camera has rested; `stale` is set when the theme or glass blur changed.
 */
export function snapshotDue({ hasSnapshot, stillForMs, f, snapshotF, stale }) {
  if (stillForMs < SNAPSHOT_SETTLE_MS) return false;
  if (!hasSnapshot || stale || snapshotF === null) return true;
  return Math.abs(f - snapshotF) >= SNAPSHOT_TRAVEL;
}

/** The snapshot is drawn at this fraction of the CSS size: small enough to be cheap, large enough for a soft frosted look. */
export const SNAPSHOT_SCALE = 0.25;

/**
 * Blur radius for the small snapshot canvas that matches a CSS blur radius at
 * full size (the Sky menu's Blur slider keeps its meaning).
 */
export const snapshotBlurPx = (cssBlurPx, scale = SNAPSHOT_SCALE) => Math.max(0, Math.round(cssBlurPx * scale * 10) / 10);
