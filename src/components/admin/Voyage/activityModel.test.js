// voyageData imports the Supabase client, which needs env; the model only reads its table list.
import {
  FILTERS, canOpen, dayLabel, daysBetween, describe as describeRow, detailText, goneRecords, groupByDay, historyEntries, historySummary,
  humanizeField, isGone, isOutside, matchesFilter, mergeRows, nyDayKey, nyTime, paneSummary, sectionLabel, sentenceText, subLine, tileWhen, toneFor, whenLabel,
} from './activityModel';

jest.mock('../../../services/supabaseClient', () => ({ supabase: {} }));

const row = (over = {}) => ({ id: 1, at: '2026-11-19T18:42:00.000Z', action: 'edit', section: 'projects', recordId: 'p1', recordTitle: 'Tallyproof', fields: ['description', 'technologies'], detail: {}, source: 'admin', ...over });
// Thursday 19 Nov 2026, 14:00 in New York (EST, UTC-5)
const NOW = new Date('2026-11-19T19:00:00.000Z');

describe('New York days', () => {
  it('keys an instant by its New York date, not the UTC one', () => {
    expect(nyDayKey('2026-11-19T03:00:00Z')).toBe('2026-11-18');   // 22:00 the evening before
    expect(nyDayKey('2026-11-19T05:00:00Z')).toBe('2026-11-19');
    expect(nyDayKey('not a date')).toBe('');
  });

  it('prints 24-hour New York wall-clock time, including both copies of the repeated autumn hour', () => {
    expect(nyTime('2026-11-19T18:42:00Z')).toBe('13:42');
    expect(nyTime('2026-11-01T05:30:00Z')).toBe('01:30');   // 01:30 EDT
    expect(nyTime('2026-11-01T06:30:00Z')).toBe('01:30');   // 01:30 EST, an hour later
    expect(nyTime('2026-07-01T04:05:00Z')).toBe('00:05');
  });

  it('labels Today, Yesterday, then "Tue 17 Nov", with the year only when it differs', () => {
    expect(dayLabel('2026-11-19', NOW)).toBe('Today');
    expect(dayLabel('2026-11-18', NOW)).toBe('Yesterday');
    expect(dayLabel('2026-11-17', NOW)).toBe('Tue 17 Nov');
    expect(dayLabel('2025-12-31', new Date('2026-01-02T15:00:00Z'))).toBe('Wed 31 Dec 2025');
  });

  it('counts calendar days across the autumn change (a 25-hour day is still one day)', () => {
    const now = new Date('2026-11-02T12:00:00Z');                       // Mon 2 Nov, 07:00 EST
    expect(dayLabel(nyDayKey('2026-11-01T04:30:00Z'), now)).toBe('Yesterday');   // Sun 1 Nov, 00:30 EDT
    expect(dayLabel(nyDayKey('2026-11-01T03:59:00Z'), now)).toBe('Sat 31 Oct');  // Sat 23:59 EDT
    const lateSunday = new Date('2026-11-02T03:30:00Z');                // Sun 1 Nov, 22:30 EST
    expect(dayLabel(nyDayKey('2026-11-01T04:30:00Z'), lateSunday)).toBe('Today');
    expect(daysBetween('2026-10-31', '2026-11-02')).toBe(2);
  });

  it('counts calendar days across the spring change (a 23-hour day is still one day)', () => {
    const lateSunday = new Date('2026-03-09T03:30:00Z');                // Sun 8 Mar, 23:30 EDT
    expect(dayLabel(nyDayKey('2026-03-08T05:30:00Z'), lateSunday)).toBe('Today');  // 00:30 EST the same day
    expect(dayLabel(nyDayKey('2026-03-08T04:30:00Z'), lateSunday)).toBe('Yesterday');
    expect(daysBetween('2026-03-07', '2026-03-09')).toBe(2);
  });

  it('stamps history entries and tile rows', () => {
    expect(whenLabel('2026-11-19T18:40:00Z', NOW)).toBe('Today 13:40');
    expect(whenLabel('2026-11-18T14:05:00Z', NOW)).toBe('Yesterday 09:05');
    expect(whenLabel('2026-11-13T15:15:00Z', NOW)).toBe('13 Nov 10:15');
    expect(whenLabel('2025-11-13T15:15:00Z', NOW)).toBe('13 Nov 2025 10:15');
    expect(whenLabel('', NOW)).toBe('');
    expect(tileWhen('2026-11-19T18:40:00Z', NOW)).toBe('13:40');
    expect(tileWhen('2026-11-18T18:40:00Z', NOW)).toBe('Yesterday');
    expect(tileWhen('2026-11-17T18:40:00Z', NOW)).toBe('17 Nov');
    expect(tileWhen(null, NOW)).toBe('');
  });

  it('groups newest-first rows into days in order and skips rows without a time', () => {
    const rows = [row({ id: 1, at: '2026-11-19T18:42:00Z' }), row({ id: 2, at: '2026-11-19T05:01:00Z' }), row({ id: 3, at: '2026-11-19T03:00:00Z' }), row({ id: 4, at: null }), row({ id: 5, at: '2026-11-17T16:20:00Z' })];
    const groups = groupByDay(rows, NOW);
    expect(groups.map((g) => [g.label, g.items.map((r) => r.id)])).toEqual([['Today', [1, 2]], ['Yesterday', [3]], ['Tue 17 Nov', [5]]]);
    expect(groupByDay(null, NOW)).toEqual([]);
  });

  it('summarises the loaded span for the pane head', () => {
    expect(paneSummary([], NOW)).toBe('');
    expect(paneSummary([row()], NOW)).toBe('Today · 1 event');
    expect(paneSummary([row(), row({ id: 2, at: '2026-11-17T16:20:00Z' })], NOW)).toBe('Last 3 days · 2 events');
  });
});

