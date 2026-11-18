/* eslint-disable testing-library/no-container, testing-library/no-node-access */
// The skills chapter as a grouped deck: moving a group writes renumbered
// priorities (and rolls back on failure), and a new skill takes the priority
// of the group it joins.

import DeckChapter from './DeckChapter';
import { skillsSchema } from './managers/skills.schema';
import { React, act, click, mount, setInputValue } from '../SkyBackground/testUtils';

jest.mock('../../../services/voyageRecords', () => ({
  listRecords: jest.fn(), saveRecord: jest.fn(), deleteRecord: jest.fn(), reorderRecords: jest.fn(), reorderGroups: jest.fn(), uploadImages: jest.fn(), removeImage: jest.fn(), imageProblems: jest.fn(),
  failureKind: jest.fn(), fetchUpdatedAt: jest.fn(), getRecord: jest.fn(), fileProblems: jest.fn(), uploadFieldFiles: jest.fn(), removeStoredFiles: jest.fn(),
}));
const records = jest.requireMock('../../../services/voyageRecords');
const flush = () => act(async () => { await Promise.resolve(); await new Promise((r) => setTimeout(r, 0)); });
const rows = [
  { id: 1, skill_name: 'Python', category: 'Languages', skill_type: 'Programming Languages', skill_type_priority: 1, status: 'active', order_index: 1 },
  { id: 2, skill_name: 'AWS', category: 'Cloud', skill_type: 'Cloud Platforms', skill_type_priority: 2, status: 'active', order_index: 1 },
];
const heads = (root) => [...root.querySelectorAll('.deck__group h3')].map((h) => h.textContent);
const input = (key) => document.querySelector(`[data-field="${key}"] input, [data-field="${key}"] select`);

describe('a grouped chapter', () => {
  let notify;
  beforeEach(() => { notify = jest.fn(); records.listRecords.mockResolvedValue(rows); });
  afterEach(() => { document.body.innerHTML = ''; });

  it('moves a group up, saves the renumbered priorities, and rolls back when the save fails', async () => {
    records.reorderGroups.mockResolvedValueOnce().mockRejectedValueOnce(new Error('The new group order could not be saved.'));
    const view = mount(<DeckChapter schema={skillsSchema} notify={notify} />);
    await flush();
    expect(heads(view.container)).toEqual(['Programming Languages', 'Cloud Platforms']);
    click(view.container.querySelector('[aria-label="Move Cloud Platforms up"]'));
    await flush();
    expect(records.reorderGroups).toHaveBeenCalledWith(skillsSchema, [{ value: 'Cloud Platforms', priority: 1 }, { value: 'Programming Languages', priority: 2 }]);
    expect(heads(view.container)).toEqual(['Cloud Platforms', 'Programming Languages']);
    expect(notify).toHaveBeenCalledWith('Group order saved.');
    click(view.container.querySelector('[aria-label="Move Programming Languages up"]'));
    await flush();
    expect(heads(view.container)).toEqual(['Cloud Platforms', 'Programming Languages']);
    expect(notify).toHaveBeenLastCalledWith('The new group order could not be saved.', 'bad');
    view.unmount();
  });

  it('gives a new skill the priority of the group it joins', async () => {
    records.saveRecord.mockImplementation(async (_s, payload) => ({ ...payload, id: 3 }));
    const view = mount(<DeckChapter schema={skillsSchema} notify={notify} />);
    await flush();
    click(view.container.querySelector('.card--new'));
    setInputValue(input('skill_name'), 'Lambda');
    setInputValue(input('category'), 'Cloud');
    const select = input('skill_type');
    act(() => { select.value = 'Cloud Platforms'; select.dispatchEvent(new Event('change', { bubbles: true })); });
    click([...document.querySelectorAll('.record-dialog button')].find((b) => b.textContent.trim() === 'Add skill'));
    await flush();
    expect(records.saveRecord).toHaveBeenCalledWith(skillsSchema, expect.objectContaining({ skill_name: 'Lambda', skill_type: 'Cloud Platforms', skill_type_priority: 2 }), null);
    expect(records.saveRecord.mock.calls[0][1]).not.toHaveProperty('order_index', 3);   // no order column owned by the deck: order_index stays what the form says
    view.unmount();
  });
});
