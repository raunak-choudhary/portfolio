import { EVENT_COLUMNS, MAX_PAGES, PAGE_SIZE, PROJECT_COLUMNS, fetchActiveProjects, fetchEvents, firstEventAt, insightsError, loadInsights } from './insightsService';
import { getAdminSupabaseClient } from './adminDataService';
import { getSectionFreshness } from './voyageData';
import { failureKind } from './voyageRecords';

jest.mock('./supabaseClient', () => ({ supabase: {} }));
jest.mock('./dataService', () => ({ deleteProject: jest.fn() }));
jest.mock('./adminDataService', () => {
  const actual = jest.requireActual('./adminDataService');
  return { describeAdminWriteError: actual.describeAdminWriteError, getAdminSupabaseClient: jest.fn() };
});
jest.mock('./voyageData', () => ({ getSectionFreshness: jest.fn() }));

/** A chainable query stub recording its calls and resolving to `result`. */
const chain = (result, calls = []) => {
  const q = {};
  for (const name of ['select', 'eq', 'neq', 'gte', 'lt', 'order', 'range', 'limit']) q[name] = jest.fn((...args) => { calls.push([name, ...args]); return q; });
  q.then = (resolve, reject) => Promise.resolve(typeof result === 'function' ? result(calls) : result).then(resolve, reject);
  return q;
};

const row = (i, at) => ({ id: `r${i}`, created_at: at, session_id: `s${i}`, user_type: 'visitor', event_type: 'page_view', event_action: 'view_page', event_label: 'home' });

let from;
beforeEach(() => {
  from = jest.fn();
  getAdminSupabaseClient.mockReturnValue({ from });
  getSectionFreshness.mockResolvedValue([{ section: 'Hero', at: '2026-10-01T00:00:00Z' }]);
});

describe('fetchEvents', () => {
  it('selects the narrow columns, filters on the server and reads every page', async () => {
    const calls = [];
    const pages = [Array.from({ length: PAGE_SIZE }, (_, i) => row(i, '2026-11-01T00:00:00Z')), [row('last', '2026-11-02T00:00:00Z')]];
    from.mockImplementation(() => chain({ data: pages.shift(), error: null }, calls));
    const out = await fetchEvents(Date.parse('2026-10-01T04:00:00Z'), Date.parse('2026-11-18T21:00:00Z'));
    expect(out.rows).toHaveLength(PAGE_SIZE + 1);
    expect(out.truncated).toBe(false);
    expect(from).toHaveBeenCalledWith('analytics_events');
    expect(calls).toContainEqual(['select', EVENT_COLUMNS]);
    expect(EVENT_COLUMNS).not.toMatch(/\bmetadata\b(?!->)/);   // only the three lifted paths, never the whole object
    expect(calls).toContainEqual(['eq', 'user_type', 'visitor']);
    expect(calls).toContainEqual(['neq', 'event_type', 'section_visit']);
    expect(calls).toContainEqual(['gte', 'created_at', '2026-10-01T04:00:00.000Z']);
    expect(calls).toContainEqual(['lt', 'created_at', '2026-11-18T21:00:00.000Z']);
    expect(calls.filter((c) => c[0] === 'range')).toEqual([['range', 0, PAGE_SIZE - 1], ['range', PAGE_SIZE, 2 * PAGE_SIZE - 1]]);
  });

  it('stops at the page cap and says the result was cut short', async () => {
    from.mockImplementation(() => chain({ data: new Array(PAGE_SIZE).fill(row(0, '2026-11-01T00:00:00Z')), error: null }));
    const out = await fetchEvents(0, 1);
    expect(from).toHaveBeenCalledTimes(MAX_PAGES);
    expect(out.truncated).toBe(true);
  });

  it('throws typed errors that failureKind can read, with a fixed message', async () => {
    from.mockImplementation(() => chain({ data: null, error: { status: 401, message: 'JWT expired' } }));
    const session = await fetchEvents(0, 1).catch((e) => e);
    expect(session.message).toBe('The numbers could not be loaded.');
    expect(failureKind(session, true)).toBe('session');
    from.mockImplementation(() => chain({ data: null, error: { code: '42501', message: 'permission denied for table analytics_events' } }));
    expect(failureKind(await fetchEvents(0, 1).catch((e) => e), true)).toBe('permission');
    from.mockImplementation(() => chain({ data: null, error: { message: 'TypeError: Failed to fetch' } }));
    expect(failureKind(await fetchEvents(0, 1).catch((e) => e), true)).toBe('network');
    from.mockImplementation(() => chain({ data: null, error: { message: 'boom' } }));
    const unknown = await fetchEvents(0, 1).catch((e) => e);
    expect(failureKind(unknown, true)).toBe('unknown');
    expect(unknown.code).toBe('READ_FAILED');
  });
});

