// src/components/admin/Voyage/activityModel.js
//
// Pure helpers for the activity log: how a stored activity row reads on
// screen. No React, no network, tested in full.
//
// Rows come from activityService (ActivityRow: id, at, action, section,
// recordId, recordTitle, fields, detail, source). They carry field names
// only, never values, and this module keeps it that way: a sentence names
// what happened and to which record, the sub line names the section and
// the fields or a count.
//
// Days are New York days, whatever the browser's own zone, because the
// owner lives there and the rest of the admin (greeting, sky, reports)
// keeps New York time. Day arithmetic works on calendar dates, never on
// 24-hour steps, so the days either side of a daylight saving change are
// still "Today" and "Yesterday".

import { EDITED_TABLES } from '../../../services/editedTables';

export const NEW_YORK = 'America/New_York';

/** The pane's filter buttons, in order. The ids match listActivity's `filter`. */
export const FILTERS = Object.freeze([
  { id: 'all', label: 'All' },
  { id: 'content', label: 'Content' },
  { id: 'files', label: 'Files' },
  { id: 'security', label: 'Security' },
]);

export const SECURITY_ACTIONS = Object.freeze(['sign-in', 'sign-out-all', 'factor-add', 'factor-remove', 'passkey-add', 'passkey-remove']);
export const FILE_ACTIONS = Object.freeze(['upload', 'remove-file']);
const SECURITY = new Set(SECURITY_ACTIONS);
const FILES = new Set(FILE_ACTIONS);

/** Rows the Recent activity tile shows. */
export const TILE_ROWS = 5;

/**
 * How each content table is named: the section label (EDITED_TABLES, the same
 * words the Recent edits tile used) and the record nouns for sentences that
 * have no title to show.
 */
const NOUNS = {
  hero_content: ['hero', 'hero'], about_content: ['about section', 'about sections'], projects: ['project', 'projects'],
  internships: ['internship', 'internships'], education: ['education entry', 'education entries'], work_experience: ['role', 'roles'],
  skills: ['skill', 'skills'], certifications: ['certification', 'certifications'], recommendations: ['recommendation', 'recommendations'],
  achievements: ['achievement', 'achievements'], leadership: ['leadership role', 'leadership roles'], contact_messages: ['message', 'messages'],
};
const LABELS = { ...Object.fromEntries(EDITED_TABLES.map(([table, label]) => [table, label])), contact_messages: 'Inbox', security: 'Security' };
/** Tables whose records open in a chapter of their own. */
const CONTENT_TABLES = new Set(EDITED_TABLES.map(([table]) => table));

/**
 * A column name in words: "about_me_content" reads "about me content". A
 * trailing "_url" is dropped and "_urls" becomes a plural ("icon_url" reads
 * "icon", "image_urls" reads "images"), since the owner thinks of the file,
 * not the address it is stored under.
 */
export function humanizeField(name) {
  const text = String(name ?? '').trim();
  if (!text) return '';
  return text.replace(/_urls$/i, 's').replace(/_url$/i, '').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
}

/** A section (table name, or 'security') in words. Unknown tables are humanised rather than hidden. */
export const sectionLabel = (section) => LABELS[section] || (section ? humanizeField(section).replace(/^./, (c) => c.toUpperCase()) : '');

const nouns = (section) => NOUNS[section] || ['record', 'records'];
const fieldList = (fields) => (Array.isArray(fields) ? fields.map(humanizeField).filter(Boolean).join(', ') : '');
const count = (detail, key) => (detail && Number.isFinite(Number(detail[key])) ? Number(detail[key]) : null);
/** An upload that swapped one file for another: {added: 1, removed: 1}. */
const isReplace = (row) => row?.action === 'upload' && count(row.detail, 'added') === 1 && count(row.detail, 'removed') === 1;
const looksLikeImages = (fields) => Array.isArray(fields) && fields.length > 0 && fields.every((f) => /image|icon|logo|photo|badge|avatar/i.test(String(f)));
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

// ---------------------------------------------------------------------------
// New York days and times

