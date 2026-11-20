/* eslint-disable testing-library/no-container, testing-library/no-node-access */
import ActivityPane, { ACTIVITY_PANE_ID, PAGE_SIZE, useActivityFeed } from './ActivityPane';
import { noteContentChanged } from './contentChanged';
import { React, act, click, mount } from '../SkyBackground/testUtils';

jest.mock('../../../services/activityService', () => ({ ACTIVITY_NOT_SET_UP: 'ACTIVITY_NOT_SET_UP', listActivity: jest.fn(), listDeletedRecords: jest.fn(), recordHistory: jest.fn(), isActivityAvailable: jest.fn(), logSecurityEvent: jest.fn() }));
const service = jest.requireMock('../../../services/activityService');

// Thursday 19 Nov 2026, 14:00 in New York
const NOW = new Date('2026-11-19T19:00:00.000Z');
const row = (id, over) => ({ id, at: '2026-11-19T18:42:00.000Z', action: 'edit', section: 'projects', recordId: `p${id}`, recordTitle: 'Tallyproof', fields: ['description'], detail: {}, source: 'admin', ...over });
const ROWS = [
  row(1, { fields: ['description', 'technologies'] }),
  row(2, { at: '2026-11-19T18:31:00.000Z', action: 'delete', recordId: 'p9', recordTitle: 'TEST-Orbit demo', fields: [] }),
  row(3, { at: '2026-11-19T18:29:00.000Z', action: 'create', recordId: 'p9', recordTitle: 'TEST-Orbit demo', fields: [] }),
  row(4, { at: '2026-11-19T18:05:00.000Z', action: 'sign-in', section: 'security', recordId: null, recordTitle: null, fields: [], detail: { label: 'Google, then passkey' } }),
  row(5, { at: '2026-11-18T22:18:00.000Z', action: 'reorder', section: 'internships', recordId: null, recordTitle: null, fields: ['order_index'], detail: { count: 3 } }),
  row(6, { at: '2026-11-17T16:20:00.000Z', section: 'about_content', recordId: 'a1', recordTitle: 'About me', fields: ['about_me_content'], source: 'outside' }),
];

const flush = () => act(async () => { await Promise.resolve(); await new Promise((r) => setTimeout(r, 0)); });
const pane = () => document.getElementById(ACTIVITY_PANE_ID);
const buttonNamed = (text) => [...pane().querySelectorAll('button')].find((b) => b.textContent.trim() === text);

let lastFeed = null;
function Harness({ onOpen }) {
  const feed = useActivityFeed();
  lastFeed = feed;
  return <ActivityPane feed={feed} onOpen={onOpen} now={NOW} />;
}

