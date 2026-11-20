// A drag reorder in a deck raises the shared content signal once the new order
// is saved, and not for the optimistic step or a rollback. The Deck itself is a
// stand-in that hands its onReorder callback to the test, because dnd-kit's
// pointer and keyboard sensors need layout that jsdom does not provide.

import DeckChapter from './DeckChapter';
import { contentVersion } from './contentChanged';
import { projectsSchema } from './managers/projects.schema';
import { React, act, mount, setInputValue } from '../SkyBackground/testUtils';

jest.mock('../../../services/activityService', () => ({ ACTIVITY_NOT_SET_UP: 'ACTIVITY_NOT_SET_UP', listActivity: jest.fn(), listDeletedRecords: jest.fn(), recordHistory: jest.fn(), isActivityAvailable: jest.fn(), logSecurityEvent: jest.fn() }));
jest.mock('../../../services/voyageRecords', () => ({ listRecords: jest.fn(), saveRecord: jest.fn(), deleteRecord: jest.fn(), reorderRecords: jest.fn(), reorderGroups: jest.fn(), uploadImages: jest.fn(), removeImage: jest.fn(), imageProblems: jest.fn(), failureKind: jest.fn(), fetchUpdatedAt: jest.fn(), getRecord: jest.fn() }));
let mockDeck = null;
jest.mock('./Deck', () => function MockDeck(props) { mockDeck = props; return null; });
const records = jest.requireMock('../../../services/voyageRecords');

const flush = () => act(async () => { await Promise.resolve(); await new Promise((r) => setTimeout(r, 0)); });
const rows = [{ id: 'a', title: 'Older one', order_index: 1, technologies: [] }, { id: 'b', title: 'Newer one', order_index: 2, technologies: [] }];

