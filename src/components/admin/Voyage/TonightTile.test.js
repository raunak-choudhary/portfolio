/* eslint-disable testing-library/no-node-access */
import TonightTile, { MOON_TILE_PX, tonightText } from './TonightTile';
import { moonTonight } from './moonModel';
import { React, act, mount } from '../SkyBackground/testUtils';

let view;
const render = (element) => { view = mount(element); return view; };
const canvasOf = () => view.container.querySelector('canvas');
const newYorkLine = () => view.container.querySelector('[data-testid="tonight-new-york"]').textContent;

// 8 pm in New York on 20 November 2026: a waxing gibbous Moon high in the south-east.
const EVENING = new Date('2026-11-21T01:00:00Z');
// Noon the same day: the Moon set at 02:06 and rises at 13:58 (U.S. Naval Observatory).
const NOON = new Date('2026-11-20T17:00:00Z');

describe('tonightText', () => {
  it('gives the lit share, the phase with the next full or new Moon, and the tilt seen from New York', () => {
    const text = tonightText(moonTonight(EVENING));
    expect(text.percent).toBe('83%');
    expect(text.phaseLine).toBe('waxing gibbous · full 24 Nov');
    expect(text.newYorkLine).toMatch(/^from New York · lit side tilted \d+° right of up$/);
    expect(text.label).toMatch(/^The Moon from New York: 83% lit, waxing gibbous, lit side tilted \d+ degrees right of up\.$/);
  });

  it('says when the Moon rises while it is below the horizon, and how it will lean then', () => {
    const text = tonightText(moonTonight(NOON));
    expect(text.newYorkLine).toBe('from New York · below the horizon until 13:58');
    expect(text.label).toMatch(/^The Moon from New York: \d+% lit, waxing gibbous, below the horizon until 13:58; at moonrise its lit side is tilted \d+ degrees right of up\.$/);
  });

  it('names the quarters with waxing or waning, and the next phase after a full Moon is the new one', () => {
    const quarter = tonightText(moonTonight(new Date('2026-12-01T06:08:00Z')));
    expect(quarter.phaseLine).toBe('waning · last quarter · new 8 Dec');   // 00:52 UT on the 9th is 19:52 on the 8th in New York
    expect(quarter.percent).toBe('50%');
    const full = tonightText(moonTonight(new Date('2026-11-24T15:00:00Z')));
    expect(full.phaseLine).toMatch(/^full moon · new 8 Dec$/);
  });
});

describe('<TonightTile />', () => {
  afterEach(() => { view?.unmount(); view = null; jest.useRealTimers(); });

  it('draws the Moon on a canvas at the screen\'s pixel ratio, labelled in words', () => {
    const ratio = window.devicePixelRatio;
    Object.defineProperty(window, 'devicePixelRatio', { value: 3, configurable: true });
    try {
      render(<TonightTile assetBase="/admin/sky/" now={() => EVENING} />);
      const canvas = canvasOf();
      expect(canvas.getAttribute('role')).toBe('img');
      expect(canvas.getAttribute('aria-label')).toMatch(/^The Moon from New York: 83% lit, waxing gibbous, lit side tilted \d+ degrees right of up\.$/);
      expect(canvas.width).toBe(MOON_TILE_PX * 3);
      expect(view.container.querySelector('.tile__big').textContent).toBe('83%');
      expect(view.container.textContent).toContain('waxing gibbous · full 24 Nov');
      expect(newYorkLine()).toMatch(/^from New York · lit side tilted \d+° right of up$/);
    } finally {
      Object.defineProperty(window, 'devicePixelRatio', { value: ratio, configurable: true });
    }
  });

  it('paints a lit disc even before the maps arrive', () => {
    render(<TonightTile assetBase="/admin/sky/" now={() => EVENING} />);
    const canvas = canvasOf();
    const { data } = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
    const middle = ((canvas.height / 2) * canvas.width + canvas.width / 2) * 4;
    expect(data[middle + 3]).toBe(255);
    expect(data[middle]).toBeGreaterThan(60);   // 83% lit: the middle of the disc is in sunlight
    expect(data[3]).toBe(0);   // the corner is clear
  });

  it('moves on with the clock each minute', () => {
    jest.useFakeTimers();
    let t = NOON;
    render(<TonightTile assetBase="/admin/sky/" now={() => t} />);
    expect(newYorkLine()).toBe('from New York · below the horizon until 13:58');
    t = EVENING;
    act(() => { jest.advanceTimersByTime(61000); });
    expect(newYorkLine()).toMatch(/lit side tilted/);
  });
});