const dayFormat = new Intl.DateTimeFormat('en-CA', { timeZone: NEW_YORK, year: 'numeric', month: '2-digit', day: '2-digit' });
const timeFormat = new Intl.DateTimeFormat('en-GB', { timeZone: NEW_YORK, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
// A calendar date (y, m, d) is held as midnight UTC, so formatting it in UTC prints that same date.
const longDay = new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' });
const shortDay = new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', day: 'numeric', month: 'short' });

// null would otherwise read as 1 January 1970
const valid = (iso) => { if (iso === null || iso === undefined || iso === '') return null; const d = new Date(iso); return Number.isNaN(d.getTime()) ? null : d; };

/** The New York calendar date of an instant, as "YYYY-MM-DD". */
export function nyDayKey(iso) {
  const d = valid(iso);
  return d ? dayFormat.format(d) : '';
}

/** The New York wall-clock time of an instant, "13:42". */
export function nyTime(iso) {
  const d = valid(iso);
  return d ? timeFormat.format(d) : '';
}

const keyToUtc = (key) => { const [y, m, d] = String(key).split('-').map(Number); return Date.UTC(y, m - 1, d); };
/** Whole calendar days from day key `a` to day key `b` (b later is positive). */
export const daysBetween = (a, b) => Math.round((keyToUtc(b) - keyToUtc(a)) / 86400000);

/**
 * A day heading: "Today", "Yesterday", then "Tue 17 Nov"; the year is added
 * only when it is not the current one.
 */
export function dayLabel(key, now = new Date()) {
  const today = nyDayKey(now);
  const diff = daysBetween(key, today);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  const date = new Date(keyToUtc(key));
  const label = longDay.format(date).replace(',', '');
  return key.slice(0, 4) === today.slice(0, 4) ? label : `${label} ${key.slice(0, 4)}`;
}

/** "Today 13:40", "Yesterday 09:05", "18 Nov 21:02" (with the year when it differs): the history list's stamp. */
export function whenLabel(iso, now = new Date()) {
  const key = nyDayKey(iso);
  if (!key) return '';
  const diff = daysBetween(key, nyDayKey(now));
  const time = nyTime(iso);
  if (diff === 0) return `Today ${time}`;
  if (diff === 1) return `Yesterday ${time}`;
  const day = shortDay.format(new Date(keyToUtc(key)));
  return key.slice(0, 4) === nyDayKey(now).slice(0, 4) ? `${day} ${time}` : `${day} ${key.slice(0, 4)} ${time}`;
}

/** The tile's short stamp: the time for today, "Yesterday", else "17 Nov". */
export function tileWhen(iso, now = new Date()) {
  const key = nyDayKey(iso);
  if (!key) return '';
  const diff = daysBetween(key, nyDayKey(now));
  if (diff === 0) return nyTime(iso);
  if (diff === 1) return 'Yesterday';
  return shortDay.format(new Date(keyToUtc(key)));
}

/**
 * Rows (newest first) grouped into New York days, keeping their order.
 * @returns {Array<{key: string, label: string, items: object[]}>}
 */
export function groupByDay(rows, now = new Date()) {
  const groups = [];
  for (const row of rows || []) {
    const key = nyDayKey(row.at);
    if (!key) continue;
    let group = groups[groups.length - 1];
    if (!group || group.key !== key) { group = { key, label: dayLabel(key, now), items: [] }; groups.push(group); }
    group.items.push(row);
  }
  return groups;
}

/** "Last 3 days · 12 events" for the pane's head; empty when nothing is loaded. */
export function paneSummary(rows, now = new Date(), hasMore = false) {
  const list = (rows || []).filter((r) => nyDayKey(r.at));
  if (!list.length) return '';
  const oldest = nyDayKey(list[list.length - 1].at);
  const count = plural(list.length, 'event', 'events');
  // With more to load the span is only partly shown, so no total is claimed for it.
  if (hasMore) {
    const since = daysBetween(oldest, nyDayKey(now));
    return `Showing ${count} ${since <= 0 ? 'from today' : since === 1 ? 'since yesterday' : `since ${dayLabel(oldest, now)}`}`;
  }
  const span = Math.max(1, daysBetween(oldest, nyDayKey(now)) + 1);
  return `${span === 1 ? 'Today' : `Last ${span} days`} · ${count}`;
}

const HOUR_MS = 3600000;
const clockParts = new Intl.DateTimeFormat('en-GB', { timeZone: NEW_YORK, hourCycle: 'h23', hour: '2-digit', minute: '2-digit', second: '2-digit' });

/**
 * How long to wait before looking at the New York date again: until just
 * after the next midnight, but never more than an hour, so the 23- and
 * 25-hour days around a clock change are measured again after the change.
 */
export function msUntilNextNyDay(now = new Date()) {
  const parts = Object.fromEntries(clockParts.formatToParts(now).map((p) => [p.type, Number(p.value)]));
  const elapsed = ((parts.hour || 0) * 3600 + (parts.minute || 0) * 60 + (parts.second || 0)) * 1000 + now.getMilliseconds();
  return Math.min(HOUR_MS, Math.max(1000, 86400000 - elapsed + 1000));
}

// ---------------------------------------------------------------------------
// Sentences

/** True for the sign-in and device actions. */
export const isSecurity = (row) => SECURITY.has(row?.action);

/** Whether a row belongs under a filter (the service filters too; this keeps a merged list honest). */
export function matchesFilter(row, filter) {
  if (filter === 'security') return isSecurity(row);
  if (filter === 'files') return FILES.has(row?.action);
  if (filter === 'content') return !isSecurity(row) && !FILES.has(row?.action);
  return true;
}

/** The colour of a row's icon: 'bad' for deletions, 'sec' for security events, '' otherwise. */
export const toneFor = (row) => (row?.action === 'delete' ? 'bad' : isSecurity(row) ? 'sec' : '');

// detail.status of an inbox row, as the database trigger writes it
const INBOX = {
  archived: ['Archived a message', 'Archived {n} messages'],
  unarchived: ['Moved a message back to the inbox', 'Moved {n} messages back to the inbox'],
  spam: ['Marked a message as spam', 'Marked {n} messages as spam'],
  'not-spam': ['Marked a message as not spam', 'Marked {n} messages as not spam'],
  read: ['Marked a message read', 'Marked {n} messages read'],
  unread: ['Marked a message unread', 'Marked {n} messages unread'],
  starred: ['Starred a message', 'Starred {n} messages'],
  unstarred: ['Unstarred a message', 'Unstarred {n} messages'],
  priority: ['Changed the priority of a message', 'Changed the priority of {n} messages'],
  notes: ['Edited the notes on a message', 'Edited the notes on {n} messages'],
  deleted: ['Deleted a message', 'Deleted {n} messages'],
};

/**
 * A row as a sentence in two parts, so the title can be set in bold (or
 * struck through when the record is gone): `lead` then `title`. With no
 * title the lead names the kind of record instead ("Edited a project").
 * @returns {{lead: string, title: string}}
 */
export function describe(row) {
  const title = row?.recordTitle ? String(row.recordTitle) : '';
  const [one] = nouns(row?.section);
  const withTitle = (verb, fallback) => (title ? { lead: verb, title } : { lead: `${verb} ${fallback ?? `a ${one}`}`.replace(/ a ([aeiou])/i, ' an $1'), title: '' });
  switch (row?.action) {
    case 'create': return withTitle('Added');
    case 'edit': return withTitle('Edited');
    case 'delete': return withTitle('Deleted');
    case 'upload': return withTitle(isReplace(row) ? 'Replaced a file in' : 'Uploaded to');
    case 'remove-file': return withTitle('Removed a file from');
    case 'reorder': return { lead: `Reordered ${sectionLabel(row.section)}`, title: '' };
    case 'sign-in': return { lead: 'Signed in', title: '' };
    case 'sign-out-all': return { lead: 'Signed out everywhere', title: '' };
    case 'factor-add': return { lead: 'Added an authenticator app', title: '' };
    case 'factor-remove': return { lead: 'Removed an authenticator app', title: '' };
    case 'passkey-add': return { lead: 'Added a passkey', title: '' };
    case 'passkey-remove': return { lead: 'Removed a passkey', title: '' };
    case 'inbox': {
      const pair = INBOX[row.detail?.status] || ['Updated a message', 'Updated {n} messages'];
      const n = count(row.detail, 'count');
      return { lead: n && n > 1 ? pair[1].replace('{n}', n) : pair[0], title: '' };
    }
    default: return { lead: humanizeField(row?.action).replace(/^./, (c) => c.toUpperCase()) || 'Changed', title: '' };
  }
}

/** The sentence as plain text, for labels and the tile. */
export const sentenceText = (row) => { const { lead, title } = describe(row); return title ? `${lead} ${title}` : lead; };

/** What sits after the section in the sub line: the changed fields, a count, or the device. */
export function detailText(row) {
  const detail = row?.detail || {};
  switch (row?.action) {
    case 'edit': return fieldList(row.fields);
    case 'upload': {
      const n = count(detail, 'added');
      if (n === null) return fieldList(row.fields);
      const [one, many] = looksLikeImages(row.fields) ? ['image', 'images'] : ['file', 'files'];
      if (isReplace(row)) return `${one} replaced`;
      const gone = count(detail, 'removed');
      return gone ? `${plural(n, one, many)} added, ${gone} removed` : plural(n, one, many);
    }
    case 'remove-file': return fieldList(row.fields) || (count(detail, 'removed') !== null ? plural(count(detail, 'removed'), 'file', 'files') : '');
    case 'reorder': {
      const n = count(detail, 'count');
      const [one, many] = nouns(row.section);
      return n ? `Order of ${plural(n, one, many)}` : '';
    }
    default:
      return isSecurity(row) && detail.label ? String(detail.label) : '';
  }
}

/** "Projects · description, technologies": the line under a sentence. */
export function subLine(row) {
  return [sectionLabel(row?.section), detailText(row)].filter(Boolean).join(' · ');
}

/** Rows that were made outside the admin (SQL editor, dashboard, imports). */
export const isOutside = (row) => row?.source === 'outside';

// ---------------------------------------------------------------------------
// Gone records and opening

/** One record across tables: section and id. */
export const recordKey = (row) => `${row.section}\u0000${row.recordId}`;

/** Most records asked about at once (the shown rows rarely name more). */
export const DELETE_CHECK_LIMIT = 100;

/**
 * The content records the shown rows name, once each and newest first: the
 * ones worth asking the server whether they were deleted. A filtered list
 * (Files, Security) or a delete on a later page cannot tell by itself.
 * @returns {Array<{section: string, recordId: string}>}
 */
export function recordsToCheck(rows) {
  const seen = new Set();
  const out = [];
  for (const row of rows || []) {
    if (!row?.recordId || !CONTENT_TABLES.has(row.section)) continue;
    const key = recordKey(row);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ section: row.section, recordId: String(row.recordId) });
    if (out.length === DELETE_CHECK_LIMIT) break;
  }
  return out;
}

