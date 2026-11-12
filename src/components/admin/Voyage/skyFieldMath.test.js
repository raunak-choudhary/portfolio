import { PALETTES, buildFigureGeometry, buildStarField, drawRangeFor, drawingPlacement, paletteForTheme } from './skyFieldMath';

const figure = {
  id: 'Leo', box: { x0: -10, x1: 10, y0: -4, y1: 4 },
  lines: [[[-10, -4], [0, 0], [10, 4]]], verts: [{ x: -10, y: -4, mag: 1.4 }, { x: 0, y: 0, mag: 3 }, { x: 10, y: 4, mag: 6 }],
  art: { file: 'Leo.webp', width: 1000, height: 800, a: 0.02, b: 0, tx: -10, ty: -8 },
};

describe('star field', () => {
  it('is deterministic, spans the route, and keeps sizes and colours in range', () => {
    const a = buildStarField(500), b = buildStarField(500);
    expect(a.positions).toEqual(b.positions);
    expect(a.positions.length).toBe(1500);
    let minZ = Infinity, maxZ = -Infinity;
    for (let i = 0; i < 500; i++) { minZ = Math.min(minZ, a.positions[i * 3 + 2]); maxZ = Math.max(maxZ, a.positions[i * 3 + 2]); }
    expect(maxZ).toBeLessThanOrEqual(300); expect(minZ).toBeLessThan(-8000);
    for (const s of a.sizes) { expect(s).toBeGreaterThanOrEqual(1); expect(s).toBeLessThanOrEqual(4); }
    for (const c of a.colors) { expect(c).toBeGreaterThanOrEqual(0.8); expect(c).toBeLessThanOrEqual(1); }
  });
});

describe('figure geometry', () => {
  it('centres the figure, flips y, scales degrees to units, and sizes points by magnitude', () => {
    const g = buildFigureGeometry(figure);
    expect(g.centre).toEqual([0, 0]);
    expect(g.segments.slice(0, 6)).toEqual([-90, 36, 0, 0, 0, 0]);
    expect(g.segments).toHaveLength(12);
    expect(g.points).toEqual([-90, 36, 0, 0, 0, 0, 90, -36, 0]);
    expect(g.sizes[0]).toBeGreaterThan(g.sizes[1]); expect(g.sizes[2]).toBe(6);
  });

  it('places the drawing plane from the stored similarity', () => {
    const p = drawingPlacement(figure);
    expect(p.width).toBeCloseTo(1000 * 0.02 * 9); expect(p.height).toBeCloseTo(800 * 0.02 * 9);
    expect(p.x).toBeCloseTo(0); expect(p.y).toBeCloseTo(0); expect(p.rotation).toBeCloseTo(0);
    expect(drawingPlacement({ ...figure, art: null })).toBeNull();
    const rotated = drawingPlacement({ ...figure, art: { ...figure.art, a: 0, b: 0.02 } });
    expect(rotated.rotation).toBeCloseTo(-Math.PI / 2);
  });

  it('draws whole segments only', () => {
    expect(drawRangeFor(12, 0)).toBe(0); expect(drawRangeFor(12, 0.5)).toBe(6); expect(drawRangeFor(12, 0.9)).toBe(10); expect(drawRangeFor(12, 1)).toBe(12);
  });
});

describe('palettes', () => {
  it('maps the site theme onto night and dawn', () => {
    expect(paletteForTheme('dark')).toBe(PALETTES.night);
    expect(paletteForTheme('light')).toBe(PALETTES.dawn);
    expect(PALETTES.dawn.starAlpha).toBeLessThan(PALETTES.night.starAlpha);
  });
});
