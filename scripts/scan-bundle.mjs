#!/usr/bin/env node
// scripts/scan-bundle.mjs
//
// Fails when a production build contains anything that must not ship.
// See scripts/lib/bundle-scan.mjs for the checks.
//
// Usage:
//   node scripts/scan-bundle.mjs [--root build] [--production] [--reject-any-jwt] [--reject-inline-scripts]
//
//   --production             also require analytics compiled as enabled; run on
//                            the exact folder about to be uploaded
//   --reject-any-jwt         after the key cutover: no JWT keys at all
//   --reject-inline-scripts  once the security policy forbids inline scripts

import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { scanBuild } from './lib/bundle-scan.mjs';

async function listJavaScript(directory) {
  const entries = await readdir(directory, { withFileTypes: true, recursive: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.js'))
    .map((entry) => path.join(entry.parentPath ?? entry.path, entry.name));
}

async function main(argv) {
  const rootIndex = argv.indexOf('--root');
  const root = rootIndex >= 0 ? argv[rootIndex + 1] : 'build';

  const html = await readFile(path.join(root, 'index.html'), 'utf8');
  const files = await listJavaScript(root);
  const scripts = await Promise.all(
    files.map(async (file) => ({ name: path.relative(root, file), text: await readFile(file, 'utf8') })),
  );

  const problems = scanBuild({ html, scripts }, {
    requireAnalytics: argv.includes('--production'),
    rejectAnyJwt: argv.includes('--reject-any-jwt'),
    rejectInlineScripts: argv.includes('--reject-inline-scripts'),
  });

  if (problems.length === 0) {
    process.stdout.write(`scan-bundle: ${scripts.length} script files clean\n`);
    return 0;
  }
  for (const problem of problems) {
    process.stderr.write(`scan-bundle: ${problem.check} in ${problem.file}: ${problem.detail}\n`);
  }
  return 1;
}

main(process.argv.slice(2))
  .then((code) => process.exit(code))
  .catch((error) => {
    process.stderr.write(`scan-bundle: ${error.message}\n`);
    process.exit(2);
  });
