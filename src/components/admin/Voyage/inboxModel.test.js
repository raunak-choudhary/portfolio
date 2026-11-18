import {
  ACTIONS, FILTERS, INQUIRY_LABELS, applyPatch, attachmentsOf, bulkActionsFor, countMessages, formatStamp, humanize, inquiryLabel,
  mergeRows, patchFor, preview, pruneSelection, replyHref, roleLabel, selectionState, stampsFor, telegramNumber, toggleAll, toggleId, visibleMessages,
} from './inboxModel';

const msg = (id, extra = {}) => ({ id, name: `Sender ${id}`, email: `${id}@example.com`, subject: `Subject ${id}`, message: 'Hello', status: 'read', priority: 'normal', is_starred: false, is_archived: false, is_spam: false, created_at: '2026-11-10T10:00:00Z', ...extra });

const box = [
  msg('a', { status: 'unread', created_at: '2026-11-15T09:00:00Z', priority: 'low' }),
  msg('b', { is_starred: true, created_at: '2026-11-17T09:00:00Z', priority: 'urgent', organization: 'Example Labs' }),
  msg('c', { is_archived: true, created_at: '2026-11-12T09:00:00Z', priority: 'high' }),
  msg('d', { is_spam: true, status: 'unread', is_starred: true, created_at: '2026-11-18T09:00:00Z' }),
  msg('e', { status: 'unread', created_at: '2026-11-16T09:00:00Z', message: 'About the Kafka pipeline' }),
];
const ids = (list) => list.map((m) => m.id);

describe('inbox filters and counts', () => {
  it('shows newest first and keeps spam out of every filter but Spam', () => {
    expect(ids(visibleMessages(box))).toEqual(['b', 'e', 'a', 'c']);
    expect(ids(visibleMessages(box, { filter: 'unread' }))).toEqual(['e', 'a']);
    expect(ids(visibleMessages(box, { filter: 'starred' }))).toEqual(['b']);
    expect(ids(visibleMessages(box, { filter: 'archived' }))).toEqual(['c']);
    expect(ids(visibleMessages(box, { filter: 'spam' }))).toEqual(['d']);
  });

  it('counts each filter exactly as it filters', () => {
    const counts = countMessages(box);
    expect(counts).toEqual({ all: 4, unread: 2, starred: 1, archived: 1, spam: 1 });
    FILTERS.forEach((f) => expect(visibleMessages(box, { filter: f.id })).toHaveLength(counts[f.id]));
  });

  it('searches name, email, subject, message and organization, ignoring case', () => {
    expect(ids(visibleMessages(box, { query: 'KAFKA' }))).toEqual(['e']);
    expect(ids(visibleMessages(box, { query: 'example labs' }))).toEqual(['b']);
    expect(ids(visibleMessages(box, { query: 'c@example.com' }))).toEqual(['c']);
    expect(ids(visibleMessages(box, { query: 'subject a' }))).toEqual(['a']);
    expect(visibleMessages(box, { query: 'nothing like this' })).toEqual([]);
  });

  it('sorts by priority or unread first, falling back to newest first', () => {
    expect(ids(visibleMessages(box, { sort: 'priority' }))).toEqual(['b', 'c', 'e', 'a']);
    expect(ids(visibleMessages(box, { sort: 'status' }))).toEqual(['e', 'a', 'b', 'c']);
  });

  it('treats a missing or unknown priority as normal', () => {
    const list = [msg('x', { priority: null, created_at: '2026-01-02T00:00:00Z' }), msg('y', { priority: 'whatever', created_at: '2026-01-01T00:00:00Z' }), msg('z', { priority: 'low' })];
    expect(ids(visibleMessages(list, { sort: 'priority' }))).toEqual(['x', 'y', 'z']);
  });
});

