#!/usr/bin/env node
// scripts/record-fixtures.mjs
//
// Snapshots the public tables into e2e/fixtures/<table>.json so the browser
// suite can run without touching the live database.
//
// It reads with the anonymous (publishable) key only, so each fixture holds
// exactly the rows Row Level Security shows a visitor and nothing private.
// Rows are sorted by id and keys alphabetically for stable, reviewable diffs.
//
// Usage:
//   node --env-file=.env.development.local scripts/record-fixtures.mjs
// Requires REACT_APP_SUPABASE_URL and REACT_APP_SUPABASE_ANON_KEY.
// Review the fixture diff like code before committing it.

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { PUBLIC_TABLES } from '../e2e/support/site-map.mjs';

const FIXTURE_DIR = path.resolve('e2e/fixtures');

/**
 * Columns that are readable through the public API but must never be
 * committed to the repository. Their values are replaced with null.
 * Empty since 2026-11-03: the salary column was dropped (Unit 2.5b). The
 * mechanism stays so a future private column can be kept out of fixtures.
 */
export const REDACTED_COLUMNS = Object.freeze({});

/** Returns a copy of the object with keys in alphabetical order. */
export const sortKeys = (row) =>
  Object.fromEntries(Object.keys(row).sort().map((key) => [key, row[key]]));

/** Returns a copy of the row with the table's redacted columns set to null. */
export const redactRow = (table, row, columns = REDACTED_COLUMNS) => {
  const redacted = { ...row };
  for (const column of columns[table] ?? []) {
    if (column in redacted) redacted[column] = null;
  }
  return redacted;
};

/** Redacts, sorts rows by id (string compare) and normalises key order. */
export const normaliseRows = (rows, table = '') =>
  [...rows]
    .map((row) => redactRow(table, row))
    .sort((a, b) => String(a.id).localeCompare(String(b.id)))
    .map(sortKeys);

async function main() {
  const url = process.env.REACT_APP_SUPABASE_URL;
  const key = process.env.REACT_APP_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error('REACT_APP_SUPABASE_URL and REACT_APP_SUPABASE_ANON_KEY must be set (use --env-file).');
  }

  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  await mkdir(FIXTURE_DIR, { recursive: true });

  for (const table of PUBLIC_TABLES) {
    const { data, error } = await supabase.from(table).select('*');
    if (error) {
      throw new Error(`Reading ${table} failed: ${error.message}`);
    }
    const rows = normaliseRows(data ?? [], table);
    await writeFile(path.join(FIXTURE_DIR, `${table}.json`), `${JSON.stringify(rows, null, 2)}\n`);
    process.stdout.write(`${table}: ${rows.length} rows\n`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    process.stderr.write(`record-fixtures: ${error.message}\n`);
    process.exit(1);
  });
}
