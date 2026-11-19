// Tests for the Analytics chapter: loading, error and empty states, the tab
// and range keyboard model, the remembered range, and what each tab shows
// from hand-made rows. The services are mocked; no request leaves the test.

import AnalyticsChapter, { RANGE_KEY, TABS, readRange } from './AnalyticsChapter';
import { loadInsights } from '../../../services/insightsService';
import { failureKind } from '../../../services/voyageRecords';
import { listReports } from '../../../services/reportsService';
import { React, act, click, mount } from '../SkyBackground/testUtils';

jest.mock('../../../services/insightsService', () => ({ loadInsights: jest.fn() }));
jest.mock('../../../services/voyageRecords', () => ({ failureKind: jest.fn() }));
jest.mock('../../../services/reportsService', () => ({ REPORT_MESSAGES: { UNKNOWN: 'x' }, listReports: jest.fn(), generateReport: jest.fn() }));
jest.mock('../../../services/reportsTableProbe', () => ({ reportsTableMissing: jest.fn() }));
// Recharts is verified in the real browser; here the chart is a stand-in that shows its summary
jest.mock('./TrendChart', () => ({ __esModule: true, default: ({ summary }) => require('react').createElement('p', { 'data-testid': 'trend' }, summary) }));

// 19 Nov 2026, 12:00 New York
const NOW = Date.parse('2026-11-19T17:00:00Z');
const clock = () => NOW;
const flush = () => act(async () => { for (let i = 0; i < 4; i++) { await Promise.resolve(); await new Promise((r) => setTimeout(r, 0)); } });

let seq = 0;
const ev = (session, at, type, action, label, extra = {}) => ({ id: `e${seq++}`, session_id: session, created_at: at, event_type: type, event_action: action, event_label: label, user_type: 'visitor', ...extra });
const home = (s, at, visitor) => ev(s, at, 'page_view', 'view_page', 'home', visitor ? { visitor } : {});
const rows = [
  home('s1', '2026-11-10T15:00:00Z', { referrer: 'www.linkedin.com', deviceClass: 'desktop' }),
  ev('s1', '2026-11-10T15:01:00Z', 'click', 'project_open', 'p1'),
  ev('s1', '2026-11-10T15:02:00Z', 'click', 'reach_out', 'email'),
  home('s2', '2026-11-12T15:00:00Z', { referrer: 'https://www.google.com/', deviceClass: 'phone' }),
  home('s3', '2026-11-14T15:00:00Z', null),
];
const data = (over = {}) => ({
  current: rows, before: [], projects: [{ id: 'p1', title: 'Knaq', featured: true }, { id: 'p2', title: 'Tallyproof', featured: false }],
  firstEngaged: null, firstProjectOpen: Date.parse('2026-01-01T00:00:00Z'), freshness: [], truncated: false, ...over,
});

const button = (name, root = document.body) => [...root.querySelectorAll('button')].find((b) => (b.getAttribute('aria-label') || b.textContent.trim()) === name) || null;
const tab = (label) => [...document.querySelectorAll('[role="tab"]')].find((t) => t.textContent === label);
const radio = (label) => [...document.querySelectorAll('[role="radio"]')].find((t) => t.textContent === label);
const key = (el, k) => act(() => { el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true })); });
const text = () => document.body.textContent;

let view;
const renderChapter = async (props = {}) => { view = mount(<AnalyticsChapter notify={jest.fn()} clock={clock} {...props} />); await flush(); };

beforeEach(() => {
  try { window.localStorage.clear(); } catch { /* ignore */ }
  loadInsights.mockResolvedValue(data());
  listReports.mockResolvedValue({ success: true, data: [] });
  failureKind.mockImplementation((e) => (e?.code === 'SESSION_EXPIRED' ? 'session' : 'unknown'));
});
afterEach(() => { view?.unmount(); view = null; });

describe('readRange', () => {
  it('returns the saved range, else the 90-day default', () => {
    expect(readRange()).toBe('90d');
    window.localStorage.setItem(RANGE_KEY, '7d');
    expect(readRange()).toBe('7d');
    window.localStorage.setItem(RANGE_KEY, 'forever');
    expect(readRange()).toBe('90d');
  });

  it('falls back to the default when storage throws', () => {
    const spy = jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    expect(readRange()).toBe('90d');
    spy.mockRestore();
  });
});