describe('inbox labels', () => {
  it('maps every inquiry slug the contact form stores to words', () => {
    ['full-time-opportunity', 'contract-opportunity', 'internship-offer', 'freelance-project', 'collaboration', 'startup-opportunity', 'research-project', 'mentorship-request', 'speaking-event', 'interview-request', 'networking', 'technical-discussion', 'general-inquiry']
      .forEach((slug) => expect(INQUIRY_LABELS[slug]).toMatch(/^[A-Z][a-z]/));
    expect(inquiryLabel('speaking-event')).toBe('Speaking or conference invitation');
    expect(inquiryLabel('some-new-type')).toBe('Some new type');
    expect(inquiryLabel(null)).toBe('');
  });

  it('maps role slugs and humanizes unknown ones', () => {
    expect(roleLabel('cto-executive')).toBe('CTO or executive');
    expect(roleLabel('hiring_partner')).toBe('Hiring partner');
    expect(humanize('  ')).toBe('');
  });

  it('stamps a message for spam, unread, priority, starred and archived', () => {
    expect(stampsFor(box[3]).map((s) => s.label)).toEqual(['Spam', 'Unread', 'Starred']);
    expect(stampsFor(box[1]).map((s) => s.label)).toEqual(['Urgent', 'Starred']);
    expect(stampsFor(box[2]).map((s) => s.label)).toEqual(['High', 'Archived']);
    expect(stampsFor(msg('n'))).toEqual([]);   // read, normal: nothing to say
  });

  it('numbers telegrams, formats times and previews long text at a word', () => {
    expect(telegramNumber({ message_number: 42 })).toBe('No. 0042');
    expect(telegramNumber({})).toBe('No number');
    expect(formatStamp('nope')).toBe('');
    expect(formatStamp('2026-11-18T14:08:00Z')).toMatch(/18 Nov 2026, \d\d:\d\d/);
    const long = 'word '.repeat(60);
    const cut = preview(long, 40);
    expect(cut.endsWith('…')).toBe(true);
    expect(cut.length).toBeLessThanOrEqual(41);
    expect(preview('  short\n\ntext ')).toBe('short text');
  });

  it('builds a reply link only from a plain address', () => {
    expect(replyHref(msg('a', { subject: 'Role & team' }))).toBe('mailto:a@example.com?subject=Re%3A%20Role%20%26%20team');
    expect(replyHref(msg('a', { subject: '' }))).toBe('mailto:a@example.com?subject=Re%3A%20your%20message');
    expect(replyHref(msg('a', { email: 'x@example.com?bcc=evil@example.com' }))).toBeNull();
    expect(replyHref(msg('a', { email: 'not an address' }))).toBeNull();
  });

  it('reads attachments from the list columns and from the legacy single column', () => {
    expect(attachmentsOf({ attachment_urls: ['contact-attachments/a.pdf', 'contact-attachments/b.png'], attachment_names: ['CV.pdf'], attachment_size: 2048 }))
      .toEqual([{ key: '0-contact-attachments/a.pdf', path: 'contact-attachments/a.pdf', name: 'CV.pdf', size: 2048 }, { key: '1-contact-attachments/b.png', path: 'contact-attachments/b.png', name: 'b.png', size: null }]);
    expect(attachmentsOf({ attachment_urls: [], attachment_url: 'contact-attachments/old.pdf', attachment_name: 'Old.pdf' })[0]).toMatchObject({ path: 'contact-attachments/old.pdf', name: 'Old.pdf' });
    expect(attachmentsOf({})).toEqual([]);
  });
});

describe('inbox actions', () => {
  const now = '2026-11-18T12:00:00.000Z';

  it('writes exactly the columns each action owns', () => {
    expect(patchFor('read', { now })).toEqual({ status: 'read', read_at: now });
    expect(patchFor('unread', { now })).toEqual({ status: 'unread', read_at: null });
    expect(patchFor('star')).toEqual({ is_starred: true });
    expect(patchFor('unstar')).toEqual({ is_starred: false });
    expect(patchFor('archive', { now })).toEqual({ is_archived: true, archived_at: now });
    expect(patchFor('unarchive')).toEqual({ is_archived: false, archived_at: null });
    expect(patchFor('spam', { now })).toEqual({ is_spam: true, marked_spam_at: now });
    expect(patchFor('notSpam')).toEqual({ is_spam: false, marked_spam_at: null });   // the classic single un-spam left the stamp behind
    expect(patchFor('priority', { value: 'urgent' })).toEqual({ priority: 'urgent' });
    expect(patchFor('notes', { value: '  call back Monday ' })).toEqual({ admin_notes: 'call back Monday' });
    expect(patchFor('notes', { value: '   ' })).toEqual({ admin_notes: null });
    expect(() => patchFor('priority', { value: 'critical' })).toThrow(/Unknown priority/);
    expect(() => patchFor('explode')).toThrow(/Unknown inbox action/);
    expect(Object.keys(ACTIONS)).toHaveLength(8);
  });

  it('applies a patch optimistically and merges the saved rows back', () => {
    const next = applyPatch(box, ['a', 'e'], { status: 'read' });
    expect(next.filter((m) => m.status === 'unread').map((m) => m.id)).toEqual(['d']);
    expect(next[1]).toBe(box[1]);   // untouched rows keep their identity
    const merged = mergeRows(next, [{ id: 'a', status: 'read', updated_at: 'later' }]);
    expect(merged[0]).toMatchObject({ id: 'a', status: 'read', updated_at: 'later', name: 'Sender a' });
  });

  it('offers only the bulk actions that would change something', () => {
    expect(bulkActionsFor([])).toEqual([]);
    expect(bulkActionsFor([box[0]])).toEqual(['read', 'star', 'archive', 'spam']);
    expect(bulkActionsFor([box[1], box[2]])).toEqual(['unread', 'star', 'unstar', 'archive', 'unarchive', 'spam']);
    expect(bulkActionsFor([box[3]])).toEqual(['read', 'unstar', 'archive', 'notSpam']);
  });
});

describe('inbox selection', () => {
  it('toggles one id, selects all visible and clears again', () => {
    let s = toggleId(new Set(), 'a');
    expect([...s]).toEqual(['a']);
    expect(selectionState(s, ['a', 'b'])).toEqual({ all: false, some: true });
    s = toggleAll(s, ['a', 'b']);
    expect(selectionState(s, ['a', 'b'])).toEqual({ all: true, some: false });
    s = toggleAll(s, ['a', 'b']);
    expect(s.size).toBe(0);
    expect(selectionState(s, [])).toEqual({ all: false, some: false });
    expect([...toggleId(new Set(['a']), 'a')]).toEqual([]);
  });

  it('drops ids that left the view and keeps the same set when nothing changed', () => {
    const s = new Set(['a', 'b']);
    expect([...pruneSelection(s, ['b', 'c'])]).toEqual(['b']);
    expect(pruneSelection(s, ['a', 'b', 'c'])).toBe(s);
  });
});
