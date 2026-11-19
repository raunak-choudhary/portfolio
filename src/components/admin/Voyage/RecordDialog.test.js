/* eslint-disable testing-library/no-container, testing-library/no-node-access */
import RecordDialog, { attentionText, failureCopy, sameStamp } from './RecordDialog';
import { projectsSchema } from './managers/projects.schema';
import { React, act, click, mount, setInputValue } from '../SkyBackground/testUtils';

// the history line and the activity pane read through the activity service, which opens the Supabase client
jest.mock('../../../services/activityService', () => ({ listActivity: jest.fn(), recordHistory: jest.fn(), isActivityAvailable: jest.fn(), logSecurityEvent: jest.fn() }));
jest.mock('../../../services/voyageRecords', () => ({ saveRecord: jest.fn(), deleteRecord: jest.fn(), uploadImages: jest.fn(), removeImage: jest.fn(), imageProblems: jest.fn(), failureKind: jest.fn(), fetchUpdatedAt: jest.fn(), getRecord: jest.fn() }));
const records = jest.requireMock('../../../services/voyageRecords');
const activity = jest.requireMock('../../../services/activityService');

const flush = () => act(async () => { await Promise.resolve(); await new Promise((r) => setTimeout(r, 0)); });
const dialog = () => document.querySelector('[data-testid="record-dialog"]');
const fieldFor = (key) => document.querySelector(`[data-field="${key}"]`);
const inputFor = (key) => fieldFor(key).querySelector('input, textarea, select');
const button = (text) => [...document.querySelectorAll('.record-dialog button, .record-dialog a')].find((b) => b.textContent.trim() === text);
const banner = () => document.querySelector('.record-banner--bad, .record-banner--warn');
const leave = (key) => act(() => { fieldFor(key).querySelector('input, textarea, select').dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: null })); });
const key = (k) => act(() => { document.dispatchEvent(new KeyboardEvent('keydown', { key: k })); });
const setOnline = (value) => { Object.defineProperty(window.navigator, 'onLine', { configurable: true, get: () => value }); act(() => { window.dispatchEvent(new Event(value ? 'online' : 'offline')); }); };

const existing = {
  id: 'p1', title: 'Tallyproof', short_description: 'Counting votes.', detailed_description: 'First paragraph.\nSecond paragraph.', project_type: 'Web app', duration: 'Oct to Nov 2026',
  technologies: ['React', 'Supabase'], key_features: [], github_urls: ['https://github.com/x/tallyproof'], live_url: 'https://tallyproof.dev', image_urls: ['https://cdn/a.png'],
  team_size: 1, featured: false, awards: null, status: 'active', order_index: 30, updated_at: '2026-11-18T10:00:00.000Z',
};

