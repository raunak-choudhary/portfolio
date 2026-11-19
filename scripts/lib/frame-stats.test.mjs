import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { checkFrameBudget, formatTable, median, quantile, summarizeFrames, summarizeLongTasks } from './frame-stats.mjs';

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
    assert.match(table, /\| voyage \| 1x \| idle \| .* \| n\/a \| n\/a \|$/);
  });
});
