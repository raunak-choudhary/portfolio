// scripts/lib/bundle-budget.mjs
//
// Size budget for the production build, measured gzipped, the way the
// browser receives it. Two rules protect two different things:
//
//   - the public bundle (main chunk) may not grow past its recorded baseline
//     plus a small allowance, so the admin's libraries never leak into the
//     pages visitors load;
//   - every other chunk (the admin, loaded on demand) stays under a cap.
//
// Pure functions; the CLI in scripts/check-bundle-budget.mjs does the I/O.

import { gzipSync } from 'node:zlib';

/** Gzipped size in bytes of a buffer or string. */
export const gzipSize = (content) => gzipSync(Buffer.isBuffer(content) ? content : Buffer.from(content)).length;

/** CRA names the entry chunk main.<hash>.js; everything else is split code. */
export const isMainChunk = (fileName) => /(^|\/)main\.[0-9a-f]+\.js$/.test(fileName);

/**
 * Checks measured chunk sizes against the budget.
 * @param {Array<{file: string, gzip: number}>} chunks
 * @param {{mainBaselineKb: number, mainAllowanceKb: number, otherChunkMaxKb: number}} budget
 * @returns {{problems: string[], main: {file: string, gzip: number}|null, others: Array<{file: string, gzip: number}>}}
 */
export function checkBudget(chunks, budget) {
  const problems = [];
  const main = chunks.find((c) => isMainChunk(c.file)) || null;
  const others = chunks.filter((c) => !isMainChunk(c.file));
  const kb = (bytes) => Math.round(bytes / 102.4) / 10;
  if (!main) problems.push('no main chunk found in the build');
  else if (kb(main.gzip) > budget.mainBaselineKb + budget.mainAllowanceKb) {
    problems.push(`main chunk is ${kb(main.gzip)} KB gzip, over the baseline ${budget.mainBaselineKb} KB plus ${budget.mainAllowanceKb} KB allowance`);
  }
  for (const chunk of others) {
    if (kb(chunk.gzip) > budget.otherChunkMaxKb) problems.push(`${chunk.file} is ${kb(chunk.gzip)} KB gzip, over the ${budget.otherChunkMaxKb} KB cap for a split chunk`);
  }
  return { problems, main, others };
}

/** Human line per chunk for the report. */
export const describeChunks = (chunks) => chunks.map((c) => `${c.file}: ${(c.gzip / 1024).toFixed(1)} KB gzip`).join('\n');
