/* eslint-disable testing-library/no-container, testing-library/render-result-naming-convention */
import { ThemeProvider } from '../../../contexts/ThemeContext';
import { SkySettingsProvider } from '../SkyBackground/SkySettingsContext';
import { CHAPTERS, chapterIndex } from '../Voyage/chapters';
import ExitVoyageSky, { STILL_REPAINT_MS } from './ExitVoyageSky';
import { React, act, mount, stubCanvas } from '../SkyBackground/testUtils';

let mockWebgl = true;
jest.mock('../Voyage/webgl', () => ({ webglAvailable: () => mockWebgl }));
// Three.js does not run in jsdom; the field is a recording stand-in with the same surface
jest.mock('../Voyage/skyField', () => ({ createSkyField: jest.fn() }));
const { createSkyField } = jest.requireMock('../Voyage/skyField');

const fakeField = () => ({ resize: jest.fn(), setTheme: jest.fn(), frame: jest.fn(() => ({ index: 0, f: 0, over: '' })), dispose: jest.fn() });

/** Lets the data fetch, the dynamic import and the state they cause settle. */
const flush = () => act(async () => { for (let i = 0; i < 4; i++) { await new Promise((r) => setTimeout(r, 0)); await Promise.resolve(); } });

const render = (props) => mount(
  <ThemeProvider>
    <SkySettingsProvider>
      <ExitVoyageSky {...props} />
    </SkySettingsProvider>
  </ThemeProvider>,
);

describe('ExitVoyageSky', () => {
  let canvas, frames, matchMediaOriginal, field;

  beforeEach(() => {
    mockWebgl = true;
    canvas = stubCanvas();
    frames = [];
    jest.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => { frames.push(cb); return frames.length; });
    jest.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
    global.fetch = jest.fn((url) => Promise.resolve({ ok: true, json: () => Promise.resolve(String(url).includes('manifest') ? [] : { figures: [] }) }));
    matchMediaOriginal = window.matchMedia;
    window.matchMedia = () => ({ matches: false });
    field = fakeField();
    createSkyField.mockImplementation(() => field);
  });

  afterEach(() => { canvas.restore(); jest.restoreAllMocks(); delete global.fetch; window.matchMedia = matchMediaOriginal; window.localStorage.clear(); jest.useRealTimers(); });

  it('freezes the voyage field at the recorded chapter, in the recorded theme, and lands there at once', async () => {
    const f = chapterIndex('projects');
    const view = render({ position: { f, chapter: 'projects', theme: 'light' } });
    await flush();
    const el = view.container.querySelector('canvas.exit-voyage-field');
    expect(el).not.toBeNull();
    expect(el.dataset.chapter).toBe('projects');
    expect(createSkyField).toHaveBeenCalledTimes(1);
    expect(createSkyField.mock.calls[0][0]).toEqual(expect.objectContaining({ canvas: el, theme: 'light', assetBase: '/admin/sky/' }));
    expect(field.frame).toHaveBeenCalledTimes(1);
    expect(field.frame.mock.calls[0][0]).toBeCloseTo(f / (CHAPTERS.length - 1));
    expect(field.frame.mock.calls[0][2]).toEqual({ snap: true });
    // with motion on, the loop keeps the Earth turning at the same camera pose
    act(() => { frames.splice(0).forEach((cb) => cb(100)); });
    expect(field.frame).toHaveBeenCalledTimes(2);
    expect(field.frame.mock.calls[1][0]).toBeCloseTo(f / (CHAPTERS.length - 1));
    view.unmount();
    expect(field.dispose).toHaveBeenCalledTimes(1);
  });

  it('opens on the prologue when nothing was recorded', async () => {
    const view = render({ position: null });
    await flush();
    expect(view.container.querySelector('canvas.exit-voyage-field').dataset.chapter).toBe('earth');
    expect(field.frame.mock.calls[0][0]).toBe(0);
    view.unmount();
  });

  it('shows the voyage flat sky without WebGL and never loads the field', async () => {
    mockWebgl = false;
    const view = render({ position: { f: 3, chapter: 'about', theme: 'dark' } });
    await flush();
    expect(view.container.querySelector('.voyage-flat-sky .sky-background')).not.toBeNull();
    expect(view.container.querySelector('canvas.exit-voyage-field')).toBeNull();
    expect(createSkyField).not.toHaveBeenCalled();
    view.unmount();
  });

  it('falls back to the flat sky when the GPU refuses a context', async () => {
    createSkyField.mockImplementation(() => { throw new Error('context refused'); });
    const view = render({ position: null });
    await flush();
    expect(view.container.querySelector('.voyage-flat-sky')).not.toBeNull();
    expect(view.container.querySelector('canvas.exit-voyage-field')).toBeNull();
    view.unmount();
  });

  it('skips painting while the film covers the sky', async () => {
    let covered = false;
    const view = render({ position: null, shouldPaint: () => !covered });
    await flush();
    covered = true;
    act(() => { frames.splice(0).forEach((cb) => cb(100)); });
    expect(field.frame).toHaveBeenCalledTimes(1);   // only the first, snapped frame
    covered = false;
    act(() => { frames.splice(0).forEach((cb) => cb(116)); });
    expect(field.frame).toHaveBeenCalledTimes(2);
    view.unmount();
  });

  it('paints a still frame now and then when motion is reduced, with no animation loop', async () => {
    window.matchMedia = () => ({ matches: true, addEventListener() {}, removeEventListener() {} });
    const interval = jest.spyOn(window, 'setInterval');
    const view = render({ position: null });
    await flush();
    expect(createSkyField.mock.calls[0][0].quality.fly).toBe(false);
    expect(frames).toHaveLength(0);
    const still = interval.mock.calls.find(([, ms]) => ms === STILL_REPAINT_MS);
    expect(still).toBeDefined();
    act(() => { still[0](); });
    expect(field.frame).toHaveBeenCalledTimes(2);
    expect(field.frame.mock.calls[1][2]).toEqual({ snap: true });
    view.unmount();
  });

  it('releases the field early through the ref, and only once', async () => {
    const releaseRef = { current: null };
    const removed = jest.spyOn(window, 'removeEventListener');
    const view = render({ position: null, releaseRef });
    await flush();
    expect(typeof releaseRef.current).toBe('function');
    act(() => { releaseRef.current(); });
    expect(field.dispose).toHaveBeenCalledTimes(1);
    expect(removed).toHaveBeenCalledWith('resize', expect.any(Function));
    act(() => { frames.splice(0).forEach((cb) => cb(100)); });
    expect(field.frame).toHaveBeenCalledTimes(1);   // nothing paints after the release
    view.unmount();
    expect(field.dispose).toHaveBeenCalledTimes(1);
    expect(releaseRef.current).toBeNull();
  });
});
