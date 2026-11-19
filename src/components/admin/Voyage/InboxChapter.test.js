/* eslint-disable testing-library/no-container, testing-library/no-node-access */
import InboxChapter, { toastFor } from './InboxChapter';
import { React, act, click, mount, setInputValue } from '../SkyBackground/testUtils';

// the record dialog's history line reads the activity log, which opens the Supabase client
jest.mock('../../../services/activityService', () => ({ ACTIVITY_NOT_SET_UP: 'ACTIVITY_NOT_SET_UP', listActivity: jest.fn(), recordHistory: jest.fn(), isActivityAvailable: jest.fn(), logSecurityEvent: jest.fn() }));
jest.mock('../../../services/inboxService', () => ({ listMessages: jest.fn(), updateMessages: jest.fn(), deleteMessages: jest.fn(), signedAttachmentUrl: jest.fn(), SIGNED_URL_SECONDS: 300 }));
// the records service pulls in the Supabase client; the inbox needs only its failure sorting and size label
jest.mock('../../../services/voyageRecords', () => ({ failureKind: jest.fn(), sizeLabel: jest.fn(), listRecords: jest.fn(), saveRecord: jest.fn(), deleteRecord: jest.fn(), fetchUpdatedAt: jest.fn(), getRecord: jest.fn(), imageProblems: jest.fn(), uploadImages: jest.fn(), removeImage: jest.fn(), fileProblems: jest.fn(), uploadFieldFiles: jest.fn(), removeStoredFiles: jest.fn() }));
const inbox = jest.requireMock('../../../services/inboxService');
const records = jest.requireMock('../../../services/voyageRecords');

const flush = () => act(async () => { await Promise.resolve(); await new Promise((r) => setTimeout(r, 0)); });
const row = (id, extra = {}) => ({ id, message_number: Number(id.slice(1)), name: `Sender ${id}`, email: `${id}@example.com`, subject: `Subject ${id}`, message: 'Hello there.\n\nSecond paragraph.', status: 'read', priority: 'normal', is_starred: false, is_archived: false, is_spam: false, created_at: '2026-11-10T10:00:00Z', ...extra });
const sample = () => [
  row('m3', { status: 'unread', created_at: '2026-11-17T10:00:00Z', inquiry_type: 'full-time-opportunity', role: 'hiring-manager', organization: 'Example Labs', attachment_urls: ['contact-attachments/contact-1-0-cv.pdf', 'contact-attachments/contact-1-1-brief.png'], attachment_names: ['cv.pdf', 'brief.png'] }),
  row('m2', { created_at: '2026-11-16T10:00:00Z', is_starred: true }),
  row('m1', { created_at: '2026-11-15T10:00:00Z' }),
  row('m9', { created_at: '2026-11-18T10:00:00Z', is_spam: true, subject: 'Buy now' }),
];
const subjects = (c) => [...c.querySelectorAll('.telegram__subject')].map((n) => n.textContent);
const button = (root, text) => [...root.querySelectorAll('button')].find((b) => b.textContent.trim() === text);
const filter = (c, label) => [...c.querySelectorAll('.inbox__filter')].find((b) => b.textContent.startsWith(label));

