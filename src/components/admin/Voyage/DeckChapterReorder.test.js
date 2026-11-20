// A drag reorder in a deck raises the shared content signal once the new order
// is saved, and not for the optimistic step or a rollback. The Deck itself is a
// stand-in that hands its onReorder callback to the test, because dnd-kit's
// pointer and keyboard sensors need layout that jsdom does not provide.

import DeckChapter from './DeckChapter';
import { contentVersion } from './contentChanged';
import { projectsSchema } from './managers/projects.schema';
import { React, act, mount } from '../SkyBackground/testUtils';

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
