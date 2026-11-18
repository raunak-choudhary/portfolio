/* eslint-disable testing-library/no-container, testing-library/no-node-access */
import DeckChapter from './DeckChapter';
import { projectsSchema } from './managers/projects.schema';
import { React, act, click, mount, setInputValue } from '../SkyBackground/testUtils';

jest.mock('../../../services/voyageRecords', () => ({ listRecords: jest.fn(), saveRecord: jest.fn(), deleteRecord: jest.fn(), reorderRecords: jest.fn(), uploadImages: jest.fn(), removeImage: jest.fn(), imageProblems: jest.fn(), failureKind: jest.fn(), fetchUpdatedAt: jest.fn(), getRecord: jest.fn() }));
const records = jest.requireMock('../../../services/voyageRecords');
const flush = () => act(async () => { await Promise.resolve(); await new Promise((r) => setTimeout(r, 0)); });
const rows = [{ id: 'a', title: 'Older one', order_index: 1, technologies: [] }, { id: 'b', title: 'Newer one', order_index: 2, technologies: [] }];
const dialogButton = (text) => [...document.querySelectorAll('.record-dialog button')].find((b) => b.textContent.trim() === text);
const titleInput = () => { const label = [...document.querySelectorAll('.record-dialog label')].find((l) => l.textContent.startsWith('Title')); return document.getElementById(label.getAttribute('for')); };

describe('DeckChapter', () => {
  let notify;
  beforeEach(() => { notify = jest.fn(); records.listRecords.mockResolvedValue(rows); });
  afterEach(() => { document.body.innerHTML = ''; });

  it('loads the deck newest first, opens a card in the read view, merges a save, and drops a deleted card', async () => {
    records.saveRecord.mockResolvedValue({ id: 'b', title: 'Newer one, renamed', order_index: 2, technologies: [] });
    records.deleteRecord.mockResolvedValue();
    const view = mount(<DeckChapter schema={projectsSchema} notify={notify} />);
    await flush();
    const titles = () => [...view.container.querySelectorAll('article.card h4')].map((h) => h.textContent);
    expect(titles()).toEqual(['Newer one', 'Older one']);
    click(view.container.querySelectorAll('.card__open')[0]);
    expect(document.querySelector('#record-title').textContent).toBe('Newer one');
    expect(document.querySelector('[data-testid="record-view"]')).not.toBeNull();
    click(dialogButton('Edit'));
    setInputValue(titleInput(), 'Newer one, renamed');
    click(dialogButton('Save'));
    await flush();
    expect(titles()).toEqual(['Newer one, renamed', 'Older one']);
    expect(document.querySelector('#record-title').textContent).toBe('Newer one, renamed');
    expect(document.querySelector('[data-testid="record-dialog"]').dataset.mode).toBe('read');
    click(dialogButton('Delete'));
    click([...document.querySelectorAll('.dialog button')].find((b) => b.textContent === 'Delete'));
    await flush();
    expect(document.querySelector('[data-testid="record-dialog"]')).toBeNull();
    expect(view.container.querySelector('article.card.is-leaving')).not.toBeNull();
    await act(async () => { await new Promise((r) => setTimeout(r, 500)); });   // the leaving animation's timer
    expect(titles()).toEqual(['Older one']);
    view.unmount();
  });

  it('creates through the new card with the next order index and lands in the read view of the new record', async () => {
    records.saveRecord.mockResolvedValue({ id: 'c', title: 'Third thing', order_index: 3, technologies: [] });
    const view = mount(<DeckChapter schema={projectsSchema} notify={notify} />);
    await flush();
    click(view.container.querySelector('.card--new'));
    expect(document.querySelector('[data-testid="record-dialog"]').dataset.mode).toBe('edit');
    setInputValue(titleInput(), 'Third thing');
    click(dialogButton('Add project'));
    await flush();
    expect(records.saveRecord).toHaveBeenCalledWith(projectsSchema, expect.objectContaining({ title: 'Third thing', order_index: 3 }), null);
    expect([...view.container.querySelectorAll('article.card h4')].map((h) => h.textContent)[0]).toBe('Third thing');
    expect(view.container.querySelector('article.card.is-new')).not.toBeNull();
    expect(document.querySelector('[data-testid="record-dialog"]').dataset.mode).toBe('read');
    expect(document.querySelector('#record-title').textContent).toBe('Third thing');
    view.unmount();
  });

  it('shows a failed list load with a retry that loads again', async () => {
    records.listRecords.mockRejectedValueOnce(new Error('The list could not be loaded.')).mockResolvedValueOnce(rows);
    const view = mount(<DeckChapter schema={projectsSchema} notify={notify} />);
    await flush();
    const error = view.container.querySelector('.deck__error');
    expect(error.getAttribute('role')).toBe('alert');
    expect(error.textContent).toContain('The list could not be loaded. Check the connection, then try again.');
    expect(view.container.querySelectorAll('article.card')).toHaveLength(0);
    click([...error.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Try again'));
    await flush();
    expect(records.listRecords).toHaveBeenCalledTimes(2);
    expect(view.container.querySelector('.deck__error')).toBeNull();
    expect(view.container.querySelectorAll('article.card')).toHaveLength(2);
    view.unmount();
  });
});
