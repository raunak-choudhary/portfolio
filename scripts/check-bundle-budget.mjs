#!/usr/bin/env node
// scripts/check-bundle-budget.mjs
//
// Measures every JavaScript chunk of a production build gzipped and checks it
// against scripts/bundle-budget.json. Fails (exit 1) when the public bundle has
// grown past its baseline or a split chunk is over the cap.
//
// Usage: node scripts/check-bundle-budget.mjs [--root build] [--update-baseline]
//   --update-baseline  records the current main chunk size as the new baseline
//                      (do this deliberately, in the same commit as the change
//                      that justified it)

import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { checkBudget, describeChunks, gzipSize } from './lib/bundle-budget.mjs';

const BUDGET_FILE = 'scripts/bundle-budget.json';

async function measure(root) {
  const dir = path.join(root, 'static', 'js');
  const names = (await readdir(dir)).filter((n) => n.endsWith('.js'));
  const chunks = [];
  for (const name of names) chunks.push({ file: `static/js/${name}`, gzip: gzipSize(await readFile(path.join(dir, name))) });
  return chunks.sort((a, b) => b.gzip - a.gzip);
}

async function main(argv) {
  const rootIndex = argv.indexOf('--root');
  const root = rootIndex >= 0 ? argv[rootIndex + 1] : 'build';
  const budget = JSON.parse(await readFile(BUDGET_FILE, 'utf8'));
  const chunks = await measure(root);
  process.stdout.write(`${describeChunks(chunks)}\n`);
  if (argv.includes('--update-baseline')) {
    const main = chunks.find((c) => /(^|\/)main\.[0-9a-f]+\.js$/.test(c.file));
    if (!main) { process.stderr.write('no main chunk to record\n'); return 1; }
    budget.mainBaselineKb = Math.ceil(main.gzip / 1024);
    budget.recordedAt = new Date().toISOString().slice(0, 10);
    await writeFile(BUDGET_FILE, `${JSON.stringify(budget, null, 2)}\n`);
    process.stdout.write(`baseline recorded: main ${budget.mainBaselineKb} KB gzip\n`);
    return 0;
  }
  const { problems } = checkBudget(chunks, budget);
  for (const problem of problems) process.stderr.write(`bundle budget: ${problem}\n`);
  if (!problems.length) process.stdout.write(`bundle budget: within limits (main baseline ${budget.mainBaselineKb} KB + ${budget.mainAllowanceKb} KB, split chunks under ${budget.otherChunkMaxKb} KB)\n`);
  return problems.length ? 1 : 0;
}

process.exitCode = await main(process.argv.slice(2));