describe('sentences', () => {
  it('names each content action with the record title kept apart for bold or strike-through', () => {
    expect(describeRow(row({ action: 'create' }))).toEqual({ lead: 'Added', title: 'Tallyproof' });
    expect(describeRow(row())).toEqual({ lead: 'Edited', title: 'Tallyproof' });
    expect(describeRow(row({ action: 'delete' }))).toEqual({ lead: 'Deleted', title: 'Tallyproof' });
    expect(describeRow(row({ action: 'upload' }))).toEqual({ lead: 'Uploaded to', title: 'Tallyproof' });
    expect(describeRow(row({ action: 'remove-file' }))).toEqual({ lead: 'Removed a file from', title: 'Tallyproof' });
    expect(describeRow(row({ action: 'reorder', section: 'internships', recordId: null, recordTitle: null }))).toEqual({ lead: 'Reordered Internships', title: '' });
  });

  it('names the kind of record when there is no title, with the right article', () => {
    expect(sentenceText(row({ recordTitle: null }))).toBe('Edited a project');
    expect(sentenceText(row({ recordTitle: null, section: 'about_content' }))).toBe('Edited an about section');
    expect(sentenceText(row({ recordTitle: null, section: 'education', action: 'upload' }))).toBe('Uploaded to an education entry');
    expect(sentenceText(row({ recordTitle: null, section: 'mystery', action: 'remove-file' }))).toBe('Removed a file from a record');
  });

  it('names security events and inbox changes without any title', () => {
    const sec = (action) => sentenceText({ action, section: 'security', detail: {} });
    expect(['sign-in', 'sign-out-all', 'factor-add', 'factor-remove', 'passkey-add', 'passkey-remove'].map(sec)).toEqual([
      'Signed in', 'Signed out everywhere', 'Added an authenticator app', 'Removed an authenticator app', 'Added a passkey', 'Removed a passkey',
    ]);
    const inbox = (detail) => sentenceText({ action: 'inbox', section: 'contact_messages', recordTitle: null, detail });
    expect(inbox({ status: 'archived' })).toBe('Archived a message');
    expect(inbox({ status: 'archived', count: 2 })).toBe('Archived 2 messages');
    expect(inbox({ status: 'deleted' })).toBe('Deleted a message');
    expect(inbox({ status: 'spam' })).toBe('Moved a message to spam');
    expect(inbox({ status: 'read' })).toBe('Marked a message read');
    expect(inbox({ status: 'weird' })).toBe('Updated a message');
    expect(sentenceText({ action: 'new-thing', section: 'x' })).toBe('New thing');
  });

  it('builds the sub line from the section label and the fields or a count, never values', () => {
    expect(subLine(row({ fields: ['description', 'about_me_content'] }))).toBe('Projects · description, about me content');
    expect(subLine(row({ action: 'upload', fields: ['image_urls'], detail: { added: 2 } }))).toBe('Projects · 2 images');
    expect(subLine(row({ action: 'upload', section: 'internships', fields: ['certificate_urls'], detail: { added: 1 } }))).toBe('Internships · 1 file');
    expect(subLine(row({ action: 'upload', fields: ['image_urls'], detail: {} }))).toBe('Projects · images');
    expect(subLine(row({ action: 'remove-file', section: 'skills', fields: ['icon_url'], detail: { removed: 1 } }))).toBe('Skills · icon');
    expect(subLine(row({ action: 'remove-file', fields: [], detail: { removed: 3 } }))).toBe('Projects · 3 files');
    expect(subLine(row({ action: 'reorder', section: 'internships', detail: { count: 3 } }))).toBe('Internships · Order of 3 internships');
    expect(subLine(row({ action: 'reorder', section: 'internships', detail: {} }))).toBe('Internships');
    expect(subLine(row({ action: 'create' }))).toBe('Projects');
    expect(subLine({ action: 'passkey-add', section: 'security', detail: { label: 'Pixel 9' } })).toBe('Security · Pixel 9');
    expect(subLine({ action: 'inbox', section: 'contact_messages', detail: { status: 'archived' } })).toBe('Inbox');
    expect(detailText({ action: 'sign-in', detail: {} })).toBe('');
  });

  it('humanises field and section names', () => {
    expect(humanizeField('about_me_content')).toBe('about me content');
    expect(humanizeField('image_urls')).toBe('images');
    expect(humanizeField('icon_url')).toBe('icon');
    expect(humanizeField('Key-Features')).toBe('key features');
    expect(humanizeField(null)).toBe('');
    expect(sectionLabel('work_experience')).toBe('Work');
    expect(sectionLabel('contact_messages')).toBe('Inbox');
    expect(sectionLabel('security')).toBe('Security');
    expect(sectionLabel('new_table')).toBe('New table');
    expect(sectionLabel(null)).toBe('');
  });

  it('marks tone, outside changes and filters', () => {
    expect(toneFor(row({ action: 'delete' }))).toBe('bad');
    expect(toneFor({ action: 'sign-in' })).toBe('sec');
    expect(toneFor(row())).toBe('');
    expect(isOutside(row({ source: 'outside' }))).toBe(true);
    expect(isOutside(row())).toBe(false);
    expect(FILTERS.map((f) => f.id)).toEqual(['all', 'content', 'files', 'security']);
    const rows = [row(), row({ action: 'upload' }), { action: 'sign-in' }, { action: 'inbox' }];
    expect(rows.filter((r) => matchesFilter(r, 'content')).map((r) => r.action)).toEqual(['edit', 'inbox']);
    expect(rows.filter((r) => matchesFilter(r, 'files')).map((r) => r.action)).toEqual(['upload']);
    expect(rows.filter((r) => matchesFilter(r, 'security')).map((r) => r.action)).toEqual(['sign-in']);
    expect(rows.filter((r) => matchesFilter(r, 'all'))).toHaveLength(4);
  });
});

