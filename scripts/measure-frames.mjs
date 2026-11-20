#!/usr/bin/env node
// scripts/measure-frames.mjs
//
// Measures how smoothly the admin runs in a real Chromium with the machine's
// GPU: the login page at rest, and the voyage dashboard at rest on the Earth
// prologue and while it scrolls through every chapter. For each CPU rate
// (1x, and 4x through CDP Emulation.setCPUThrottlingRate) it records every
// requestAnimationFrame timestamp and every long task, then reports the
// median frame rate, the 95th percentile frame time, the frames over 50 ms
// and the long tasks. With --budget it fails when a number breaks
// scripts/frame-budget.json (npm run check:frames).
//
// Nothing leaves the laptop: the build is served through a Playwright route
// on a made-up localhost origin, Supabase is answered by scripts/lib/admin-mocks.mjs
// (fake second-factor session, recorded fixtures, writes refused), and every
// other host is aborted and listed in the output.
//
// Needs a build first: npm run build:e2e (any REACT_APP_SUPABASE_ANON_KEY
// placeholder works, every request is mocked).
//
// usage: node scripts/measure-frames.mjs [--build build] [--rates 1,4]
//          [--scenarios login,voyage] [--width 1440] [--height 900] [--dpr 2]
//          [--theme dark|light] [--panels on|off] [--repeat 1]
//          [--out results.json] [--trace trace.json --trace-rate 4]
//          [--budget scripts/frame-budget.json [--profiles desktop-light,phone-dark]]
//          [--inject-css experiment.css] [--inject-js experiment.js] [--gpu-method timer|sync]
//
// GPU time: every WebGL2 render is timed on the GPU with
// EXT_disjoint_timer_query_webgl2 and reported per phase as the median and
// 90th percentile ms per rendered frame. rAF timing and presented fps stop at
// the display's refresh rate, so a scene that keeps the GPU busy for 10 ms of
// every 16.7 ms frame looks as smooth as one that needs 2 ms; GPU time is what
// shows the difference (and what a slower GPU or a busy laptop runs out of).
// Without the extension the probe falls back to a forced sync per frame,
// marked ~ in the table because it also counts CPU submit time.
//
// A budget file with "profiles" runs each named configuration (viewport,
// pixel ratio, theme, panels) with its own limits; --profiles picks some.
//
// Run it on an otherwise quiet machine: builds and test suites running at
// the same time take the same CPU and GPU and make every number worse.

import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SESSION_STORAGE_KEY, buildFakeAdminSession, installAdminRoutes } from './lib/admin-mocks.mjs';
import { budgetProfiles, checkFrameBudget, formatTable, summarizeFrames, summarizeGpu, summarizeLongTasks } from './lib/frame-stats.mjs';
import { compositorStats, summarizeTrace } from './lib/trace-summary.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(REPO);   // the e2e fixture loader resolves e2e/fixtures from the working directory

/** A localhost origin nothing listens on: every request to it is answered by the route. */
const ORIGIN = 'http://localhost:3217';

function readOptions(argv) {
  const o = { build: 'build', rates: '1,4', scenarios: 'login,voyage', width: 1440, height: 900, dpr: 2, theme: 'dark', panels: 'on', repeat: 1, out: '', trace: '', 'trace-rate': 4, budget: '', profiles: '', 'gpu-method': 'timer', 'idle-ms': 5000, 'scroll-ms': 25000, 'inject-css': '', 'inject-js': '' };
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i].replace(/^--/, '');
    if (!(key in o)) throw new Error(`unknown option --${key}`);
    const value = argv[++i];
    o[key] = typeof o[key] === 'number' ? Number(value) : value;
  }
  return { ...o, rates: o.rates.split(',').map(Number), scenarios: o.scenarios.split(',') };
}

/**
 * Runs in the page before any app code: the probe that records frames, long
 * tasks and the GPU time of every frame the WebGL sky draws.
 *
 * GPU time: every WebGL2 context the page creates is noted. On the first draw
 * of a task a TIME_ELAPSED query begins (EXT_disjoint_timer_query_webgl2); a
 * microtask ends it once the task's script returns, so one query spans one
 * render of the sky, however many draw calls it makes. Results are read back a
 * few frames later; a disjoint (the GPU was interrupted) discards them. Where
 * the extension is missing, the fallback forces a sync with a one-pixel
 * readPixels after the render and times from the first draw: method 'sync',
 * which also counts the CPU time spent issuing the draws, so it is approximate.
 */
