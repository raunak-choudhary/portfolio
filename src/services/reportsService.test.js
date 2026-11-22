// Unit tests for the reports service: the archive read, "Generate now",
// deleting a report, and the mapping of every failure to a fixed sentence. Supabase is faked;
// no request leaves the test.

import { REPORT_FUNCTION, REPORT_MESSAGES, deleteReport, generateReport, listReports } from './reportsService';
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

describe('deleteReport', () => {
  const ID = '3f2b8c1e-9a4d-4e6f-8b7a-1c2d3e4f5a6b';

  /** A builder for delete().eq().select() whose select() resolves to the given result. */
  const deletion = (result) => {
    const builder = { delete: jest.fn(() => builder), eq: jest.fn(() => builder), select: jest.fn(() => Promise.resolve(result)) };
    return builder;
  };

  it.each([undefined, null, 42, '', 'r1', `${ID} or 1=1`, `${ID}x`])('refuses the id %p without calling Supabase', async (id) => {
    await expect(deleteReport(id)).resolves.toEqual({ success: false, error: { code: 'DELETE_FAILED', message: REPORT_MESSAGES.DELETE_FAILED } });
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('deletes the one row and asks for its id back', async () => {
    const builder = deletion({ data: [{ id: ID }], error: null });
    supabase.from.mockReturnValue(builder);

    await expect(deleteReport(ID)).resolves.toEqual({ success: true, data: { id: ID } });
    expect(supabase.from).toHaveBeenCalledWith('analytics_reports');
    expect(builder.delete).toHaveBeenCalledTimes(1);
    expect(builder.eq).toHaveBeenCalledWith('id', ID);
    expect(builder.select).toHaveBeenCalledWith('id');
  });

  it('accepts an id in upper case and matches the lower-case id Postgres returns', async () => {
    const builder = deletion({ data: [{ id: ID }], error: null });
    supabase.from.mockReturnValue(builder);
    await expect(deleteReport(ID.toUpperCase())).resolves.toEqual({ success: true, data: { id: ID } });
    expect(builder.eq).toHaveBeenCalledWith('id', ID);
  });

  it('does not count a different row coming back as this delete', async () => {
    supabase.from.mockReturnValue(deletion({ data: [{ id: '00000000-0000-4000-8000-000000000000' }], error: null }));
    const result = await deleteReport(ID);
    expect(result.error.code).toBe('DELETE_NOT_ALLOWED');
  });

  it.each([[[]], [null]])('treats %p rows back (row level security filtered the delete) as not set up', async (data) => {
    supabase.from.mockReturnValue(deletion({ data, error: null }));
    await expect(deleteReport(ID)).resolves.toEqual({ success: false, error: { code: 'DELETE_NOT_ALLOWED', message: REPORT_MESSAGES.DELETE_NOT_ALLOWED } });
  });

  it.each([
    [{ code: '42501', message: 'permission denied for table analytics_reports' }],
    [{ status: 403, message: 'Forbidden' }]
  ])('words a refused grant %p as not set up', async (error) => {
    supabase.from.mockReturnValue(deletion({ data: null, error }));
    const result = await deleteReport(ID);
    expect(result).toEqual({ success: false, error: { code: 'DELETE_NOT_ALLOWED', message: REPORT_MESSAGES.DELETE_NOT_ALLOWED } });
  });

  it('gives the fixed sentence for any other returned error, never the server text', async () => {
    supabase.from.mockReturnValue(deletion({ data: null, error: { code: 'XX000', message: 'secret detail' } }));
    const result = await deleteReport(ID);
    expect(result).toEqual({ success: false, error: { code: 'DELETE_FAILED', message: REPORT_MESSAGES.DELETE_FAILED } });
    expect(JSON.stringify(result)).not.toContain('secret detail');
  });

  it('gives the fixed sentence when the call throws', async () => {
    supabase.from.mockImplementation(() => { throw new Error('offline'); });
    await expect(deleteReport(ID)).resolves.toEqual({ success: false, error: { code: 'DELETE_FAILED', message: REPORT_MESSAGES.DELETE_FAILED } });
  });

  it('gives the fixed sentence when the request rejects', async () => {
    const builder = deletion(null);
    builder.select.mockImplementation(() => Promise.reject(new Error('offline')));
    supabase.from.mockReturnValue(builder);
    await expect(deleteReport(ID)).resolves.toEqual({ success: false, error: { code: 'DELETE_FAILED', message: REPORT_MESSAGES.DELETE_FAILED } });
  });
});

it('uses no em dash in any message', () => {
  Object.values(REPORT_MESSAGES).forEach((message) => expect(message).not.toContain('\u2014'));
});
