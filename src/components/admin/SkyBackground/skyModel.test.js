import {
  BLUR_RANGE, DEFAULT_SETTINGS, FAMOUS_IDS, GLASS_RANGE, ZODIAC_IDS,
  autoTheme, figureProgress, hashSeed, lampPosition, moonPhase, planClouds, planTiles, resolveTheme, sanitizeSettings, seededRandom, sunAltitude,
} from './skyModel';

/** Eighteen stand-in figures with a 10 by 8 degree star box and a wider drawing. */
const fakeFigures = () => [...ZODIAC_IDS, ...FAMOUS_IDS].map((id) => ({
  id, name: id, zodiac: ZODIAC_IDS.includes(id),
  lines: [[[-5, -4], [5, 4]]], verts: [{ x: -5, y: -4, mag: 2 }, { x: 5, y: 4, mag: 3 }],
  box: { x0: -5, x1: 5, y0: -4, y1: 4 },
  art: { file: `${id}.webp`, width: 1000, height: 800, a: 0.02, b: 0, tx: -10, ty: -8, fit: { x0: -10, x1: 10, y0: -8, y1: 8 } },
}));

describe('settings', () => {
  it('fills defaults and drops anything malformed', () => {
    expect(sanitizeSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(sanitizeSettings('junk')).toEqual(DEFAULT_SETTINGS);
    expect(sanitizeSettings({ themeMode: 'purple', drawings: 'yes', glass: 'big' })).toEqual(DEFAULT_SETTINGS);
  });

  it('keeps valid values and clamps the sliders', () => {
    const out = sanitizeSettings({ themeMode: 'light', drawings: false, clouds: false, motion: false, panels: false, glass: 5, blur: -3 });
    expect(out).toEqual({ themeMode: 'light', drawings: false, clouds: false, motion: false, panels: false, glass: GLASS_RANGE.max, blur: BLUR_RANGE.min });
    expect(sanitizeSettings({ glass: 0.333, blur: 7.6 })).toMatchObject({ glass: 0.333, blur: 8 });
  });
});

describe('time', () => {
  it('knows noon from midnight over New York', () => {
    const noon = new Date('2026-11-11T17:00:00Z');       // 12:00 in New York (EST)
    const midnight = new Date('2026-11-11T05:00:00Z');   // 00:00 in New York
    expect(sunAltitude(noon)).toBeGreaterThan(25);
    expect(sunAltitude(midnight)).toBeLessThan(-50);
    expect(autoTheme(noon)).toBe('light');
    expect(autoTheme(midnight)).toBe('dark');
  });

  it('resolves pinned modes without looking at the clock', () => {
    const noon = new Date('2026-11-11T17:00:00Z');
    expect(resolveTheme('dark', noon)).toBe('dark');
    expect(resolveTheme('light', new Date('2026-11-11T05:00:00Z'))).toBe('light');
    expect(resolveTheme('auto', noon)).toBe('light');
  });

  it('tracks the Moon: new on 9 November 2026, full about 24 November', () => {
    const newMoon = moonPhase(new Date('2026-11-10T07:00:00Z'));   // a day after the new moon of 9 November
    const fullMoon = moonPhase(new Date('2026-11-24T02:00:00Z'));
    expect(newMoon.lit).toBeLessThan(0.05);
    expect(newMoon.waxing).toBe(true);
    expect(fullMoon.lit).toBeGreaterThan(0.98);
    expect(moonPhase(new Date('2026-11-30T00:00:00Z')).waxing).toBe(false);
  });
});

describe('deterministic randomness', () => {
  it('repeats the same sequence for the same seed', () => {
    const a = seededRandom(42), b = seededRandom(42);
    const seqA = [a(), a(), a()], seqB = [b(), b(), b()];
    expect(seqA).toEqual(seqB);
    seqA.forEach((v) => { expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThan(1); });
  });

  it('hashes ids to a stable value in [0, 1)', () => {
    expect(hashSeed('Leo')).toBe(hashSeed('Leo'));
    expect(hashSeed('Leo')).not.toBe(hashSeed('Vir'));
    expect(hashSeed('Leo')).toBeLessThan(1);
  });
});

describe('layout', () => {
  const inside = (t) => t.x >= 0 && t.y >= 0 && t.x + t.w <= 1440.01 && t.y + t.h <= 900.01;

  it('puts eighteen figures on a laptop, fifteen on a portrait tablet, twelve on a phone', () => {
    const figures = fakeFigures();
    expect(planTiles({ W: 1440, H: 900, figures, showArt: true })).toHaveLength(18);
    expect(planTiles({ W: 768, H: 1024, figures, showArt: true })).toHaveLength(15);
    expect(planTiles({ W: 375, H: 812, figures, showArt: true })).toHaveLength(12);
  });

  it('keeps tiles inside the viewport, never overlapping, zodiac in calendar order', () => {
    const tiles = planTiles({ W: 1440, H: 900, figures: fakeFigures(), showArt: true });
    tiles.forEach((t) => expect(inside(t)).toBe(true));
    for (let i = 0; i < tiles.length; i++) {
      for (let j = i + 1; j < tiles.length; j++) {
        const a = tiles[i], b = tiles[j];
        const overlap = a.x < b.x + b.w - 0.01 && a.x + a.w - 0.01 > b.x && a.y < b.y + b.h - 0.01 && a.y + a.h - 0.01 > b.y;
        expect(overlap).toBe(false);
      }
    }
    expect(tiles.filter((t) => t.fig.zodiac).map((t) => t.id)).toEqual(ZODIAC_IDS);
  });

  it('fits the whole drawing inside the tile when drawings are shown, and only the stars otherwise', () => {
    const figures = fakeFigures();
    const withArt = planTiles({ W: 1440, H: 900, figures, showArt: true })[6];
    const starsOnly = planTiles({ W: 1440, H: 900, figures, showArt: false })[6];
    const fit = withArt.fig.art.fit;
    for (const [x, y] of [[fit.x0, fit.y0], [fit.x1, fit.y1]]) {
      const sx = withArt.cx + x * withArt.scale, sy = withArt.cy + y * withArt.scale;
      expect(sx).toBeGreaterThanOrEqual(withArt.x); expect(sx).toBeLessThanOrEqual(withArt.x + withArt.w);
      expect(sy).toBeGreaterThanOrEqual(withArt.y); expect(sy).toBeLessThanOrEqual(withArt.y + withArt.h);
    }
    expect(starsOnly.scale).toBeGreaterThan(withArt.scale);
    expect(withArt.artT).toMatchObject({ a: withArt.fig.art.a * withArt.scale, b: 0 });
  });

  it('leaves the top-right corner to the Sun and Moon', () => {
    const { cx, cy, R } = lampPosition(1440);
    const tiles = planTiles({ W: 1440, H: 900, figures: fakeFigures(), showArt: true });
    const famousRow = tiles.filter((t) => !t.fig.zodiac);
    famousRow.forEach((t) => expect(t.x + t.w).toBeLessThanOrEqual(cx - R));
    expect(cy).toBeGreaterThan(R);
  });

  it('skips figures that are missing from the data instead of failing', () => {
    const figures = fakeFigures().filter((f) => f.id !== 'Her');
    expect(planTiles({ W: 1440, H: 900, figures, showArt: true })).toHaveLength(17);
  });
});

describe('clouds', () => {
  it('spreads seventeen clouds over a laptop and seven over a phone, all within the sky', () => {
    const laptop = planClouds({ W: 1440 }), phone = planClouds({ W: 375 });
    expect(laptop).toHaveLength(17);
    expect(phone).toHaveLength(7);
    [...laptop, ...phone].forEach((c) => { expect(c.y).toBeGreaterThan(0); expect(c.y).toBeLessThan(1); expect(c.size).toBeGreaterThan(0); });
    expect(new Set(laptop.map((c) => c.kind))).toEqual(new Set(['big', 'mid', 'small']));
  });
});

describe('figure animation', () => {
  const timing = { drawMs: 1000, staggerMs: 500, turnMs: 5000 };

  it('draws figures one after another on the first pass', () => {
    expect(figureProgress(0, 4, 500, 500, timing)).toMatchObject({ progress: 0.5, firstPass: true, drawing: true });
    expect(figureProgress(1, 4, 500, 500, timing)).toMatchObject({ progress: 0, firstPass: true });
    expect(figureProgress(0, 4, 1500, 1500, timing)).toMatchObject({ progress: 1, firstPass: false, drawing: false });
  });

  it('then lets one figure at a time redraw itself', () => {
    const now = 5000 * 2 + 400;   // the third turn, 400 ms in
    expect(figureProgress(2, 4, 99999, now, timing)).toMatchObject({ progress: 0.4, drawing: true, firstPass: false });
    expect(figureProgress(1, 4, 99999, now, timing)).toMatchObject({ progress: 1, drawing: false });
  });
});
