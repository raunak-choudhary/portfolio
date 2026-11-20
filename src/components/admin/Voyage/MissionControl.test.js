/* eslint-disable testing-library/no-container, testing-library/no-node-access */
// Integration: the bento and the activity pane share one feed, and every row click goes through openRecord.
import MissionControl, { chapterForTable } from './MissionControl';
import { ACTIVITY_PANE_ID, ACTIVITY_TITLE_ID } from './ActivityPane';
import { noteContentChanged } from './contentChanged';
import { clearIntent, recordIntent } from './recordIntent';
import { React, act, click, mount } from '../SkyBackground/testUtils';

jest.mock('../../../services/activityService', () => ({ ACTIVITY_NOT_SET_UP: 'ACTIVITY_NOT_SET_UP', listActivity: jest.fn(), listDeletedRecords: jest.fn(), recordHistory: jest.fn(), isActivityAvailable: jest.fn(), logSecurityEvent: jest.fn() }));
// Bento reads relativeTime from voyageData, which opens the Supabase client
jest.mock('../../../services/voyageData', () => ({ relativeTime: () => '2 h ago' }));
const service = jest.requireMock('../../../services/activityService');

const NOW = new Date('2026-11-19T19:00:00.000Z');
const row = (id, over) => ({ id, at: '2026-11-19T18:42:00.000Z', action: 'edit', section: 'projects', recordId: `p${id}`, recordTitle: `Project ${id}`, fields: ['title'], detail: {}, source: 'admin', ...over });
const ROWS = [1, 2, 3, 4, 5, 6, 7].map((i) => row(i, { at: new Date(Date.parse('2026-11-19T18:42:00.000Z') - i * 3600000).toISOString() }));
const DATA = { health: null, visitors: null, inbox: null, pages: null, stats: null, edits: [{ section: 'Projects', label: 'Tallyproof', at: '2026-11-19T17:00:00.000Z' }], assetBase: '/admin/sky/' };
const flush = () => act(async () => { await Promise.resolve(); await new Promise((r) => setTimeout(r, 0)); });