/**
 * Records whose latest loaded action is a delete, plus `deleted` (keys the
 * server reported as deleted, see recordsToCheck). Rows are newest first, so
 * the first row seen for a record decides.
 * @returns {Set<string>}
 */
export function goneRecords(rows, deleted = null) {
  const seen = new Set(), gone = new Set(deleted || []);
  for (const row of rows || []) {
    if (!row?.recordId) continue;
    const key = recordKey(row);
    if (seen.has(key)) continue;
    seen.add(key);
    if (row.action === 'delete') gone.add(key);
  }
  return gone;
}

export const isGone = (row, gone) => Boolean(row?.recordId) && gone.has(recordKey(row));

/** A row opens its record when it names one in a content chapter that still exists. */
export function canOpen(row, gone) {
  return Boolean(row?.recordId) && CONTENT_TABLES.has(row.section) && row.action !== 'delete' && row.action !== 'reorder' && !isGone(row, gone);
}

/**
 * One bulk inbox change writes a row per message, all with the same `at`.
 * Each such run (same instant, status and source) folds into one row whose
 * detail.count is the number of messages, so it reads "Archived 3 messages".
 * Rows are newest first and runs are adjacent; fold after merging pages so a
 * run split by a page edge joins up again.
 */
export function collapseBulk(rows) {
  const out = [];
  for (const row of rows || []) {
    const prev = out[out.length - 1];
    const same = row?.action === 'inbox' && prev?.action === 'inbox' && Date.parse(prev.at) === Date.parse(row.at)
      && prev.detail?.status === row.detail?.status && prev.source === row.source;
    if (same) out[out.length - 1] = { ...prev, detail: { ...prev.detail, count: (count(prev.detail, 'count') || 1) + 1 } };
    else out.push(row);
  }
  return out;
}

