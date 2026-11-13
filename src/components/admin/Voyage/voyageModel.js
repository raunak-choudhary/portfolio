// src/components/admin/Voyage/voyageModel.js
//
// Pure model of the voyage: where the camera is for a scroll position, how far
// each chapter's constellation has drawn itself, which chapter is live, where
// the deep-sky objects sit, and the decisions about motion and WebGL. No DOM,
// no Three.js, so every rule here is unit tested; the scene and the page apply
// the numbers.

import { CHAPTERS, DEEP_SKY_PLACEMENTS, chapterIndex } from './chapters';

/** World units between chapter anchors along the route, and units per degree of sky inside a figure. */
export const SPACING = 520;
export const DEGREE_SCALE = 9;
/** The camera looks this far below a chapter's figure, so the figure sits in the upper part of the frame above the content. */
export const LOOK_DROP = 110;
/** How far behind an anchor the camera rests when a chapter is in view. */
export const CAMERA_STANDOFF = 520;
/** The first anchor sits this far in front of the origin. */
const FIRST_ANCHOR_Z = -360;
/** Extra depth between the prologue and the first chapter, so the Earth and Moon are left behind before the Great Bear draws. */
export const PROLOGUE_GAP = 520;

export const clamp01 = (v) => Math.min(1, Math.max(0, v));

/**
 * Anchor of chapter i: a gentle lateral weave so the route is not a straight
 * corridor, and a constant step in depth. The prologue's anchor sits lower
 * and to the right so the camera opens on the Earth (placed off that anchor
 * by earthModel's EARTH_OFFSET) with the title at the left.
 * @returns {{x: number, y: number, z: number}}
 */
export const anchorFor = (i) => (i === 0 ? { x: 160, y: -140, z: FIRST_ANCHOR_Z } : { x: Math.sin(i * 1.7) * 160, y: Math.cos(i * 1.3) * 90, z: FIRST_ANCHOR_Z - PROLOGUE_GAP - i * SPACING });

export const ANCHORS = Object.freeze(CHAPTERS.map((_, i) => anchorFor(i)));

/**
 * Scroll fraction (0..1 over the whole page) to a position along the route.
 * @returns {{f: number, index: number, frac: number}} f is the continuous chapter
 *   coordinate, index the chapter the camera is leaving or at, frac the way to the next.
 */
export function routePosition(scrollFraction, count = CHAPTERS.length) {
  const f = clamp01(scrollFraction) * (count - 1);
  const index = Math.min(count - 1, Math.floor(f + 1e-6));
  return { f, index, frac: f - index };
}

const lerp = (a, b, t) => a + (b - a) * t;

/**
 * Where the camera wants to be and look for a route position.
 * With fly = false the camera cuts straight to the chapter in view (the fallback
 * for reduced motion and weak devices).
 */
export function cameraTarget({ index, frac }, fly = true, anchors = ANCHORS) {
  const a = anchors[index], b = anchors[Math.min(anchors.length - 1, index + 1)];
  const look = fly ? { x: lerp(a.x, b.x, frac), y: lerp(a.y, b.y, frac) - LOOK_DROP, z: lerp(a.z, b.z, frac) } : { x: a.x, y: a.y - LOOK_DROP, z: a.z };
  const position = fly
    ? { x: look.x * 0.35, y: look.y * 0.35 + 20, z: look.z + CAMERA_STANDOFF }
    : { x: 0, y: -LOOK_DROP * 0.35, z: a.z + CAMERA_STANDOFF };
  return { position, look };
}

/** Where in the approach a figure starts to draw: the first chapter waits until the Earth is behind the camera. */
export const drawStartFor = (i) => (i === 1 ? 0.5 : 0.15);

/**
 * How a chapter's constellation shows for a route coordinate f: `near` is 1 at
 * the chapter and 0 one chapter away; lines draw from `drawStart` to 75% of
 * the approach; the drawing fades in over the last 40% of the draw; the whole
 * group turns slightly as the camera passes.
 */
