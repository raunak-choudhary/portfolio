import {
  ADAPT, AMBIENT_INTERVAL_MS, MIN_PIXEL_RATIO, QUALITY_STEPS, SNAPSHOT_SETTLE_MS, SUN_SURFACE,
  adaptQuality, initialAdaptState, modeFor, pixelRatioFor, renderDue, snapshotBlurPx, snapshotDue, sunSurfaceScale, sunTierFor,
} from './renderBudget';

describe('modeFor', () => {
  it('works with the panels on and shows off with them off', () => {
    expect(modeFor(true)).toBe('working');
    expect(modeFor(false)).toBe('showcase');
    expect(modeFor(undefined)).toBe('working');   // an old saved setting without the key keeps the panels
  });
});

describe('pixelRatioFor', () => {
  it('caps a Retina screen at 1 while working and 2 in showcase', () => {
    expect(pixelRatioFor({ mode: 'working', devicePixelRatio: 2 })).toBe(1);
    expect(pixelRatioFor({ mode: 'showcase', devicePixelRatio: 2 })).toBe(2);
    expect(pixelRatioFor({ mode: 'showcase', devicePixelRatio: 3 })).toBe(2);
  });

  it('keeps phones at 1.5 or less in showcase', () => {
    expect(pixelRatioFor({ mode: 'showcase', devicePixelRatio: 3, phone: true })).toBe(1.5);
  });

  it('lowers the ratio one step per adaptive level and never below the floor', () => {
    expect(pixelRatioFor({ mode: 'showcase', devicePixelRatio: 2, level: 1 })).toBe(1.7);
    expect(pixelRatioFor({ mode: 'showcase', devicePixelRatio: 2, level: 3 })).toBe(1.1);
    expect(pixelRatioFor({ mode: 'working', devicePixelRatio: 1, level: 3 })).toBe(MIN_PIXEL_RATIO);
    expect(pixelRatioFor({ mode: 'working', devicePixelRatio: 1, level: 99 })).toBe(MIN_PIXEL_RATIO);
  });

  it('treats an unknown mode or missing ratio as working at 1', () => {
    expect(pixelRatioFor({ mode: 'nope' })).toBe(1);
    expect(pixelRatioFor({ mode: 'showcase', devicePixelRatio: 0 })).toBe(1);
  });
});

describe('renderDue', () => {
  it('always renders the first frame', () => {
    expect(renderDue({ now: 5, lastRenderAt: -Infinity, frameInterval: 33, active: false })).toBe(true);
  });

  it('renders every frame in showcase while something moves', () => {
    expect(renderDue({ now: 1016.7, lastRenderAt: 1000, frameInterval: 0, active: true })).toBe(true);
  });

  it('holds a 30 fps cap on a 60 Hz screen: skips the next vsync, takes the one after even when it lands early', () => {
    expect(renderDue({ now: 1016.7, lastRenderAt: 1000, frameInterval: 1000 / 30, active: true })).toBe(false);
    expect(renderDue({ now: 1031, lastRenderAt: 1000, frameInterval: 1000 / 30, active: true })).toBe(true);
  });

  it('repaints a resting sky only at the ambient interval', () => {
    expect(renderDue({ now: 1400, lastRenderAt: 1000, frameInterval: 0, active: false })).toBe(false);
    expect(renderDue({ now: 1000 + AMBIENT_INTERVAL_MS, lastRenderAt: 1000, frameInterval: 0, active: false })).toBe(true);
  });
});