describe('first events and projects', () => {
  it('finds when a kind of tracking started, or null before it exists', async () => {
    const calls = [];
    from.mockReturnValueOnce(chain({ data: [{ created_at: '2026-11-20T15:00:00Z' }], error: null }, calls));
    expect(await firstEventAt('engaged')).toBe(Date.parse('2026-11-20T15:00:00Z'));
    expect(calls).toContainEqual(['eq', 'event_action', 'engaged']);
    expect(calls).toContainEqual(['order', 'created_at', { ascending: true }]);
    from.mockReturnValueOnce(chain({ data: [], error: null }));
    expect(await firstEventAt('project_open')).toBeNull();
  });

  it('reads a stored instant without a zone as UTC, not local time', async () => {
    from.mockReturnValueOnce(chain({ data: [{ created_at: '2026-08-01T04:00:00.000' }], error: null }));
    expect(await firstEventAt('engaged')).toBe(Date.UTC(2026, 7, 1, 4));
  });

  it('reads active projects with an explicit column list', async () => {
    const calls = [];
    from.mockReturnValueOnce(chain({ data: [{ id: 'p1', title: 'Tallyproof' }], error: null }, calls));
    expect(await fetchActiveProjects()).toEqual([{ id: 'p1', title: 'Tallyproof' }]);
    expect(from).toHaveBeenCalledWith('projects');
    expect(calls).toEqual(expect.arrayContaining([['select', PROJECT_COLUMNS], ['eq', 'status', 'active']]));
  });
});

describe('loadInsights', () => {
  it('reads both windows at once and splits the rows at the boundary', async () => {
    const windows = { before: { from: Date.parse('2026-07-01T04:00:00Z'), to: Date.parse('2026-10-01T04:00:00Z') }, current: { from: Date.parse('2026-10-01T04:00:00Z'), to: Date.parse('2026-11-18T21:00:00Z') } };
    const eventCalls = [];
    from.mockImplementation((table) => {
      if (table === 'projects') return chain({ data: [{ id: 'p1', title: 'Knaq' }], error: null });
      return chain((calls) => {
        if (calls.some((c) => c[0] === 'limit')) return { data: calls.some((c) => c[2] === 'engaged') ? [{ created_at: '2026-11-19T00:00:00Z' }] : [], error: null };
        return { data: [row(1, '2026-09-30T12:00:00Z'), row(2, '2026-10-01T04:00:00Z'), row(3, 'bad'), row(4, '2026-11-01T00:00:00Z'), row(5, '2026-10-01T03:59:59.999')], error: null };
      }, eventCalls.length ? [] : eventCalls);
    });
    const out = await loadInsights(windows);
    // r5 has no zone: UTC, so one millisecond before the boundary
    expect(out.before.map((r) => r.id)).toEqual(['r1', 'r5']);
    expect(out.current.map((r) => r.id)).toEqual(['r2', 'r4']);
    expect(out.projects).toHaveLength(1);
    expect(out.firstEngaged).toBe(Date.parse('2026-11-19T00:00:00Z'));
    expect(out.firstProjectOpen).toBeNull();
    expect(out.freshness).toEqual([{ section: 'Hero', at: '2026-10-01T00:00:00Z' }]);
    expect(out.truncated).toBe(false);
  });

  it('fails as a whole when any read fails', async () => {
    from.mockImplementation((table) => chain(table === 'projects' ? { data: null, error: { status: 403 } } : { data: [], error: null }));
    await expect(loadInsights({ before: { from: 0, to: 1 }, current: { from: 1, to: 2 } })).rejects.toMatchObject({ code: 'SECOND_FACTOR_REQUIRED' });
  });

  it('builds its error from any Supabase error shape', () => {
    expect(insightsError(null).code).toBe('READ_FAILED');
  });
});
