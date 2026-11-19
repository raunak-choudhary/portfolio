// scripts/lib/trace-summary.mjs
//
// Reduces a Chrome trace (the JSON from CDP Tracing) to the few numbers a
// person needs to see where frame time goes: wall time per event name on the
// renderer's main thread, its compositor, and the GPU process, plus the
// script URLs that cost the most. Pure, so it is unit tested with tiny
// synthetic traces.

/** Thread names worth reporting, mapped to a short label. */
const THREADS = Object.freeze({
  CrRendererMain: 'main',
  Compositor: 'compositor',
  CrGpuMain: 'gpu',
  VizCompositorThread: 'viz',
});

/**
 * Event names that wrap everything a frame or task does; reporting them next
 * to their children would count the same time twice, so they are skipped.
 */
const WRAPPERS = new Set(['RunTask', 'ThreadControllerImpl::RunTask', 'TaskQueueManager::ProcessTaskFromWorkQueue', 'MessageLoop::RunTask', 'RunNormalPriorityTask']);

/**
 * What the screen actually got, from a light trace (categories `viz` and
 * `toplevel`): frames the display compositor drew and swapped per second, and
 * the share of the window the GPU process's main thread was busy. The
 * requestAnimationFrame rate only shows the page's main thread; a page can
 * hold 60 there while the GPU, saturated by blur passes and a large canvas,
 * presents far fewer frames.
 * @param {object[]} events
 * @param {number} windowMs length of the traced window.
 * @returns {{presentedFps: number|null, gpuBusyPct: number|null}}
 */
export function compositorStats(events, windowMs) {
  if (!(windowMs > 0)) return { presentedFps: null, gpuBusyPct: null };
  const gpuThreads = new Set(events.filter((e) => e.ph === 'M' && e.name === 'thread_name' && e.args?.name === 'CrGpuMain').map((e) => `${e.pid}:${e.tid}`));
  let swaps = 0, gpuUs = 0;
  for (const e of events) {
    if (e.ph !== 'X') continue;
    if (e.name === 'Display::DrawAndSwap') swaps += 1;
    else if (e.name === 'ThreadControllerImpl::RunTask' && gpuThreads.has(`${e.pid}:${e.tid}`)) gpuUs += e.dur || 0;
  }
  return {
    presentedFps: Math.round((swaps / (windowMs / 1000)) * 10) / 10,
    gpuBusyPct: gpuThreads.size ? Math.min(100, Math.round(gpuUs / 10 / windowMs)) : null,
  };
}

/**
 * @param {object[]} events trace events (`traceEvents` of a trace file).
 * @param {{limit?: number}} [options]
 * @returns {{threads: Record<string, {busyMs: number, top: Array<{name: string, ms: number, count: number}>}>, scripts: Array<{url: string, ms: number}>}}
 *   busyMs is the sum of top-level complete events on that thread.
 */
export function summarizeTrace(events, { limit = 8 } = {}) {
  // pid:tid -> label, from the thread_name metadata events
  const labels = new Map();
  for (const e of events) {
    if (e.ph === 'M' && e.name === 'thread_name' && THREADS[e.args?.name]) labels.set(`${e.pid}:${e.tid}`, THREADS[e.args.name]);
  }

  const byThread = {};
  const scripts = new Map();
  // Complete events nest; only events that start after the previous top-level
  // event on the same thread ended are top-level, which gives a busy time
  // without double counting.
  const sorted = events.filter((e) => e.ph === 'X' && Number.isFinite(e.dur) && labels.has(`${e.pid}:${e.tid}`)).sort((a, b) => a.ts - b.ts);
  const topEnd = new Map();
  for (const e of sorted) {
    const key = `${e.pid}:${e.tid}`;
    const label = labels.get(key);
    const bucket = byThread[label] || (byThread[label] = { busyUs: 0, names: new Map() });
    if (!WRAPPERS.has(e.name)) {
      const entry = bucket.names.get(e.name) || { us: 0, count: 0 };
      entry.us += e.dur; entry.count += 1;
      bucket.names.set(e.name, entry);
    }
    if (e.ts >= (topEnd.get(key) ?? -Infinity)) { bucket.busyUs += e.dur; topEnd.set(key, e.ts + e.dur); }
    if (label === 'main' && (e.name === 'FunctionCall' || e.name === 'EvaluateScript')) {
      const url = e.args?.data?.url || '(anonymous)';
      const short = url.replace(/^https?:\/\/[^/]+/, '');
      scripts.set(short, (scripts.get(short) || 0) + e.dur);
    }
  }

  const toMs = (us) => Math.round(us / 100) / 10;
  const threads = {};
  for (const [label, bucket] of Object.entries(byThread)) {
    threads[label] = {
      busyMs: toMs(bucket.busyUs),
      top: [...bucket.names.entries()].map(([name, v]) => ({ name, ms: toMs(v.us), count: v.count })).sort((a, b) => b.ms - a.ms).slice(0, limit),
    };
  }
  return {
    threads,
    scripts: [...scripts.entries()].map(([url, us]) => ({ url, ms: toMs(us) })).sort((a, b) => b.ms - a.ms).slice(0, limit),
  };
}