function installProbe({ forceSync = false } = {}) {
  let stamps = [], startAt = 0, endAt = Infinity, running = false, handle = 0;
  const tasks = [];
  const gpu = { method: null, samples: [], pending: [] };
  const contexts = [];
  const DRAWS = ['drawArrays', 'drawElements', 'drawArraysInstanced', 'drawElementsInstanced', 'drawRangeElements'];
  const watch = (gl) => {
    if (contexts.some((c) => c.gl === gl)) return;
    const ext = forceSync ? null : gl.getExtension('EXT_disjoint_timer_query_webgl2');
    const entry = { gl, ext, active: null, syncStart: null };
    contexts.push(entry);
    const finish = () => {
      if (entry.active) { gl.endQuery(ext.TIME_ELAPSED_EXT); gpu.pending.push({ entry, query: entry.active }); entry.active = null; }
      if (entry.syncStart !== null) {
        gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
        gpu.samples.push(performance.now() - entry.syncStart); entry.syncStart = null;
      }
    };
    for (const name of DRAWS) {
      const original = gl[name];
      if (typeof original !== 'function') continue;
      gl[name] = function draw(...args) {
        if (running && entry.active === null && entry.syncStart === null && gl.canvas && gl.canvas.isConnected) {
          if (ext) { entry.active = gl.createQuery(); gl.beginQuery(ext.TIME_ELAPSED_EXT, entry.active); gpu.method = 'timer'; }
          else { entry.syncStart = performance.now(); gpu.method = 'sync'; }
          queueMicrotask(finish);
        }
        return original.apply(this, args);
      };
    }
  };
  const getContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function patched(type, ...rest) {
    const ctx = getContext.call(this, type, ...rest);
    if (ctx && type === 'webgl2') { try { watch(ctx); } catch { /* measurement only: never break the page */ } }
    return ctx;
  };
  const poll = () => {
    gpu.pending = gpu.pending.filter(({ entry, query }) => {
      const { gl, ext } = entry;
      if (gl.isContextLost()) return false;
      if (!gl.getQueryParameter(query, gl.QUERY_RESULT_AVAILABLE)) return true;
      const disjoint = gl.getParameter(ext.GPU_DISJOINT_EXT);
      const ns = gl.getQueryParameter(query, gl.QUERY_RESULT);
      gl.deleteQuery(query);
      if (!disjoint) gpu.samples.push(ns / 1e6);
      return false;
    });
  };
  const loop = (t) => { if (!running) return; stamps.push(t); poll(); handle = requestAnimationFrame(loop); };
  try {
    new PerformanceObserver((list) => { for (const e of list.getEntries()) tasks.push({ start: e.startTime, duration: e.duration }); }).observe({ type: 'longtask' });
  } catch { /* no long task support: the count stays zero and the report says so through frames */ }
  window.__frameProbe = {
    start() { stamps = []; gpu.samples = []; startAt = performance.now(); endAt = Infinity; running = true; handle = requestAnimationFrame(loop); },
    stop() { running = false; cancelAnimationFrame(handle); endAt = performance.now(); },
    /** Waits up to half a second for the last queries to land, then hands everything over. */
    async collect() {
      for (let i = 0; i < 30 && gpu.pending.length; i++) { await new Promise((r) => requestAnimationFrame(r)); poll(); }
      return { stamps, tasks: tasks.filter((t) => t.start >= startAt && t.start <= endAt), gpu: { method: gpu.method, samples: gpu.samples.slice() } };
    },
  };
}

/** Seeds the browser storage the app reads: the fake session (voyage only) and the sky settings. */
function seedStorage({ session, theme, panels }) {
  try {
    if (session) localStorage.setItem(session.key, JSON.stringify(session.value));
    const raw = localStorage.getItem('rc-admin-sky');
    const settings = raw ? JSON.parse(raw) : {};
    settings.themeMode = theme; settings.panels = panels;
    localStorage.setItem('rc-admin-sky', JSON.stringify(settings));
    localStorage.setItem('portfolio-theme', theme);
  } catch { /* storage refused: defaults apply */ }
}

