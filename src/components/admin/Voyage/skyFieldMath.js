// src/components/admin/Voyage/skyFieldMath.js
//
// Numbers behind the 3D field, kept free of Three.js so they can be tested:
// the star field layout, constellation geometry from figures.json, the
// drawing-plane placement from the stored similarity, and the two palettes.

import { seededRandom } from '../SkyBackground/skyModel';
import { CHAPTERS } from './chapters';
import { DEGREE_SCALE, SPACING } from './voyageModel';

/**
 * Positions, colours and sizes for the background star field: three depth
 * bands spread along the whole route, seeded so every load looks the same.
 * @returns {{positions: Float32Array, colors: Float32Array, sizes: Float32Array}}
 */
export function buildStarField(count, seed = 3) {
  const rnd = seededRandom(seed);
  const positions = new Float32Array(count * 3), colors = new Float32Array(count * 3), sizes = new Float32Array(count);
  const routeLength = CHAPTERS.length * SPACING + 1600;
  for (let i = 0; i < count; i++) {
    positions[i * 3] = (rnd() - 0.5) * 2600;
    positions[i * 3 + 1] = (rnd() - 0.5) * 1600;
    positions[i * 3 + 2] = 300 - rnd() * routeLength;
    const warmth = rnd();   // a few warm stars among the blue-white
    colors[i * 3] = 0.8 + 0.2 * warmth; colors[i * 3 + 1] = 0.85 + 0.1 * warmth; colors[i * 3 + 2] = warmth > 0.9 ? 0.85 : 1;
    sizes[i] = 1 + rnd() * rnd() * 3;
  }
  return { positions, colors, sizes };
}

/**
 * A constellation's lines and star points in local units around its centre.
 * @param {object} figure one entry of figures.json.
 * @returns {{segments: number[], points: number[], sizes: number[], centre: [number, number]}}
 *   segments is a flat list of x,y,z pairs (two vertices per segment).
 */
export function buildFigureGeometry(figure) {
  const cx = (figure.box.x0 + figure.box.x1) / 2, cy = (figure.box.y0 + figure.box.y1) / 2;
  const local = ([x, y]) => [(x - cx) * DEGREE_SCALE + 0, -(y - cy) * DEGREE_SCALE + 0, 0];   // + 0 turns -0 into 0
  const segments = [];
  for (const seg of figure.lines) for (let k = 1; k < seg.length; k++) segments.push(...local(seg[k - 1]), ...local(seg[k]));
  const points = [], sizes = [];
  for (const v of figure.verts) { points.push(...local([v.x, v.y])); sizes.push(6 + (5.5 - Math.min(5.5, v.mag)) * 3); }
  return { segments, points, sizes, centre: [cx, cy] };
}

/**
 * Where the atlas drawing's plane sits for a figure: size in local units,
 * offset of its centre from the figure centre, and rotation, from the
 * drawing-to-degrees similarity stored in figures.json.
 * @returns {null | {width: number, height: number, x: number, y: number, rotation: number}}
 */
export function drawingPlacement(figure) {
  const art = figure.art;
  if (!art) return null;
  const { a, b, tx, ty, width, height } = art;
  const scale = Math.hypot(a, b), theta = Math.atan2(b, a);
  const [cx, cy] = [(figure.box.x0 + figure.box.x1) / 2, (figure.box.y0 + figure.box.y1) / 2];
  const centreX = a * (width / 2) - b * (height / 2) + tx, centreY = b * (width / 2) + a * (height / 2) + ty;
  return { width: width * scale * DEGREE_SCALE, height: height * scale * DEGREE_SCALE, x: (centreX - cx) * DEGREE_SCALE, y: -(centreY - cy) * DEGREE_SCALE, rotation: -theta };
}

/** Night is the locked zodiac night; dawn is the light theme in space: indigo to rose, rust figures, faint stars. */
export const PALETTES = Object.freeze({
  // night: the locked zodiac sky's colours (near-black ground, white stars, pale blue lines and drawings); fog reaches past the photographs so stars hang in front of them
  night: { background: 0x04070f, fogNear: 500, fogFar: 4400, starAlpha: 1, line: 0xbfd4ff, point: 0xffffff, art: 0xa9c0ee, artAlpha: 0.32, deepAlpha: 0.9, glow: 0x7cc7ff },
  // dawn is a placeholder until the day scene (Earth around the Sun) is built: a warm near-black, no violet
  dawn: { background: 0x120c08, fogNear: 400, fogFar: 3600, starAlpha: 0.55, line: 0xffb27a, point: 0xffd9b0, art: 0xd98a5a, artAlpha: 0.28, deepAlpha: 0.7, glow: 0xff9a5c },
});

export const paletteForTheme = (theme) => (theme === 'light' ? PALETTES.dawn : PALETTES.night);

/** Number of segment vertices to draw for a draw fraction, in whole segments. */
export const drawRangeFor = (segmentVertexCount, draw) => Math.floor((segmentVertexCount / 2) * draw) * 2;