describe('gone records and opening', () => {
  const rows = [
    row({ id: 5, action: 'delete', recordId: 'p9', recordTitle: 'TEST-Orbit' }),
    row({ id: 4, action: 'create', recordId: 'p9', recordTitle: 'TEST-Orbit' }),
    row({ id: 3, action: 'create', recordId: 'p7', recordTitle: 'Revived' }),
    row({ id: 2, action: 'delete', recordId: 'p7', recordTitle: 'Revived' }),
    row({ id: 1, action: 'edit', section: 'skills', recordId: 'p9', recordTitle: 'Python' }),
  ];

  it('treats a record as gone only when its latest action is a delete, per table', () => {
    const gone = goneRecords(rows);
    expect(isGone(rows[1], gone)).toBe(true);
    expect(isGone(rows[2], gone)).toBe(false);   // re-created after the delete
    expect(isGone(rows[4], gone)).toBe(false);   // same id, another table
    expect(isGone({ recordId: null }, gone)).toBe(false);
  });

  it('opens content records that still exist, never deletes, reorders, security or inbox rows', () => {
    const gone = goneRecords(rows);
    expect(canOpen(rows[1], gone)).toBe(false);
    expect(canOpen(rows[0], gone)).toBe(false);
    expect(canOpen(rows[2], gone)).toBe(true);
    expect(canOpen(rows[4], gone)).toBe(true);
    expect(canOpen(row({ action: 'reorder' }), gone)).toBe(false);
    expect(canOpen({ action: 'sign-in', section: 'security', recordId: null }, gone)).toBe(false);
    expect(canOpen({ action: 'inbox', section: 'contact_messages', recordId: 'm1' }, gone)).toBe(false);
  });

  it('joins pages without repeating a row', () => {
    expect(mergeRows([row({ id: 1 }), row({ id: 2 })], [row({ id: 2 }), row({ id: 3 })]).map((r) => r.id)).toEqual([1, 2, 3]);
    expect(mergeRows(null, [row()])).toHaveLength(1);
  });
});