/** Facts about the page that explain its numbers: GPU, canvas size, live blur layers. */
function pageFacts() {
  const canvas = document.querySelector('canvas.voyage-field, canvas.preflight-sky__stars');
  let renderer = null;
  try {
    const gl = document.createElement('canvas').getContext('webgl');
    const ext = gl && gl.getExtension('WEBGL_debug_renderer_info');
    renderer = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : null;
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
  } catch { /* unknown */ }
  const blurred = [...document.querySelectorAll('body *')].filter((el) => {
    const s = getComputedStyle(el);
    const filter = s.backdropFilter || s.webkitBackdropFilter;
    if (!filter || filter === 'none') return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight;
  }).length;
  return {
    renderer,
    devicePixelRatio,
    canvas: canvas ? [canvas.width, canvas.height] : null,
    blurredInView: blurred,
    documentHeight: document.documentElement.scrollHeight,
    mode: document.querySelector('.voyage')?.dataset.mode || null,
  };
}

/**
 * Record one phase: rAF frames and long tasks in the page, and a light trace
 * (display compositor swaps, GPU main-thread tasks) for what was presented.
 */
async function record(page, cdp, ms, during) {
  const events = [];
  const onData = ({ value }) => events.push(...value);
  cdp.on('Tracing.dataCollected', onData);
  await cdp.send('Tracing.start', { traceConfig: { includedCategories: ['viz', 'toplevel'], recordMode: 'recordContinuously' }, transferMode: 'ReportEvents' });
  const started = Date.now();
  await page.evaluate(() => window.__frameProbe.start());
  if (during) await during(); else await page.waitForTimeout(ms);
  await page.evaluate(() => window.__frameProbe.stop());
  const windowMs = Date.now() - started;
  const complete = new Promise((resolve) => cdp.once('Tracing.tracingComplete', resolve));
  await cdp.send('Tracing.end');
  await complete;
  cdp.off('Tracing.dataCollected', onData);
  await page.waitForTimeout(300);   // long-task entries arrive after the task ends
  const { stamps, tasks, gpu } = await page.evaluate(() => window.__frameProbe.collect());
  return { frames: summarizeFrames(stamps), longTasks: summarizeLongTasks(tasks), compositor: compositorStats(events, windowMs), gpu: summarizeGpu(gpu) };
}

/** Wheel through the whole page at about 2000 px a second, the speed of a brisk trackpad flick, then stop. */
async function scrollThrough(page, maxMs) {
  const viewport = page.viewportSize();
  await page.mouse.move(12, Math.round(viewport.height / 2));   // the left gutter: no inner scroller under the pointer
  const started = Date.now();
  for (let step = 0; Date.now() - started < maxMs; step++) {
    await page.mouse.wheel(0, 100);
    await page.waitForTimeout(50);
    if (step % 10 === 9) {
      const atEnd = await page.evaluate(() => scrollY + innerHeight >= document.documentElement.scrollHeight - 2);
      if (atEnd) break;
    }
  }
}

async function openScenario(browser, scenario, opts) {
  const context = await browser.newContext({ viewport: { width: opts.width, height: opts.height }, deviceScaleFactor: opts.dpr, reducedMotion: 'no-preference' });
  const session = buildFakeAdminSession(Math.floor(Date.now() / 1000));
  const log = await installAdminRoutes(context, { buildDir: path.resolve(opts.build), origin: ORIGIN, session });
  await context.addInitScript(installProbe, { forceSync: opts['gpu-method'] === 'sync' });
  await context.addInitScript(seedStorage, { session: scenario === 'voyage' ? { key: SESSION_STORAGE_KEY, value: session } : null, theme: opts.theme, panels: opts.panels !== 'off' });
  if (opts['inject-css']) {
    // A/B experiments: extra CSS added to every page before the app runs (for example, all backdrop filters off)
    const css = readFileSync(opts['inject-css'], 'utf8');
    await context.addInitScript((text) => { document.addEventListener('DOMContentLoaded', () => { const s = document.createElement('style'); s.textContent = text; document.head.appendChild(s); }); }, css);
  }
  if (opts['inject-js']) {
    // A/B experiments on the GPU side: a script run before the app (for example, one that patches a shader source to drop a layer)
    await context.addInitScript({ content: readFileSync(opts['inject-js'], 'utf8') });
  }
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  if (scenario === 'login') {
    await page.goto(`${ORIGIN}/adminlogin`, { waitUntil: 'load' });
    await page.waitForSelector('.preflight', { timeout: 30000 });
    await page.waitForTimeout(2000);
  } else {
    await page.goto(`${ORIGIN}/admindashboard`, { waitUntil: 'load' });
    await page.waitForSelector('.voyage', { timeout: 40000 });
    for (let i = 0; i < 15 && await page.locator('.matrix-entry').count(); i++) { await page.keyboard.press('Escape'); await page.waitForTimeout(600); }
    await page.waitForSelector('canvas.voyage-field', { timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(4000);   // textures and the first data settle before anything is timed
  }
  return { context, page, errors, log };
}

async function measureOnce(browser, scenario, rate, opts) {
  const { context, page, errors, log } = await openScenario(browser, scenario, opts);
  const cdp = await context.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate });
  const facts = await page.evaluate(pageFacts);
  const out = [];
  try {
    if (scenario === 'login') {
      out.push({ phase: 'idle', ...(await record(page, cdp, opts['idle-ms'])) });
    } else {
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(1500);
      const wants = (phase) => !opts.phases || opts.phases.includes(phase);
      if (wants('idle')) out.push({ phase: 'idle', ...(await record(page, cdp, opts['idle-ms'])) });
      if (wants('scroll')) out.push({ phase: 'scroll', ...(await record(page, cdp, 0, () => scrollThrough(page, opts['scroll-ms']))) });
    }
  } finally {
    await context.close();
  }
  return out.map((r) => ({ scenario, cpuRate: rate, ...r, facts, errors, network: { aborted: [...new Set(log.aborted)], writes: [...new Set(log.writes)] } }));
}

