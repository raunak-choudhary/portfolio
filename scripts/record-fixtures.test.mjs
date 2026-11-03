import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { REDACTED_COLUMNS, normaliseRows, redactRow, sortKeys } from './record-fixtures.mjs';

describe('record-fixtures helpers', () => {
  it('sorts object keys alphabetically', () => {
    assert.deepEqual(Object.keys(sortKeys({ b: 1, a: 2, c: 3 })), ['a', 'b', 'c']);
  });

  it('redacts the configured columns of a table and leaves other tables untouched', () => {
    const columns = { work_experience: ['private_note'] };
    assert.deepEqual(
      redactRow('work_experience', { id: 1, private_note: 'private', title: 'Engineer' }, columns),
      { id: 1, private_note: null, title: 'Engineer' },
    );
    assert.deepEqual(redactRow('projects', { id: 1, private_note: 'kept' }, columns), { id: 1, private_note: 'kept' });
  });

  it('redacts nothing by default: every private column has been dropped from the database', () => {
    assert.deepEqual(REDACTED_COLUMNS, {});
    assert.deepEqual(redactRow('work_experience', { id: 1, title: 'Engineer' }), { id: 1, title: 'Engineer' });
  });

  it('normalises rows: ordered by id, keys sorted, input not mutated', () => {
    const input = [
      { title: 'B', id: 'b', team_size: 'x' },
      { title: 'A', id: 'a', team_size: 'y' },
    ];
    const output = normaliseRows(input, 'work_experience');
    assert.deepEqual(output, [
      { id: 'a', team_size: 'y', title: 'A' },
      { id: 'b', team_size: 'x', title: 'B' },
    ]);
    assert.equal(input[0].title, 'B');
  });
});
