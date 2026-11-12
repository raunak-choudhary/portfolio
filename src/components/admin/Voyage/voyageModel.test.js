import { CHAPTERS, CHAPTER_IDS, DEEP_SKY_PLACEMENTS, chapterById, chapterIndex } from './chapters';
import {
  ANCHORS, LOOK_DROP, SPACING, blackHolePlacement, cameraTarget, deepSkyLayout, deepSkyPlacement, figureState, isChapterLive, liveChapterIndex, qualityFor, routePosition, scrollFractionFor,
} from './voyageModel';

describe('chapter registry', () => {
  it('has sixteen chapters, the twelve managers on the zodiac in order', () => {
    expect(CHAPTERS).toHaveLength(16);
    const zodiac = ['Ari', 'Tau', 'Gem', 'Cnc', 'Leo', 'Vir', 'Lib', 'Sco', 'Sgr', 'Cap', 'Aqr', 'Psc'];
    expect(CHAPTERS.filter((c) => c.kind === 'deck').map((c) => c.constellation)).toEqual(zodiac);
    expect(chapterById('overview').constellation).toBe('UMa');
    expect(chapterById('analytics').constellation).toBe('Ori');
    expect(chapterById('inbox').constellation).toBe('Cyg');
    expect(chapterById('security').constellation).toBe('Cas');
    expect(new Set(CHAPTER_IDS).size).toBe(16);
    expect(chapterIndex('projects')).toBe(3);
    expect(chapterIndex('nope')).toBe(-1);
  });

  it('places every deep-sky object near a real chapter', () => {
    DEEP_SKY_PLACEMENTS.forEach((p) => expect(chapterIndex(p.near)).toBeGreaterThanOrEqual(0));
    expect(new Set(DEEP_SKY_PLACEMENTS.map((p) => p.slug)).size).toBe(DEEP_SKY_PLACEMENTS.length);
  });
});

describe('route and camera', () => {
  it('maps the scroll fraction onto the chapters', () => {
    expect(routePosition(0)).toEqual({ f: 0, index: 0, frac: 0 });
    expect(routePosition(1)).toMatchObject({ index: 15, frac: 0 });
    const mid = routePosition(0.5);
    expect(mid.f).toBeCloseTo(7.5); expect(mid.index).toBe(7); expect(mid.frac).toBeCloseTo(0.5);
    expect(routePosition(-1).f).toBe(0); expect(routePosition(2).f).toBe(15);
  });

  it('spaces the anchors evenly in depth and keeps them near the axis', () => {
    for (let i = 1; i < ANCHORS.length; i++) expect(ANCHORS[i - 1].z - ANCHORS[i].z).toBeCloseTo(SPACING);
    ANCHORS.forEach((a) => { expect(Math.abs(a.x)).toBeLessThanOrEqual(160); expect(Math.abs(a.y)).toBeLessThanOrEqual(90); });
  });

  it('flies between anchors, or cuts straight when flying is off', () => {
    const at = cameraTarget({ index: 2, frac: 0 });
    expect(at.look).toEqual({ x: ANCHORS[2].x, y: ANCHORS[2].y - LOOK_DROP, z: ANCHORS[2].z });
    expect(at.position.z).toBeCloseTo(ANCHORS[2].z + 520);
    const between = cameraTarget({ index: 2, frac: 0.5 });
    expect(between.look.z).toBeCloseTo((ANCHORS[2].z + ANCHORS[3].z) / 2);
    const cut = cameraTarget({ index: 2, frac: 0.5 }, false);
    expect(cut.position).toEqual({ x: 0, y: -LOOK_DROP * 0.35, z: ANCHORS[2].z + 520 });
    expect(cameraTarget({ index: 15, frac: 0.9 }).look.z).toEqual(ANCHORS[15].z);
  });
});

describe('figure drawing', () => {
  it('draws a figure as the camera arrives and holds it fully drawn at the chapter', () => {
    expect(figureState(4, 3.0)).toMatchObject({ near: 0, draw: 0, pointAlpha: 0, artAlpha: 0 });
    expect(figureState(4, 3.5).draw).toBeCloseTo((0.5 - 0.15) / 0.6);
    expect(figureState(4, 4.0)).toMatchObject({ near: 1, draw: 1, pointAlpha: 1, artAlpha: 1, turn: 0 });
    expect(figureState(4, 4.2).turn).toBeCloseTo(0.024);
    expect(figureState(4, 5.5).draw).toBe(0);
  });

  it('marks one chapter live at a time', () => {
    expect(liveChapterIndex(3.4)).toBe(3); expect(liveChapterIndex(3.6)).toBe(4);
    expect(isChapterLive(3, 3.5)).toBe(true); expect(isChapterLive(4, 3.5)).toBe(true); expect(isChapterLive(3, 3.6)).toBe(false);
  });
});

describe('deep sky and the black hole', () => {
  it('keeps photographs beside the route, behind the figures, with their aspect ratio', () => {
    const p = deepSkyPlacement({ slug: 'x', near: 'projects', side: 'left', scale: 1, depth: -800 }, { width: 1024, height: 512 });
    expect(p.x).toBeLessThan(-900);
    expect(p.z).toBeLessThan(ANCHORS[3].z);
    expect(p.width / p.height).toBeCloseTo(2);
    const portrait = deepSkyPlacement({ slug: 'y', near: 'projects', side: 'right', scale: 1, depth: -800 }, { width: 500, height: 1000 });
    expect(portrait.x).toBeGreaterThan(900);
    expect(portrait.height).toBeGreaterThan(portrait.width);
  });

  it('lays out only the objects the manifest provides', () => {
    const layout = deepSkyLayout([{ slug: 'andromeda', width: 1024, height: 672 }, { slug: 'unknown', width: 10, height: 10 }]);
    expect(layout).toHaveLength(1);
    expect(layout[0]).toMatchObject({ slug: 'andromeda', side: 'left' });
    const hole = blackHolePlacement();
    expect(hole.radius).toBe(240); expect(hole.x).toBeGreaterThan(1000); expect(hole.z).toBeLessThan(ANCHORS[chapterIndex('skills')].z);
  });
});

describe('quality', () => {
  it('scales the field to the device and falls back without WebGL', () => {
    expect(qualityFor({ width: 1440, devicePixelRatio: 2 })).toEqual({ mode: 'webgl', stars: 9000, pixelRatio: 2, fly: true });
    expect(qualityFor({ width: 390, devicePixelRatio: 3 })).toEqual({ mode: 'webgl', stars: 3500, pixelRatio: 1.5, fly: true });
    expect(qualityFor({ width: 1440, devicePixelRatio: 1, reducedMotion: true }).fly).toBe(false);
    expect(qualityFor({ width: 1440, webgl: false })).toMatchObject({ mode: 'fallback', fly: false, stars: 0 });
    expect(scrollFractionFor(0)).toBe(0); expect(scrollFractionFor(15)).toBe(1);
  });
});
