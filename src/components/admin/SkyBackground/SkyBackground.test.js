/* eslint-disable testing-library/no-container, testing-library/render-result-naming-convention */
import { ThemeProvider } from '../../../contexts/ThemeContext';
import SkyBackground from './SkyBackground';
import { SkySettingsProvider } from './SkySettingsContext';
import { React, act, mount, stubCanvas } from './testUtils';

const figuresDocument = {
  version: 1,
  figures: [{ id: 'Leo', name: 'Leo', zodiac: true, lines: [[[-5, -4], [5, 4]]], verts: [{ x: -5, y: -4, mag: 1.4 }, { x: 5, y: 4, mag: 3 }], box: { x0: -5, x1: 5, y0: -4, y1: 4 }, art: null }],
};

const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve(); });
const memoryStorage = (seed = {}) => { const data = { ...seed }; return { getItem: (k) => data[k] ?? null, setItem: (k, v) => { data[k] = v; } }; };

const render = (props = {}, seed = {}) => mount(
  <ThemeProvider>
    <SkySettingsProvider storage={memoryStorage(seed)} now={() => new Date('2026-11-11T05:00:00Z')}>
      <SkyBackground assetBase="/admin/sky/" liveSun={false} {...props} />
    </SkySettingsProvider>
  </ThemeProvider>,
);

describe('SkyBackground', () => {
  let canvas, rafSpy, matchMediaOriginal;

  beforeEach(() => {
    canvas = stubCanvas();
    global.fetch = jest.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve(figuresDocument) }));
    rafSpy = jest.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 1);
    jest.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
    matchMediaOriginal = window.matchMedia;
    window.matchMedia = () => ({ matches: false });
  });

  afterEach(() => { canvas.restore(); jest.restoreAllMocks(); delete global.fetch; window.matchMedia = matchMediaOriginal; });

  it('loads the figures once, draws on two canvases and starts the frame loop', async () => {
    const view = render();
    await flush();
    expect(global.fetch).toHaveBeenCalledWith('/admin/sky/figures.json');
    expect(view.container.querySelectorAll('canvas')).toHaveLength(2);
    expect(view.container.querySelector('.sky-background').getAttribute('aria-hidden')).toBe('true');
    expect(rafSpy).toHaveBeenCalled();
    expect(canvas.calls.some(([fn, args]) => fn === 'fillText' && args[0] === 'LEO')).toBe(true);
    view.unmount();
  });

  it('holds a still frame instead of a loop when motion is off', async () => {
    const view = render({}, { 'rc-admin-sky': JSON.stringify({ motion: false }) });
    await flush();
    expect(rafSpy).not.toHaveBeenCalled();
    expect(canvas.calls.filter(([fn]) => fn === 'clearRect').length).toBeGreaterThan(0);
    view.unmount();
  });

  it('holds still when the operating system asks for less motion, whatever the setting', async () => {
    window.matchMedia = () => ({ matches: true });
    const view = render();
    await flush();
    expect(rafSpy).not.toHaveBeenCalled();
    view.unmount();
  });

  it('falls back to a plain gradient when figures.json cannot load', async () => {
    global.fetch = jest.fn(() => Promise.resolve({ ok: false, status: 404 }));
    const view = render();
    await flush();
    expect(view.container.querySelector('.sky-background--plain')).not.toBeNull();
    expect(rafSpy).not.toHaveBeenCalled();
    view.unmount();
  });
});
