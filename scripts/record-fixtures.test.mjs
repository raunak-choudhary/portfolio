import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { REDACTED_COLUMNS, normaliseRows, redactRow, sortKeys } from './record-fixtures.mjs';

describe('record-fixtures helpers', () => {
  it('sorts object keys alphabetically', () => {
    assert.deepEqual(Object.keys(sortKeys({ b: 1, a: 2, c: 3 })), ['a', 'b', 'c']);
  });

  it('redacts configured columns and leaves others untouched', () => {
    assert.ok(REDACTED_COLUMNS.work_experience.includes('salary_range'));
    assert.deepEqual(
      redactRow('work_experience', { id: 1, salary_range: 'private', title: 'Engineer' }),
      { id: 1, salary_range: null, title: 'Engineer' },
    );
    assert.deepEqual(redactRow('projects', { id: 1, salary_range: 'kept' }), { id: 1, salary_range: 'kept' });
  });

  it('normalises rows: redacted, ordered by id, keys sorted, input not mutated', () => {
    const input = [
      { title: 'B', id: 'b', salary_range: 'x' },
      { title: 'A', id: 'a', salary_range: 'y' },
    ];
    const output = normaliseRows(input, 'work_experience');
    assert.deepEqual(output, [
      { id: 'a', salary_range: null, title: 'A' },
      { id: 'b', salary_range: null, title: 'B' },
    ]);
    assert.equal(input[0].salary_range, 'x');
  });
});