describe('adaptQuality', () => {
  const feed = (state, gap, n) => { let s = state; let changes = 0; for (let i = 0; i < n; i++) { s = adaptQuality(s, gap); if (s.changed) changes += 1; } return { s, changes }; };

  it('stays at full quality while frames are on time', () => {
    const { s, changes } = feed(initialAdaptState(), 16.7, 1000);
    expect(s.level).toBe(0);
    expect(changes).toBe(0);
  });

  it('steps down after a sustained run of slow frames, not after one', () => {
    expect(feed(initialAdaptState(), 40, 10).s.level).toBe(0);
    const { s } = feed(initialAdaptState(), 40, ADAPT.slowFrames + 10);
    expect(s.level).toBe(1);
  });

  // A screen that draws `workMs` of fill at full quality, on a 60 Hz display: the work shrinks with
  // the pixel count (the square of the step) and each frame waits for the next vsync.
  const fillBound = (workMs) => (level) => Math.max(1, Math.ceil((workMs * QUALITY_STEPS[level] ** 2) / 16.7)) * 16.7;
  const run = (gapAt, n, state = initialAdaptState()) => { let s = state; const levels = new Set(); for (let i = 0; i < n; i++) { s = adaptQuality(s, gapAt(s.level)); levels.add(s.level); } return { s, levels }; };

  it('keeps a lower level when fewer pixels shorten the frames, and never goes past the last step', () => {
    const light = run(fillBound(20), 2000);     // 33 ms at full quality, 16.7 ms one step down
    expect(light.s.level).toBe(1);
    expect(light.s.held).toBeNull();
    const heavy = run(fillBound(120), 4000);    // too much for any level, but every step helps
    expect(heavy.s.level).toBe(QUALITY_STEPS.length - 1);
    expect(heavy.s.held).toBeNull();
  });

  it('gives the pixels back when the lowest level changes nothing (a browser capped at 30 frames a second)', () => {
    const capped = () => 33.3;
    const { s, levels } = run(capped, 2000);
    expect([...levels]).toEqual(expect.arrayContaining([1, 2, 3]));   // it tried
    expect(s.level).toBe(0);
    expect(s.held).toBeCloseTo(33.3, 1);
    // and stays there: no second trip down while the cap lasts
    const later = run(capped, 5000, s);
    expect([...later.levels]).toEqual([0]);
  });

  it('ends the hold when frames get clearly worse, and when they get fast again', () => {
    const held = run(() => 33.3, 2000).s;
    const worse = run(fillBound(60), 3000, held);   // 66 ms at full quality now: a real load on top of the cap
    expect(worse.s.held).toBeNull();
    expect(worse.s.level).toBeGreaterThan(0);
    const lifted = run(() => 16.7, ADAPT.fastFrames + 80, held);
    expect(lifted.s.held).toBeNull();
    expect(lifted.s.level).toBe(0);
    expect(run(fillBound(20), 2000, lifted.s).s.level).toBe(1);   // the steps work as before afterwards
  });

  it('steps back up only after a long run of fast frames', () => {
    const slow = feed(initialAdaptState(), 40, ADAPT.slowFrames + 10).s;
    expect(feed(slow, 16, 100).s.level).toBe(1);
    expect(feed(slow, 16, ADAPT.fastFrames + 60).s.level).toBe(0);
  });

  it('clamps an outlier gap so one tab switch cannot drop the quality', () => {
    const s = adaptQuality({ ...initialAdaptState(), average: 16.7 }, 5000);
    expect(s.average).toBeCloseTo(16.7 + (ADAPT.maxGapMs - 16.7) * ADAPT.smoothing, 5);
    expect(s.level).toBe(0);
  });
});

describe('snapshotDue', () => {
  const base = { hasSnapshot: true, stillForMs: SNAPSHOT_SETTLE_MS, f: 3, snapshotF: 3, stale: false };

  it('waits for the camera to settle', () => {
    expect(snapshotDue({ ...base, hasSnapshot: false, stillForMs: 100 })).toBe(false);
  });

  it('takes the first snapshot once settled, and a new one when stale', () => {
    expect(snapshotDue({ ...base, hasSnapshot: false, snapshotF: null })).toBe(true);
    expect(snapshotDue({ ...base, stale: true })).toBe(true);
  });

  it('retakes it only after the camera has travelled half a chapter', () => {
    expect(snapshotDue({ ...base, f: 3.2 })).toBe(false);
    expect(snapshotDue({ ...base, f: 3.6 })).toBe(true);
    expect(snapshotDue({ ...base, f: 2.4 })).toBe(true);
  });
});

describe('snapshotBlurPx', () => {
  it('scales the CSS blur to the small snapshot canvas', () => {
    expect(snapshotBlurPx(8)).toBe(2);
    expect(snapshotBlurPx(5)).toBe(1.3);
    expect(snapshotBlurPx(-3)).toBe(0);
  });
});

describe('sunSurfaceScale', () => {
  it('draws the working Sun at three quarters of a CSS pixel and showcase at one, whatever the canvas ratio', () => {
    expect(sunSurfaceScale({ mode: 'working', pixelRatio: 1 })).toBe(SUN_SURFACE.working);
    expect(sunSurfaceScale({ mode: 'showcase', pixelRatio: 2 })).toBe(0.5);
    expect(sunSurfaceScale({ mode: 'showcase', pixelRatio: 1 })).toBe(1);
    expect(sunSurfaceScale({ mode: 'working', pixelRatio: 1, phone: true })).toBe(SUN_SURFACE.phone);
  });

  it('lowers the Sun with each adaptive step, and never below the floor or above the canvas', () => {
    const at = (level) => sunSurfaceScale({ mode: 'showcase', pixelRatio: 1, level });
    for (let level = 1; level < QUALITY_STEPS.length; level++) expect(at(level)).toBeLessThan(at(level - 1));
    expect(at(99)).toBe(at(QUALITY_STEPS.length - 1));
    expect(sunSurfaceScale({ mode: 'working', pixelRatio: 0.6, level: 3 })).toBeLessThanOrEqual(1);
    expect(sunSurfaceScale({ mode: 'working', pixelRatio: 8 })).toBe(SUN_SURFACE.min);
  });

  it('rounds to a twentieth so a small ratio change does not reallocate the buffer', () => {
    const s = sunSurfaceScale({ mode: 'working', pixelRatio: 1.37 });
    expect(Math.round(s * 20) / 20).toBe(s);
  });
});

describe('sunTierFor', () => {
  it('picks low on phones, medium for the working sky and high for showcase', () => {
    expect(sunTierFor({ mode: 'working', phone: true })).toBe('low');
    expect(sunTierFor({ mode: 'showcase', phone: true })).toBe('low');
    expect(sunTierFor({ mode: 'working' })).toBe('medium');
    expect(sunTierFor({ mode: 'showcase' })).toBe('high');
  });
});