/** One Chrome trace of the voyage scrolling at the given CPU rate, reduced to its top costs. */
async function traceVoyage(browser, opts) {
  const { context, page } = await openScenario(browser, 'voyage', opts);
  const cdp = await context.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: opts['trace-rate'] });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(1500);
  const categories = ['devtools.timeline', 'disabled-by-default-devtools.timeline', 'disabled-by-default-devtools.timeline.frame', 'toplevel', 'blink', 'cc', 'gpu', 'viz', 'v8.execute'];
  const events = [];
  cdp.on('Tracing.dataCollected', ({ value }) => events.push(...value));
  const done = new Promise((resolve) => cdp.once('Tracing.tracingComplete', resolve));
  await cdp.send('Tracing.start', { traceConfig: { includedCategories: categories, recordMode: 'recordContinuously' }, transferMode: 'ReportEvents' });
  await page.waitForTimeout(3000);   // the prologue at rest: the Earth turning
  await scrollThrough(page, 10000);
  await cdp.send('Tracing.end');
  await done;
  await context.close();
  writeFileSync(opts.trace, JSON.stringify({ traceEvents: events }));
  return summarizeTrace(events, { limit: 10 });
}

/** Of repeated runs, the one with the median frame rate, ties broken by GPU time (robust against one noisy run). */
function pickMedianRun(runs) {
  const sorted = [...runs].sort((a, b) => (a.frames.medianFps ?? 0) - (b.frames.medianFps ?? 0) || (b.gpu?.medianMs ?? 0) - (a.gpu?.medianMs ?? 0));
  return { ...sorted[Math.floor((sorted.length - 1) / 2)], repeats: runs.map((r) => r.frames.medianFps), gpuRepeats: runs.map((r) => r.gpu?.medianMs ?? null) };
}

/** Measure one profile (viewport, theme, panels): every scenario at every rate it names, each phase once per repeat. */
async function measureProfile(browser, profile, opts) {
  const results = [];
  const run = { ...opts, width: profile.width, height: profile.height, dpr: profile.dpr, theme: profile.theme, panels: profile.panels };
  for (const scenario of profile.scenarios) {
    // a budget names the rates per scenario (the phone runs need not repeat the login page at 4x)
    const rates = profile.limits[scenario] ? Object.keys(profile.limits[scenario]).map(Number).sort((x, y) => x - y) : profile.rates;
    for (const rate of rates) {
      const phases = profile.limits[scenario]?.[rate] ? Object.keys(profile.limits[scenario][rate]) : null;
      const runs = [];
      for (let i = 0; i < opts.repeat; i++) runs.push(...(await measureOnce(browser, scenario, rate, { ...run, phases })));
      for (const phase of [...new Set(runs.map((r) => r.phase))]) results.push({ profile: profile.name, ...pickMedianRun(runs.filter((r) => r.phase === phase)) });
      console.error(`measured ${profile.name}: ${scenario} at ${rate}x`);
    }
  }
  return results;
}

