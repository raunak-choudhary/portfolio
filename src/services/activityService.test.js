// Unit tests for the activity service: paging and filters of the log, one
// record's history, the "not set up yet" probe, best-effort security events
// and the once-per-session sign-in entry. Supabase is faked; no request
// leaves the test.

import {
  ACTIVITY_NOT_SET_UP, LOG_TIMEOUT_MS, SIGN_IN_FLAG, cleanSecurityLabel, isActivityAvailable, listActivity, listDeletedRecords,
  logSecurityEvent, noteSecondFactorSignIn, recordHistory, sessionIdFromToken, signInLabel, toActivityRow,
} from './activityService';
import { failureKind } from './voyageRecords';
import { supabase } from './supabaseClient';

jest.mock('./supabaseClient', () => ({
  supabase: {
    from: jest.fn(),
    rpc: jest.fn(),
    auth: { getSession: jest.fn(), mfa: { getAuthenticatorAssuranceLevel: jest.fn() } },
  },
}));
// voyageRecords pulls in the data service; only failureKind is used here.
jest.mock('./dataService', () => ({ deleteProject: jest.fn() }));

/**
 * A chainable query builder that records every call and resolves (when
 * awaited) with `result`.
 */
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

const dbRow = (id, extra = {}) => ({
  id, at: `2026-11-19T1${id}:00:00+00:00`, action: 'edit', section: 'projects', record_id: 'p1',
  record_title: 'Tallyproof', fields: ['title'], detail: null, source: 'admin', ...extra,
});

beforeEach(() => {
  jest.clearAllMocks();
});

describe('toActivityRow', () => {
  it('maps a stored row to the UI shape with safe defaults', () => {
    expect(toActivityRow({ id: 3, at: 'a', action: 'sign-in', section: 'security', record_id: null, record_title: null, fields: null, detail: { label: 'Mac' }, source: 'admin' }))
      .toEqual({ id: 3, at: 'a', action: 'sign-in', section: 'security', recordId: null, recordTitle: null, fields: [], detail: { label: 'Mac' }, source: 'admin' });
    expect(toActivityRow({ id: 4, source: 'something' })).toMatchObject({ fields: [], detail: {}, source: 'outside', recordId: null });
  });
});

