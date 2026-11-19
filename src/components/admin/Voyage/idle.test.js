// Tests for the idle scheduling helpers: the requestIdleCallback path, the
// timer fallback for browsers without it, cancellation, and the sliced walk.

import { sliceWork, whenIdle } from './idle';

describe('whenIdle', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  /** A window stand-in with real (fake-timer) timers and an optional idle callback. */
  const fakeWindow = (withIdle) => {
    const win = { setTimeout: (f, ms) => setTimeout(f, ms), clearTimeout: (t) => clearTimeout(t) };
    if (withIdle) {
      win.pending = [];
      win.requestIdleCallback = jest.fn((f, opts) => { win.pending.push({ f, opts }); return win.pending.length; });
      win.cancelIdleCallback = jest.fn();
    }
    return win;
  };

  it('falls back to a timer when the browser has no idle callback', () => {
    const fn = jest.fn();
    whenIdle(fn, { delay: 2500, win: fakeWindow(false) });
    jest.advanceTimersByTime(2499);
    expect(fn).not.toHaveBeenCalled();
    jest.advanceTimersByTime(2);
    expect(fn).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(10000);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('asks for an idle period after the delay, with the timeout', () => {
    const fn = jest.fn();
    const win = fakeWindow(true);
    whenIdle(fn, { delay: 1000, timeout: 3000, win });
    expect(win.requestIdleCallback).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1000);
    expect(win.requestIdleCallback).toHaveBeenCalledWith(expect.any(Function), { timeout: 3000 });
    expect(fn).not.toHaveBeenCalled();
    win.pending[0].f();
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('cancels a pending delay, and an idle request already made', () => {
    const fn = jest.fn();
    const cancelEarly = whenIdle(fn, { delay: 1000, win: fakeWindow(false) });
    cancelEarly();
    jest.advanceTimersByTime(5000);
    expect(fn).not.toHaveBeenCalled();

    const win = fakeWindow(true);
    const cancelLate = whenIdle(fn, { delay: 10, win });
    jest.advanceTimersByTime(10);
    cancelLate();
    expect(win.cancelIdleCallback).toHaveBeenCalledWith(1);
    win.pending[0].f();   // a browser that runs it anyway still does nothing
    expect(fn).not.toHaveBeenCalled();
  });
});

describe('sliceWork', () => {
  it('visits every item in order and yields between slices of the budget', async () => {
    let t = 0;
    const now = () => t;
    const seen = [];
    const pause = jest.fn(async () => {});
    // each item costs 1 ms of the fake clock; the clock is read every 64 items
    const done = await sliceWork([...Array(300).keys()], (x) => { seen.push(x); t += 1; }, { budgetMs: 8, now, pause });
    expect(done).toBe(true);
    expect(seen).toEqual([...Array(300).keys()]);
    expect(pause).toHaveBeenCalledTimes(4);   // 64-item steps: 64, 128, 192, 256, then the last 44
  });

  it('finishes a short list without yielding at all', async () => {
    const pause = jest.fn(async () => {});
    const seen = [];
    await sliceWork([1, 2, 3], (x) => seen.push(x), { pause });
    expect(seen).toEqual([1, 2, 3]);
    expect(pause).not.toHaveBeenCalled();
  });

  it('stops between slices once cancelled', async () => {
    let t = 0, stop = false;
    const seen = [];
    const done = await sliceWork([...Array(200).keys()], (x) => { seen.push(x); t += 10; }, {
      budgetMs: 8, now: () => t, pause: async () => { stop = true; }, cancelled: () => stop,
    });
    expect(done).toBe(false);
    expect(seen).toHaveLength(64);
  });
});