async function main() {
  const opts = readOptions(process.argv.slice(2));
  const budget = opts.budget ? JSON.parse(readFileSync(opts.budget, 'utf8')) : null;
  // With a profiled budget every profile runs (or the ones --profiles names); otherwise the command line is the one profile.
  const cli = { width: opts.width, height: opts.height, dpr: opts.dpr, theme: opts.theme, panels: opts.panels, rates: opts.rates, scenarios: opts.scenarios };
  let profiles = budget ? budgetProfiles(budget, cli) : [{ name: 'default', ...cli, limits: {} }];
  if (opts.profiles) {
    const wanted = opts.profiles.split(',');
    profiles = profiles.filter((p) => wanted.includes(p.name));
    if (!profiles.length) throw new Error(`no profile named ${opts.profiles}`);
  }
  const browser = await chromium.launch({
    channel: 'chromium',   // full Chromium in new headless mode: it composites on the real GPU (Metal on a Mac)
    ...(process.env.PERF_CHROMIUM_PATH ? { executablePath: process.env.PERF_CHROMIUM_PATH } : {}),
    // Playwright's headless default is SwiftShader (software WebGL), which measures the CPU, not the
    // owner's experience; on a Mac ANGLE's Metal backend gives the real GPU. The GPU line of the report
    // names the renderer actually used, so a software run can never pass for a hardware one.
    args: ['--ignore-gpu-blocklist', '--enable-gpu-rasterization', ...(process.platform === 'darwin' ? ['--use-angle=metal'] : [])],
  });
  const byProfile = [];
  let trace = null;
  try {
    for (const profile of profiles) byProfile.push({ profile, results: await measureProfile(browser, profile, opts) });
    if (opts.trace) trace = await traceVoyage(browser, opts);
  } finally {
    await browser.close();
  }

  const load = os.loadavg().map((v) => v.toFixed(1)).join(' ');
  const failures = [];
  for (const { profile, results } of byProfile) {
    console.log(`\n== ${profile.name}: viewport ${profile.width}x${profile.height} at ${profile.dpr}x, theme ${profile.theme}, panels ${profile.panels}`);
    console.log(`logical cores ${os.cpus().length}, load average ${load}`);
    console.log(`GPU: ${results[0]?.facts.renderer || 'unknown'}; GPU time ${results.find((r) => r.gpu?.method)?.gpu.method === 'sync' ? 'by forced sync (approximate, marked ~)' : 'by EXT_disjoint_timer_query_webgl2'}, per rendered frame\n`);
    console.log(formatTable(results));
    for (const r of results) {
      if (r.errors.length) console.log(`page errors in ${r.scenario} ${r.cpuRate}x: ${r.errors.slice(0, 3).join(' | ')}`);
      if (r.network.aborted.length || r.network.writes.length) console.log(`${r.scenario} ${r.cpuRate}x network: aborted ${JSON.stringify(r.network.aborted)}, refused writes ${JSON.stringify(r.network.writes)}`);
    }
    console.log(`\nfacts: ${JSON.stringify(Object.fromEntries(results.filter((r) => r.phase !== 'scroll').map((r) => [`${r.scenario}@${r.cpuRate}x`, r.facts])))}`);
    if (budget) failures.push(...checkFrameBudget(results, profile.limits).map((f) => `${profile.name}: ${f}`));
  }
  if (trace) {
    console.log(`\ntrace (${opts['trace-rate']}x CPU) written to ${opts.trace}`);
    for (const [thread, t] of Object.entries(trace.threads)) console.log(`  ${thread}: busy ${t.busyMs} ms; top ${t.top.slice(0, 6).map((x) => `${x.name} ${x.ms}`).join(', ')}`);
    console.log(`  scripts: ${trace.scripts.slice(0, 5).map((s) => `${s.url} ${s.ms}`).join(', ')}`);
  }
  if (opts.out) {
    mkdirSync(path.dirname(path.resolve(opts.out)), { recursive: true });
    writeFileSync(opts.out, JSON.stringify({ when: new Date().toISOString(), load, options: opts, profiles: byProfile.map(({ profile, results }) => ({ profile, results })), trace }, null, 1));
  }
  if (budget) {
    if (failures.length) {
      console.log(`\nframe budget broken:\n- ${failures.join('\n- ')}`);
      process.exitCode = 1;
    } else {
      console.log('\nframe budget held');
    }
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