describe('InboxChapter', () => {
  let notify;
  beforeEach(() => {
    notify = jest.fn();
    inbox.listMessages.mockResolvedValue(sample());
    inbox.signedAttachmentUrl.mockImplementation((path) => Promise.resolve(`https://example.com/signed/${path.split('/').pop()}`));
    records.failureKind.mockImplementation((err) => (err?.code === 'SECOND_FACTOR_REQUIRED' ? 'permission' : err?.code === 'SESSION_EXPIRED' ? 'session' : 'unknown'));
    records.sizeLabel.mockImplementation((b) => `${b} B`);
  });
  afterEach(() => { document.body.innerHTML = ''; });

  it('files telegrams newest first, keeps spam under Spam only, counts each filter and searches', async () => {
    const view = mount(<InboxChapter notify={notify} />);
    await flush();
    expect(subjects(view.container)).toEqual(['Subject m3', 'Subject m2', 'Subject m1']);
    expect(filter(view.container, 'All').textContent).toBe('All3');
    expect(filter(view.container, 'Unread').textContent).toBe('Unread1');
    expect(filter(view.container, 'Spam').textContent).toBe('Spam1');
    expect(view.container.querySelector('.telegram.is-unread .stamp').textContent).toBe('Unread');
    expect(view.container.querySelector('.telegram__files').textContent).toBe('2 enclosures');
    click(filter(view.container, 'Spam'));
    expect(subjects(view.container)).toEqual(['Buy now']);
    click(filter(view.container, 'All'));
    setInputValue(view.container.querySelector('.inbox__search input'), 'example labs');
    expect(subjects(view.container)).toEqual(['Subject m3']);
    expect(view.container.querySelector('.deck__count').textContent).toBe('1 message of 4 messages');
    view.unmount();
  });

  it('marks a message read when it is opened and shows it in full with signed enclosure links', async () => {
    inbox.updateMessages.mockImplementation((ids, patch) => Promise.resolve(ids.map((id) => ({ id, ...patch, updated_at: 'now' }))));
    const view = mount(<InboxChapter notify={notify} />);
    await flush();
    click(view.container.querySelector('.telegram__open'));
    await flush();
    expect(inbox.updateMessages).toHaveBeenCalledWith(['m3'], { status: 'read', read_at: expect.any(String) });
    expect(view.container.querySelector('.telegram.is-unread')).toBeNull();
    const dialog = document.querySelector('[data-testid="inbox-dialog"]');
    expect(dialog.querySelector('#inbox-dialog-title').textContent).toBe('Subject m3');
    expect(dialog.textContent).toContain('Full-time job opportunity');
    expect(dialog.textContent).toContain('Hiring manager');
    expect(dialog.querySelectorAll('.inbox-dialog__text p')).toHaveLength(2);
    const links = [...dialog.querySelectorAll('.enclosure a')];
    expect(links.map((a) => a.getAttribute('href'))).toEqual(['https://example.com/signed/contact-1-0-cv.pdf', 'https://example.com/signed/contact-1-1-brief.png']);
    links.forEach((a) => { expect(a.target).toBe('_blank'); expect(a.rel).toBe('noopener noreferrer'); });
    expect(inbox.signedAttachmentUrl).toHaveBeenCalledWith('contact-attachments/contact-1-0-cv.pdf');
    expect(dialog.querySelector('a.voyage-bar__button--primary').getAttribute('href')).toBe('mailto:m3@example.com?subject=Re%3A%20Subject%20m3');
    view.unmount();
  });

  it('puts the unread stamp back and explains why when marking read is refused', async () => {
    inbox.updateMessages.mockRejectedValue(Object.assign(new Error('refused'), { code: 'SECOND_FACTOR_REQUIRED' }));
    const view = mount(<InboxChapter notify={notify} />);
    await flush();
    click(view.container.querySelector('.telegram__open'));
    await flush();
    expect(view.container.querySelector('.telegram.is-unread')).not.toBeNull();
    expect(document.querySelector('.inbox-dialog .record-banner--bad').textContent).toContain('This save was refused.');
    view.unmount();
  });

  it('rolls back only the columns a failed action wrote', async () => {
    inbox.updateMessages.mockImplementation((ids, patch) => (patch.is_starred ? Promise.reject(new Error('Server went away')) : Promise.resolve(ids.map((id) => ({ id, ...patch })))));
    const view = mount(<InboxChapter notify={notify} />);
    await flush();
    click(view.container.querySelectorAll('.telegram__open')[2]);   // m1: already read, nothing written on open
    await flush();
    expect(inbox.updateMessages).not.toHaveBeenCalled();
    const dialog = document.querySelector('[data-testid="inbox-dialog"]');
    click(button(dialog, 'Star'));
    await flush();
    expect(button(dialog, 'Star')).toBeDefined();   // back to unstarred
    expect(dialog.querySelector('.record-banner--bad').textContent).toContain('Server went away');
    view.unmount();
  });

  it('applies a bulk action to the selection and drops messages that leave the view', async () => {
    inbox.updateMessages.mockImplementation((ids, patch) => Promise.resolve(ids.map((id) => ({ id, ...patch }))));
    const view = mount(<InboxChapter notify={notify} />);
    await flush();
    const boxes = view.container.querySelectorAll('.telegram__pick input');
    click(boxes[0]); click(boxes[1]);
    const bar = view.container.querySelector('.inbox__selection');
    expect(bar.querySelector('.inbox__selection-count').textContent).toBe('2 selected');
    // m3 is unread and m2 read: both read and unread are offered; both are unarchived
    expect([...bar.querySelectorAll('button')].map((b) => b.textContent)).toEqual(['Mark read', 'Mark unread', 'Star', 'Unstar', 'Archive', 'Mark spam', 'Delete', 'Clear']);
    click(button(bar, 'Archive'));
    await flush();
    expect(inbox.updateMessages).toHaveBeenCalledWith(['m3', 'm2'], { is_archived: true, archived_at: expect.any(String) });
    expect(notify).toHaveBeenCalledWith('2 messages archived.');
    // All keeps archived messages (only spam is quarantined); they carry the stamp now
    expect(view.container.querySelectorAll('.stamp--muted')).toHaveLength(2);
    expect(view.container.querySelector('.inbox__selection-count').textContent).toBe('2 selected');
    // under Unread, marking read moves them out of view, and out of the selection
    click(button(view.container.querySelector('.inbox__selection'), 'Clear'));
    click(filter(view.container, 'Unread'));
    click(view.container.querySelector('.telegram__pick input'));
    click(button(view.container.querySelector('.inbox__selection'), 'Mark read'));
    await flush();
    expect(subjects(view.container)).toEqual([]);
    expect(view.container.querySelector('.inbox__selection')).toBeNull();
    expect(view.container.querySelector('.deck__empty').textContent).toBe('Nothing under Unread.');
    view.unmount();
  });

  it('selects every shown message at once and clears the selection on a new filter', async () => {
    const view = mount(<InboxChapter notify={notify} />);
    await flush();
    click(view.container.querySelector('.inbox__all input'));
    expect(view.container.querySelector('.inbox__selection-count').textContent).toBe('3 selected');
    click(filter(view.container, 'Starred'));
    expect(view.container.querySelector('.inbox__selection')).toBeNull();
    view.unmount();
  });

  it('deletes after confirmation and reports the enclosures removed with it', async () => {
    inbox.deleteMessages.mockResolvedValue({ deletedIds: ['m3'], filesRemoved: 2, filesExpected: 2 });
    inbox.updateMessages.mockImplementation((ids, patch) => Promise.resolve(ids.map((id) => ({ id, ...patch }))));
    const view = mount(<InboxChapter notify={notify} />);
    await flush();
    click(view.container.querySelector('.telegram__open'));
    await flush();
    click(button(document.querySelector('.inbox-dialog__foot'), 'Delete'));
    expect(document.querySelector('.dialog #dialog-body').textContent).toContain('2 enclosures');
    click(button(document.querySelector('.dialog'), 'Delete'));
    await flush();
    expect(inbox.deleteMessages).toHaveBeenCalledWith([expect.objectContaining({ id: 'm3' })]);
    expect(document.querySelector('[data-testid="inbox-dialog"]')).toBeNull();
    expect(subjects(view.container)).toEqual(['Subject m2', 'Subject m1']);
    expect(notify).toHaveBeenCalledWith('1 message deleted with 2 enclosures.');
    view.unmount();
  });

  it('keeps every message when the enclosures cannot be removed', async () => {
    inbox.deleteMessages.mockRejectedValue(Object.assign(new Error('The attachments could not be removed, so nothing was deleted.'), { filesRemoved: false }));
    const view = mount(<InboxChapter notify={notify} />);
    await flush();
    click(view.container.querySelectorAll('.telegram__pick input')[0]);
    click(button(view.container.querySelector('.inbox__selection'), 'Delete'));
    click(button(view.container.querySelector('.dialog'), 'Delete'));
    await flush();
    expect(subjects(view.container)).toHaveLength(3);
    expect(notify).toHaveBeenCalledWith('The attachments could not be removed, so nothing was deleted.', 'bad');
    expect(inbox.listMessages).toHaveBeenCalledTimes(1);
    view.unmount();
  });

  it('reloads the list when the files went but the message stayed', async () => {
    inbox.deleteMessages.mockRejectedValue(Object.assign(new Error('The attachments were removed, but the message could not be deleted.'), { filesRemoved: true, code: 'SECOND_FACTOR_REQUIRED' }));
    const view = mount(<InboxChapter notify={notify} />);
    await flush();
    click(view.container.querySelectorAll('.telegram__pick input')[0]);
    click(button(view.container.querySelector('.inbox__selection'), 'Delete'));
    click(button(view.container.querySelector('.dialog'), 'Delete'));
    await flush();
    expect(inbox.listMessages).toHaveBeenCalledTimes(2);
    expect(notify).toHaveBeenCalledWith('The attachments were removed, but the message could not be deleted.', 'bad');
    view.unmount();
  });

  it('offers a retry when the inbox cannot be loaded', async () => {
    inbox.listMessages.mockRejectedValueOnce(Object.assign(new Error('JWT expired'), { code: 'SESSION_EXPIRED' }));
    const view = mount(<InboxChapter notify={notify} />);
    await flush();
    expect(view.container.querySelector('.deck__error').textContent).toContain('Your session has expired.');
    click(button(view.container.querySelector('.deck__error'), 'Try again'));
    await flush();
    expect(subjects(view.container)).toHaveLength(3);
    view.unmount();
  });

  it('words a failed change for a toast by its kind', () => {
    records.failureKind.mockReturnValueOnce('network');
    expect(toastFor(new Error('Failed to fetch'))).toBe('The change did not reach the server. Check the connection and try again.');
    records.failureKind.mockReturnValueOnce('unknown');
    expect(toastFor(new Error('Boom'))).toBe('Boom');
  });
});
