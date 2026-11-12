import { CHAPTERS, CHAPTER_IDS, DEEP_SKY_PLACEMENTS, chapterById, chapterIndex } from './chapters';
import {
  ANCHORS, LOOK_DROP, SPACING, cameraTarget, deepSkyLayout, greetingFor, deepSkyPlacement, figureState, isChapterLive, liveChapterIndex, qualityFor, routePosition, scrollFractionFor,
} from './voyageModel';

describe('chapter registry', () => {
  it('has a prologue and sixteen chapters, the twelve managers on the zodiac in order', () => {
    expect(CHAPTERS).toHaveLength(17);
    expect(CHAPTERS[0]).toMatchObject({ id: 'earth', kind: 'prologue', constellation: null, place: 'Low Earth orbit' });
    const zodiac = ['Ari', 'Tau', 'Gem', 'Cnc', 'Leo', 'Vir', 'Lib', 'Sco', 'Sgr', 'Cap', 'Aqr', 'Psc'];
    expect(CHAPTERS.filter((c) => c.kind === 'deck').map((c) => c.constellation)).toEqual(zodiac);
    expect(chapterById('overview').constellation).toBe('UMa');
    expect(chapterById('analytics').constellation).toBe('Ori');
    expect(chapterById('inbox').constellation).toBe('Cyg');
    expect(chapterById('security').constellation).toBe('Cas');
    expect(new Set(CHAPTER_IDS).size).toBe(17);
    expect(chapterIndex('projects')).toBe(4);
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
    expect(routePosition(1)).toMatchObject({ index: 16, frac: 0 });
    const mid = routePosition(0.25);
    expect(mid.f).toBeCloseTo(4); expect(mid.index).toBe(4); expect(mid.frac).toBeCloseTo(0);
    const between = routePosition(0.5 / 16);
    expect(between.index).toBe(0); expect(between.frac).toBeCloseTo(0.5);
    expect(routePosition(-1).f).toBe(0); expect(routePosition(2).f).toBe(16);
  });

  it('spaces the anchors evenly in depth and keeps them near the axis, the prologue lower and to the right', () => {
    for (let i = 1; i < ANCHORS.length; i++) expect(ANCHORS[i - 1].z - ANCHORS[i].z).toBeCloseTo(SPACING);
    ANCHORS.slice(1).forEach((a) => { expect(Math.abs(a.x)).toBeLessThanOrEqual(160); expect(Math.abs(a.y)).toBeLessThanOrEqual(90); });
    expect(ANCHORS[0]).toEqual({ x: 160, y: -140, z: -360 });
  });

  it('flies between anchors, or cuts straight when flying is off', () => {
    const at = cameraTarget({ index: 2, frac: 0 });
    expect(at.look).toEqual({ x: ANCHORS[2].x, y: ANCHORS[2].y - LOOK_DROP, z: ANCHORS[2].z });
    expect(at.position.z).toBeCloseTo(ANCHORS[2].z + 520);
    const between = cameraTarget({ index: 2, frac: 0.5 });
    expect(between.look.z).toBeCloseTo((ANCHORS[2].z + ANCHORS[3].z) / 2);
    const cut = cameraTarget({ index: 2, frac: 0.5 }, false);
    expect(cut.position).toEqual({ x: 0, y: -LOOK_DROP * 0.35, z: ANCHORS[2].z + 520 });
    expect(cameraTarget({ index: 16, frac: 0.9 }).look.z).toEqual(ANCHORS[16].z);
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

describe('deep sky', () => {
  it('keeps photographs off the route, far behind the figures, with their aspect ratio', () => {
    const p = deepSkyPlacement({ slug: 'x', near: 'projects', side: 'left', scale: 1, depth: -800 }, { width: 1024, height: 512 });
    expect(p.x).toBeLessThan(-800);
    expect(p.z).toBe(ANCHORS[chapterIndex('projects')].z - 800);
    DEEP_SKY_PLACEMENTS.forEach((d) => expect(d.depth).toBeLessThanOrEqual(-1600));
    expect(p.width / p.height).toBeCloseTo(2);
    const portrait = deepSkyPlacement({ slug: 'y', near: 'projects', side: 'right', scale: 1, depth: -800 }, { width: 500, height: 1000 });
    expect(portrait.x).toBeGreaterThan(800);
    expect(portrait.height).toBeGreaterThan(portrait.width);
  });

  it('lays out only the objects the manifest provides', () => {
    const layout = deepSkyLayout([{ slug: 'andromeda', width: 1024, height: 672 }, { slug: 'unknown', width: 10, height: 10 }]);
    expect(layout).toHaveLength(1);
    expect(layout[0]).toMatchObject({ slug: 'andromeda', side: 'left' });
    expect(DEEP_SKY_PLACEMENTS).toHaveLength(8);
  });
});

describe('quality', () => {
  it('scales the field to the device and falls back without WebGL', () => {
    expect(qualityFor({ width: 1440, devicePixelRatio: 2 })).toEqual({ mode: 'webgl', stars: 9000, pixelRatio: 2, fly: true });
    expect(qualityFor({ width: 390, devicePixelRatio: 3 })).toEqual({ mode: 'webgl', stars: 3500, pixelRatio: 1.5, fly: true });
    expect(qualityFor({ width: 1440, devicePixelRatio: 1, reducedMotion: true }).fly).toBe(false);
    expect(qualityFor({ width: 1440, webgl: false })).toMatchObject({ mode: 'fallback', fly: false, stars: 0 });
    expect(scrollFractionFor(0)).toBe(0); expect(scrollFractionFor(16)).toBe(1);
  });
});

describe('greeting', () => {
  it('follows the New York clock', () => {
    expect(greetingFor(new Date('2026-11-12T13:00:00Z'))).toBe('Good morning');     // 08:00 EST
    expect(greetingFor(new Date('2026-11-12T19:00:00Z'))).toBe('Good afternoon');   // 14:00 EST
    expect(greetingFor(new Date('2026-11-13T01:00:00Z'))).toBe('Good evening');     // 20:00 EST
    expect(greetingFor(new Date('2026-11-13T04:30:00Z'))).toBe('Good night');       // 23:30 EST
    expect(greetingFor(new Date('2026-11-13T08:00:00Z'))).toBe('Good night');       // 03:00 EST
  });
});
