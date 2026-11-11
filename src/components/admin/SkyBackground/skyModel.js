// src/components/admin/SkyBackground/skyModel.js
//
// Pure model for the admin dashboard's zodiac sky background: no DOM, no
// canvas, no timers. Everything here is deterministic so it can be unit
// tested and so the sky looks the same on every reload.
//
// The sky is composed, not observed. The twelve zodiac figures sit in
// calendar order, the famous northern figures above them; each figure keeps
// its true star pattern (precomputed in public/admin/sky/figures.json by
// scripts/build-sky-figures.mjs) and is fitted to a tile of the layout.
// Only two things follow real time: whether it is day or night over New
// York, which drives the theme, and the Moon's phase.

/** Zodiac figures in calendar order, Aries first. */
export const ZODIAC_IDS = ['Ari', 'Tau', 'Gem', 'Cnc', 'Leo', 'Vir', 'Lib', 'Sco', 'Sgr', 'Cap', 'Aqr', 'Psc'];

/** The famous figures shown above the zodiac on wide screens. */
export const FAMOUS_IDS = ['UMa', 'UMi', 'Ori', 'Cas', 'Her', 'Cyg'];

/** New York, the owner's city; the Sun's altitude here decides day or night. */
export const NEW_YORK = { lat: 40.7128, lon: -74.006 };

/** Sun altitude in degrees above which the dashboard counts as daytime (civil twilight starts at -6). */
export const DAYLIGHT_ALTITUDE = -3;

/** Settings the owner can change from the Sky menu; cosmetic only, remembered per browser. */
export const DEFAULT_SETTINGS = Object.freeze({
  themeMode: 'auto',   // 'auto' follows the New York clock; 'dark' or 'light' pin the theme
  drawings: true,      // the 1824 atlas drawings behind the star patterns
  clouds: true,
  motion: true,        // figures drawing themselves, twinkle, drifting clouds, the living Sun
  panels: true,        // false hides the dashboard body so the whole sky can be seen
  glass: 0.10,         // panel opacity
  blur: 5,             // panel backdrop blur in pixels
});

export const SETTINGS_STORAGE_KEY = 'rc-admin-sky';
export const GLASS_RANGE = Object.freeze({ min: 0.05, max: 0.8 });
export const BLUR_RANGE = Object.freeze({ min: 0, max: 20 });

const DEG = Math.PI / 180;

/**
 * Accepts only well-formed settings; anything unexpected falls back to the
 * default, so a hand-edited or stale localStorage entry can never break the
 * dashboard or inject values the renderer does not expect.
 * @param {unknown} raw parsed JSON or anything else.
 * @returns {typeof DEFAULT_SETTINGS}
 */
export function sanitizeSettings(raw) {
  return mergeSettings(DEFAULT_SETTINGS, raw);
}

/**
 * Applies a patch to existing settings, key by key: a well-formed value
 * replaces the old one, anything else leaves the old value in place.
 * @param {typeof DEFAULT_SETTINGS} base
 * @param {unknown} patch
 */
export function mergeSettings(base, patch) {
  const out = { ...base };
  if (!patch || typeof patch !== 'object') return out;
  if (['auto', 'dark', 'light'].includes(patch.themeMode)) out.themeMode = patch.themeMode;
  for (const key of ['drawings', 'clouds', 'motion', 'panels']) if (typeof patch[key] === 'boolean') out[key] = patch[key];
  if (Number.isFinite(patch.glass)) out.glass = clamp(patch.glass, GLASS_RANGE.min, GLASS_RANGE.max);
  if (Number.isFinite(patch.blur)) out.blur = Math.round(clamp(patch.blur, BLUR_RANGE.min, BLUR_RANGE.max));
  return out;
}

export const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

// ---------------------------------------------------------------------------
// Time: day or night over New York, and the Moon's phase
// ---------------------------------------------------------------------------

export const julianDay = (date) => date.getTime() / 86400000 + 2440587.5;

/** Local sidereal time at New York in degrees (Meeus, low precision is plenty). */
export function siderealLocal(date) {
  const jd = julianDay(date), T = (jd - 2451545.0) / 36525;
  const gmst = 280.46061837 + 360.98564736629 * (jd - 2451545.0) + 0.000387933 * T * T;
  return (((gmst + NEW_YORK.lon) % 360) + 360) % 360;
}

