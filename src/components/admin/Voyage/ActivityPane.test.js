/* eslint-disable testing-library/no-container, testing-library/no-node-access */
import ActivityPane, { ACTIVITY_PANE_ID, PAGE_SIZE, useActivityFeed } from './ActivityPane';
import { React, act, click, mount } from '../SkyBackground/testUtils';

jest.mock('../../../services/activityService', () => ({ ACTIVITY_NOT_SET_UP: 'ACTIVITY_NOT_SET_UP', listActivity: jest.fn(), recordHistory: jest.fn(), isActivityAvailable: jest.fn(), logSecurityEvent: jest.fn() }));
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

function Harness({ onOpen }) {
  const feed = useActivityFeed();
  return <ActivityPane feed={feed} onOpen={onOpen} now={NOW} />;
}

describe('ActivityPane', () => {
  let onOpen, view;
  const render = () => { view = mount(<Harness onOpen={onOpen} />); };
  beforeEach(() => {
    onOpen = jest.fn();
    service.listActivity.mockResolvedValue({ rows: ROWS, hasMore: true });
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
    expect(service.listActivity).toHaveBeenCalledWith({ limit: PAGE_SIZE, filter: 'all' });
    expect([...pane().querySelectorAll('.act-day h4')].map((h) => h.textContent)).toEqual(['Today', 'Yesterday', 'Tue 17 Nov']);
    expect(pane().querySelector('.v5-head__sum').textContent).toBe('Last 3 days · 6 events');
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
    expect(service.listActivity).toHaveBeenLastCalledWith({ before: { at: ROWS[5].at, id: ROWS[5].id }, limit: PAGE_SIZE, filter: 'all' });
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
    expect(pane().querySelector('.v5-head__sum').textContent).toBe('Today · 4 events');
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
});
