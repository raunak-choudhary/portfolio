/* eslint-disable testing-library/render-result-naming-convention */
import fs from 'fs';
import { createSkyRenderer } from './skyRenderer';
import { fakeContext } from './testUtils';

/** A minimal canvas stand-in whose context records every call. */
const fakeCanvas = (calls) => ({ width: 0, height: 0, getContext: () => fakeContext(calls) });

const figures = [
  { id: 'Leo', name: 'Leo', zodiac: true, lines: [[[-5, -4], [5, 4], [6, -2]]], verts: [{ x: -5, y: -4, mag: 1.4 }, { x: 5, y: 4, mag: 3 }, { x: 6, y: -2, mag: 4 }], box: { x0: -5, x1: 6, y0: -4, y1: 4 }, art: { file: 'Leo.webp', width: 1000, height: 800, a: 0.02, b: 0, tx: -10, ty: -8, fit: { x0: -10, x1: 10, y0: -8, y1: 8 } } },
  { id: 'UMa', name: 'Ursa Major', zodiac: false, lines: [[[-3, 0], [3, 0]]], verts: [{ x: -3, y: 0, mag: 2 }, { x: 3, y: 0, mag: 2 }], box: { x0: -3, x1: 3, y0: 0, y1: 0.1 }, art: null },
];

/** jsdom has no canvas, so offscreen sprites come from the same fake. */
const fakeDocument = (calls) => ({ createElement: () => fakeCanvas(calls) });

const build = (calls = []) => createSkyRenderer({
  skyCanvas: fakeCanvas(calls), liveCanvas: fakeCanvas(calls), figures, assetBase: '/admin/sky/', doc: fakeDocument(calls), liveSun: false,
});

describe('createSkyRenderer', () => {
  afterEach(() => jest.useRealTimers());

  it('paints a long run with the shipped figures in both themes without a single non-finite value', () => {
    const shipped = JSON.parse(fs.readFileSync('public/admin/sky/figures.json', 'utf8')).figures;
    const calls = [];
    const renderer = createSkyRenderer({ skyCanvas: fakeCanvas(calls), liveCanvas: fakeCanvas(calls), figures: shipped, assetBase: '/admin/sky/', doc: fakeDocument(calls), liveSun: false });
    renderer.resize(1460, 702, 2);
    renderer.setSettings({ drawings: true, clouds: true, motion: true });
    for (const theme of ['light', 'dark']) {
      renderer.setTheme(theme);
      for (let now = 61234.5; now < 61234.5 + 120000; now += 137) renderer.frame(now);
    }
    expect(renderer.status().tiles).toBe(18);
    renderer.destroy();
  });

  it('survives a frame timestamp that steps back behind the previous one', () => {
    // requestAnimationFrame can hand over a time slightly earlier than a performance.now() read just before it;
    // a flare born at the later time then had a negative age, and its gradient radius became NaN
    const renderer = build([]);
    renderer.resize(1460, 702, 2);
    renderer.setTheme('light');
    renderer.setSettings({ drawings: true, clouds: true, motion: true });
    renderer.frame(5000.8);
    expect(() => renderer.frame(4998.2)).not.toThrow();
    expect(() => renderer.frame(Number.NaN)).not.toThrow();
    renderer.destroy();
  });

  it('paints a frame in both themes without throwing and writes every figure name', () => {
    const calls = [];
    const renderer = build(calls);
    renderer.resize(1440, 900, 1);
    renderer.setSettings({ drawings: true, clouds: true, motion: true });
    renderer.frame(20000);
    renderer.setTheme('light');
    renderer.frame(21000);
    const names = calls.filter(([fn]) => fn === 'fillText').map(([, args]) => args[0]);
    expect(names).toEqual(expect.arrayContaining(['LEO', 'URSA MAJOR']));
    expect(renderer.status()).toMatchObject({ tiles: 2, drawingsLoaded: 0, liveSunAt: null });
    renderer.destroy();
  });

  it('still paints with motion, clouds and drawings off', () => {
    const calls = [];
    const renderer = build(calls);
    renderer.resize(375, 812, 2);
    renderer.setSettings({ drawings: false, clouds: false, motion: false });
    expect(() => renderer.frame(0)).not.toThrow();
    // no cloud sprites drawn: drawImage is only used for clouds, drawings, Sun and Moon images (none loaded here)
    expect(calls.some(([fn]) => fn === 'drawImage')).toBe(false);
    renderer.destroy();
  });

  it('does nothing before it has a size', () => {
    const calls = [];
    const renderer = build(calls);
    renderer.frame(1000);
    expect(calls.filter(([fn]) => fn === 'clearRect')).toHaveLength(0);
    renderer.destroy();
  });

  it('refreshes the live Sun on a timer when enabled and stops on destroy', () => {
    jest.useFakeTimers();
    const sources = [];
    const RealImage = global.Image;
    global.Image = class { set src(value) { sources.push(value); } };
    const renderer = createSkyRenderer({ skyCanvas: fakeCanvas([]), liveCanvas: fakeCanvas([]), figures, assetBase: '/admin/sky/', doc: fakeDocument([]), liveSun: true });
    const liveLoads = () => sources.filter((s) => s.startsWith('https://sdo.gsfc.nasa.gov/')).length;
    expect(liveLoads()).toBe(1);
    jest.advanceTimersByTime(15 * 60 * 1000);
    expect(liveLoads()).toBe(2);
    renderer.destroy();
    jest.advanceTimersByTime(15 * 60 * 1000);
    expect(liveLoads()).toBe(2);
    global.Image = RealImage;
  });
});