export function figureState(i, f, drawStart = drawStartFor(i)) {
  const d = Math.abs(f - i);
  const near = clamp01(1 - d);
  const draw = clamp01((near - drawStart) / (0.75 - drawStart));
  return { near, draw, pointAlpha: clamp01(near * 1.4), artAlpha: clamp01((draw - 0.6) / 0.4), turn: (f - i) * 0.12 };
}

/** The chapter whose stage is live (title and content shown) for a route coordinate. */
export const liveChapterIndex = (f) => Math.round(f);
export const isChapterLive = (i, f) => Math.abs(f - i) < 0.55;

/**
 * World placement of a deep-sky photograph: far behind its chapter's figure
 * and off to one side, large enough to still fill a good part of the frame
 * from that distance, so it drifts slowly past (parallax) with the stars in
 * front of it.
 * @param {{slug: string, near: string, side: 'left'|'right', scale: number, depth: number}} placement
 * @param {{width: number, height: number}} image
 * @returns {{x: number, y: number, z: number, width: number, height: number}}
 */
export function deepSkyPlacement(placement, image, anchors = ANCHORS) {
  const i = Math.max(0, chapterIndex(placement.near));
  const a = anchors[i];
  const base = 1250 * placement.scale;
  const aspect = image.width / Math.max(1, image.height);
  const width = aspect >= 1 ? base : base * aspect, height = aspect >= 1 ? base / aspect : base;
  // off the route's axis, so the object is seen past the figure rather than behind it
  const x = (placement.side === 'left' ? -1 : 1) * (700 + base * 0.3) + a.x * 0.4;
  const y = a.y * 0.4 + (i % 3 === 0 ? 380 : i % 3 === 1 ? -300 : 120);
  return { x, y, z: a.z + placement.depth, width, height };
}

export const deepSkyLayout = (manifest, anchors = ANCHORS) =>
  DEEP_SKY_PLACEMENTS.flatMap((p) => { const img = manifest.find((m) => m.slug === p.slug); return img ? [{ ...p, image: img, ...deepSkyPlacement(p, img, anchors) }] : []; });

/**
 * Star count and pixel ratio for a device, so phones keep their frame rate.
 * @param {{width: number, devicePixelRatio: number, reducedMotion: boolean, webgl: boolean}} env
 */
export function qualityFor({ width, devicePixelRatio = 1, reducedMotion = false, webgl = true }) {
  if (!webgl) return { mode: 'fallback', stars: 0, pixelRatio: 1, fly: false };
  const phone = width < 768;
  return { mode: 'webgl', stars: phone ? 3500 : 9000, pixelRatio: Math.min(devicePixelRatio, phone ? 1.5 : 2), fly: !reducedMotion };
}

/** The greeting for the prologue, by the hour in New York. */
export function greetingFor(date = new Date(), timeZone = 'America/New_York') {
  const hour = Number(new Intl.DateTimeFormat('en-US', { hour: 'numeric', hourCycle: 'h23', timeZone }).format(date));
  if (hour < 5) return 'Good night';
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  if (hour < 22) return 'Good evening';
  return 'Good night';
}

/** Scroll fraction that puts a chapter's stage in view when stages are evenly spaced (the 2D fallback and tests). */
export const scrollFractionFor = (i, count = CHAPTERS.length) => i / (count - 1);

/**
 * The route coordinate from where the chapter stages actually sit on the
 * page. Stages are not all one screen tall (a deck of thirty cards is
 * several), so the camera follows the stage under the viewport: f runs from
 * i to i + 1 as the scroll position runs from stage i's top to stage i + 1's.
 * @param {number} scrollY
 * @param {number[]} tops document offsets of the stages, ascending.
 */
export function routeFromTops(scrollY, tops) {
  const n = tops.length;
  if (n === 0) return 0;
  if (n === 1 || scrollY <= tops[0]) return 0;
  for (let i = 0; i < n - 1; i++) {
    if (scrollY < tops[i + 1]) { const span = Math.max(1, tops[i + 1] - tops[i]); return i + (scrollY - tops[i]) / span; }
  }
  return n - 1;
}