describe('a record\'s history', () => {
  const rows = [
    row({ id: 4, action: 'upload', at: '2026-11-19T18:40:00Z', fields: ['image_urls'], detail: { added: 2 } }),
    row({ id: 3, action: 'edit', at: '2026-11-18T21:02:00Z', fields: ['description', 'key_features'] }),
    row({ id: 2, action: 'remove-file', at: '2026-11-13T15:15:00Z', fields: ['image_urls'] }),
    row({ id: 1, action: 'edit', at: '2026-11-09T23:30:00Z', fields: ['title', 'duration'], source: 'outside' }),
  ];

  it('lists entries with New York stamps and plain words', () => {
    expect(historyEntries(rows, NOW)).toEqual([
      { id: 4, when: 'Today 13:40', what: 'Added 2 images', outside: false },
      { id: 3, when: 'Yesterday 16:02', what: 'Edited: description, key features', outside: false },
      { id: 2, when: '13 Nov 10:15', what: 'Removed images', outside: false },
      { id: 1, when: '9 Nov 18:30', what: 'Changed outside the admin: title, duration', outside: true },
    ]);
    expect(historyEntries([row({ action: 'create' }), row({ action: 'delete', source: 'outside' }), row({ action: 'edit', fields: [] }), row({ action: 'reorder' })], NOW).map((e) => e.what))
      .toEqual(['Created', 'Deleted (outside the admin)', 'Edited', 'Moved in the order']);
    expect(historyEntries([row({ action: 'edit', fields: [], source: 'outside' })], NOW)[0].what).toBe('Changed outside the admin');
    expect(historyEntries(null)).toEqual([]);
  });

  it('summarises the last change and the count, flagging a full page as "or more"', () => {
    expect(historySummary(rows, 20, NOW)).toEqual({ count: 4, last: 'Today 13:40', countText: '4 changes recorded', created: false });
    expect(historySummary([row({ action: 'create' })], 20, NOW)).toMatchObject({ countText: '1 change recorded', created: true });
    expect(historySummary(rows, 4, NOW).countText).toBe('4+ changes recorded');
    expect(historySummary([], 20, NOW)).toMatchObject({ count: 0, last: '' });
  });
});
