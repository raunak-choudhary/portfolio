import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { checkBudget, describeChunks, gzipSize, isMainChunk } from './bundle-budget.mjs';

const budget = { mainBaselineKb: 330, mainAllowanceKb: 5, otherChunkMaxKb: 300 };

describe('bundle budget', () => {
  it('tells the main chunk from split chunks by CRA naming', () => {
    assert.equal(isMainChunk('static/js/main.1a5272a2.js'), true);
    assert.equal(isMainChunk('static/js/453.0b1c2d3e.chunk.js'), false);
    assert.equal(isMainChunk('static/js/main.1a5272a2.js.map'), false);
  });

  it('measures gzipped size, not raw size', () => {
    const raw = 'a'.repeat(100000);
    assert.ok(gzipSize(raw) < 1000);
  });

  it('passes a build inside the budget and reports the chunks', () => {
    const chunks = [{ file: 'static/js/main.abc123.js', gzip: 330 * 1024 }, { file: 'static/js/453.def456.chunk.js', gzip: 280 * 1024 }];
    const result = checkBudget(chunks, budget);
    assert.deepEqual(result.problems, []);
    assert.equal(result.main.file, 'static/js/main.abc123.js');
    assert.equal(result.others.length, 1);
    assert.match(describeChunks(chunks), /main\.abc123\.js: 330\.0 KB gzip/);
  });

  it('fails when the public bundle grows past the allowance', () => {
    const result = checkBudget([{ file: 'static/js/main.abc123.js', gzip: 336 * 1024 }], budget);
    assert.equal(result.problems.length, 1);
    assert.match(result.problems[0], /main chunk is 336 KB gzip, over the baseline 330 KB/);
  });

  it('fails when a split chunk passes the cap, and when there is no main chunk', () => {
    const big = checkBudget([{ file: 'static/js/main.abc123.js', gzip: 100 }, { file: 'static/js/9.x.chunk.js', gzip: 301 * 1024 }], budget);
    assert.match(big.problems[0], /over the 300 KB cap/);
    const none = checkBudget([{ file: 'static/js/9.x.chunk.js', gzip: 10 }], budget);
    assert.match(none.problems[0], /no main chunk/);
  });
});