/** Altitude of the Sun over New York in degrees. */
export function sunAltitude(date) {
  const T = (julianDay(date) - 2451545.0) / 36525;
  const L = (280.46646 + 36000.76983 * T) % 360, M = (357.52911 + 35999.05029 * T) % 360;
  const lon = (L + 1.914602 * Math.sin(M * DEG)) * DEG, e = 23.4393 * DEG;
  const ra = Math.atan2(Math.cos(e) * Math.sin(lon), Math.cos(lon)), dec = Math.asin(Math.sin(e) * Math.sin(lon));
  const ha = siderealLocal(date) * DEG - ra;
  const lat = NEW_YORK.lat * DEG;
  return Math.asin(Math.sin(lat) * Math.sin(dec) + Math.cos(lat) * Math.cos(dec) * Math.cos(ha)) / DEG;
}

/** 'light' while the Sun is up over New York (a little past sunset), else 'dark'. */
export const autoTheme = (date = new Date()) => (sunAltitude(date) > DAYLIGHT_ALTITUDE ? 'light' : 'dark');

/** The theme the sky should show for a given mode and moment. */
export const resolveTheme = (themeMode, date = new Date()) => (themeMode === 'auto' ? autoTheme(date) : themeMode);

/**
 * Moon phase from a reference new moon (2000-01-06 18:14 UTC) and the mean
 * synodic month. Good to a few hours, which is all a drawing needs.
 * @returns {{ fraction: number, lit: number, waxing: boolean }} fraction 0..1 through the cycle, lit 0..1.
 */
export function moonPhase(date = new Date()) {
  const days = (date.getTime() - Date.UTC(2000, 0, 6, 18, 14)) / 86400000;
  const cycles = days / 29.530588853;
  const fraction = cycles - Math.floor(cycles);
  return { fraction, lit: (1 - Math.cos(2 * Math.PI * fraction)) / 2, waxing: fraction < 0.5 };
}

// ---------------------------------------------------------------------------
// Deterministic randomness
// ---------------------------------------------------------------------------

/** Small linear congruential generator; the same seed always gives the same sky. */
export function seededRandom(seed) {
  let s = Math.abs(Math.floor(seed)) % 233280 || 1;
  return () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
}

/** A stable 0..1 value from a figure id, used for the small per-figure jitter. */
export function hashSeed(id) {
  let h = 2166136261;
  for (const ch of String(id)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; }
  return (h % 10000) / 10000;
}

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

/** Radius of the Sun or Moon disc for a viewport width. */
export const lampRadius = (W) => clamp(W * 0.034, 22, 64);

/** Where the Sun or Moon sits: the top-right corner, in its own band on phones. */
export function lampPosition(W) {
  const R = lampRadius(W);
  return { R, cx: W - R * 2.6, cy: (W < 600 ? 64 : 70) + R * 1.4 };
}

/**
 * Lays the figures out in rows. Landscape: six famous figures in a row, then
 * the zodiac in three rows of four. Portrait tablets: three famous, then four
 * rows of three. Phones: the zodiac only. Every figure is fitted whole into
 * its tile, including its drawing when drawings are shown, so nothing is ever
 * cut by an edge.
 *
 * @param {object} input
 * @param {number} input.W viewport width in CSS pixels.
 * @param {number} input.H viewport height.
 * @param {Array} input.figures figures from figures.json.
 * @param {boolean} input.showArt whether the drawings count toward the fit.
 * @returns {Array<object>} tiles with the figure, its screen scale and offsets, name position and drawing transform.
 */
