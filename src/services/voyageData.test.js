import { getTopPages, getUnreadMessages, getVisitorSeries, normalizePage, rankPages, relativeTime, summarizeVisitorEvents } from './voyageData';
import { supabase } from './supabaseClient';

jest.mock('./supabaseClient', () => ({ supabase: { from: jest.fn() } }));

/** A chainable query stub that resolves to the given result. */
const chain = (result) => {
  const q = {};
  for (const name of ['select', 'eq', 'gte', 'order', 'limit']) q[name] = jest.fn(() => q);
  q.then = (resolve, reject) => Promise.resolve(result).then(resolve, reject);
  return q;
};

describe('visitor series', () => {
  it('buckets page views by day, counts distinct sessions, and compares with the previous window', () => {
    const now = new Date('2026-11-12T18:00:00Z');
    const rows = [
      { created_at: '2026-11-12T10:00:00Z', session_id: 'a' }, { created_at: '2026-11-12T11:00:00Z', session_id: 'a' },
      { created_at: '2026-11-11T09:00:00Z', session_id: 'b' }, { created_at: '2026-10-20T09:00:00Z', session_id: 'z' }, { created_at: 'junk', session_id: 'q' },
    ];
    const out = summarizeVisitorEvents(rows, 7, now);
    expect(out.days).toHaveLength(7);
    expect(out.days.at(-1)).toEqual({ date: '2026-11-12', views: 2, visitors: 1 });
    expect(out.days.at(-2)).toEqual({ date: '2026-11-11', views: 1, visitors: 1 });
    expect(out.totalViews).toBe(3); expect(out.totalVisitors).toBe(2); expect(out.previousVisitors).toBe(1);
  });

  it('reads page views through the session and returns an empty shape on error', async () => {
    supabase.from.mockReturnValueOnce(chain({ data: [{ created_at: new Date().toISOString(), session_id: 's' }], error: null }));
    const ok = await getVisitorSeries(7);
    expect(ok.totalViews).toBe(1);
    expect(supabase.from).toHaveBeenCalledWith('analytics_events');
    supabase.from.mockReturnValueOnce(chain({ data: null, error: { message: 'denied' } }));
    expect(await getVisitorSeries(7)).toEqual({ days: [], totalViews: 0, totalVisitors: 0, previousVisitors: 0 });
  });
});

describe('top pages', () => {
  it('normalises labels and ranks them', () => {
    expect(normalizePage('Home Page')).toBe('/home'); expect(normalizePage('/projects')).toBe('/projects'); expect(normalizePage('')).toBeNull();
    const ranked = rankPages([{ event_label: 'home' }, { event_label: '/home' }, { event_label: 'projects' }, { event_label: null }], 5);
    expect(ranked).toEqual([{ page: '/home', views: 2 }, { page: '/projects', views: 1 }]);
  });

  it('returns [] when the query fails', async () => {
    supabase.from.mockReturnValueOnce(chain({ data: null, error: { message: 'no' } }));
    expect(await getTopPages()).toEqual([]);
  });
});

describe('unread messages and times', () => {
  it('shapes the unread count and the newest three', async () => {
    supabase.from.mockReturnValueOnce(chain({ data: [{ id: '1', name: 'NYU', subject: null, created_at: '2026-11-12T10:00:00Z' }], error: null, count: 3 }));
    const out = await getUnreadMessages();
    expect(out.count).toBe(3);
    expect(out.latest[0]).toMatchObject({ name: 'NYU', subject: '(no subject)' });
  });

  it('says how long ago in short words', () => {
    const now = new Date('2026-11-12T18:00:00Z');
    expect(relativeTime('2026-11-12T17:59:50Z', now)).toBe('just now');
    expect(relativeTime('2026-11-12T17:20:00Z', now)).toBe('40 min ago');
    expect(relativeTime('2026-11-12T13:00:00Z', now)).toBe('5 h ago');
    expect(relativeTime('2026-11-09T18:00:00Z', now)).toBe('3 d ago');
    expect(relativeTime('2026-09-01T18:00:00Z', now)).toMatch(/Sep/);
  });
});
