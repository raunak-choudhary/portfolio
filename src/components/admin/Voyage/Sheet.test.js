/* eslint-disable testing-library/no-container, testing-library/no-node-access */
import Sheet from './Sheet';
import { projectsSchema } from './managers/projects.schema';
import { React, act, click, mount, setInputValue } from '../SkyBackground/testUtils';

jest.mock('../../../services/voyageRecords', () => ({ saveRecord: jest.fn(), deleteRecord: jest.fn(), uploadImages: jest.fn(), removeImage: jest.fn(), imageProblem: jest.fn(() => null) }));
const records = jest.requireMock('../../../services/voyageRecords');

const flush = () => act(async () => { await Promise.resolve(); await new Promise((r) => setTimeout(r, 0)); });
const sheet = () => document.querySelector('[data-testid="sheet"]');
const byLabel = (text) => { const label = [...document.querySelectorAll('.sheet label')].find((l) => l.textContent.replace(' *', '') === text); return document.getElementById(label.getAttribute('for')); };
const button = (text) => [...document.querySelectorAll('.sheet button')].find((b) => b.textContent.trim() === text);

const existing = { id: 'p1', title: 'Tallyproof', short_description: 'Counting', technologies: ['React'], github_urls: [], key_features: [], image_urls: ['https://cdn/a.png'], team_size: 1, featured: false, status: 'active', order_index: 30 };

describe('Sheet', () => {
  let notify, onClose, onSaved, onDeleted;
  beforeEach(() => { notify = jest.fn(); onClose = jest.fn(); onSaved = jest.fn(); onDeleted = jest.fn(); document.body.style.overflow = ''; });
  afterEach(() => { document.body.innerHTML = ''; });

  it('renders nothing while closed and a dialog with every group when open', () => {
    const view = mount(<Sheet schema={projectsSchema} record={null} open={false} onClose={onClose} onSaved={onSaved} onDeleted={onDeleted} notify={notify} />);
    expect(sheet()).toBeNull();
    view.rerender(<Sheet schema={projectsSchema} record={null} open onClose={onClose} onSaved={onSaved} onDeleted={onDeleted} notify={notify} />);
    expect(sheet()).not.toBeNull();
    expect([...document.querySelectorAll('.sheet legend')].map((l) => l.textContent)).toEqual(['The card', 'Stack and features', 'Links and images', 'More']);
    expect(document.body.style.overflow).toBe('hidden');
    expect(document.querySelector('#sheet-title').textContent).toBe('New project');
    expect(document.querySelector('.sheet').textContent).toContain('Save the project once, then add images.');
    view.unmount();
    expect(document.body.style.overflow).toBe('');
  });

  it('refuses an invalid form, then saves a new record with the next order index and stays open on it', async () => {
    records.saveRecord.mockResolvedValue({ ...existing, id: 'new1', title: 'Brand new thing', order_index: 31 });
    const view = mount(<Sheet schema={projectsSchema} record={null} open onClose={onClose} onSaved={onSaved} onDeleted={onDeleted} notify={notify} nextOrder={31} />);
    click(button('Add project'));
    expect(document.querySelector('.field__error').textContent).toBe('Title is required.');
    expect(records.saveRecord).not.toHaveBeenCalled();
    expect(notify).toHaveBeenCalledWith('Fix the marked fields first.', 'warn');
    setInputValue(byLabel('Title'), 'Brand new thing');
    setInputValue(byLabel('Team size'), '3');
    expect(document.querySelector('.sheet__status').textContent).toBe('Unsaved changes');
    click(button('Add project'));
    await flush();
    expect(records.saveRecord).toHaveBeenCalledWith(projectsSchema, expect.objectContaining({ title: 'Brand new thing', team_size: 3, order_index: 31, status: 'active', technologies: [] }), null);
    expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ id: 'new1' }), true);
    expect(notify).toHaveBeenLastCalledWith('Project added.');
    view.rerender(<Sheet schema={projectsSchema} record={{ ...existing, id: 'new1', title: 'Brand new thing' }} open onClose={onClose} onSaved={onSaved} onDeleted={onDeleted} notify={notify} />);
    expect(document.querySelector('#sheet-title').textContent).toBe('Brand new thing');
    expect(document.querySelector('.thumb--add')).not.toBeNull();   // saved once: images can be added
    view.unmount();
  });

  it('guards unsaved changes on close and on Escape, and discards on confirm', () => {
    const view = mount(<Sheet schema={projectsSchema} record={existing} open onClose={onClose} onSaved={onSaved} onDeleted={onDeleted} notify={notify} />);
    click(button('Close'));
    expect(onClose).toHaveBeenCalledTimes(1);
    setInputValue(byLabel('Title'), 'Tallyproof, renamed');
    act(() => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(document.querySelector('[role="alertdialog"]').textContent).toContain('Discard the changes?');
    click([...document.querySelectorAll('.dialog button')].find((b) => b.textContent === 'Discard'));
    expect(onClose).toHaveBeenCalledTimes(2);
    view.unmount();
  });

  it('adds list items, saves an edit with the clean payload, and deletes after confirmation', async () => {
    records.saveRecord.mockResolvedValue({ ...existing, technologies: ['React', 'Three.js'] });
    records.deleteRecord.mockResolvedValue();
    const view = mount(<Sheet schema={projectsSchema} record={existing} open onClose={onClose} onSaved={onSaved} onDeleted={onDeleted} notify={notify} />);
    const techInput = byLabel('Technologies');
    setInputValue(techInput, ' Three.js ');
    act(() => { techInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); });
    expect([...document.querySelectorAll('.chip__text')].map((c) => c.textContent)).toEqual(['React', 'Three.js']);
    click(button('Save'));
    await flush();
    expect(records.saveRecord).toHaveBeenCalledWith(projectsSchema, expect.objectContaining({ technologies: ['React', 'Three.js'], title: 'Tallyproof' }), 'p1');
    expect(records.saveRecord.mock.calls[0][1]).not.toHaveProperty('order_index');
    expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ id: 'p1' }), false);
    click(button('Delete'));
    expect(document.querySelector('[role="alertdialog"]').textContent).toContain('Its images in storage go with it.');
    click([...document.querySelectorAll('.dialog button')].find((b) => b.textContent === 'Delete'));
    await flush();
    expect(records.deleteRecord).toHaveBeenCalledWith(projectsSchema, 'p1');
    expect(onDeleted).toHaveBeenCalledWith('p1');
    view.unmount();
  });

  it('uploads images into the record and persists the list at once', async () => {
    records.uploadImages.mockResolvedValue(['https://cdn/b.png']);
    records.saveRecord.mockResolvedValue({ ...existing, image_urls: ['https://cdn/a.png', 'https://cdn/b.png'] });
    const view = mount(<Sheet schema={projectsSchema} record={existing} open onClose={onClose} onSaved={onSaved} onDeleted={onDeleted} notify={notify} />);
    const file = new File(['x'], 'b.png', { type: 'image/png' });
    const input = document.querySelector('.thumb--add input');
    Object.defineProperty(input, 'files', { value: [file] });
    await act(async () => { input.dispatchEvent(new Event('change', { bubbles: true })); });
    await flush();
    expect(records.uploadImages).toHaveBeenCalledWith(projectsSchema, 'p1', [file]);
    expect(records.saveRecord).toHaveBeenCalledWith(projectsSchema, { image_urls: ['https://cdn/a.png', 'https://cdn/b.png'] }, 'p1');
    expect(document.querySelectorAll('.thumb img')).toHaveLength(2);
    expect(notify).toHaveBeenLastCalledWith('Image added.');
    view.unmount();
  });
});
