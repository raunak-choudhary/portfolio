#!/usr/bin/env node
// Writes supabase/seed/projects-import.sql from supabase/seed/projects.json.
// Usage: node scripts/build-projects-import.mjs [--check]
//   --check  fails if the committed SQL is out of date instead of writing it.
import { readFileSync, writeFileSync } from 'node:fs';
import { buildImportSql } from './lib/projects-import.mjs';

const SEED = 'supabase/seed/projects.json';
const OUT = 'supabase/seed/projects-import.sql';

const sql = buildImportSql(JSON.parse(readFileSync(SEED, 'utf8')));
if (process.argv.includes('--check')) {
  if (readFileSync(OUT, 'utf8') !== sql) {
    console.error(`${OUT} is out of date; run node scripts/build-projects-import.mjs`);
    process.exit(1);
  }
  console.log(`${OUT} is up to date`);
} else {
  writeFileSync(OUT, sql);
  console.log(`wrote ${OUT}`);
}
