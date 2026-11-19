import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { compositorStats, summarizeTrace } from './trace-summary.mjs';

const thread = (pid, tid, name) => ({ ph: 'M', name: 'thread_name', pid, tid, args: { name } });
const span = (pid, tid, name, ts, dur, args) => ({ ph: 'X', pid, tid, name, ts, dur, ...(args ? { args } : {}) });

describe('summarizeTrace', () => {
  const events = [
    thread(1, 1, 'CrRendererMain'), thread(2, 9, 'CrGpuMain'), thread(1, 5, 'ThreadPoolForegroundWorker'),
    span(1, 1, 'ThreadControllerImpl::RunTask', 0, 10_000),
    span(1, 1, 'FunctionCall', 1_000, 6_000, { data: { url: 'http://localhost:3217/static/js/voyage.chunk.js' } }),
    span(1, 1, 'Layout', 7_000, 2_000),
    span(1, 1, 'ThreadControllerImpl::RunTask', 20_000, 5_000),
    span(1, 1, 'FunctionCall', 20_500, 4_000, { data: { url: 'http://localhost:3217/static/js/voyage.chunk.js' } }),
    span(2, 9, 'SkiaOutputSurfaceImplOnGpu::SwapBuffers', 0, 3_000),
    span(1, 5, 'Decode Image', 0, 50_000),   // a thread that is not reported
  ];

  it('reports busy time per thread from top-level events only', () => {
    const { threads } = summarizeTrace(events);
    assert.equal(threads.main.busyMs, 15);
    assert.equal(threads.gpu.busyMs, 3);
    assert.equal(threads.ThreadPoolForegroundWorker, undefined);
  });

  it('ranks event names by time, leaving out the task wrappers', () => {
    const { threads } = summarizeTrace(events);
    assert.deepEqual(threads.main.top[0], { name: 'FunctionCall', ms: 10, count: 2 });
    assert.ok(!threads.main.top.some((t) => t.name === 'ThreadControllerImpl::RunTask'));
  });

  it('attributes script time to the script path without the origin', () => {
    assert.deepEqual(summarizeTrace(events).scripts, [{ url: '/static/js/voyage.chunk.js', ms: 10 }]);
  });
});

describe('compositorStats', () => {
  it('counts display swaps per second and the GPU main thread busy share', () => {
    const events = [thread(2, 9, 'CrGpuMain'), ...Array.from({ length: 30 }, (_, i) => span(3, 4, 'Display::DrawAndSwap', i * 33_000, 1_000)), span(2, 9, 'ThreadControllerImpl::RunTask', 0, 250_000)];
    assert.deepEqual(compositorStats(events, 1000), { presentedFps: 30, gpuBusyPct: 25 });
  });

  it('returns nulls for an empty window and no GPU share without a GPU thread', () => {
    assert.deepEqual(compositorStats([], 0), { presentedFps: null, gpuBusyPct: null });
    assert.deepEqual(compositorStats([span(3, 4, 'Display::DrawAndSwap', 0, 1)], 500), { presentedFps: 2, gpuBusyPct: null });
  });
});
