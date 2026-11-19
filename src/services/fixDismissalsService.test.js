// Unit tests for the fix-queue dismissals service. Supabase is faked; no
// request leaves the test.

import { DISMISSALS_NOT_SET_UP, NOTE_MAX, cleanNote, dismiss, listDismissals, restore, toDismissal } from './fixDismissalsService';
import { failureKind } from './voyageRecords';
import { supabase } from './supabaseClient';

jest.mock('./supabaseClient', () => ({ supabase: { from: jest.fn() } }));
jest.mock('./dataService', () => ({ deleteProject: jest.fn() }));

/** A chainable query builder that records calls and resolves with `result`. */
function query(result) {
  const calls = [];
  const chain = new Proxy({}, {
    get(_, op) {
      if (op === 'then') return (res, rej) => Promise.resolve(result).then(res, rej);
      if (op === 'calls') return calls;
      return (...args) => { calls.push([op, ...args]); return chain; };
    },
  });
  return chain;
}

const stored = { id: 'd1', rule_key: 'projects:images', record_id: null, note: 'Not for this one', created_at: '2026-11-19T12:00:00Z' };

beforeEach(() => jest.clearAllMocks());

describe('toDismissal and cleanNote', () => {
  it('maps a row to the queue shape', () => {
    expect(toDismissal(stored)).toEqual({ id: 'd1', ruleKey: 'projects:images', recordId: null, note: 'Not for this one', createdAt: '2026-11-19T12:00:00Z' });
  });

  it('trims the reason, folds spaces, caps it and stores empty as null', () => {
    expect(cleanNote('  a \n b  ')).toBe('a b');
    expect(cleanNote('')).toBeNull();
    expect(cleanNote(undefined)).toBeNull();
    expect(cleanNote('x'.repeat(200))).toHaveLength(NOTE_MAX);
  });
});

describe('listDismissals', () => {
  it('reads every dismissal newest first', async () => {
    const q = query({ data: [stored], error: null });
    supabase.from.mockReturnValue(q);
    await expect(listDismissals()).resolves.toEqual([toDismissal(stored)]);
    expect(supabase.from).toHaveBeenCalledWith('admin_fix_dismissals');
    expect(q.calls).toContainEqual(['order', 'created_at', { ascending: false }]);
  });

  it.each([
    [{ code: '42P01' }, DISMISSALS_NOT_SET_UP],
    [{ code: 'PGRST205' }, DISMISSALS_NOT_SET_UP],
    [{ status: 401, message: 'JWT expired' }, 'SESSION_EXPIRED'],
    [{ code: '42501', message: 'permission denied' }, 'SECOND_FACTOR_REQUIRED'],
  ])('throws a typed error for %p', async (error, code) => {
    supabase.from.mockReturnValue(query({ data: null, error }));
    await expect(listDismissals()).rejects.toMatchObject({ code });
  });

  it('lets a network failure read as network', async () => {
    supabase.from.mockReturnValue(query(Promise.reject(new TypeError('Load failed'))));
    const thrown = await listDismissals().catch((e) => e);
    expect(failureKind(thrown, true)).toBe('network');
  });
});

describe('dismiss', () => {
  it('stores a whole-group dismissal with a clean note', async () => {
    const q = query({ data: stored, error: null });
    supabase.from.mockReturnValue(q);
    await expect(dismiss('projects:images', null, '  Not for this one ')).resolves.toEqual(toDismissal(stored));
    expect(q.calls[0]).toEqual(['insert', [{ rule_key: 'projects:images', record_id: null, note: 'Not for this one' }]]);
  });

  it('stores a single-item dismissal with the id as text and no note', async () => {
    const q = query({ data: { ...stored, record_id: '7', note: null }, error: null });
    supabase.from.mockReturnValue(q);
    await dismiss('skills:skill_category', 7);
    expect(q.calls[0]).toEqual(['insert', [{ rule_key: 'skills:skill_category', record_id: '7', note: null }]]);
  });

  it('returns the stored row when the item is already dismissed', async () => {
    const insert = query({ data: null, error: { code: '23505', message: 'duplicate key' } });
    const lookup = query({ data: stored, error: null });
    supabase.from.mockReturnValueOnce(insert).mockReturnValueOnce(lookup);
    await expect(dismiss('projects:images', null)).resolves.toEqual(toDismissal(stored));
    expect(lookup.calls).toContainEqual(['is', 'record_id', null]);
  });

  it('looks up an item dismissal by its record id', async () => {
    supabase.from
      .mockReturnValueOnce(query({ data: null, error: { code: '23505' } }))
      .mockReturnValueOnce(query({ data: { ...stored, record_id: 'p1' }, error: null }));
    await expect(dismiss('projects:images', 'p1')).resolves.toMatchObject({ recordId: 'p1' });
  });

  it('refuses an empty rule without a request', async () => {
    await expect(dismiss('  ', null)).rejects.toThrow('A fix rule is required.');
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('throws typed errors', async () => {
    supabase.from.mockReturnValue(query({ data: null, error: { code: '42501', message: 'new row violates row-level security policy' } }));
    await expect(dismiss('projects:images')).rejects.toMatchObject({ code: 'SECOND_FACTOR_REQUIRED' });
  });
});

describe('restore', () => {
  it('deletes the dismissal by id', async () => {
    const q = query({ data: [{ id: 'd1' }], error: null });
    supabase.from.mockReturnValue(q);
    await expect(restore('d1')).resolves.toBeUndefined();
    expect(q.calls.slice(0, 2)).toEqual([['delete'], ['eq', 'id', 'd1']]);
  });

  it('counts an item already brought back as done', async () => {
    supabase.from.mockReturnValueOnce(query({ data: [], error: null })).mockReturnValueOnce(query({ data: null, error: null }));
    await expect(restore('d1')).resolves.toBeUndefined();
  });

  it('reports a silent refusal as needing the second factor', async () => {
    supabase.from.mockReturnValueOnce(query({ data: [], error: null })).mockReturnValueOnce(query({ data: { id: 'd1' }, error: null }));
    await expect(restore('d1')).rejects.toMatchObject({ code: 'SECOND_FACTOR_REQUIRED' });
  });

  it('throws typed errors and refuses a missing id', async () => {
    supabase.from.mockReturnValue(query({ data: null, error: { status: 401, message: 'JWT expired' } }));
    await expect(restore('d1')).rejects.toMatchObject({ code: 'SESSION_EXPIRED' });
    await expect(restore('')).rejects.toThrow('No item selected.');
  });
});
