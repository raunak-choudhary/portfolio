// Unit tests for the reports service: the archive read and "Generate now",
// and the mapping of every failure to a fixed sentence. Supabase is faked;
// no request leaves the test.

import { REPORT_FUNCTION, REPORT_MESSAGES, generateReport, listReports } from './reportsService';
import { supabase } from './supabaseClient';

jest.mock('./supabaseClient', () => ({
  supabase: { functions: { invoke: jest.fn() }, from: jest.fn() }
}));

/** What supabase-js returns for a non-2xx answer: a FunctionsHttpError whose context is the response. */
const httpError = (status, body) => ({
  name: 'FunctionsHttpError',
  context: { status, clone: () => ({ json: () => (body === undefined ? Promise.reject(new Error('not json')) : Promise.resolve(body)) }) }
});

/** A query builder whose order() resolves to the given result. */
const query = (result) => {
  const builder = { select: jest.fn(() => builder), order: jest.fn(() => Promise.resolve(result)) };
  return builder;
};

describe('listReports', () => {
  it('reads analytics_reports newest first', async () => {
    const rows = [{ id: 'b', quarter: 'Q4 2026' }, { id: 'a', quarter: 'Q3 2026' }];
    const builder = query({ data: rows, error: null });
    supabase.from.mockReturnValue(builder);

    await expect(listReports()).resolves.toEqual({ success: true, data: rows });
    expect(supabase.from).toHaveBeenCalledWith('analytics_reports');
    expect(builder.order).toHaveBeenCalledWith('created_at', { ascending: false });
  });

  it('returns an empty list when there are no rows', async () => {
    supabase.from.mockReturnValue(query({ data: null, error: null }));
    await expect(listReports()).resolves.toEqual({ success: true, data: [] });
  });

  it.each([
    [{ status: 401, message: 'JWT expired' }, 'SESSION_EXPIRED'],
    [{ code: '42501', message: 'permission denied for table analytics_reports' }, 'SECOND_FACTOR_REQUIRED'],
    [{ message: 'something else' }, 'LOAD_FAILED']
  ])('maps a read error to %p', async (error, code) => {
    supabase.from.mockReturnValue(query({ data: null, error }));
    await expect(listReports()).resolves.toEqual({ success: false, error: { code, message: REPORT_MESSAGES[code] } });
  });

  it('reports a thrown fetch as a network failure', async () => {
    supabase.from.mockImplementation(() => { throw new Error('offline'); });
    const result = await listReports();
    expect(result.error.code).toBe('NETWORK');
  });
});

describe('generateReport', () => {
  it('calls the function and returns the stored report', async () => {
    const data = { id: 'r1', quarter: 'Q4 2026', partial: true, email_status: 'sent' };
    supabase.functions.invoke.mockResolvedValue({ data: { success: true, data }, error: null });

    await expect(generateReport()).resolves.toEqual({ success: true, data });
    expect(supabase.functions.invoke).toHaveBeenCalledWith(REPORT_FUNCTION, { body: {} });
  });

  it('treats an answer without an id as a failure', async () => {
    supabase.functions.invoke.mockResolvedValue({ data: { success: true, data: {} }, error: null });
    const result = await generateReport();
    expect(result.error.code).toBe('UNKNOWN');
  });

  it.each([
    [401, { code: 'unauthorized' }, 'SESSION_EXPIRED'],
    [403, { code: 'insufficient_aal' }, 'SECOND_FACTOR_REQUIRED'],
    [403, { code: 'forbidden' }, 'FORBIDDEN'],
    [403, { code: 'origin_not_allowed' }, 'FORBIDDEN'],
    [503, { code: 'not_configured' }, 'NOT_CONFIGURED'],
    [404, undefined, 'NOT_CONFIGURED'],
    [401, undefined, 'SESSION_EXPIRED'],
    [500, { code: 'server_error', error: 'server text' }, 'UNKNOWN']
  ])('maps status %p with body %p to %p', async (status, body, code) => {
    supabase.functions.invoke.mockResolvedValue({ data: null, error: httpError(status, body) });
    await expect(generateReport()).resolves.toEqual({ success: false, error: { code, message: REPORT_MESSAGES[code] } });
  });

  it('reports a fetch error as a network failure', async () => {
    supabase.functions.invoke.mockResolvedValue({ data: null, error: { name: 'FunctionsFetchError', context: {} } });
    const result = await generateReport();
    expect(result.error).toEqual({ code: 'NETWORK', message: REPORT_MESSAGES.NETWORK });
  });

  it('reports a thrown call as a network failure', async () => {
    supabase.functions.invoke.mockRejectedValue(new Error('offline'));
    const result = await generateReport();
    expect(result.error.code).toBe('NETWORK');
  });

  it('never shows a server message', async () => {
    supabase.functions.invoke.mockResolvedValue({ data: null, error: httpError(500, { code: 'x', error: 'secret detail' }) });
    const result = await generateReport();
    expect(result.error.message).not.toContain('secret detail');
  });
});

it('uses no em dash in any message', () => {
  Object.values(REPORT_MESSAGES).forEach((message) => expect(message).not.toContain('\u2014'));
});
