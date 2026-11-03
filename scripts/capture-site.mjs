#!/usr/bin/env node
// scripts/capture-site.mjs
//
// Runs a capture of either the live site or the local build.
//
//   node scripts/capture-site.mjs --live  --out <dir>   # https://www.raunakchoudhary.com, real data
//   node scripts/capture-site.mjs --local --out <dir>   # build/ on localhost, real data (no fixtures)
//   node scripts/capture-site.mjs --local --fixtures --out <dir>  # build/ with recorded fixtures
//
// A local capture needs a fresh `npm run build:e2e` (fixtures) or
// `npm run build` (real data) first. Live-data local captures read the real
// database with the public key only; analytics stay off in those builds.

import { spawnSync } from 'node:child_process';
import path from 'node:path';

const LIVE_URL = 'https://www.raunakchoudhary.com';

const argv = process.argv.slice(2);
const outIndex = argv.indexOf('--out');
const outDir = outIndex >= 0 ? path.resolve(argv[outIndex + 1]) : null;
const live = argv.includes('--live');
const local = argv.includes('--local');

if (!outDir || live === local) {
  process.stderr.write('usage: capture-site (--live | --local [--fixtures]) --out <dir>\n');
  process.exit(2);
}

const env = { ...process.env, CAPTURE_DIR: outDir };
if (live) {
  env.E2E_BASE_URL = LIVE_URL;
} else if (!argv.includes('--fixtures')) {
  // Local build against the real database: serve it, but skip fixture routing.
  env.E2E_REAL_DATA = '1';
}

const result = spawnSync('npx', ['playwright', 'test', 'e2e/capture.spec.mjs'], { stdio: 'inherit', env });
process.exit(result.status ?? 1);