describe('listActivity', () => {
  it('reads newest first, one extra row to know about more', async () => {
    const q = query({ data: [dbRow(3), dbRow(2), dbRow(1)], error: null });
    supabase.from.mockReturnValue(q);
    const page = await listActivity({ limit: 2 });
    expect(supabase.from).toHaveBeenCalledWith('admin_activity');
    expect(q.calls).toEqual(expect.arrayContaining([
      ['order', 'at', { ascending: false }], ['order', 'id', { ascending: false }], ['limit', 3],
    ]));
    expect(page.hasMore).toBe(true);
    expect(page.rows.map((r) => r.id)).toEqual([3, 2]);
    expect(page.rows[0]).toMatchObject({ recordId: 'p1', recordTitle: 'Tallyproof', fields: ['title'], source: 'admin' });
  });

  it('says there is no more when the page is short', async () => {
    supabase.from.mockReturnValue(query({ data: [dbRow(1)], error: null }));
    await expect(listActivity()).resolves.toMatchObject({ hasMore: false });
  });

  it.each([
    ['security', [['eq', 'section', 'security']]],
    ['files', [['in', 'action', ['upload', 'remove-file']]]],
    ['content', [['neq', 'section', 'security'], ['not', 'action', 'in', '(upload,remove-file)']]],
  ])('filter %s narrows the query', async (filter, expected) => {
    const q = query({ data: [], error: null });
    supabase.from.mockReturnValue(q);
    await listActivity({ filter });
    expect(q.calls).toEqual(expect.arrayContaining(expected));
  });

  it('filter all and unknown filters add no condition', async () => {
    for (const filter of ['all', 'nonsense']) {
      const q = query({ data: [], error: null });
      supabase.from.mockReturnValue(q);
      await listActivity({ filter });
      expect(q.calls.map((c) => c[0])).toEqual(['select', 'order', 'order', 'limit']);
    }
  });

  it('pages by the last row\'s time, passed through as the server sent it', async () => {
    const q = query({ data: [], error: null });
    supabase.from.mockReturnValue(q);
    await listActivity({ before: '2026-11-19T10:00:00+00:00' });
    expect(q.calls).toContainEqual(['lt', 'at', '2026-11-19T10:00:00+00:00']);
  });

  it('pages by time and id when given the row, so rows of one instant are not skipped', async () => {
    const q = query({ data: [], error: null });
    supabase.from.mockReturnValue(q);
    await listActivity({ before: { at: '2026-11-19T10:00:00Z', id: 42 } });
    expect(q.calls).toContainEqual(['or', 'at.lt."2026-11-19T10:00:00Z",and(at.eq."2026-11-19T10:00:00Z",id.lt.42)']);
  });

  it('keeps the microseconds of the cursor and quotes it inside or()', async () => {
    // Postgres keeps microseconds; a cursor cut to milliseconds would make
    // "earlier than" skip the rest of a bulk change written in one instant.
    const q = query({ data: [], error: null });
    supabase.from.mockReturnValue(q);
    await listActivity({ before: { at: '2026-11-19T20:38:58.779068+00:00', id: 7 } });
    expect(q.calls).toContainEqual(['or', 'at.lt."2026-11-19T20:38:58.779068+00:00",and(at.eq."2026-11-19T20:38:58.779068+00:00",id.lt.7)']);
    const plain = query({ data: [], error: null });
    supabase.from.mockReturnValue(plain);
    await listActivity({ before: '2026-11-19 20:38:58.779068+00' });
    expect(plain.calls).toContainEqual(['lt', 'at', '2026-11-19 20:38:58.779068+00']);
  });

  it.each([
    ['text', 'yesterday'],
    ['filter syntax', '2026-11-19T10:00:00Z,id.gt.0'],
    ['a quote', '2026-11-19T10:00:00"Z'],
    ['seven fractional digits', '2026-11-19T10:00:00.1234567Z'],
    ['a number', 1763546400000],
    ['a row without a time', { id: 4 }],
  ])('rejects a cursor that is not a timestamp (%s) before asking the server', async (_, before) => {
    supabase.from.mockReturnValue(query({ data: [], error: null }));
    const thrown = await listActivity({ before }).catch((e) => e);
    expect(thrown.code).toBe('LOAD_FAILED');
    expect(failureKind(thrown, true)).toBe('unknown');
  });

  it('clamps the page size', async () => {
    const q = query({ data: [], error: null });
    supabase.from.mockReturnValue(q);
    await listActivity({ limit: 10000 });
    expect(q.calls).toContainEqual(['limit', 201]);
  });

  it.each([
    [{ status: 401, message: 'JWT expired' }, 'SESSION_EXPIRED', 'session'],
    [{ code: '42501', message: 'permission denied for table admin_activity' }, 'SECOND_FACTOR_REQUIRED', 'permission'],
    [{ code: '42P01', message: 'relation "public.admin_activity" does not exist' }, ACTIVITY_NOT_SET_UP, 'unknown'],
    [{ code: 'PGRST205', message: 'Could not find the table' }, ACTIVITY_NOT_SET_UP, 'unknown'],
    [{ code: 'XX000', message: 'boom' }, 'LOAD_FAILED', 'unknown'],
  ])('throws a typed error for %p', async (error, code, kind) => {
    supabase.from.mockReturnValue(query({ data: null, error }));
    const thrown = await listActivity().catch((e) => e);
    expect(thrown.code).toBe(code);
    expect(failureKind(thrown, true)).toBe(kind);
    expect(thrown.message).not.toMatch(/boom|relation/);
  });

  it('lets a network failure reach failureKind as network', async () => {
    supabase.from.mockReturnValue(query(Promise.reject(new TypeError('Failed to fetch'))));
    const thrown = await listActivity().catch((e) => e);
    expect(failureKind(thrown, true)).toBe('network');
  });
});

describe('listDeletedRecords', () => {
  it('asks once for the newest create or delete per record and returns the asked-for records deleted last', async () => {
    const q = query({ data: [
      { section: 'projects', record_id: 'p9', action: 'delete' },
      { section: 'projects', record_id: 'p9', action: 'create' },
      { section: 'projects', record_id: 'p9', action: 'delete' },     // an older delete adds nothing
      { section: 'projects', record_id: 'p1', action: 'create' },     // made again after its delete: it exists
      { section: 'projects', record_id: 'p1', action: 'delete' },
      { section: 'internships', record_id: 'p1', action: 'delete' },  // an id from one table paired with another section
    ], error: null });
    supabase.from.mockReturnValue(q);
    const found = await listDeletedRecords([{ section: 'projects', recordId: 'p9' }, { section: 'projects', recordId: 'p1' }, { section: 'internships', recordId: 'i4' }]);
    expect(supabase.from).toHaveBeenCalledTimes(1);
    expect(supabase.from).toHaveBeenCalledWith('admin_activity');
    expect(q.calls).toEqual([
      ['select', 'section, record_id, action'], ['in', 'action', ['create', 'delete']], ['in', 'section', ['projects', 'internships']], ['in', 'record_id', ['p9', 'p1', 'i4']],
      ['order', 'at', { ascending: false }], ['order', 'id', { ascending: false }], ['limit', 1000],
    ]);
    expect(found).toEqual([{ section: 'projects', recordId: 'p9' }]);
  });

  it('makes no request for nothing, and throws typed errors', async () => {
    await expect(listDeletedRecords([])).resolves.toEqual([]);
    await expect(listDeletedRecords([{ section: 'projects', recordId: null }])).resolves.toEqual([]);
    expect(supabase.from).not.toHaveBeenCalled();
    supabase.from.mockReturnValue(query({ data: null, error: { code: 'PGRST205', message: 'missing' } }));
    await expect(listDeletedRecords([{ section: 'projects', recordId: 'p1' }])).rejects.toMatchObject({ code: ACTIVITY_NOT_SET_UP });
  });
});