describe('RecordDialog', () => {
  let props;
  const render = (overrides = {}) => mount(<RecordDialog schema={projectsSchema} record={existing} open {...props} {...overrides} />);
  beforeEach(() => {
    props = { notify: jest.fn(), onClose: jest.fn(), onSaved: jest.fn(), onDeleted: jest.fn() };
    document.body.style.overflow = '';
    setOnline(true);
    records.fetchUpdatedAt.mockResolvedValue(existing.updated_at);
  });
  afterEach(() => { document.body.innerHTML = ''; });

  it('shows the history line in the read view of a saved record only', async () => {
    activity.isActivityAvailable.mockResolvedValue(true);
    activity.recordHistory.mockResolvedValue([{ id: 1, at: new Date().toISOString(), action: 'edit', section: 'projects', recordId: 'p1', recordTitle: 'Tallyproof', fields: ['title'], detail: {}, source: 'admin' }]);
    render();
    await flush();
    expect(activity.recordHistory).toHaveBeenCalledWith('projects', 'p1', 20);
    const line = dialog().querySelector('[data-testid="history-line"]');
    expect(line.textContent).toContain('1 change recorded');
    expect(line.nextElementSibling.className).toContain('record-view');
    click(button('Edit'));
    expect(dialog().querySelector('[data-testid="history-line"]')).toBeNull();
  });

  it('renders nothing while closed, locks the page scroll while open, and opens a new record straight in the form', () => {
    const view = render({ record: null, open: false });
    expect(dialog()).toBeNull();
    view.rerender(<RecordDialog schema={projectsSchema} record={null} open {...props} />);
    expect(dialog().dataset.mode).toBe('edit');
    expect(dialog().getAttribute('role')).toBe('dialog');
    expect(document.body.style.overflow).toBe('hidden');
    expect(document.querySelector('#record-title').textContent).toBe('New project');
    expect([...document.querySelectorAll('.record-form legend')].map((l) => l.textContent)).toEqual(['The card', 'Stack and features', 'Links and images', 'More']);
    expect(dialog().textContent).toContain('Save the project once, then add images.');
    expect(button('Delete')).toBeUndefined();
    expect(document.activeElement).toBe(inputFor('title'));
    view.unmount();
    expect(document.body.style.overflow).toBe('');
  });

  it('opens a saved record in a rendered read view, not in disabled inputs', () => {
    const view = render();
    expect(dialog().dataset.mode).toBe('read');
    const read = document.querySelector('[data-testid="record-view"]');
    expect(read.querySelectorAll('input, textarea, select')).toHaveLength(0);
    expect(document.querySelector('#record-title').textContent).toBe('Tallyproof');
    expect(document.querySelector('.record-dialog__sub').textContent).toBe('Web app · Oct to Nov 2026');
    expect(read.querySelectorAll('.record-view__strip img')).toHaveLength(1);
    expect([...read.querySelectorAll('.record-view__chips li')].map((c) => c.textContent)).toEqual(['React', 'Supabase']);
    expect([...read.querySelectorAll('.record-view__prose p')].map((p) => p.textContent)).toEqual(['Counting votes.', 'First paragraph.', 'Second paragraph.']);
    const live = [...read.querySelectorAll('a.record-view__link')].find((a) => a.href === 'https://tallyproof.dev/');
    expect(live.getAttribute('target')).toBe('_blank');
    expect(live.getAttribute('rel')).toBe('noopener noreferrer');
    const item = (label) => [...read.querySelectorAll('.record-view__item')].find((i) => i.querySelector('dt').textContent === label).querySelector('dd').textContent;
    expect(item('Award')).toBe('Not set');
    expect(item('Key features')).toBe('Not set');
    expect(item('Starred on the public page')).toBe('No');
    expect(item('Visibility')).toBe('Public');
    expect(read.textContent).not.toContain('TitleTallyproof');   // the title heads the dialog and is not repeated
    expect(document.activeElement).toBe(button('Edit'));
    view.unmount();
  });

  it('never turns a non-http value into a link', () => {
    const scriptUrl = ['javascript', 'alert(1)'].join(':');   // built at runtime: the point is that it never becomes an href
    const view = render({ record: { ...existing, live_url: scriptUrl } });
    expect([...document.querySelectorAll('.record-view a')].some((a) => a.getAttribute('href')?.startsWith('javascript'))).toBe(false);
    expect(document.querySelector('.record-view').textContent).toContain(scriptUrl);
    view.unmount();
  });

  it('switches to the form on Edit and back to the read view on Cancel, asking first when something changed', () => {
    const view = render();
    click(button('Edit'));
    expect(dialog().dataset.mode).toBe('edit');
    expect(document.activeElement).toBe(inputFor('title'));
    click(button('Cancel'));
    expect(dialog().dataset.mode).toBe('read');
    click(button('Edit'));
    setInputValue(inputFor('title'), 'Tallyproof renamed');
    click(button('Cancel'));
    expect(document.querySelector('[role="alertdialog"]').textContent).toContain('Discard the edits?');
    click([...document.querySelectorAll('.dialog button')].find((b) => b.textContent === 'Discard'));
    expect(dialog().dataset.mode).toBe('read');
    expect(document.querySelector('#record-title').textContent).toBe('Tallyproof');
    expect(props.onClose).not.toHaveBeenCalled();
    view.unmount();
  });

  it('shows a field error only after the field is left, then every error after a Save attempt with the first one focused', async () => {
    const view = render();
    click(button('Edit'));
    setInputValue(inputFor('title'), 'abc');
    setInputValue(inputFor('live_url'), 'tallyproof.dev');
    expect(fieldFor('title').querySelector('.field__error')).toBeNull();   // typing alone shows nothing
    leave('title');
    const error = fieldFor('title').querySelector('.field__error');
    expect(error.textContent).toBe('Title needs at least 5 characters.');
    expect(error.querySelector('svg')).not.toBeNull();   // an icon as well as colour
    expect(inputFor('title').getAttribute('aria-invalid')).toBe('true');
    expect(inputFor('title').getAttribute('aria-describedby')).toBe(error.id);
    expect(fieldFor('live_url').querySelector('.field__error')).toBeNull();   // not left yet
    expect(inputFor('live_url').getAttribute('aria-describedby')).toBeNull();
    act(() => { inputFor('live_url').focus(); });
    click(button('Save'));
    await flush();
    expect(records.saveRecord).not.toHaveBeenCalled();
    expect(fieldFor('live_url').querySelector('.field__error').textContent).toBe('Live link must start with https://.');
    expect(document.querySelector('.record-dialog__status').textContent).toBe('2 fields need attention');
    expect(document.activeElement).toBe(inputFor('title'));
    setInputValue(inputFor('title'), 'Tallyproof two');
    expect(fieldFor('title').querySelector('.field__error')).toBeNull();   // fixing clears at once
    expect(document.querySelector('.record-dialog__status').textContent).toBe('1 field needs attention');
    view.unmount();
  });

  it('saves an edit, returns to the read view and reports it', async () => {
    records.saveRecord.mockResolvedValue({ ...existing, title: 'Tallyproof two', updated_at: '2026-11-18T11:00:00.000Z' });
    const view = render();
    click(button('Edit'));
    setInputValue(inputFor('title'), 'Tallyproof two');
    expect(document.querySelector('.record-dialog__status').textContent).toBe('Unsaved changes');
    click(button('Save'));
    await flush();
    expect(records.fetchUpdatedAt).toHaveBeenCalledWith(projectsSchema, 'p1');
    expect(records.saveRecord).toHaveBeenCalledWith(projectsSchema, expect.objectContaining({ title: 'Tallyproof two' }), 'p1');
    expect(records.saveRecord.mock.calls[0][1]).not.toHaveProperty('order_index');
    expect(props.onSaved).toHaveBeenCalledWith(expect.objectContaining({ title: 'Tallyproof two' }), false);
    expect(props.notify).toHaveBeenLastCalledWith('Saved.');
    expect(dialog().dataset.mode).toBe('read');
    expect(document.querySelector('#record-title').textContent).toBe('Tallyproof two');
    view.unmount();
  });

  it.each([
    ['session', Object.assign(new Error('Your session expired.'), { code: 'SESSION_EXPIRED' }), 'Your session has expired.', 'Sign in in a new tab', '/adminlogin'],
    ['permission', Object.assign(new Error('Needs the code.'), { code: 'SECOND_FACTOR_REQUIRED' }), 'This save was refused.', 'Open the admin area in a new tab', '/admindashboard'],
  ])('explains a %s failure in the banner with a way out and keeps the typed text', async (kind, err, title, linkText, href) => {
    records.saveRecord.mockRejectedValue(err);
    records.failureKind.mockReturnValue(kind);
    const view = render();
    click(button('Edit'));
    setInputValue(inputFor('title'), 'Typed and not lost');
    click(button('Save'));
    await flush();
    expect(banner().getAttribute('role')).toBe('alert');
    expect(banner().textContent).toContain(title);
    const link = button(linkText);
    expect(link.getAttribute('href')).toBe(href);
    expect(link.getAttribute('target')).toBe('_blank');
    expect(dialog().dataset.mode).toBe('edit');
    expect(inputFor('title').value).toBe('Typed and not lost');
    expect(props.onSaved).not.toHaveBeenCalled();
    view.unmount();
  });

  it('explains a network failure and retries the same save', async () => {
    records.saveRecord.mockRejectedValueOnce(new Error('TypeError: Failed to fetch')).mockResolvedValueOnce({ ...existing, title: 'Second try' });
    records.failureKind.mockReturnValue('network');
    const view = render();
    click(button('Edit'));
    setInputValue(inputFor('title'), 'Second try');
    click(button('Save'));
    await flush();
    expect(banner().textContent).toContain('The save did not reach the server.');
    expect(banner().textContent).toContain('Nothing typed here is lost.');
    click(button('Try again'));
    await flush();
    expect(records.saveRecord).toHaveBeenCalledTimes(2);
    expect(banner()).toBeNull();
    expect(dialog().dataset.mode).toBe('read');
    view.unmount();
  });

  it('shows the server message for an unknown failure, including a failed delete', async () => {
    records.deleteRecord.mockRejectedValue(new Error('The project could not be deleted.'));
    records.failureKind.mockReturnValue('unknown');
    const view = render();
    click(button('Delete'));
    click([...document.querySelectorAll('.dialog button')].find((b) => b.textContent === 'Delete'));
    await flush();
    expect(banner().textContent).toContain('The delete did not go through.');
    expect(banner().textContent).toContain('The server said: The project could not be deleted.');
    expect(props.onDeleted).not.toHaveBeenCalled();
    click(button('Dismiss'));
    expect(banner()).toBeNull();
    view.unmount();
  });

  it('pauses saving while offline, explains why, and resumes when the connection returns', () => {
    const view = render();
    click(button('Edit'));
    setInputValue(inputFor('title'), 'Written on a train');
    setOnline(false);
    const offline = document.querySelector('#record-offline');
    expect(offline.textContent).toContain('You are offline.');
    expect(offline.textContent).toContain('Saving waits until the connection comes back.');
    expect(button('Save').disabled).toBe(true);
    expect(button('Save').getAttribute('aria-describedby')).toBe('record-offline');
    expect(inputFor('title').value).toBe('Written on a train');
    setOnline(true);
    expect(document.querySelector('#record-offline')).toBeNull();
    expect(button('Save').disabled).toBe(false);
    view.unmount();
  });

  it('stops before overwriting a row changed elsewhere and offers Overwrite or Reload latest', async () => {
    records.fetchUpdatedAt.mockResolvedValue('2026-11-18T12:30:00.000Z');
    records.saveRecord.mockResolvedValue({ ...existing, title: 'Mine wins', updated_at: '2026-11-18T12:31:00.000Z' });
    const view = render();
    click(button('Edit'));
    setInputValue(inputFor('title'), 'Mine wins');
    click(button('Save'));
    await flush();
    expect(records.saveRecord).not.toHaveBeenCalled();
    expect(banner().textContent).toContain('This project changed somewhere else after it was opened here.');
    expect(inputFor('title').value).toBe('Mine wins');
    click(button('Overwrite'));
    await flush();
    expect(records.fetchUpdatedAt).toHaveBeenCalledTimes(1);   // Overwrite skips the check
    expect(records.saveRecord).toHaveBeenCalledWith(projectsSchema, expect.objectContaining({ title: 'Mine wins' }), 'p1');
    expect(dialog().dataset.mode).toBe('read');
    view.unmount();
  });

  it('reloads the latest saved version on request', async () => {
    records.fetchUpdatedAt.mockResolvedValue('2026-11-18T12:30:00.000Z');
    records.getRecord.mockResolvedValue({ ...existing, title: 'Changed elsewhere', updated_at: '2026-11-18T12:30:00.000Z' });
    const view = render();
    click(button('Edit'));
    setInputValue(inputFor('title'), 'Mine instead');
    click(button('Save'));
    await flush();
    click(button('Reload latest'));
    await flush();
    expect(records.getRecord).toHaveBeenCalledWith(projectsSchema, 'p1');
    expect(props.onSaved).toHaveBeenCalledWith(expect.objectContaining({ title: 'Changed elsewhere' }), false);
    expect(dialog().dataset.mode).toBe('read');
    expect(document.querySelector('#record-title').textContent).toBe('Changed elsewhere');
    expect(banner()).toBeNull();
    view.unmount();
  });

  it('skips the conflict check for a table without updated_at and treats equal stamps in other formats as equal', async () => {
    const { updated_at: _ignored, ...noStamp } = existing;
    records.saveRecord.mockResolvedValue({ ...noStamp, title: 'No stamp here' });
    const view = render({ record: noStamp });
    click(button('Edit'));
    setInputValue(inputFor('title'), 'No stamp here');
    click(button('Save'));
    await flush();
    expect(records.fetchUpdatedAt).not.toHaveBeenCalled();
    expect(records.saveRecord).toHaveBeenCalled();
    view.unmount();
    expect(sameStamp('2026-11-18T10:00:00+00:00', '2026-11-18T10:00:00.000Z')).toBe(true);
    expect(sameStamp(null, null)).toBe(true);
    expect(sameStamp(null, '2026-11-18T10:00:00Z')).toBe(false);
  });

  it('reports image problems per file next to the field and keeps the form as typed', async () => {
    const good = new File(['x'], 'b.png', { type: 'image/png' });
    const bad = new File(['x'], 'a.gif', { type: 'image/gif' });
    records.imageProblems.mockReturnValue({ accepted: [good], problems: [{ name: 'a.gif', message: 'is not a JPEG, PNG or WebP image.' }] });
    records.uploadImages.mockResolvedValue({ urls: ['https://cdn/b.png'], failed: [] });
    records.saveRecord.mockResolvedValue({ ...existing, image_urls: ['https://cdn/a.png', 'https://cdn/b.png'], updated_at: '2026-11-18T10:05:00.000Z' });
    const view = render();
    click(button('Edit'));
    setInputValue(inputFor('title'), 'Typed before the upload');
    const input = document.querySelector('.thumb--add input');
    Object.defineProperty(input, 'files', { configurable: true, value: [bad, good] });
    await act(async () => { input.dispatchEvent(new Event('change', { bubbles: true })); });
    await flush();
    expect(records.uploadImages).toHaveBeenCalledWith(projectsSchema, 'p1', [good]);
    expect(records.saveRecord).toHaveBeenCalledWith(projectsSchema, { image_urls: ['https://cdn/a.png', 'https://cdn/b.png'] }, 'p1');
    expect(fieldFor('image_urls').querySelector('.field__problems').textContent).toBe('a.gif is not a JPEG, PNG or WebP image.');
    expect(fieldFor('image_urls').querySelectorAll('.thumb img')).toHaveLength(2);
    // the deck hands back a fresh row object after the image save; the form must not reset
    view.rerender(<RecordDialog schema={projectsSchema} record={{ ...existing, image_urls: ['https://cdn/a.png', 'https://cdn/b.png'] }} open {...props} />);
    expect(dialog().dataset.mode).toBe('edit');
    expect(inputFor('title').value).toBe('Typed before the upload');
    // a storage failure is listed by file name and still leaves the form alone
    records.imageProblems.mockReturnValue({ accepted: [good], problems: [] });
    records.uploadImages.mockResolvedValue({ urls: [], failed: [{ name: 'b.png', message: 'did not upload: the connection dropped.' }] });
    await act(async () => { input.dispatchEvent(new Event('change', { bubbles: true })); });
    await flush();
    expect(fieldFor('image_urls').querySelector('.field__problems').textContent).toBe('b.png did not upload: the connection dropped.');
    expect(inputFor('title').value).toBe('Typed before the upload');
    // the next Save compares against the stamp the image save returned, so it is not a false conflict
    records.fetchUpdatedAt.mockResolvedValue('2026-11-18T10:05:00.000Z');
    click(button('Save'));
    await flush();
    expect(banner()).toBeNull();
    expect(records.saveRecord).toHaveBeenLastCalledWith(projectsSchema, expect.objectContaining({ title: 'Typed before the upload' }), 'p1');
    view.unmount();
  });

  it('closes on Escape when clean, guards typed text, and lets Escape dismiss the guard first', () => {
    const view = render();
    key('Escape');
    expect(props.onClose).toHaveBeenCalledTimes(1);
    click(button('Edit'));
    setInputValue(inputFor('title'), 'Unsaved words');
    key('Escape');
    expect(props.onClose).toHaveBeenCalledTimes(1);
    expect(document.querySelector('[role="alertdialog"]').textContent).toContain('Discard the changes?');
    key('Escape');
    expect(document.querySelector('[role="alertdialog"]')).toBeNull();
    expect(inputFor('title').value).toBe('Unsaved words');
    click(button('Close') || document.querySelector('.record-dialog__close'));
    click([...document.querySelectorAll('.dialog button')].find((b) => b.textContent === 'Discard'));
    expect(props.onClose).toHaveBeenCalledTimes(2);
    view.unmount();
  });

  it('places a new record after the others unless its form sets the order itself', async () => {
    const ordered = {
      table: 'things', singular: 'thing', plural: 'things', titleKey: 'title', orderKey: 'order_index', orderDirection: 'asc',
      fields: [{ key: 'title', label: 'Title', kind: 'text', required: true }, { key: 'order_index', label: 'Display order', kind: 'number', integer: true, min: 0 }],
      groups: [{ label: 'Thing', keys: ['title', 'order_index'] }],
      card: (row) => ({ title: row.title || 'Thing', subtitle: '', chips: [], image: null, flags: [] }), searchText: () => '',
    };
    records.saveRecord.mockImplementation(async (schema, payload) => ({ id: 'n1', ...payload }));
    let view = render({ schema: ordered, record: null, nextOrder: 7 });
    setInputValue(inputFor('title'), 'Typed');
    click(button('Add thing'));
    await flush();
    expect(records.saveRecord.mock.calls[0][1]).toEqual(expect.objectContaining({ title: 'Typed', order_index: 7 }));
    view.unmount();
    document.body.innerHTML = '';
    view = render({ schema: ordered, record: null, nextOrder: 7 });
    setInputValue(inputFor('title'), 'Typed');
    setInputValue(inputFor('order_index'), '2');
    click(button('Add thing'));
    await flush();
    expect(records.saveRecord.mock.calls[1][1]).toEqual(expect.objectContaining({ order_index: 2 }));
    view.unmount();
  });

  it('keeps the copy helpers in plain sentences', () => {
    expect(attentionText(1)).toBe('1 field needs attention');
    expect(attentionText(3)).toBe('3 fields need attention');
    expect(failureCopy('unknown', 'save', '').body).toBe('No reason was given.');
    expect(failureCopy('network', 'reload').title).toBe('The reload did not reach the server.');
  });
});