/** What a screen reader hears after a filter loads ("Files: 3 events"). */
export function filterAnnouncement(filter, count) {
  const label = FILTERS.find((f) => f.id === filter)?.label || 'This filter';
  if (filter === 'all') return count ? `All activity: ${plural(count, 'event', 'events')}` : 'Nothing yet.';
  return count ? `${label}: ${plural(count, 'event', 'events')}` : `Nothing under ${label} yet.`;
}

/** What a screen reader hears after Show earlier ("12 more loaded"). */
export const moreAnnouncement = (count, done) => `${count} more loaded${done ? '. That is everything recorded.' : '.'}`;

/** Pages of rows joined without duplicates (a row on the edge of two pages appears once). */
export function mergeRows(current, next) {
  const ids = new Set((current || []).map((r) => r.id));
  return [...(current || []), ...(next || []).filter((r) => !ids.has(r.id))];
}

// ---------------------------------------------------------------------------
// One record's history

/**
 * The history list in the record dialog, newest first.
 * @returns {Array<{id: *, when: string, what: string, outside: boolean}>}
 */
export function historyEntries(rows, now = new Date()) {
  return (rows || []).map((row) => {
    const fields = fieldList(row.fields);
    let what;
    switch (row.action) {
      case 'create': what = 'Created'; break;
      case 'edit': what = fields ? `Edited: ${fields}` : 'Edited'; break;
      case 'delete': what = 'Deleted'; break;
      case 'upload': what = isReplace(row) ? `Replaced the ${detailText(row).replace(' replaced', '')}` : `Added ${detailText(row) || 'files'}`; break;
      case 'remove-file': what = `Removed ${fields || 'a file'}`; break;
      case 'reorder': what = 'Moved in the order'; break;
      default: what = sentenceText(row);
    }
    if (isOutside(row)) what = row.action === 'edit' ? (fields ? `Changed outside the admin: ${fields}` : 'Changed outside the admin') : `${what} (outside the admin)`;
    return { id: row.id, when: whenLabel(row.at, now), what, outside: isOutside(row) };
  });
}