describe('recordHistory', () => {
  it('reads one record\'s rows newest first', async () => {
    const q = query({ data: [dbRow(2), dbRow(1)], error: null });
    supabase.from.mockReturnValue(q);
    const rows = await recordHistory('projects', 123, 5);
    expect(q.calls).toEqual(expect.arrayContaining([
      ['eq', 'section', 'projects'], ['eq', 'record_id', '123'], ['order', 'at', { ascending: false }], ['limit', 5],
    ]));
    expect(rows.map((r) => r.id)).toEqual([2, 1]);
  });

  it('returns nothing without a table or id, and asks nothing', async () => {
    await expect(recordHistory('', 'x')).resolves.toEqual([]);
    await expect(recordHistory('projects', null)).resolves.toEqual([]);
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('throws typed errors', async () => {
    supabase.from.mockReturnValue(query({ data: null, error: { code: '42P01' } }));
    await expect(recordHistory('projects', 'p1')).rejects.toMatchObject({ code: ACTIVITY_NOT_SET_UP });
  });
});

describe('isActivityAvailable', () => {
  it('is true when the table answers', async () => {
    supabase.from.mockReturnValue(query({ data: [], error: null }));
    await expect(isActivityAvailable()).resolves.toBe(true);
  });

  it.each(['42P01', 'PGRST205'])('is false when the table is missing (%s)', async (code) => {
    supabase.from.mockReturnValue(query({ data: null, error: { code, message: 'relation "public.admin_activity" does not exist' } }));
    await expect(isActivityAvailable()).resolves.toBe(false);
  });

  it('is true for other errors and network failures, so the list reports them', async () => {
    supabase.from.mockReturnValue(query({ data: null, error: { status: 401, message: 'JWT expired' } }));
    await expect(isActivityAvailable()).resolves.toBe(true);
    supabase.from.mockImplementation(() => { throw new TypeError('Failed to fetch'); });
    await expect(isActivityAvailable()).resolves.toBe(true);
  });
});

describe('logSecurityEvent', () => {
  it('calls the RPC with the kind and a clean label', async () => {
    supabase.rpc.mockResolvedValue({ data: null, error: null });
    await expect(logSecurityEvent('passkey-add', '  Pixel\n9  ')).resolves.toBe(true);
    expect(supabase.rpc).toHaveBeenCalledWith('log_admin_event', { kind: 'passkey-add', label: 'Pixel 9' });
  });

  it('drops unknown kinds without a request', async () => {
    await expect(logSecurityEvent('edit', 'x')).resolves.toBe(false);
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it('never throws: refused, missing, thrown and rejected calls all resolve false', async () => {
    supabase.rpc.mockResolvedValueOnce({ error: { code: '42501' } });
    await expect(logSecurityEvent('sign-in')).resolves.toBe(false);
    supabase.rpc.mockResolvedValueOnce({ error: { code: 'PGRST202' } });
    await expect(logSecurityEvent('sign-in')).resolves.toBe(false);
    supabase.rpc.mockImplementationOnce(() => { throw new Error('sync'); });
    await expect(logSecurityEvent('sign-in')).resolves.toBe(false);
    supabase.rpc.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await expect(logSecurityEvent('sign-in')).resolves.toBe(false);
  });

  it('gives up after the timeout so the action is not held up', async () => {
    jest.useFakeTimers();
    try {
      supabase.rpc.mockReturnValue(new Promise(() => {}));
      const pending = logSecurityEvent('sign-out-all');
      jest.advanceTimersByTime(LOG_TIMEOUT_MS);
      await expect(pending).resolves.toBe(false);
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('cleanSecurityLabel', () => {
  it('trims, folds spaces, strips control characters and caps at 60', () => {
    expect(cleanSecurityLabel(null)).toBeNull();
    expect(cleanSecurityLabel('   ')).toBeNull();
    expect(cleanSecurityLabel('a\u0007b')).toBe('a b');
    expect(cleanSecurityLabel('x'.repeat(80))).toHaveLength(60);
  });
});

describe('signInLabel', () => {
  const totpAt = 1_800_000_000;
  it('names both steps', () => {
    expect(signInLabel([{ method: 'oauth', timestamp: totpAt - 30 }, { method: 'totp', timestamp: totpAt }])).toBe('Google, then authenticator code');
    expect(signInLabel(['otp', 'totp'])).toBe('Email code, then authenticator code');
  });

  it('recognises a passkey used next to the second step', () => {
    const passkeys = [{ last_used_at: new Date((totpAt + 2) * 1000).toISOString() }];
    expect(signInLabel([{ method: 'oauth', timestamp: totpAt - 30 }, { method: 'mfa/totp', timestamp: totpAt }], passkeys)).toBe('Google, then passkey');
    const old = [{ last_used_at: new Date((totpAt - 86400) * 1000).toISOString() }];
    expect(signInLabel([{ method: 'otp', timestamp: 1 }, { method: 'totp', timestamp: totpAt }], old)).toBe('Email code, then authenticator code');
  });

  it('falls back to what is known', () => {
    expect(signInLabel([{ method: 'totp', timestamp: 5 }])).toBe('authenticator code');
    expect(signInLabel([])).toBeNull();
    expect(signInLabel(undefined)).toBeNull();
  });
});

describe('sessionIdFromToken', () => {
  const token = (payload) => `h.${btoa(JSON.stringify(payload)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_')}.s`;
  it('reads the session_id claim', () => {
    expect(sessionIdFromToken(token({ session_id: 'abc' }))).toBe('abc');
  });
  it('is null for anything else', () => {
    expect(sessionIdFromToken('')).toBeNull();
    expect(sessionIdFromToken('not-a-token')).toBeNull();
    expect(sessionIdFromToken(token({}))).toBeNull();
  });
});

describe('noteSecondFactorSignIn', () => {
  const token = `h.${btoa(JSON.stringify({ session_id: 's-1' }))}.s`;
  const memory = () => {
    const values = new Map();
    return { getItem: (k) => (values.has(k) ? values.get(k) : null), setItem: (k, v) => values.set(k, String(v)), values };
  };
  const atLevel = (currentLevel) => {
    supabase.auth.mfa.getAuthenticatorAssuranceLevel.mockResolvedValue({
      data: { currentLevel, currentAuthenticationMethods: [{ method: 'oauth', timestamp: 100 }, { method: 'totp', timestamp: 130 }] }, error: null,
    });
    supabase.auth.getSession.mockResolvedValue({ data: { session: { access_token: token } }, error: null });
    supabase.from.mockReturnValue(query({ data: [], error: null }));
    supabase.rpc.mockResolvedValue({ data: null, error: null });
  };

  it('logs the first level 2 check of a session once, with its label', async () => {
    atLevel('aal2');
    const storage = memory();
    await expect(noteSecondFactorSignIn({ storage })).resolves.toBe(true);
    await expect(noteSecondFactorSignIn({ storage })).resolves.toBe(false);
    expect(supabase.rpc).toHaveBeenCalledTimes(1);
    expect(supabase.rpc).toHaveBeenCalledWith('log_admin_event', { kind: 'sign-in', label: 'Google, then authenticator code' });
    expect(storage.values.get(SIGN_IN_FLAG)).toBe('s-1');
  });

  it('shares one attempt between concurrent checks', async () => {
    atLevel('aal2');
    const storage = memory();
    const [a, b] = await Promise.all([noteSecondFactorSignIn({ storage }), noteSecondFactorSignIn({ storage })]);
    expect([a, b]).toEqual([true, true]);
    expect(supabase.rpc).toHaveBeenCalledTimes(1);
  });

  it('logs again for a new session in the same tab', async () => {
    atLevel('aal2');
    const storage = memory();
    storage.setItem(SIGN_IN_FLAG, 'an-older-session');
    await expect(noteSecondFactorSignIn({ storage })).resolves.toBe(true);
  });

  it('does nothing below level 2', async () => {
    atLevel('aal1');
    await expect(noteSecondFactorSignIn({ storage: memory() })).resolves.toBe(false);
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it('never rejects, even when every call fails', async () => {
    supabase.auth.mfa.getAuthenticatorAssuranceLevel.mockRejectedValue(new Error('offline'));
    supabase.auth.getSession.mockRejectedValue(new Error('offline'));
    await expect(noteSecondFactorSignIn({ storage: memory() })).resolves.toBe(false);
  });

  it('still logs when storage is blocked', async () => {
    atLevel('aal2');
    const blocked = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
    await expect(noteSecondFactorSignIn({ storage: blocked })).resolves.toBe(true);
  });
});
