/* eslint-disable testing-library/no-container, testing-library/no-node-access */
// Single and list uploads in the record dialog, plus the form-only mode the
// singleton chapters use. The records service is mocked: these tests check
// what the dialog asks it to write and what it shows back.

import RecordDialog from './RecordDialog';
import { skillsSchema } from './managers/skills.schema';
import { heroSchema } from './managers/hero.schema';
import { React, act, click, mount, setInputValue } from '../SkyBackground/testUtils';

// the history line and the activity pane read through the activity service, which opens the Supabase client
jest.mock('../../../services/activityService', () => ({ ACTIVITY_NOT_SET_UP: 'ACTIVITY_NOT_SET_UP', listActivity: jest.fn(), recordHistory: jest.fn(), isActivityAvailable: jest.fn(), logSecurityEvent: jest.fn() }));
jest.mock('../../../services/voyageRecords', () => ({
  saveRecord: jest.fn(), deleteRecord: jest.fn(), uploadImages: jest.fn(), removeImage: jest.fn(), imageProblems: jest.fn(), failureKind: jest.fn(), fetchUpdatedAt: jest.fn(), getRecord: jest.fn(),
  fileProblems: jest.fn(), uploadFieldFiles: jest.fn(), removeStoredFiles: jest.fn(),
}));
const records = jest.requireMock('../../../services/voyageRecords');

const flush = () => act(async () => { await Promise.resolve(); await new Promise((r) => setTimeout(r, 0)); });
const fieldFor = (key) => document.querySelector(`[data-field="${key}"]`);
const button = (root, text) => [...root.querySelectorAll('button')].find((b) => (b.getAttribute('aria-label') || b.textContent.trim()) === text);
const choose = (input, files) => act(() => {
  Object.defineProperty(input, 'files', { configurable: true, value: files });
  input.dispatchEvent(new Event('change', { bubbles: true }));
});
const STORE = 'https://x.supabase.co/storage/v1/object/public/skill-icons/';
const skill = { id: 7, skill_name: 'Rust', category: 'Languages', skill_type: 'Programming Languages', skill_type_priority: 1, proficiency_level: 7, learning_source: null, description: '', icon_url: `${STORE}icons/old.png`, certifications: ['AWS SAA'], projects_used: [], is_featured: false, order_index: 1, status: 'active' };