describe('AnalyticsChapter', () => {
  it('shows a skeleton while loading, then the funnel for the default range', async () => {
    let resolve;
    loadInsights.mockReturnValue(new Promise((r) => { resolve = r; }));
    view = mount(<AnalyticsChapter notify={jest.fn()} clock={clock} />);
    await flush();
    expect(document.querySelector('[aria-label="Loading the numbers"]')).not.toBeNull();
    await act(async () => { resolve(data()); });
    await flush();
    expect(loadInsights).toHaveBeenCalledTimes(1);
    const windows = loadInsights.mock.calls[0][0];
    expect(windows.current.to).toBe(NOW);
    expect(radio('90 days').getAttribute('aria-checked')).toBe('true');
    const cards = document.querySelectorAll('[aria-labelledby="ins-funnel-h"] [data-testid="water-card"]');
    expect([...cards].map((c) => c.getAttribute('aria-label'))).toEqual(['Visits: 3', 'Went deeper: 1', 'Looked at your work: 1', 'Reached out: 1']);
    expect(text()).toContain('scrolled down to the About section or further');
    expect(document.querySelector('[data-testid="trend"]').textContent).toContain('Visits per');
  });

  it('moves between tabs with the arrow keys, Home and End, with one tab stop', async () => {
    await renderChapter();
    expect(TABS.map((t) => t.label)).toEqual(['Is it working?', 'Where from', 'Your work', 'Health', 'Reports']);
    const list = document.querySelector('[role="tablist"]');
    expect([...list.querySelectorAll('[tabindex="0"]')]).toEqual([tab('Is it working?')]);
    key(tab('Is it working?'), 'ArrowRight');
    expect(tab('Where from').getAttribute('aria-selected')).toBe('true');
    expect(document.activeElement).toBe(tab('Where from'));
    expect(tab('Where from').getAttribute('tabindex')).toBe('0');
    key(tab('Where from'), 'End');
    expect(tab('Reports').getAttribute('aria-selected')).toBe('true');
    key(tab('Reports'), 'ArrowRight');
    expect(tab('Is it working?').getAttribute('aria-selected')).toBe('true');
    key(tab('Is it working?'), 'ArrowLeft');
    expect(tab('Reports').getAttribute('aria-selected')).toBe('true');
    key(tab('Reports'), 'Home');
    expect(document.querySelector('[role="tabpanel"]').getAttribute('aria-labelledby')).toBe('ins-tab-working');
  });

  it('remembers the range picked by click or arrow key and reads it again', async () => {
    await renderChapter();
    click(radio('7 days'));
    await flush();
    expect(window.localStorage.getItem(RANGE_KEY)).toBe('7d');
    expect(loadInsights).toHaveBeenCalledTimes(2);
    expect(loadInsights.mock.calls[1][0].current.days).toBe(7);
    key(radio('7 days'), 'ArrowRight');
    await flush();
    expect(radio('30 days').getAttribute('aria-checked')).toBe('true');
    expect(document.activeElement).toBe(radio('30 days'));
    expect(window.localStorage.getItem(RANGE_KEY)).toBe('30d');
  });

  it('reuses a loaded range for five minutes', async () => {
    await renderChapter();
    click(radio('7 days'));
    await flush();
    click(radio('90 days'));
    await flush();
    expect(loadInsights).toHaveBeenCalledTimes(2);
  });

  it('shows the quarter strip in quarter mode', async () => {
    window.localStorage.setItem(RANGE_KEY, 'quarter');
    await renderChapter();
    expect(document.querySelector('.ins-quarter').textContent).toContain('Day 50 of 92');
    const bar = document.querySelector('[role="progressbar"]');
    expect(bar.getAttribute('aria-valuenow')).toBe('50');
    expect(bar.getAttribute('aria-valuemax')).toBe('92');
  });

  it('is honest when nothing was recorded and offers a longer range', async () => {
    loadInsights.mockResolvedValue(data({ current: [], before: [] }));
    await renderChapter();
    expect(text()).toContain('No visits in the last 90 days');
    expect(text()).toContain('Nothing was recorded in the 90 days before either.');
    click(button('Show 12 months'));
    await flush();
    expect(radio('12 months').getAttribute('aria-checked')).toBe('true');
    expect(button('Show 12 months')).toBeNull();
  });

  it('shows a fixed sentence and Try again when the read fails', async () => {
    loadInsights.mockRejectedValueOnce(Object.assign(new Error('JWT expired'), { code: 'SESSION_EXPIRED' }));
    await renderChapter();
    const alert = document.querySelector('[role="alert"]');
    expect(alert.textContent).toContain('Your session has expired.');
    expect(alert.textContent).not.toContain('JWT');
    click(button('Try again'));
    await flush();
    expect(document.querySelector('[role="alert"]')).toBeNull();
    expect(document.querySelectorAll('[aria-labelledby="ins-funnel-h"] [data-testid="water-card"]')).toHaveLength(4);
  });

  it('ranks sources with full referrer URLs read as hosts', async () => {
    await renderChapter();
    click(tab('Where from'));
    await flush();
    expect(text()).toContain('LinkedIn');
    expect(text()).toContain('Google');
    expect(text()).toContain('Best rate');
  });

  it('lists opened projects and the ones nobody opened', async () => {
    await renderChapter();
    click(tab('Your work'));
    await flush();
    expect(document.querySelector('[aria-label^="Knaq, starred: opened 1 times"]')).not.toBeNull();
    expect(document.querySelector('.ins-quiet').textContent).toBe('Tallyproof');
  });

  it('lists an Unknown device row only when such visits exist, and says when quick leaves are not measured', async () => {
    await renderChapter();
    click(tab('Health'));
    await flush();
    const names = [...document.querySelectorAll('.ins-rows__text b')].map((b) => b.textContent);
    expect(names).toEqual(expect.arrayContaining(['Laptop or desktop', 'Phone', 'Tablet', 'Unknown device']));
    expect(text()).toContain('Measured once the new tracking is live.');
  });

  it('loads the archive only on the Reports tab', async () => {
    await renderChapter();
    expect(listReports).not.toHaveBeenCalled();
    click(tab('Reports'));
    await flush();
    expect(listReports).toHaveBeenCalledTimes(1);
    expect(document.querySelector('[role="radiogroup"]')).toBeNull();
  });

  it('marks reduced motion and a hidden tab for the CSS', async () => {
    await renderChapter({ motion: false });
    const root = document.querySelector('[data-testid="analytics-chapter"]');
    expect(root.getAttribute('data-motion')).toBe('reduced');
    const hidden = jest.spyOn(document, 'hidden', 'get').mockReturnValue(true);
    act(() => { document.dispatchEvent(new Event('visibilitychange')); });
    expect(root.classList.contains('is-tab-hidden')).toBe(true);
    hidden.mockRestore();
  });
});
