/* eslint-disable testing-library/no-container, testing-library/no-node-access */
// The singleton chapter (hero, about): shows the one row as a read panel,
// edits it in a form-only dialog, and never inserts a second row because the
// existing one was switched off.

import SingletonChapter from './SingletonChapter';
import { heroSchema } from './managers/hero.schema';
import { React, act, click, mount, setInputValue } from '../SkyBackground/testUtils';

// the history line and the activity pane read through the activity service, which opens the Supabase client
jest.mock('../../../services/activityService', () => ({ ACTIVITY_NOT_SET_UP: 'ACTIVITY_NOT_SET_UP', listActivity: jest.fn(), listDeletedRecords: jest.fn(), recordHistory: jest.fn(), isActivityAvailable: jest.fn(), logSecurityEvent: jest.fn() }));
jest.mock('../../../services/voyageRecords', () => ({
  listRecords: jest.fn(), saveRecord: jest.fn(), deleteRecord: jest.fn(), uploadImages: jest.fn(), removeImage: jest.fn(), imageProblems: jest.fn(), failureKind: jest.fn(), fetchUpdatedAt: jest.fn(), getRecord: jest.fn(),
  fileProblems: jest.fn(), uploadFieldFiles: jest.fn(), removeStoredFiles: jest.fn(),
}));
const records = jest.requireMock('../../../services/voyageRecords');
const flush = () => act(async () => { await Promise.resolve(); await new Promise((r) => setTimeout(r, 0)); });
const hero = { id: 'h1', title: 'Hi, I am Raunak', subtitle: 'Engineer', description: 'Builds things.', highlights: ['One'], cta_text: 'Explore', cta_link: '#navigation', is_active: false, updated_at: '2026-11-01' };
const dialogButton = (text) => [...document.querySelectorAll('.record-dialog button')].find((b) => b.textContent.trim() === text);
const panel = (view) => view.container.querySelector('[data-testid="singleton"]');

describe('SingletonChapter', () => {
  let notify;
  beforeEach(() => { notify = jest.fn(); records.fetchUpdatedAt.mockResolvedValue(hero.updated_at); });
  afterEach(() => { document.body.innerHTML = ''; });

  it('loads a switched-off row, says it is hidden, and saves back into that same row', async () => {
    records.listRecords.mockResolvedValue([hero]);
    records.saveRecord.mockImplementation(async (_s, payload, id) => ({ ...hero, ...payload, id }));
    const view = mount(<SingletonChapter schema={heroSchema} notify={notify} />);
    await flush();
    expect(panel(view).querySelector('.singleton__title').textContent).toBe('Hi, I am Raunak');
    expect(panel(view).textContent).toContain('Hidden from visitors');
    expect(panel(view).querySelector('[data-testid="record-view"]')).not.toBeNull();
    expect(view.container.querySelector('[data-testid="deck"]')).toBeNull();
    click(panel(view).querySelector('[data-action="edit"]'));
    const dialog = document.querySelector('[data-testid="record-dialog"]');
    expect(dialog.dataset.mode).toBe('edit');
    expect(dialogButton('Delete')).toBeUndefined();
    setInputValue(document.querySelector('[data-field="title"] input'), 'Hello, I am Raunak');
    click(dialogButton('Save'));
    await flush();
    expect(records.saveRecord).toHaveBeenCalledTimes(1);
    expect(records.saveRecord.mock.calls[0][2]).toBe('h1');
    expect(document.querySelector('[data-testid="record-dialog"]')).toBeNull();
    expect(panel(view).querySelector('.singleton__title').textContent).toBe('Hello, I am Raunak');
    view.unmount();
  });

  it('prefers the active row and reports extra rows without touching them', async () => {
    records.listRecords.mockResolvedValue([{ ...hero, id: 'old', title: 'Old hero', updated_at: '2026-12-01' }, { ...hero, id: 'live', title: 'Live hero', is_active: true }]);
    const view = mount(<SingletonChapter schema={heroSchema} notify={notify} />);
    await flush();
    expect(panel(view).querySelector('.singleton__title').textContent).toBe('Live hero');
    expect(panel(view).textContent).not.toContain('Hidden from visitors');
    expect(panel(view).querySelector('.singleton__note').textContent).toContain('The table holds 2 rows');
    view.unmount();
  });

  it('offers to write the row only when the table is empty, and inserts once', async () => {
    records.listRecords.mockResolvedValue([]);
    records.saveRecord.mockImplementation(async (_s, payload) => ({ ...payload, id: 'new' }));
    const view = mount(<SingletonChapter schema={heroSchema} notify={notify} />);
    await flush();
    expect(panel(view).textContent).toContain('Nothing here yet');
    click([...panel(view).querySelectorAll('button')].find((b) => b.textContent.trim() === 'Write it'));
    setInputValue(document.querySelector('[data-field="title"] input'), 'A brand new hero');
    click([...document.querySelectorAll('.record-dialog button')].find((b) => /^(Save|Add hero section)$/.test(b.textContent.trim())));
    await flush();
    expect(records.saveRecord).toHaveBeenCalledWith(heroSchema, expect.objectContaining({ title: 'A brand new hero', is_active: true }), null);
    expect(panel(view).querySelector('.singleton__title').textContent).toBe('A brand new hero');
    view.unmount();
  });

  it('shows a failed load with a retry', async () => {
    records.listRecords.mockRejectedValueOnce(new Error('The record could not be loaded.')).mockResolvedValueOnce([hero]);
    const view = mount(<SingletonChapter schema={heroSchema} notify={notify} />);
    await flush();
    expect(panel(view).querySelector('[role="alert"]').textContent).toContain('The record could not be loaded.');
    click([...panel(view).querySelectorAll('button')].find((b) => b.textContent.trim() === 'Try again'));
    await flush();
    expect(panel(view).querySelector('[role="alert"]')).toBeNull();
    expect(panel(view).querySelector('.singleton__title').textContent).toBe('Hi, I am Raunak');
    view.unmount();
  });
});
