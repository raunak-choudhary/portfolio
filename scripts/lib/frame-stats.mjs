// scripts/lib/frame-stats.mjs
//
// Pure helpers for the frame-time measurement (scripts/measure-frames.mjs):
// turn requestAnimationFrame timestamps and long-task entries into the
// numbers the report and the budget use, and check those numbers against
// scripts/frame-budget.json. No browser, no I/O, so every rule is unit tested.

/** A frame longer than this is a visible hitch (three missed vsyncs at 60 Hz). */
export const HITCH_MS = 50;

/**
 * Value at quantile q (0..1) of an ascending array, by the nearest-rank
 * method, so the result is always a value that was actually observed.
 * @param {number[]} sorted ascending values.
 * @param {number} q
 * @returns {number} NaN for an empty array.
 */
export function quantile(sorted, q) {
  if (!sorted.length) return NaN;
  const rank = Math.ceil(Math.min(1, Math.max(0, q)) * sorted.length);
  return sorted[Math.max(0, rank - 1)];
}

/** Median of an ascending array (mean of the middle pair for even lengths). */
export function median(sorted) {
  if (!sorted.length) return NaN;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

const round1 = (v) => (Number.isFinite(v) ? Math.round(v * 10) / 10 : null);

/**
 * Summarise a run of requestAnimationFrame timestamps.
 * @param {number[]} stamps rAF timestamps in ms, in the order received.
 * @returns {{frames: number, medianFps: number|null, p95FrameMs: number|null, maxFrameMs: number|null, over50: number, seconds: number}}
 *   `frames` counts intervals; `over50` counts intervals longer than HITCH_MS.
 */
export function summarizeFrames(stamps) {
  const deltas = [];
  for (let i = 1; i < stamps.length; i++) {
    const d = stamps[i] - stamps[i - 1];
    if (d > 0) deltas.push(d);
  }
  const sorted = [...deltas].sort((a, b) => a - b);
  const med = median(sorted);
  return {
    frames: deltas.length,
    medianFps: round1(med > 0 ? 1000 / med : NaN),
    p95FrameMs: round1(quantile(sorted, 0.95)),
    maxFrameMs: round1(sorted[sorted.length - 1]),
    over50: deltas.filter((d) => d > HITCH_MS).length,
    seconds: round1(stamps.length > 1 ? (stamps[stamps.length - 1] - stamps[0]) / 1000 : 0),
  };
}

/**
 * Summarise long-task entries (PerformanceObserver 'longtask', each at least 50 ms by definition).
 * @param {{duration: number}[]} tasks
 * @returns {{count: number, maxMs: number, totalMs: number}}
 */
export function summarizeLongTasks(tasks) {
  const durations = tasks.map((t) => t.duration).filter((d) => Number.isFinite(d));
  return {
    count: durations.length,
    maxMs: round1(durations.length ? Math.max(...durations) : 0),
    totalMs: round1(durations.reduce((a, b) => a + b, 0)),
  };
}

/**
 * Summarise GPU time per rendered frame (ms), as measured in the page by
 * EXT_disjoint_timer_query_webgl2 (method 'timer') or, where that extension is
 * missing, by forcing a sync with a one-pixel readPixels after each render
 * (method 'sync', approximate: it also counts the CPU time spent issuing the
 * draws). Frames that drew nothing are not samples, so a sky that renders at
 * 30 fps is judged by the frames it drew.
 * @param {{method: string|null, samples: number[]}|null|undefined} gpu
 * @returns {{method: string|null, frames: number, medianMs: number|null, p90Ms: number|null}}
 */
export function summarizeGpu(gpu) {
  const samples = (gpu?.samples || []).filter((v) => Number.isFinite(v) && v >= 0);
  const sorted = [...samples].sort((a, b) => a - b);
  // two decimals: a quiet night frame is a couple of milliseconds, and the budget compares tenths
  const round2 = (v) => (Number.isFinite(v) ? Math.round(v * 100) / 100 : null);
  return { method: gpu?.method || null, frames: sorted.length, medianMs: round2(median(sorted)), p90Ms: round2(quantile(sorted, 0.9)) };
}

/**
 * The runs a budget file asks for. A budget with `profiles` names each
 * configuration (viewport, pixel ratio, theme, panels, CPU rates and the
 * limits per scenario); an older budget without them is one profile whose
 * settings come from the command line.
 * @param {object} budget parsed scripts/frame-budget.json.
 * @param {object} defaults command-line settings (width, height, dpr, theme, panels, rates, scenarios).
 * @returns {{name: string, width: number, height: number, dpr: number, theme: string, panels: string, rates: number[], scenarios: string[], limits: object}[]}
 */
export function budgetProfiles(budget, defaults) {
  const profiles = budget && budget.profiles;
  if (!profiles) {
    const limits = Object.fromEntries(Object.entries(budget || {}).filter(([k]) => !k.startsWith('_')));
    return [{ name: 'default', ...defaults, limits }];
  }
  return Object.entries(profiles).map(([name, p]) => {
    const limits = p.limits || {};
    const scenarios = Object.keys(limits);
    // every rate any scenario names, in ascending order
    const rates = [...new Set(scenarios.flatMap((s) => Object.keys(limits[s]).map(Number)))].sort((a, b) => a - b);
    return { name, width: p.width ?? defaults.width, height: p.height ?? defaults.height, dpr: p.dpr ?? defaults.dpr, theme: p.theme ?? defaults.theme, panels: p.panels ?? defaults.panels, rates, scenarios, limits };
  });
}

/**
 * Check measured results against a budget.
 *
 * Budget shape (scripts/frame-budget.json): `{ "<scenario>": { "<cpuRate>": { "<phase>": limits } } }`
 * where limits may hold `minMedianFps`, `maxP95FrameMs`, `maxOver50`,
 * `maxLongTasks`, `minPresentedFps`, and the GPU time per rendered frame
 * `maxGpuMedianMs` and `maxGpuP90Ms`. A result is `{ scenario, cpuRate, phase, frames, longTasks }`
 * as produced by summarizeFrames and summarizeLongTasks.
 *
 * A budget entry with no matching result is a failure too, so a scenario
 * that silently stops running cannot pass.
 *
 * @returns {string[]} one sentence per broken limit; empty when within budget.
 */
export function checkFrameBudget(results, budget) {
  const failures = [];
  for (const [scenario, rates] of Object.entries(budget || {})) {
    if (scenario.startsWith('_')) continue;   // "_note" and similar keys document the file
    for (const [rate, phases] of Object.entries(rates)) {
      for (const [phase, limits] of Object.entries(phases)) {
        const label = `${scenario} ${rate}x ${phase}`;
        const result = results.find((r) => r.scenario === scenario && String(r.cpuRate) === rate && r.phase === phase);
        if (!result) { failures.push(`${label}: no measurement`); continue; }
        const { frames, longTasks } = result;
        // Number.isFinite guards every comparison: in JavaScript `null <= 25` is true, so a missing value would pass.
        const atLeast = (v, min) => Number.isFinite(v) && v >= min;
        const atMost = (v, max) => Number.isFinite(v) && v <= max;
        if (limits.minMedianFps !== undefined && !atLeast(frames.medianFps, limits.minMedianFps)) failures.push(`${label}: median ${frames.medianFps} fps is under ${limits.minMedianFps}`);
        if (limits.maxP95FrameMs !== undefined && !atMost(frames.p95FrameMs, limits.maxP95FrameMs)) failures.push(`${label}: p95 frame ${frames.p95FrameMs} ms is over ${limits.maxP95FrameMs}`);
        if (limits.maxOver50 !== undefined && frames.over50 > limits.maxOver50) failures.push(`${label}: ${frames.over50} frames over ${HITCH_MS} ms (limit ${limits.maxOver50})`);
        if (limits.minPresentedFps !== undefined && !atLeast(result.compositor?.presentedFps, limits.minPresentedFps)) failures.push(`${label}: ${result.compositor?.presentedFps ?? 'no'} presented fps is under ${limits.minPresentedFps}`);
        if (limits.maxGpuMedianMs !== undefined && !atMost(result.gpu?.medianMs, limits.maxGpuMedianMs)) failures.push(`${label}: GPU ${result.gpu?.medianMs ?? 'not measured'} ms median per frame is over ${limits.maxGpuMedianMs}`);
        if (limits.maxGpuP90Ms !== undefined && !atMost(result.gpu?.p90Ms, limits.maxGpuP90Ms)) failures.push(`${label}: GPU ${result.gpu?.p90Ms ?? 'not measured'} ms p90 per frame is over ${limits.maxGpuP90Ms}`);
        if (limits.maxLongTasks !== undefined && longTasks.count > limits.maxLongTasks) failures.push(`${label}: ${longTasks.count} long tasks, longest ${longTasks.maxMs} ms (limit ${limits.maxLongTasks})`);
      }
    }
  }
  return failures;
}

/**
 * Render results as a Markdown table, one row per scenario, rate and phase.
 * @param {Array<{scenario: string, cpuRate: number, phase: string, frames: object, longTasks: object}>} results
 */
export function formatTable(results) {
  const head = '| scenario | cpu | phase | median fps | p95 frame ms | frames > 50 ms | long tasks (max ms) | presented fps | GPU busy | GPU ms median | GPU ms p90 | GPU frames |\n|---|---|---|---|---|---|---|---|---|---|---|---|';
  const dash = (v, unit = '') => (v === null || v === undefined ? 'n/a' : `${v}${unit}`);
  // a sync measurement is marked with a tilde: it is an approximation, not a GPU timer
  const gpuMs = (r, key) => (r.gpu?.[key] === null || r.gpu?.[key] === undefined ? 'n/a' : `${r.gpu.method === 'sync' ? '~' : ''}${r.gpu[key]}`);
  const rows = results.map((r) => `| ${r.scenario} | ${r.cpuRate}x | ${r.phase} | ${r.frames.medianFps} | ${r.frames.p95FrameMs} | ${r.frames.over50} of ${r.frames.frames} | ${r.longTasks.count} (${r.longTasks.maxMs}) | ${dash(r.compositor?.presentedFps)} | ${dash(r.compositor?.gpuBusyPct, '%')} | ${gpuMs(r, 'medianMs')} | ${gpuMs(r, 'p90Ms')} | ${r.gpu?.frames ?? 0} |`);
  return [head, ...rows].join('\n');
}