describe('DeckChapter reorder and the content signal', () => {
  let notify, view;
  beforeEach(() => { notify = jest.fn(); mockDeck = null; records.listRecords.mockResolvedValue(rows); });
  afterEach(() => { view?.unmount(); view = null; });

  it('raises the signal after the new order is saved, not while the write is on its way', async () => {
    let finish;
    records.reorderRecords.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    view = mount(<DeckChapter schema={projectsSchema} notify={notify} />);
    await flush();
    const version = contentVersion.get();
    act(() => { mockDeck.onReorder(['a', 'b']); });
    expect(records.reorderRecords).toHaveBeenCalledTimes(1);
    expect(contentVersion.get()).toBe(version);          // the optimistic step alone
    await act(async () => { finish(); });
    await flush();
    expect(notify).toHaveBeenCalledWith('Order saved.');
    expect(contentVersion.get()).toBe(version + 1);
  });

  it('takes the stamps the reorder wrote, so the next Save of a moved record sees no false conflict', async () => {
    records.reorderRecords.mockResolvedValue([{ id: 'a', updated_at: '2026-11-20T10:00:00Z' }, { id: 'b', updated_at: '2026-11-20T10:00:00Z' }]);
    view = mount(<DeckChapter schema={projectsSchema} notify={notify} />);
    await flush();
    act(() => { mockDeck.onReorder(['a', 'b']); });
    await flush();
    expect(mockDeck.records.map((r) => [r.id, r.order_index, r.updated_at])).toEqual([['a', 2, '2026-11-20T10:00:00Z'], ['b', 1, '2026-11-20T10:00:00Z']]);
  });

  it('sends a second drag only after the first has been answered', async () => {
    let finishFirst;
    records.reorderRecords.mockReturnValueOnce(new Promise((resolve) => { finishFirst = resolve; })).mockResolvedValueOnce([]);
    view = mount(<DeckChapter schema={projectsSchema} notify={notify} />);
    await flush();
    act(() => { mockDeck.onReorder(['a', 'b']); });
    act(() => { mockDeck.onReorder(['b', 'a']); });
    await flush();
    expect(records.reorderRecords).toHaveBeenCalledTimes(1);
    await act(async () => { finishFirst([]); });
    await flush();
    expect(records.reorderRecords).toHaveBeenCalledTimes(2);
    expect(records.reorderRecords.mock.calls[1][1]).toEqual([{ id: 'b', order_index: 2 }, { id: 'a', order_index: 1 }]);
  });

  it('reloads the stored order when a save fails, because part of it may have been written', async () => {
    records.reorderRecords.mockRejectedValue(new Error('The new order could not be saved.'));
    view = mount(<DeckChapter schema={projectsSchema} notify={notify} />);
    await flush();
    records.listRecords.mockResolvedValue([{ ...rows[0], order_index: 5 }, rows[1]]);
    act(() => { mockDeck.onReorder(['a', 'b']); });
    await flush();
    expect(records.listRecords).toHaveBeenCalledTimes(2);
    expect(mockDeck.records.map((r) => [r.id, r.order_index])).toEqual([['a', 5], ['b', 2]]);
  });

  it('shows the order a queued drag stored, even after an earlier failed drag reloaded the deck', async () => {
    let failFirst;
    records.reorderRecords.mockReturnValueOnce(new Promise((_resolve, reject) => { failFirst = reject; })).mockResolvedValueOnce([{ id: 'a', updated_at: 'S2' }, { id: 'b', updated_at: 'S2' }]);
    view = mount(<DeckChapter schema={projectsSchema} notify={notify} />);
    await flush();
    act(() => { mockDeck.onReorder(['b', 'a']); });       // first drag: will fail
    act(() => { mockDeck.onReorder(['a', 'b']); });       // second drag, queued: a on top
    await act(async () => { failFirst(new Error('The new order could not be saved.')); });
    await flush();
    // the reload after the failure returned the stored rows (a 1, b 2); the second write then landed
    expect(records.reorderRecords).toHaveBeenCalledTimes(2);
    expect(mockDeck.records.map((r) => [r.id, r.order_index, r.updated_at])).toEqual([['a', 2, 'S2'], ['b', 1, 'S2']]);
  });

  it('hands the open record the stamp a reorder wrote, so a card opened mid-write saves without a false conflict', async () => {
    let finish;
    records.reorderRecords.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    records.fetchUpdatedAt.mockResolvedValue('2026-11-20T10:00:00Z');
    records.saveRecord.mockImplementation(async (_s, payload) => ({ ...rows[0], ...payload, updated_at: '2026-11-20T10:01:00Z' }));
    const stamped = rows.map((r) => ({ ...r, updated_at: '2026-11-20T09:00:00Z' }));
    records.listRecords.mockResolvedValue(stamped);
    view = mount(<DeckChapter schema={projectsSchema} notify={notify} />);
    await flush();
    act(() => { mockDeck.onReorder(['a', 'b']); });
    act(() => { mockDeck.onOpen(mockDeck.records.find((r) => r.id === 'a')); });   // opened while the write is on its way
    await act(async () => { finish([{ id: 'a', updated_at: '2026-11-20T10:00:00Z' }, { id: 'b', updated_at: '2026-11-20T10:00:00Z' }]); });
    await flush();
    const inDialog = (text) => [...document.querySelectorAll('.record-dialog button')].find((b) => b.textContent.trim() === text);
    act(() => { inDialog('Edit').dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    setInputValue(document.querySelector('[data-field="title"] input'), 'Older one, renamed');
    act(() => { inDialog('Save').dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    await flush();
    expect(document.querySelector('.record-banner--warn')).toBeNull();
    expect(records.saveRecord).toHaveBeenCalledWith(projectsSchema, { title: 'Older one, renamed' }, 'a');
  });

  it('leaves the signal alone when the save fails and the order rolls back', async () => {
    records.reorderRecords.mockRejectedValue(new Error('The new order could not be saved.'));
    view = mount(<DeckChapter schema={projectsSchema} notify={notify} />);
    await flush();
    const version = contentVersion.get();
    act(() => { mockDeck.onReorder(['a', 'b']); });
    await flush();
    expect(notify).toHaveBeenCalledWith('The new order could not be saved.', 'bad');
    expect(contentVersion.get()).toBe(version);
  });
});