export function planTiles({ W, H, figures, showArt }) {
  const byId = new Map(figures.map((f) => [f.id, f]));
  const landscape = W > H, phone = W < 600;
  const { R } = lampPosition(W);
  const cornerW = phone ? 0 : R * 5.2;                 // the Sun or Moon owns the top-right corner
  const top = phone ? 64 + R * 2.8 : 64, bottom = 44;  // header and footer of the dashboard; phones give the Moon a band
  const famous = phone ? [] : landscape ? FAMOUS_IDS : FAMOUS_IDS.slice(0, 3);
  const famousH = famous.length ? (landscape ? 0.26 : 0.18) * (H - top - bottom) : 0;
  const slots = [];
  if (famous.length) {
    const w = (W - cornerW) / famous.length;
    famous.forEach((id, i) => slots.push({ id, x: i * w, y: top, w, h: famousH }));
  }
  const cols = landscape ? 4 : 3, rows = landscape ? 3 : 4;
  const zy = top + famousH, zh = (H - top - bottom - famousH) / rows, zw = W / cols;
  ZODIAC_IDS.forEach((id, i) => slots.push({ id, x: (i % cols) * zw, y: zy + Math.floor(i / cols) * zh, w: zw, h: zh }));

  const tiles = [];
  for (const slot of slots) {
    const fig = byId.get(slot.id);
    if (!fig) continue;
    const seed = hashSeed(fig.id);
    const nameSize = clamp(slot.w / 10, 11, 15), nameH = clamp(slot.w / 9, 14, 20) + 8;
    const fb = showArt && fig.art ? fig.art.fit : fig.box;
    const availW = slot.w * 0.84, availH = (slot.h - nameH) * 0.86;
    const bw = fb.x1 - fb.x0, bh = fb.y1 - fb.y0;
    const scale = Math.min(availW / bw, availH / bh) * (0.94 + seed * 0.08);
    const jx = (seed - 0.5) * slot.w * 0.05, jy = (((seed * 7) % 1) - 0.5) * slot.h * 0.04;
    const cx = slot.x + slot.w / 2 + jx - ((fb.x0 + fb.x1) / 2) * scale;
    const cy = slot.y + (slot.h - nameH) / 2 + jy - ((fb.y0 + fb.y1) / 2) * scale;
    const tile = {
      ...slot, fig, scale, cx, cy, nameSize,
      nameX: cx + ((fb.x0 + fb.x1) / 2) * scale,
      nameY: slot.y + (slot.h - nameH) / 2 + (bh * scale) / 2 + nameH * 0.9 + jy,
      artT: null,
    };
    if (fig.art) {
      // drawing pixels -> degrees (a, b, tx, ty from figures.json) composed with degrees -> screen
      const m = fig.art;
      tile.artT = { a: m.a * scale, b: m.b * scale, tx: cx + m.tx * scale, ty: cy + m.ty * scale };
    }
    tiles.push(tile);
  }
  return tiles;
}

/**
 * Cumulus clouds of three sizes spread over the whole sky, each with its own
 * drift speed. Positions are fractions of the viewport.
 */
export function planClouds({ W, phone = W < 600 }) {
  const rnd = seededRandom(5);
  const scale = clamp(W / 1440, 0.55, 1.3);
  const plan = phone ? [['big', 1], ['mid', 2], ['small', 4]] : [['big', 3], ['mid', 5], ['small', 9]];
  const clouds = [];
  for (const [kind, count] of plan) {
    for (let i = 0; i < count; i++) {
      const size = (kind === 'big' ? 0.9 + rnd() * 0.5 : kind === 'mid' ? 0.5 + rnd() * 0.3 : 0.22 + rnd() * 0.18) * scale;
      clouds.push({
        kind, sprite: i, size,
        x: rnd(), y: 0.06 + rnd() * 0.86,
        speed: (kind === 'big' ? 0.010 : kind === 'mid' ? 0.006 : 0.0035) * (0.7 + rnd() * 0.6),
        alpha: kind === 'big' ? 0.8 : kind === 'mid' ? 0.7 : 0.6,
        flip: rnd() < 0.5,
      });
    }
  }
  return clouds;
}

// ---------------------------------------------------------------------------
// Animation timing
// ---------------------------------------------------------------------------

/** Figures draw themselves one after another on load, then take turns redrawing. */
export const FIGURE_TIMING = Object.freeze({ drawMs: 2400, staggerMs: 550, turnMs: 6500 });

/**
 * How far along its lines a figure is at a moment, and whether it is still in
 * the opening pass (when its drawing has not yet appeared).
 * @param {number} index tile index.
 * @param {number} count number of tiles.
 * @param {number} elapsed milliseconds since the sky appeared.
 * @param {number} now the animation clock (same units as elapsed).
 */
export function figureProgress(index, count, elapsed, now, timing = FIGURE_TIMING) {
  const first = (elapsed - index * timing.staggerMs) / timing.drawMs;
  if (first < 1) return { progress: Math.max(0, first), firstPass: true, drawing: true };
  const turn = Math.floor(now / timing.turnMs) % count;
  if (turn === index) {
    const p = (now % timing.turnMs) / timing.drawMs;
    if (p < 1) return { progress: p, firstPass: false, drawing: true };
  }
  return { progress: 1, firstPass: false, drawing: false };
}