describe('ActivityPane', () => {
  let onOpen, view;
  const render = () => { view = mount(<Harness onOpen={onOpen} />); };
  beforeEach(() => {
    onOpen = jest.fn();
    service.listActivity.mockResolvedValue({ rows: ROWS, hasMore: true });
    service.listDeletedRecords.mockResolvedValue([]);
  });
  afterEach(() => { view?.unmount(); view = null; });

  it('shows skeleton rows while the first page loads', async () => {
    service.listActivity.mockReturnValue(new Promise(() => {}));
    render();
    expect(pane().querySelector('[data-testid="activity-loading"]').children).toHaveLength(5);
    expect(pane().getAttribute('aria-busy')).toBe('true');
  });

  it('groups rows into New York days with sentences, sub lines and the outside tag', async () => {
    render();
    await flush();
    expect(PAGE_SIZE).toBe(20);
    expect(service.listActivity).toHaveBeenCalledWith({ limit: 20, filter: 'all' });
    expect([...pane().querySelectorAll('.act-day h4')].map((h) => h.textContent)).toEqual(['Today', 'Yesterday', 'Tue 17 Nov']);
    expect(pane().querySelector('.v5-head__sum').textContent).toBe('Showing 6 events since Tue 17 Nov');   // more to load: no total claimed
    const first = pane().querySelector('.act-row');
    expect(first.querySelector('time').textContent).toBe('13:42');
    expect(first.querySelector('b').textContent).toBe('Edited Tallyproof');
    expect(first.querySelector('.act-row__text > span').textContent).toBe('Projects · description, technologies');
    const text = pane().textContent;
    expect(text).toContain('Signed in');
    expect(text).toContain('Security · Google, then passkey');
    expect(text).toContain('Internships · Order of 3 internships');
    expect(text).toContain('About · about me content');
    expect(pane().querySelectorAll('.act-tag')).toHaveLength(1);
    expect(pane().querySelector('.act-row__icon.is-bad')).not.toBeNull();
    expect(pane().querySelector('.act-row__icon.is-sec')).not.toBeNull();
  });

  it('strikes through records that are gone and opens only records that still exist', async () => {
    render();
    await flush();
    const struck = [...pane().querySelectorAll('s')].map((s) => s.textContent);
    expect(struck).toEqual(['TEST-Orbit demo', 'TEST-Orbit demo']);
    expect(pane().textContent).toContain('record no longer exists');
    const opening = [...pane().querySelectorAll('button.act-row')].map((b) => b.querySelector('b').textContent);
    expect(opening).toEqual(['Edited Tallyproof', 'Edited About me']);
    click(pane().querySelector('button.act-row'));
    expect(onOpen).toHaveBeenCalledWith('projects', 'p1');
  });

  it('pages earlier rows before the oldest one shown, without repeats, and hides the button at the end', async () => {
    render();
    await flush();
    service.listActivity.mockResolvedValue({ rows: [ROWS[5], row(7, { at: '2026-11-10T16:00:00.000Z', recordId: 'p2', recordTitle: 'CareVault' })], hasMore: false });
    click(buttonNamed('Show earlier'));
    await flush();
    expect(service.listActivity).toHaveBeenLastCalledWith({ before: { at: ROWS[5].at, id: ROWS[5].id }, limit: 20, filter: 'all' });
    expect(pane().querySelectorAll('.act-row')).toHaveLength(7);
    expect(pane().textContent).toContain('Tue 10 Nov');
    expect(buttonNamed('Show earlier')).toBeUndefined();
  });

  it('keeps the rows and says so when an earlier page fails', async () => {
    render();
    await flush();
    service.listActivity.mockRejectedValue(new TypeError('Failed to fetch'));
    click(buttonNamed('Show earlier'));
    await flush();
    expect(pane().querySelectorAll('.act-row')).toHaveLength(6);
    expect(pane().querySelector('.act-foot__error').textContent).toMatch(/did not reach the server/);
  });

  it('reloads under a filter, keeps the filter bar, and says when a filter is empty', async () => {
    render();
    await flush();
    service.listActivity.mockResolvedValue({ rows: [], hasMore: false });
    click(buttonNamed('Files'));
    await flush();
    expect(service.listActivity).toHaveBeenLastCalledWith({ limit: PAGE_SIZE, filter: 'files' });
    expect(buttonNamed('Files').getAttribute('aria-pressed')).toBe('true');
    expect(buttonNamed('All').getAttribute('aria-pressed')).toBe('false');
    expect(pane().textContent).toContain('Nothing under Files yet.');
  });

  it('shows the calm empty state before anything is recorded', async () => {
    service.listActivity.mockResolvedValue({ rows: [], hasMore: false });
    render();
    await flush();
    expect(pane().textContent).toContain('Nothing yet.');
    expect(pane().textContent).toContain('Changes made before today are not known.');
    expect(pane().querySelector('.v5-seg')).toBeNull();
  });

  it('says "not set up yet" when the table is missing, with no error and no filters', async () => {
    service.listActivity.mockRejectedValue(Object.assign(new Error('This is not set up yet.'), { code: 'ACTIVITY_NOT_SET_UP' }));
    render();
    await flush();
    expect(pane().textContent).toContain('Not set up yet.');
    expect(pane().querySelector('[role="alert"]')).toBeNull();
    expect(pane().querySelector('.v5-seg')).toBeNull();
  });

  it('reads a bulk inbox change as one sentence, and joins a run split by a page edge', async () => {
    const inbox = (id, over) => row(id, { at: '2026-11-19T18:50:00.000Z', action: 'inbox', section: 'contact_messages', recordId: `m${id}`, recordTitle: null, fields: ['is_archived'], detail: { status: 'archived' }, ...over });
    service.listActivity.mockResolvedValue({ rows: [inbox(20), inbox(21), inbox(22, { detail: { status: 'starred' } }), ...ROWS.slice(0, 1), inbox(23, { at: '2026-11-19T18:10:00.000Z' })], hasMore: true });
    render();
    await flush();
    const sentences = () => [...pane().querySelectorAll('.act-row b')].map((b) => b.textContent);
    expect(sentences()).toEqual(['Archived 2 messages', 'Starred a message', 'Edited Tallyproof', 'Archived a message']);
    expect(pane().querySelector('.v5-head__sum').textContent).toBe('Showing 4 events from today');
    service.listActivity.mockResolvedValue({ rows: [inbox(24, { at: '2026-11-19T18:10:00.000Z' })], hasMore: false });
    click(buttonNamed('Show earlier'));
    await flush();
    expect(service.listActivity).toHaveBeenLastCalledWith({ before: { at: '2026-11-19T18:10:00.000Z', id: 23 }, limit: PAGE_SIZE, filter: 'all' });
    expect(sentences()[3]).toBe('Archived 2 messages');
    expect(pane().querySelectorAll('button.act-row')).toHaveLength(1);
  });

  it('shows one fixed sentence on failure and loads again on Try again', async () => {
    service.listActivity.mockRejectedValue(Object.assign(new Error('JWT expired at db'), { code: 'SESSION_EXPIRED' }));
    render();
    await flush();
    expect(pane().querySelector('[role="alert"]').textContent).toContain('The session has expired.');
    expect(pane().textContent).not.toContain('JWT expired at db');
    service.listActivity.mockResolvedValue({ rows: ROWS, hasMore: false });
    click(buttonNamed('Try again'));
    await flush();
    expect(pane().querySelectorAll('.act-row')).toHaveLength(6);
  });

  it('ignores a slow answer once another filter has been asked for', async () => {
    render();
    await flush();
    let finishSecurity;
    service.listActivity.mockImplementation(({ filter }) => (filter === 'security'
      ? new Promise((resolve) => { finishSecurity = resolve; })
      : Promise.resolve({ rows: [ROWS[0]], hasMore: false })));
    click(buttonNamed('Security'));
    await flush();
    expect(service.listActivity).toHaveBeenLastCalledWith({ limit: PAGE_SIZE, filter: 'security' });
    click(buttonNamed('Content'));
    await flush();
    finishSecurity({ rows: ROWS, hasMore: false });   // the stale Security answer arrives last
    await flush();
    expect(pane().querySelectorAll('.act-row')).toHaveLength(1);
    expect(buttonNamed('Content').getAttribute('aria-pressed')).toBe('true');
  });

  // ----- review fixes -----

  it('returns every row of a same-instant bulk change split by a page edge, keeping the microseconds', async () => {
    // 30 messages archived in one transaction share one microsecond instant; a server that compares
    // exactly (as Postgres does) only returns the rest when the cursor carries that instant unchanged.
    const AT = '2026-11-19T18:50:00.779068+00:00';
    const all = Array.from({ length: 30 }, (_, i) => row(100 - i, { at: AT, action: 'inbox', section: 'contact_messages', recordId: `m${i}`, recordTitle: null, fields: ['is_archived'], detail: { status: 'archived' } }));
    service.listActivity.mockImplementation(async ({ before, limit }) => {
      const older = before ? all.filter((r) => r.at < before.at || (r.at === before.at && r.id < before.id)) : all;
      return { rows: older.slice(0, limit), hasMore: older.length > limit };
    });
    render();
    await flush();
    expect(pane().querySelector('.act-row b').textContent).toBe('Archived 20 messages');
    click(buttonNamed('Show earlier'));
    await flush();
    expect(service.listActivity).toHaveBeenLastCalledWith({ before: { at: AT, id: 81 }, limit: PAGE_SIZE, filter: 'all' });
    expect(pane().querySelectorAll('.act-row')).toHaveLength(1);
    expect(pane().querySelector('.act-row b').textContent).toBe('Archived 30 messages');
    expect(buttonNamed('Show earlier')).toBeUndefined();
  });

  it('strikes a record deleted outside the filtered list: upload then delete X, Files shows X struck and closed', async () => {
    render();
    await flush();
    const upload = row(30, { action: 'upload', recordId: 'px', recordTitle: 'Orbit', fields: ['image_urls'], detail: { added: 1 } });
    service.listActivity.mockResolvedValue({ rows: [upload], hasMore: false });
    service.listDeletedRecords.mockResolvedValue([{ section: 'projects', recordId: 'px' }]);
    click(buttonNamed('Files'));
    await flush();
    expect(service.listDeletedRecords).toHaveBeenLastCalledWith([{ section: 'projects', recordId: 'px' }]);
    expect(pane().querySelector('.act-row s').textContent).toBe('Orbit');
    expect(pane().textContent).toContain('record no longer exists');
    expect(pane().querySelector('button.act-row')).toBeNull();
  });

  it('still shows the rows when the deleted check fails', async () => {
    service.listDeletedRecords.mockRejectedValue(new TypeError('Failed to fetch'));
    render();
    await flush();
    expect(pane().querySelectorAll('.act-row')).toHaveLength(6);
    expect(pane().querySelectorAll('button.act-row')).toHaveLength(2);
  });

  it('refreshes quietly: no skeleton, rows kept on failure, as many rows as are shown', async () => {
    render();
    await flush();
    let finish;
    service.listActivity.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    act(() => { lastFeed.refresh(); });
    expect(pane().querySelector('[data-testid="activity-loading"]')).toBeNull();
    expect(pane().querySelectorAll('.act-row')).toHaveLength(6);
    expect(service.listActivity).toHaveBeenLastCalledWith({ limit: PAGE_SIZE, filter: 'all' });
    await act(async () => { finish({ rows: [row(40, { at: '2026-11-19T18:55:00.000Z', recordTitle: 'New one' }), ...ROWS], hasMore: true }); });
    await flush();
    expect(pane().querySelector('.act-row b').textContent).toBe('Edited New one');
    service.listActivity.mockRejectedValue(new TypeError('Failed to fetch'));
    act(() => { lastFeed.refresh(); });
    await flush();
    expect(pane().querySelectorAll('.act-row')).toHaveLength(7);
    expect(pane().querySelector('[role="alert"]')).toBeNull();
  });

  describe('when the shared content signal moves', () => {
    const pending = () => { let finish; service.listActivity.mockReturnValue(new Promise((resolve) => { finish = resolve; })); return (page) => act(async () => { finish(page); }); };
    const SAVED = row(41, { at: '2026-11-19T18:58:00.000Z', recordTitle: 'Saved elsewhere' });

    it('reloads quietly under the current filter, keeping the rows and the filter on screen', async () => {
      render();
      await flush();
      service.listActivity.mockResolvedValue({ rows: ROWS, hasMore: true });
      click(buttonNamed('Content'));
      await flush();
      service.listActivity.mockClear();
      const finish = pending();
      act(() => { noteContentChanged(); });
      expect(service.listActivity).toHaveBeenCalledTimes(1);
      expect(service.listActivity).toHaveBeenCalledWith({ limit: PAGE_SIZE, filter: 'content' });
      expect(pane().querySelector('[data-testid="activity-loading"]')).toBeNull();
      expect(pane().querySelectorAll('.act-row')).toHaveLength(6);
      await finish({ rows: [SAVED, ...ROWS], hasMore: true });
      await flush();
      expect(pane().querySelector('.act-row b').textContent).toBe('Edited Saved elsewhere');
      expect(buttonNamed('Content').getAttribute('aria-pressed')).toBe('true');
    });

    it('reads once when the signal and another refresh fire together', async () => {
      render();
      await flush();
      service.listActivity.mockClear();
      const finish = pending();
      act(() => { noteContentChanged(); lastFeed.refresh(); });
      act(() => { lastFeed.refresh(); noteContentChanged(); });
      expect(service.listActivity).toHaveBeenCalledTimes(1);
      await finish({ rows: ROWS, hasMore: true });
      await flush();
      expect(service.listActivity).toHaveBeenCalledTimes(1);
    });

    it('reads once more when the content changes after a quiet reload set off, and not for a plain refresh', async () => {
      render();
      await flush();
      service.listActivity.mockClear();
      let finish = pending();
      act(() => { lastFeed.refresh(); });
      await act(async () => { await Promise.resolve(); });   // a later task: that read may predate the save
      act(() => { lastFeed.refresh(); });                     // already covered by the read in flight
      act(() => { noteContentChanged(); noteContentChanged(); });
      expect(service.listActivity).toHaveBeenCalledTimes(1);
      const first = finish;
      finish = pending();
      await first({ rows: ROWS, hasMore: true });
      expect(service.listActivity).toHaveBeenCalledTimes(2);
      await finish({ rows: [SAVED, ...ROWS], hasMore: true });
      await flush();
      expect(service.listActivity).toHaveBeenCalledTimes(2);
      expect(pane().querySelector('.act-row b').textContent).toBe('Edited Saved elsewhere');
    });

    it('stops listening once unmounted', async () => {
      render();
      await flush();
      view.unmount(); view = null;
      service.listActivity.mockClear();
      act(() => { noteContentChanged(); });
      expect(service.listActivity).not.toHaveBeenCalled();
    });
  });

  it('moves focus into the list when Show earlier loads the last page, and announces what came in', async () => {
    render();
    await flush();
    service.listActivity.mockResolvedValue({ rows: [row(7, { at: '2026-11-10T16:00:00.000Z', recordId: 'p2', recordTitle: 'CareVault' })], hasMore: false });
    const more = buttonNamed('Show earlier');
    more.focus();
    click(more);
    expect(more.disabled).toBe(false);   // aria-disabled while loading, so the focus it holds is not dropped
    expect(more.getAttribute('aria-disabled')).toBe('true');
    await flush();
    expect(document.activeElement.textContent).toContain('Edited CareVault');
    expect(pane().querySelector('[data-testid="activity-announce"]').textContent).toBe('1 more loaded. That is everything recorded.');
  });

  it('falls back to the foot line when the last row added cannot be opened', async () => {
    render();
    await flush();
    service.listActivity.mockResolvedValue({ rows: [row(8, { at: '2026-11-10T16:00:00.000Z', action: 'sign-in', section: 'security', recordId: null, recordTitle: null, fields: [] })], hasMore: false });
    click(buttonNamed('Show earlier'));
    await flush();
    expect(document.activeElement.classList.contains('act-foot__note')).toBe(true);
  });

  it('announces filter results politely', async () => {
    render();
    await flush();
    const live = pane().querySelector('[data-testid="activity-announce"]');
    expect(live.getAttribute('aria-live')).toBe('polite');
    expect(live.textContent).toBe('');
    service.listActivity.mockResolvedValue({ rows: [ROWS[3]], hasMore: false });
    click(buttonNamed('Security'));
    await flush();
    expect(live.textContent).toBe('Security: 1 event');
    service.listActivity.mockResolvedValue({ rows: [], hasMore: false });
    click(buttonNamed('Files'));
    await flush();
    expect(live.textContent).toBe('Nothing under Files yet.');
  });

  it('claims a span total only when everything in it is loaded', async () => {
    service.listActivity.mockResolvedValue({ rows: ROWS, hasMore: false });
    render();
    await flush();
    expect(pane().querySelector('.v5-head__sum').textContent).toBe('Last 3 days · 6 events');
  });
});

describe('ActivityPane at a New York midnight', () => {
  let view;
  afterEach(() => { view?.unmount(); view = null; jest.useRealTimers(); });

  it('reloads quietly when the date changes while open', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-11-20T04:59:30.000Z'));   // 23:59:30 on Thu 19 Nov in New York
    service.listActivity.mockResolvedValue({ rows: ROWS, hasMore: false });
    service.listDeletedRecords.mockResolvedValue([]);
    const tick = async (ms) => { await act(async () => { jest.advanceTimersByTime(ms); for (let i = 0; i < 6; i += 1) await Promise.resolve(); }); };
    view = mount(<Harness onOpen={jest.fn()} />);
    await tick(0);
    expect(service.listActivity).toHaveBeenCalledTimes(1);
    await tick(20000);   // still Thursday
    expect(service.listActivity).toHaveBeenCalledTimes(1);
    await tick(15000);   // Friday 00:00:05
    expect(service.listActivity).toHaveBeenCalledTimes(2);
    expect(lastFeed.day).toBe('2026-11-20');
    expect(pane().querySelector('[data-testid="activity-loading"]')).toBeNull();
  });
});