describe('RecordDialog uploads', () => {
  let props;
  beforeEach(() => {
    props = { notify: jest.fn(), onClose: jest.fn(), onSaved: jest.fn(), onDeleted: jest.fn() };
    records.fetchUpdatedAt.mockResolvedValue(null);
    records.fileProblems.mockImplementation((files) => ({ accepted: files.filter((f) => f.size < 100), problems: files.filter((f) => f.size >= 100).map((f) => ({ name: f.name, message: 'is too big.' })) }));
    records.removeStoredFiles.mockResolvedValue();
    records.failureKind.mockReturnValue('unknown');
  });
  afterEach(() => { document.body.innerHTML = ''; });

  const openEdit = (record = skill) => {
    const view = mount(<RecordDialog schema={skillsSchema} record={record} open {...props} />);
    click(button(document, 'Edit'));
    return view;
  };

  it('replaces the icon: uploads under the skill id, saves only that column, then removes the old file', async () => {
    records.uploadFieldFiles.mockResolvedValue({ urls: [`${STORE}icons/new.png`], failed: [] });
    records.saveRecord.mockImplementation(async (_s, payload) => ({ ...skill, ...payload }));
    const view = openEdit();
    const file = { name: 'new.png', size: 10, type: 'image/png' };
    choose(fieldFor('icon_url').querySelector('input[type="file"]'), [file]);
    await flush();
    expect(records.uploadFieldFiles).toHaveBeenCalledWith(skillsSchema.fields.find((f) => f.key === 'icon_url').upload, expect.objectContaining({ id: 7 }), [file]);
    expect(records.saveRecord).toHaveBeenCalledWith(skillsSchema, { icon_url: `${STORE}icons/new.png` }, 7);
    expect(records.removeStoredFiles).toHaveBeenCalledWith('skill-icons', [`${STORE}icons/old.png`]);
    expect(fieldFor('icon_url').querySelector('img').getAttribute('src')).toBe(`${STORE}icons/new.png`);
    expect(props.notify).toHaveBeenCalledWith('Image saved.');
    view.unmount();
  });

  it('lists a refused file under the field and uploads nothing', async () => {
    const view = openEdit();
    choose(fieldFor('icon_url').querySelector('input[type="file"]'), [{ name: 'huge.png', size: 500, type: 'image/png' }]);
    await flush();
    expect(records.uploadFieldFiles).not.toHaveBeenCalled();
    expect(fieldFor('icon_url').querySelector('.field__problems').textContent).toBe('huge.png is too big.');
    view.unmount();
  });

  it('removes the icon: the column goes null first, then the file leaves storage', async () => {
    records.saveRecord.mockImplementation(async (_s, payload) => ({ ...skill, ...payload }));
    const view = openEdit();
    click(button(fieldFor('icon_url'), 'Remove'));
    await flush();
    expect(records.saveRecord).toHaveBeenCalledWith(skillsSchema, { icon_url: null }, 7);
    expect(records.removeStoredFiles).toHaveBeenCalledWith('skill-icons', [`${STORE}icons/old.png`]);
    expect(records.saveRecord.mock.invocationCallOrder[0]).toBeLessThan(records.removeStoredFiles.mock.invocationCallOrder[0]);
    expect(fieldFor('icon_url').textContent).toContain('Choose an image');
    view.unmount();
  });

  it('appends uploaded certificates after the typed names and keeps a failed file in the list of problems', async () => {
    records.uploadFieldFiles.mockResolvedValue({ urls: [`${STORE}certifications/a.pdf`], failed: [{ name: 'b.pdf', message: 'could not be uploaded.' }] });
    records.saveRecord.mockImplementation(async (_s, payload) => ({ ...skill, ...payload }));
    const view = openEdit();
    choose(fieldFor('certifications').querySelector('input[type="file"]'), [{ name: 'a.pdf', size: 5 }, { name: 'b.pdf', size: 5 }]);
    await flush();
    expect(records.saveRecord).toHaveBeenCalledWith(skillsSchema, { certifications: ['AWS SAA', `${STORE}certifications/a.pdf`] }, 7);
    expect(fieldFor('certifications').querySelector('a.file-link').textContent).toBe('a.pdf');
    expect(fieldFor('certifications').querySelector('.field__problems').textContent).toContain('b.pdf could not be uploaded.');
    expect(props.notify).toHaveBeenCalledWith('File added.');
    view.unmount();
  });

  it('offers no upload for an unsaved skill (the classic "temp" id bug)', () => {
    const view = mount(<RecordDialog schema={skillsSchema} record={null} open {...props} />);
    expect(fieldFor('icon_url').querySelector('input[type="file"]')).toBeNull();
    expect(fieldFor('icon_url').textContent).toContain('Save the skill once, then add an image.');
    expect(fieldFor('certifications').textContent).toContain('Save the skill once, then add files.');
    view.unmount();
  });
});

describe('RecordDialog in form-only mode', () => {
  const hero = { id: 'h1', title: 'Hello there', subtitle: '', description: '', highlights: ['One'], cta_text: '', cta_link: '#navigation', is_active: false };
  let props;
  beforeEach(() => {
    props = { notify: jest.fn(), onClose: jest.fn(), onSaved: jest.fn(), onDeleted: jest.fn() };
    records.fetchUpdatedAt.mockResolvedValue(null);
  });
  afterEach(() => { document.body.innerHTML = ''; });

  it('opens in the form, has no Delete, updates the existing row and closes on Save', async () => {
    records.saveRecord.mockImplementation(async (_s, payload, id) => ({ ...hero, ...payload, id }));
    const view = mount(<RecordDialog schema={heroSchema} record={hero} open editOnly {...props} />);
    const dialog = document.querySelector('[data-testid="record-dialog"]');
    expect(dialog.dataset.mode).toBe('edit');
    expect(button(dialog, 'Delete')).toBeUndefined();
    setInputValue(fieldFor('title').querySelector('input'), 'Hello again');
    click(button(dialog, 'Save'));
    await flush();
    expect(records.saveRecord).toHaveBeenCalledWith(heroSchema, expect.objectContaining({ title: 'Hello again', is_active: false }), 'h1');
    expect(props.onSaved).toHaveBeenCalled();
    expect(props.onClose).toHaveBeenCalled();
    view.unmount();
  });

  it('Cancel closes straight away when nothing changed', () => {
    const view = mount(<RecordDialog schema={heroSchema} record={hero} open editOnly {...props} />);
    click(button(document.querySelector('[data-testid="record-dialog"]'), 'Cancel'));
    expect(props.onClose).toHaveBeenCalled();
    view.unmount();
  });
});
