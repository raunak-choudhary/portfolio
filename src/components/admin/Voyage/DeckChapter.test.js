/* eslint-disable testing-library/no-container, testing-library/no-node-access */
import DeckChapter from './DeckChapter';
import { projectsSchema } from './managers/projects.schema';
import { React, act, click, mount, setInputValue } from '../SkyBackground/testUtils';

jest.mock('../../../services/voyageRecords', () => ({ listRecords: jest.fn(), saveRecord: jest.fn(), deleteRecord: jest.fn(), reorderRecords: jest.fn(), uploadImages: jest.fn(), removeImage: jest.fn(), imageProblem: jest.fn(() => null) }));
const records = jest.requireMock('../../../services/voyageRecords');
const flush = () => act(async () => { await Promise.resolve(); await new Promise((r) => setTimeout(r, 0)); });
const rows = [{ id: 'a', title: 'Older one', order_index: 1, technologies: [] }, { id: 'b', title: 'Newer one', order_index: 2, technologies: [] }];

describe('DeckChapter', () => {
  let notify;
  beforeEach(() => { notify = jest.fn(); records.listRecords.mockResolvedValue(rows); });
  afterEach(() => { document.body.innerHTML = ''; });

  it('loads the deck newest first, opens the sheet on a card, merges a save, and drops a deleted card', async () => {
    records.saveRecord.mockResolvedValue({ id: 'b', title: 'Newer one, renamed', order_index: 2, technologies: [] });
    records.deleteRecord.mockResolvedValue();
    const view = mount(<DeckChapter schema={projectsSchema} notify={notify} />);
    await flush();
    const titles = () => [...view.container.querySelectorAll('article.card h4')].map((h) => h.textContent);
    expect(titles()).toEqual(['Newer one', 'Older one']);
    click(view.container.querySelectorAll('.card__open')[0]);
    expect(document.querySelector('#sheet-title').textContent).toBe('Newer one');
    const label = [...document.querySelectorAll('.sheet label')].find((l) => l.textContent.startsWith('Title'));
    setInputValue(document.getElementById(label.getAttribute('for')), 'Newer one, renamed');
    click([...document.querySelectorAll('.sheet button')].find((b) => b.textContent.trim() === 'Save'));
    await flush();
    expect(titles()).toEqual(['Newer one, renamed', 'Older one']);
    expect(document.querySelector('#sheet-title').textContent).toBe('Newer one, renamed');
    click([...document.querySelectorAll('.sheet button')].find((b) => b.textContent.trim() === 'Delete'));
    click([...document.querySelectorAll('.dialog button')].find((b) => b.textContent === 'Delete'));
    await flush();
    expect(document.querySelector('[data-testid="sheet"]')).toBeNull();
    expect(view.container.querySelector('article.card.is-leaving')).not.toBeNull();
    await act(async () => { await new Promise((r) => setTimeout(r, 500)); });   // the leaving animation's timer
    expect(titles()).toEqual(['Older one']);
    view.unmount();
  });

  it('creates through the new card with the next order index and rolls a failed reorder back', async () => {
    records.saveRecord.mockResolvedValue({ id: 'c', title: 'Third thing', order_index: 3, technologies: [] });
    records.reorderRecords.mockRejectedValue(new Error('The new order could not be saved.'));
    const view = mount(<DeckChapter schema={projectsSchema} notify={notify} />);
    await flush();
    click(view.container.querySelector('.card--new'));
    const label = [...document.querySelectorAll('.sheet label')].find((l) => l.textContent.startsWith('Title'));
    setInputValue(document.getElementById(label.getAttribute('for')), 'Third thing');
    click([...document.querySelectorAll('.sheet button')].find((b) => b.textContent.trim() === 'Add project'));
    await flush();
    expect(records.saveRecord).toHaveBeenCalledWith(projectsSchema, expect.objectContaining({ title: 'Third thing', order_index: 3 }), null);
    expect([...view.container.querySelectorAll('article.card h4')].map((h) => h.textContent)[0]).toBe('Third thing');
    expect(view.container.querySelector('article.card.is-new')).not.toBeNull();
    view.unmount();
  });
});
