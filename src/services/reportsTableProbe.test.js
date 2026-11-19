// Unit tests for the analytics_reports existence probe. Supabase is faked;
// no request leaves the test.

import { reportsTableMissing } from './reportsTableProbe';
import { supabase } from './supabaseClient';

jest.mock('./supabaseClient', () => ({ supabase: { from: jest.fn() } }));

/** A builder whose limit() resolves to the given result (or rejects). */
const query = (result, reject = false) => {
  const builder = { select: jest.fn(() => builder), limit: jest.fn(() => (reject ? Promise.reject(result) : Promise.resolve(result))) };
  return builder;
};

describe('reportsTableMissing', () => {
  it('reads one id from analytics_reports', async () => {
    const builder = query({ data: [], error: null });
    supabase.from.mockReturnValue(builder);
    await expect(reportsTableMissing()).resolves.toBe(false);
    expect(supabase.from).toHaveBeenCalledWith('analytics_reports');
    expect(builder.select).toHaveBeenCalledWith('id');
    expect(builder.limit).toHaveBeenCalledWith(1);
  });

  it.each(['42P01', 'PGRST205'])('says missing for %s', async (code) => {
    supabase.from.mockReturnValue(query({ data: null, error: { code, message: 'relation does not exist' } }));
    await expect(reportsTableMissing()).resolves.toBe(true);
  });

  it.each([
    ['a permission error', { code: '42501' }],
    ['an expired session', { code: 'PGRST301', status: 401 }],
    ['an error without a code', { message: 'boom' }],
  ])('says present for %s', async (_, error) => {
    supabase.from.mockReturnValue(query({ data: null, error }));
    await expect(reportsTableMissing()).resolves.toBe(false);
  });

  it('says present when the request itself fails, so the caller shows its error', async () => {
    supabase.from.mockReturnValue(query(new Error('offline'), true));
    await expect(reportsTableMissing()).resolves.toBe(false);
  });
});
