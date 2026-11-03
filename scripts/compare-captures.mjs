#!/usr/bin/env node
// scripts/compare-captures.mjs
//
// Compares two capture folders and prints a review report.
// Exits 1 when any difference is not covered by the allowlist.
//
// Usage:
//   node scripts/compare-captures.mjs <before-dir> <after-dir> [--allowlist e2e/allowlists/<file>.json]

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { compareCaptures, formatReport } from './lib/compare-captures.mjs';

async function readJson(file) {
  return JSON.parse(await readFile(file, 'utf8'));
}

async function main(argv) {
  const [beforeDir, afterDir] = argv.filter((arg) => !arg.startsWith('--'));
  const allowlistIndex = argv.indexOf('--allowlist');
  if (!beforeDir || !afterDir) {
    throw new Error('usage: compare-captures <before-dir> <after-dir> [--allowlist file]');
  }

  const before = await readJson(path.join(beforeDir, 'capture-log.json'));
  const after = await readJson(path.join(afterDir, 'capture-log.json'));
  const allowlist = allowlistIndex >= 0 ? await readJson(argv[allowlistIndex + 1]) : [];

  const findings = compareCaptures(before, after, allowlist);
  const report = formatReport(findings);
  process.stdout.write(`${report}\n`);
  await writeFile(path.join(afterDir, 'comparison-report.json'), `${JSON.stringify(findings, null, 2)}\n`);

  return findings.some((finding) => !finding.expected) ? 1 : 0;
}

main(process.argv.slice(2))
  .then((code) => process.exit(code))
  .catch((error) => {
    process.stderr.write(`compare-captures: ${error.message}\n`);
    process.exit(2);
  });
