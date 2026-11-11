#!/usr/bin/env node
// Writes public/admin/sky/figures.json: the eighteen constellation figures the
// admin dashboard's zodiac sky draws, projected and fitted ahead of time so the
// browser never loads the star catalogue. The maths lives in
// scripts/lib/sky-figures.mjs; this file only reads and writes files.
//
// Usage:
//   node scripts/build-sky-figures.mjs [--lines <file>] [--names <file>]
//     [--stars <file>] [--manifest <file>] [--out <file>] [--check]
//
// Defaults (the sources committed in this repository):
//   --lines     scripts/sky-sources/lines.json     d3-celestial constellation lines
//   --names     scripts/sky-sources/names.json     d3-celestial constellation names
//   --stars     scripts/sky-sources/stars.js       Yale Bright Star Catalogue (window.STARS=[...])
//   --manifest  scripts/sky-sources/manifest.json  drawing reference stars (this project)
//   --out       public/admin/sky/figures.json
//   --check     fails if the file at --out is missing or out of date instead of writing it.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { parseArgs } from 'node:util';
import { buildFiguresDocument, isStale, parseStarsScript, serializeFigures } from './lib/sky-figures.mjs';

const SOURCES = 'scripts/sky-sources';
const { values } = parseArgs({
  options: {
    lines: { type: 'string', default: `${SOURCES}/lines.json` },
    names: { type: 'string', default: `${SOURCES}/names.json` },
    stars: { type: 'string', default: `${SOURCES}/stars.js` },
    manifest: { type: 'string', default: `${SOURCES}/manifest.json` },
    out: { type: 'string', default: 'public/admin/sky/figures.json' },
    check: { type: 'boolean', default: false },
  },
});

const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));

const document = buildFiguresDocument({
  lines: readJson(values.lines),
  names: readJson(values.names),
  stars: parseStarsScript(readFileSync(values.stars, 'utf8')),
  manifest: readJson(values.manifest),
});
const json = serializeFigures(document);

if (values.check) {
  const onDisk = existsSync(values.out) ? readFileSync(values.out, 'utf8') : null;
  if (isStale(onDisk, json)) {
    console.error(`${values.out} is out of date; run node scripts/build-sky-figures.mjs`);
    process.exit(1);
  }
  console.log(`${values.out} is up to date`);
} else {
  mkdirSync(dirname(values.out), { recursive: true });
  writeFileSync(values.out, json);
  const residuals = document.figures
    .map((figure) => `${figure.id} ${figure.art ? `${figure.art.residual}°` : 'no art'}`)
    .join(', ');
  console.log(`wrote ${values.out} (${document.figures.length} figures, ${json.length} bytes)`);
  console.log(`art residuals: ${residuals}`);
}