describe('MissionControl', () => {
  let view, onGo;
  const tile = () => [...view.container.querySelectorAll('.tile')].find((t) => t.textContent.includes('Recent activity'));
  const render = (props = {}) => { view = mount(<MissionControl data={DATA} onGo={onGo} now={NOW} {...props} />); };
  beforeEach(() => {
    onGo = jest.fn();
    Element.prototype.scrollIntoView = jest.fn();
    service.listActivity.mockResolvedValue({ rows: ROWS, hasMore: false });
  });
  afterEach(() => { view?.unmount(); view = null; window.localStorage.clear(); });

  it('maps a table to its deck chapter', () => {
    expect(chapterForTable('projects').id).toBe('projects');
    expect(chapterForTable('work_experience').id).toBe('work');
    expect(chapterForTable('contact_messages')).toBeUndefined();
    expect(chapterForTable('security')).toBeUndefined();
  });

  it('loads the feed once and shows its five newest rows in the tile', async () => {
    render();
    expect(tile().querySelector('[data-testid="tile-activity-loading"]')).not.toBeNull();
    await flush();
    expect(service.listActivity).toHaveBeenCalledTimes(1);
    const lines = [...tile().querySelectorAll('.tile__act > div')];
    expect(lines).toHaveLength(5);
    expect(lines[0].textContent).toBe('12:42Edited Project 1');
    expect(lines[0].querySelector('b').textContent).toBe('Project 1');
    expect(lines[0].getAttribute('title')).toBe('Edited Project 1');   // the whole sentence, for a row clamped at two lines
    expect(view.container.querySelectorAll(`#${ACTIVITY_PANE_ID} .act-row`)).toHaveLength(7);
  });

  it('scrolls to the pane from "See all activity", without smoothing when motion is off', async () => {
    render({ motion: false });
    await flush();
    click([...tile().querySelectorAll('button')].find((b) => b.textContent === 'See all activity'));
    expect(Element.prototype.scrollIntoView).toHaveBeenCalledWith({ behavior: 'auto', block: 'start' });
    expect(Element.prototype.scrollIntoView.mock.instances[0].id).toBe(ACTIVITY_PANE_ID);
  });

  it('opens a row through openRecord, which sets a read intent for the record', async () => {
    render();
    await flush();
    click(view.container.querySelector(`#${ACTIVITY_PANE_ID} button.act-row`));
    expect(recordIntent.get()).toEqual({ table: 'projects', recordId: 'p1', mode: 'read', field: null, walk: null });
    expect(onGo).not.toHaveBeenCalled();   // the page travels on the intent
    act(() => clearIntent());
  });

  it('fills the fix queue slot beside the activity pane', async () => {
    render({ fixQueue: <section data-testid="fix-slot" /> });
    await flush();
    const split = view.container.querySelector('[data-testid="mission-split"]');
    expect(split.className).toBe('v5-split');
    expect(split.firstElementChild.dataset.testid).toBe('fix-slot');
    expect(split.lastElementChild.id).toBe(ACTIVITY_PANE_ID);
  });

  it('keeps the tile while the pane is filtered', async () => {
    render();
    await flush();
    service.listActivity.mockResolvedValue({ rows: [], hasMore: false });
    click([...view.container.querySelectorAll('.v5-seg button')].find((b) => b.textContent === 'Security'));
    await flush();
    expect(tile().querySelectorAll('.tile__act > div')).toHaveLength(5);
  });

  it('falls back to the latest saves per section while the table is missing', async () => {
    service.listActivity.mockRejectedValue(Object.assign(new Error('This is not set up yet.'), { code: 'ACTIVITY_NOT_SET_UP' }));
    render();
    await flush();
    expect(tile().querySelector('.tile__feed').textContent).toBe('2 h agoProjects · Tallyproof');
    expect(view.container.querySelector(`#${ACTIVITY_PANE_ID}`).textContent).toContain('Not set up yet.');
  });

  it('falls back as well when the log fails, and says "Nothing recorded yet" for an empty log', async () => {
    service.listActivity.mockRejectedValue(new Error('down'));
    render();
    await flush();
    expect(tile().querySelector('.tile__feed')).not.toBeNull();
    view.unmount();
    service.listActivity.mockResolvedValue({ rows: [], hasMore: false });
    render();
    await flush();
    expect(tile().textContent).toContain('Nothing recorded yet.');
  });

  it('gives the activity pane the whole row until the fix queue fills its slot', async () => {
    render();
    await flush();
    const split = view.container.querySelector('[data-testid="mission-split"]');
    expect(split.className).toBe('v5-split v5-split--single');
    view.unmount();
    render({ fixQueue: <section data-testid="fix-queue">queue</section> });
    await flush();
    const filled = view.container.querySelector('[data-testid="mission-split"]');
    expect(filled.className).toBe('v5-split');
    expect(filled.firstElementChild.dataset.testid).toBe('fix-queue');
    expect(filled.lastElementChild.id).toBe(ACTIVITY_PANE_ID);
  });

  it('moves focus to the pane heading from "See all activity"', async () => {
    render();
    await flush();
    click([...tile().querySelectorAll('button')].find((b) => b.textContent === 'See all activity'));
    expect(document.activeElement.id).toBe(ACTIVITY_TITLE_ID);
    expect(document.activeElement.textContent).toBe('Activity');
  });

  describe('coming back into view', () => {
    let observe;
    const RealObserver = global.IntersectionObserver;
    beforeEach(() => {
      observe = null;
      global.IntersectionObserver = jest.fn(function Observer(callback) {
        this.observe = () => { observe = (isIntersecting) => act(() => { callback([{ isIntersecting }]); }); };
        this.disconnect = jest.fn();
      });
    });
    afterEach(() => { global.IntersectionObserver = RealObserver; });

    it('reloads the feed quietly after the overview was away (a record saved or deleted elsewhere)', async () => {
      render();
      await flush();
      observe(true);                                  // the first report is the overview already on screen
      expect(service.listActivity).toHaveBeenCalledTimes(1);
      observe(false);                                 // off to a chapter, where a record is saved
      service.listActivity.mockResolvedValue({ rows: [row(9, { at: '2026-11-19T18:59:00.000Z', recordTitle: 'Saved just now' }), ...ROWS], hasMore: false });
      observe(true);
      expect(view.container.querySelector('[data-testid="tile-activity-loading"]')).toBeNull();
      expect(tile().querySelectorAll('.tile__act > div')).toHaveLength(5);
      await flush();
      expect(service.listActivity).toHaveBeenCalledTimes(2);
      expect(tile().querySelector('.tile__act > div').textContent).toBe('13:59Edited Saved just now');
    });

    it('reloads once when a save elsewhere and the return into view arrive together', async () => {
      render();
      await flush();
      observe(true);
      observe(false);
      service.listActivity.mockClear();
      service.listActivity.mockResolvedValue({ rows: [row(9, { at: '2026-11-19T18:59:00.000Z', recordTitle: 'Saved just now' }), ...ROWS], hasMore: false });
      act(() => { noteContentChanged(); });
      observe(true);
      await flush();
      expect(service.listActivity).toHaveBeenCalledTimes(1);
      expect(tile().querySelector('.tile__act > div').textContent).toBe('13:59Edited Saved just now');
    });
  });
});
