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
//          [--budget scripts/frame-budget.json] [--inject-css experiment.css]
//
// Run it on an otherwise quiet machine: builds and test suites running at
// the same time take the same CPU and GPU and make every number worse.

import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SESSION_STORAGE_KEY, buildFakeAdminSession, installAdminRoutes } from './lib/admin-mocks.mjs';
import { checkFrameBudget, formatTable, summarizeFrames, summarizeLongTasks } from './lib/frame-stats.mjs';
import { compositorStats, summarizeTrace } from './lib/trace-summary.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(REPO);   // the e2e fixture loader resolves e2e/fixtures from the working directory

/** A localhost origin nothing listens on: every request to it is answered by the route. */
const ORIGIN = 'http://localhost:3217';

function readOptions(argv) {
  const o = { build: 'build', rates: '1,4', scenarios: 'login,voyage', width: 1440, height: 900, dpr: 2, theme: 'dark', panels: 'on', repeat: 1, out: '', trace: '', 'trace-rate': 4, budget: '', 'idle-ms': 5000, 'scroll-ms': 25000, 'inject-css': '' };
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i].replace(/^--/, '');
    if (!(key in o)) throw new Error(`unknown option --${key}`);
    const value = argv[++i];
    o[key] = typeof o[key] === 'number' ? Number(value) : value;
  }
  return { ...o, rates: o.rates.split(',').map(Number), scenarios: o.scenarios.split(',') };
}

/** Runs in the page before any app code: the probe that records frames and long tasks. */
function installProbe() {
  let stamps = [], startAt = 0, endAt = Infinity, running = false, handle = 0;
  const tasks = [];
  const loop = (t) => { if (!running) return; stamps.push(t); handle = requestAnimationFrame(loop); };
  try {
    new PerformanceObserver((list) => { for (const e of list.getEntries()) tasks.push({ start: e.startTime, duration: e.duration }); }).observe({ type: 'longtask' });
  } catch { /* no long task support: the count stays zero and the report says so through frames */ }
  window.__frameProbe = {
    start() { stamps = []; startAt = performance.now(); endAt = Infinity; running = true; handle = requestAnimationFrame(loop); },
    stop() { running = false; cancelAnimationFrame(handle); endAt = performance.now(); },
    collect() { return { stamps, tasks: tasks.filter((t) => t.start >= startAt && t.start <= endAt) }; },
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
  const { stamps, tasks } = await page.evaluate(() => window.__frameProbe.collect());
  return { frames: summarizeFrames(stamps), longTasks: summarizeLongTasks(tasks), compositor: compositorStats(events, windowMs) };
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
  await context.addInitScript(installProbe);
  await context.addInitScript(seedStorage, { session: scenario === 'voyage' ? { key: SESSION_STORAGE_KEY, value: session } : null, theme: opts.theme, panels: opts.panels !== 'off' });
  if (opts['inject-css']) {
    // A/B experiments: extra CSS added to every page before the app runs (for example, all backdrop filters off)
    const css = readFileSync(opts['inject-css'], 'utf8');
    await context.addInitScript((text) => { document.addEventListener('DOMContentLoaded', () => { const s = document.createElement('style'); s.textContent = text; document.head.appendChild(s); }); }, css);
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
      out.push({ phase: 'idle', ...(await record(page, cdp, opts['idle-ms'])) });
      out.push({ phase: 'scroll', ...(await record(page, cdp, 0, () => scrollThrough(page, opts['scroll-ms']))) });
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

/** Of repeated runs, the one with the median frame rate (robust against one noisy run). */
function pickMedianRun(runs) {
  const sorted = [...runs].sort((a, b) => (a.frames.medianFps ?? 0) - (b.frames.medianFps ?? 0));
  return { ...sorted[Math.floor((sorted.length - 1) / 2)], repeats: runs.map((r) => r.frames.medianFps) };
}

async function main() {
  const opts = readOptions(process.argv.slice(2));
  const browser = await chromium.launch({
    channel: 'chromium',   // full Chromium in new headless mode: it composites on the real GPU (Metal on a Mac)
    ...(process.env.PERF_CHROMIUM_PATH ? { executablePath: process.env.PERF_CHROMIUM_PATH } : {}),
    // Playwright's headless default is SwiftShader (software WebGL), which measures the CPU, not the
    // owner's experience; on a Mac ANGLE's Metal backend gives the real GPU. The GPU line of the report
    // names the renderer actually used, so a software run can never pass for a hardware one.
    args: ['--ignore-gpu-blocklist', '--enable-gpu-rasterization', ...(process.platform === 'darwin' ? ['--use-angle=metal'] : [])],
  });
  const results = [];
  let trace = null;
  try {
    for (const scenario of opts.scenarios) {
      for (const rate of opts.rates) {
        const runs = [];
        for (let i = 0; i < opts.repeat; i++) runs.push(...(await measureOnce(browser, scenario, rate, opts)));
        for (const phase of [...new Set(runs.map((r) => r.phase))]) results.push(pickMedianRun(runs.filter((r) => r.phase === phase)));
        console.error(`measured ${scenario} at ${rate}x`);
      }
    }
    if (opts.trace) trace = await traceVoyage(browser, opts);
  } finally {
    await browser.close();
  }

  const load = os.loadavg().map((v) => v.toFixed(1)).join(' ');
  console.log(`\nlogical cores ${os.cpus().length}, load average ${load}, viewport ${opts.width}x${opts.height} at ${opts.dpr}x, theme ${opts.theme}, panels ${opts.panels}`);
  console.log(`GPU: ${results[0]?.facts.renderer || 'unknown'}\n`);
  console.log(formatTable(results));
  for (const r of results) {
    if (r.errors.length) console.log(`page errors in ${r.scenario} ${r.cpuRate}x: ${r.errors.slice(0, 3).join(' | ')}`);
    if (r.network.aborted.length || r.network.writes.length) console.log(`${r.scenario} ${r.cpuRate}x network: aborted ${JSON.stringify(r.network.aborted)}, refused writes ${JSON.stringify(r.network.writes)}`);
  }
  console.log(`\nfacts: ${JSON.stringify(Object.fromEntries(results.filter((r) => r.phase !== 'scroll').map((r) => [`${r.scenario}@${r.cpuRate}x`, r.facts])))}`);
  if (trace) {
    console.log(`\ntrace (${opts['trace-rate']}x CPU) written to ${opts.trace}`);
    for (const [thread, t] of Object.entries(trace.threads)) console.log(`  ${thread}: busy ${t.busyMs} ms; top ${t.top.slice(0, 6).map((x) => `${x.name} ${x.ms}`).join(', ')}`);
    console.log(`  scripts: ${trace.scripts.slice(0, 5).map((s) => `${s.url} ${s.ms}`).join(', ')}`);
  }
  if (opts.out) {
    mkdirSync(path.dirname(path.resolve(opts.out)), { recursive: true });
    writeFileSync(opts.out, JSON.stringify({ when: new Date().toISOString(), load, options: opts, results, trace }, null, 1));
  }
  if (opts.budget) {
    const failures = checkFrameBudget(results, JSON.parse(readFileSync(opts.budget, 'utf8')));
    if (failures.length) {
      console.log(`\nframe budget broken:\n- ${failures.join('\n- ')}`);
      process.exitCode = 1;
    } else {
      console.log('\nframe budget held');
    }
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
