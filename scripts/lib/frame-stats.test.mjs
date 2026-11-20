import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { budgetProfiles, checkFrameBudget, formatTable, median, quantile, summarizeFrames, summarizeGpu, summarizeLongTasks } from './frame-stats.mjs';

/** Timestamps for a run of frames with the given intervals, starting at 1000 ms. */
const stampsFrom = (intervals) => intervals.reduce((acc, d) => [...acc, acc[acc.length - 1] + d], [1000]);

describe('quantile and median', () => {
  it('returns observed values by nearest rank', () => {
    const sorted = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
    assert.equal(quantile(sorted, 0.95), 100);
    assert.equal(quantile(sorted, 0.5), 50);
    assert.equal(quantile(sorted, 0), 10);
  });

  it('takes the middle pair mean for even lengths and NaN for empty input', () => {
    assert.equal(median([1, 2, 3, 4]), 2.5);
    assert.equal(median([1, 2, 3]), 2);
    assert.ok(Number.isNaN(median([])));
    assert.ok(Number.isNaN(quantile([], 0.5)));
  });
});

describe('summarizeFrames', () => {
  it('reports a steady 60 Hz run as 60 fps with no hitches', () => {
    const s = summarizeFrames(stampsFrom(Array(120).fill(1000 / 60)));
    assert.equal(s.frames, 120);
    assert.equal(s.medianFps, 60);
    assert.equal(s.p95FrameMs, 16.7);
    assert.equal(s.over50, 0);
    assert.equal(s.seconds, 2);
  });

  it('counts frames over 50 ms and lets them lift the p95, not the median', () => {
    const intervals = [...Array(90).fill(16.7), ...Array(10).fill(80)];
    const s = summarizeFrames(stampsFrom(intervals));
    assert.equal(s.over50, 10);
    assert.equal(s.medianFps, 59.9);
    assert.equal(s.p95FrameMs, 80);
    assert.equal(s.maxFrameMs, 80);
  });

  it('treats a 50 ms frame as on the limit, not over it', () => {
    assert.equal(summarizeFrames(stampsFrom([50, 50.1])).over50, 1);
  });

  it('returns nulls rather than NaN when there is nothing to measure', () => {
    const s = summarizeFrames([5]);
    assert.equal(s.frames, 0);
    assert.equal(s.medianFps, null);
    assert.equal(s.p95FrameMs, null);
  });
});

describe('summarizeLongTasks', () => {
  it('counts tasks and reports the longest and the total', () => {
    assert.deepEqual(summarizeLongTasks([{ duration: 60 }, { duration: 120.04 }]), { count: 2, maxMs: 120, totalMs: 180 });
    assert.deepEqual(summarizeLongTasks([]), { count: 0, maxMs: 0, totalMs: 0 });
  });
});

describe('checkFrameBudget', () => {
  const result = (over) => ({ scenario: 'voyage', cpuRate: 1, phase: 'scroll', frames: { medianFps: 59, p95FrameMs: 20, over50: 0, frames: 600 }, longTasks: { count: 0, maxMs: 0 }, ...over });
  const budget = { _note: 'documentation keys are ignored', voyage: { 1: { scroll: { minMedianFps: 55, maxP95FrameMs: 25, maxOver50: 2, maxLongTasks: 0 } } } };

  it('passes a run inside every limit', () => {
    assert.deepEqual(checkFrameBudget([result()], budget), []);
  });

  it('names each broken limit in a sentence', () => {
    const failures = checkFrameBudget([result({ frames: { medianFps: 40, p95FrameMs: 60, over50: 9, frames: 400 }, longTasks: { count: 3, maxMs: 140 } })], budget);
    assert.equal(failures.length, 4);
    assert.match(failures[0], /median 40 fps is under 55/);
    assert.match(failures[1], /p95 frame 60 ms is over 25/);
    assert.match(failures[2], /9 frames over 50 ms/);
    assert.match(failures[3], /3 long tasks, longest 140 ms/);
  });

  it('fails a budget entry that has no measurement, so a skipped scenario cannot pass', () => {
    assert.deepEqual(checkFrameBudget([], budget), ['voyage 1x scroll: no measurement']);
  });

  it('checks the presented frame rate when the budget asks for it', () => {
    const presented = { voyage: { 1: { scroll: { minPresentedFps: 50 } } } };
    assert.deepEqual(checkFrameBudget([result({ compositor: { presentedFps: 55 } })], presented), []);
    assert.match(checkFrameBudget([result({ compositor: { presentedFps: 31 } })], presented)[0], /31 presented fps is under 50/);
    assert.match(checkFrameBudget([result()], presented)[0], /no presented fps/);
  });

  it('fails a missing frame rate instead of comparing against null', () => {
    const failures = checkFrameBudget([result({ frames: { medianFps: null, p95FrameMs: null, over50: 0, frames: 0 } })], budget);
    assert.equal(failures.length, 2);
  });
});