/**
 * The one line the read view shows: when the record last changed and how
 * many changes are known. `limit` is how many rows were asked for; a full
 * page means there may be more ("20+ changes recorded").
 */
export function historySummary(rows, limit = 20, now = new Date()) {
  const list = rows || [];
  const n = list.length;
  return {
    count: n,
    last: n ? whenLabel(list[0].at, now) : '',
    countText: n >= limit ? `${limit}+ changes recorded` : plural(n, 'change recorded', 'changes recorded'),
    created: list.some((r) => r.action === 'create'),
  };
}

// ---------------------------------------------------------------------------
// Failures

/**
 * One fixed sentence for a failed activity read, from the typed failures the
 * services share (voyageRecords' failureKind codes). Server text is never shown.
 */
export function activityFailure(err) {
  if (err?.code === 'SESSION_EXPIRED') return 'The session has expired. Sign in again, then try again.';
  if (err?.code === 'SECOND_FACTOR_REQUIRED') return 'The authenticator code has not been entered in this session yet. Enter it, then try again.';
  const text = `${err?.message ?? ''}`;
  if ((typeof navigator !== 'undefined' && navigator.onLine === false) || /failed to fetch|network|load failed/i.test(text)) return 'The request did not reach the server. Check the connection, then try again.';
  return 'The activity log could not be read just now. Try again in a moment.';
}
