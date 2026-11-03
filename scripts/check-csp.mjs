#!/usr/bin/env node
// scripts/check-csp.mjs
//
// Verifies that the security headers in public/.htaccess match what the
// site needs. Runs in CI and before every deploy.
//
//   - Inventories asset hosts from the public components and the recorded
//     fixtures (scripts/lib/asset-hosts.mjs).
//   - Checks the policy and companion headers (scripts/lib/csp.mjs).
//
// Usage: node scripts/check-csp.mjs [--verbose]
// Exit code 1 when a problem is found.

import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { collectAssetHosts } from './lib/asset-hosts.mjs';
import { checkSecurityHeaders, supabaseHostFromIndexHtml } from './lib/csp.mjs';

/** Source folders that render the public site; admin screens are excluded. */
const PUBLIC_SOURCE_DIRS = ['src/components/sections', 'src/components/common', 'src/pages'];
const FIXTURE_DIR = 'e2e/fixtures';

async function readSources() {
  const texts = [];
  for (const dir of PUBLIC_SOURCE_DIRS) {
    const entries = await readdir(dir, { withFileTypes: true, recursive: true });
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.js') || entry.name.endsWith('.test.js')) continue;
      texts.push(await readFile(path.join(entry.parentPath ?? entry.path, entry.name), 'utf8'));
    }
  }
  return texts;
}

async function readFixtures() {
  const rows = [];
  for (const name of await readdir(FIXTURE_DIR)) {
    if (name.endsWith('.json')) rows.push(...JSON.parse(await readFile(path.join(FIXTURE_DIR, name), 'utf8')));
  }
  return rows;
}

async function main(argv) {
  const verbose = argv.includes('--verbose');
  const [htaccess, indexHtml, sources, fixtures] = await Promise.all([
    readFile('public/.htaccess', 'utf8'),
    readFile('public/index.html', 'utf8'),
    readSources(),
    readFixtures(),
  ]);

  const supabaseHost = supabaseHostFromIndexHtml(indexHtml);
  if (!supabaseHost) {
    process.stderr.write('check-csp: no Supabase preconnect hint found in public/index.html\n');
    return 1;
  }

  const hosts = collectAssetHosts({ sources, fixtures });
  if (verbose) {
    process.stdout.write(`image hosts: ${[...hosts.image].join(', ')}\n`);
    process.stdout.write(`document hosts: ${[...hosts.document].join(', ')}\n`);
  }

  const problems = checkSecurityHeaders({
    htaccess,
    indexHtml,
    supabaseHost,
    imageHosts: hosts.image,
    documentHosts: hosts.document,
  });

  if (problems.length === 0) {
    process.stdout.write(`check-csp: policy allows ${hosts.image.size} image host(s) and ${hosts.document.size} document host(s); headers consistent\n`);
    return 0;
  }
  for (const problem of problems) process.stderr.write(`check-csp: ${problem}\n`);
  return 1;
}

main(process.argv.slice(2))
  .then((code) => process.exit(code))
  .catch((error) => {
    process.stderr.write(`check-csp: ${error.message}\n`);
    process.exit(2);
  });