describe('formatTable', () => {
  it('renders one Markdown row per result', () => {
    const table = formatTable([
      { scenario: 'login', cpuRate: 4, phase: 'idle', frames: { medianFps: 60, p95FrameMs: 17, over50: 0, frames: 300 }, longTasks: { count: 0, maxMs: 0 }, compositor: { presentedFps: 58.5, gpuBusyPct: 21 } },
      { scenario: 'voyage', cpuRate: 1, phase: 'idle', frames: { medianFps: 60, p95FrameMs: 17, over50: 0, frames: 300 }, longTasks: { count: 0, maxMs: 0 } },
    ]);
    assert.match(table, /^\| scenario \|/);
    assert.match(table, /\| login \| 4x \| idle \| 60 \| 17 \| 0 of 300 \| 0 \(0\) \| 58\.5 \| 21% \|/);
    assert.match(table, /\| voyage \| 1x \| idle \| .* \| n\/a \| n\/a \| n\/a \| n\/a \| 0 \|$/);
  });

  it('shows GPU time, and marks a sync measurement as approximate', () => {
    const row = (method) => formatTable([{ scenario: 'voyage', cpuRate: 1, phase: 'idle', frames: { medianFps: 60, p95FrameMs: 17, over50: 0, frames: 300 }, longTasks: { count: 0, maxMs: 0 }, gpu: { method, frames: 150, medianMs: 3.2, p90Ms: 4.75 } }]);
    assert.match(row('timer'), /\| 3\.2 \| 4\.75 \| 150 \|$/);
    assert.match(row('sync'), /\| ~3\.2 \| ~4\.75 \| 150 \|$/);
  });
});

describe('summarizeGpu', () => {
  it('reports the median and nearest-rank p90 of the frames that drew', () => {
    const s = summarizeGpu({ method: 'timer', samples: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] });
    assert.deepEqual(s, { method: 'timer', frames: 10, medianMs: 5.5, p90Ms: 9 });
  });

  it('drops samples that are not finite or negative (a disjoint or lost query)', () => {
    const s = summarizeGpu({ method: 'timer', samples: [2, NaN, -1, Infinity, 4] });
    assert.equal(s.frames, 2);
    assert.equal(s.medianMs, 3);
  });

  it('gives nulls, not zeros, when nothing was measured', () => {
    assert.deepEqual(summarizeGpu(null), { method: null, frames: 0, medianMs: null, p90Ms: null });
    assert.deepEqual(summarizeGpu({ method: 'sync', samples: [] }), { method: 'sync', frames: 0, medianMs: null, p90Ms: null });
  });
});

describe('checkFrameBudget GPU limits', () => {
  const result = (gpu) => ({ scenario: 'voyage', cpuRate: 1, phase: 'idle', frames: { medianFps: 60, p95FrameMs: 17, over50: 0, frames: 300 }, longTasks: { count: 0, maxMs: 0 }, gpu });
  const budget = { voyage: { 1: { idle: { maxGpuMedianMs: 4, maxGpuP90Ms: 6 } } } };

  it('passes a run under both GPU limits', () => {
    assert.deepEqual(checkFrameBudget([result({ method: 'timer', frames: 100, medianMs: 3.1, p90Ms: 5.9 })], budget), []);
  });

  it('names a median and a p90 over the limit', () => {
    const failures = checkFrameBudget([result({ method: 'timer', frames: 100, medianMs: 10.5, p90Ms: 21 })], budget);
    assert.equal(failures.length, 2);
    assert.match(failures[0], /GPU 10\.5 ms median per frame is over 4/);
    assert.match(failures[1], /GPU 21 ms p90 per frame is over 6/);
  });

  it('fails a run whose GPU time could not be measured', () => {
    const failures = checkFrameBudget([result(undefined)], budget);
    assert.equal(failures.length, 2);
    assert.match(failures[0], /not measured/);
  });
});

describe('budgetProfiles', () => {
  const defaults = { width: 1440, height: 900, dpr: 2, theme: 'dark', panels: 'on', rates: [1, 4], scenarios: ['login', 'voyage'] };

  it('reads an old budget without profiles as one run with the command-line settings', () => {
    const [p, ...rest] = budgetProfiles({ _note: 'x', voyage: { 1: { idle: {} } } }, defaults);
    assert.equal(rest.length, 0);
    assert.equal(p.name, 'default');
    assert.deepEqual(p.rates, [1, 4]);
    assert.deepEqual(Object.keys(p.limits), ['voyage']);
  });

  it('takes viewport, theme, rates and scenarios from each profile', () => {
    const profiles = budgetProfiles({ profiles: {
      'phone-light': { width: 390, height: 844, dpr: 3, theme: 'light', limits: { voyage: { 4: { scroll: {} }, 1: { idle: {} } } } },
      'desktop-dark': { limits: { login: { 1: { idle: {} } }, voyage: { 1: { idle: {} } } } },
    } }, defaults);
    assert.deepEqual(profiles.map((p) => p.name), ['phone-light', 'desktop-dark']);
    assert.deepEqual([profiles[0].width, profiles[0].height, profiles[0].dpr, profiles[0].theme, profiles[0].panels], [390, 844, 3, 'light', 'on']);
    assert.deepEqual(profiles[0].rates, [1, 4]);
    assert.deepEqual(profiles[0].scenarios, ['voyage']);
    assert.deepEqual(profiles[1].scenarios, ['login', 'voyage']);
    assert.deepEqual(profiles[1].rates, [1]);
    assert.equal(profiles[1].width, 1440);
  });
});
