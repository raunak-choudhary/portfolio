// src/components/admin/Voyage/idle.js
//
// Small scheduling helpers that keep one-off work off the scroll path.
// whenIdle runs a callback once the page has been quiet for a while
// (requestIdleCallback, with a plain timer where the browser lacks it, as
// Safari does). sliceWork walks a long list in slices of a few milliseconds
// and yields to the browser between slices, so no single task grows long
// enough to drop frames while the voyage is moving.

/**
 * Runs `fn` after `delay` ms, at the next idle period (or after `timeout` ms at
 * the latest). Returns a function that cancels whatever is still pending.
 *
 * @param {() => void} fn
 * @param {object} [options]
 * @param {number} [options.delay] wait this long before asking for an idle period.
 * @param {number} [options.timeout] the idle callback runs by then even on a busy page.
 * @param {object} [options.win] the window to schedule on (tests pass a stand-in).
 * @returns {() => void}
 */
export function whenIdle(fn, { delay = 0, timeout = 2000, win = window } = {}) {
  let timer = null, idle = null, done = false;
  const run = () => { if (!done) { done = true; fn(); } };
  const ask = () => {
    timer = null;
    if (typeof win.requestIdleCallback === 'function') idle = win.requestIdleCallback(run, { timeout });
    else timer = win.setTimeout(run, 1);   // no idle callback in this browser: the next free moment will do
  };
  if (delay > 0) timer = win.setTimeout(ask, delay); else ask();
  return () => {
    done = true;
    if (timer !== null) win.clearTimeout(timer);
    if (idle !== null && typeof win.cancelIdleCallback === 'function') win.cancelIdleCallback(idle);
  };
}

/** Resolves on a fresh task, letting the browser paint and handle input first. */
export function yieldToMain() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

const clock = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

/**
 * Calls `step(item)` for every item, at most about `budgetMs` per task, and
 * yields between slices. The first slice starts at once, so short lists finish
 * without waiting for a timer. Stops early, resolving false, when `cancelled()`
 * turns true; resolves true when every item was visited.
 *
 * @template T
 * @param {T[]} items
 * @param {(item: T) => void} step
 * @param {object} [options]
 * @param {number} [options.budgetMs]
 * @param {() => number} [options.now]
 * @param {() => Promise<void>} [options.pause]
 * @param {() => boolean} [options.cancelled]
 * @returns {Promise<boolean>}
 */
export async function sliceWork(items, step, { budgetMs = 8, now = clock, pause = yieldToMain, cancelled = () => false } = {}) {
  let i = 0;
  while (i < items.length) {
    if (cancelled()) return false;
    const until = now() + budgetMs;
    // check the clock every 64 items: reading it per item would cost more than the work
    do {
      const end = Math.min(items.length, i + 64);
      for (; i < end; i++) step(items[i]);
    } while (i < items.length && now() < until);
    if (i < items.length) await pause();
  }
  return !cancelled();
}
