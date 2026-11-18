// src/components/admin/Voyage/inboxModel.js
//
// The inbox chapter's rules, kept pure so they can be tested without a
// browser or a database: which messages a filter shows, how they sort, what
// each action writes, which bulk actions make sense for a selection, and how
// the contact form's stored slugs read as words.
//
// The model follows the classic manager's meaning with two deliberate
// changes: spam is quarantined (it appears only under Spam, so the unread,
// starred and archived counts never include it), and un-spam always clears
// marked_spam_at (the classic single action left the old timestamp behind).

/** Filters in the order the toolbar shows them. "All" is everything except spam. */
export const FILTERS = Object.freeze([
  { id: 'all', label: 'All' },
  { id: 'unread', label: 'Unread' },
  { id: 'starred', label: 'Starred' },
  { id: 'archived', label: 'Archived' },
  { id: 'spam', label: 'Spam' },
]);

export const SORTS = Object.freeze([
  { id: 'date', label: 'Newest first' },
  { id: 'priority', label: 'Priority' },
  { id: 'status', label: 'Unread first' },
]);

export const PRIORITIES = Object.freeze([
  { value: 'urgent', label: 'Urgent' },
  { value: 'high', label: 'High' },
  { value: 'normal', label: 'Normal' },
  { value: 'low', label: 'Low' },
]);
const PRIORITY_RANK = { urgent: 4, high: 3, normal: 2, low: 1 };

/** Inquiry types exactly as ContactForm.js stores them, as the owner reads them. */
export const INQUIRY_LABELS = Object.freeze({
  'full-time-opportunity': 'Full-time job opportunity',
  'contract-opportunity': 'Contract or consulting opportunity',
  'internship-offer': 'Internship opportunity',
  'freelance-project': 'Freelance project',
  collaboration: 'Technical collaboration',
  'startup-opportunity': 'Startup opportunity',
  'research-project': 'Research project',
  'mentorship-request': 'Mentorship request',
  'speaking-event': 'Speaking or conference invitation',
  'interview-request': 'Interview or podcast request',
  networking: 'Professional networking',
  'technical-discussion': 'Technical discussion',
  'general-inquiry': 'General inquiry',
});

/** The sender's role, also stored by ContactForm.js as a slug. */
export const ROLE_LABELS = Object.freeze({
  recruiter: 'Recruiter',
  'hr-manager': 'HR manager',
  'hiring-manager': 'Hiring manager',
  'technical-lead': 'Technical lead',
  'team-lead': 'Team lead',
  'project-manager': 'Project manager',
  'cto-executive': 'CTO or executive',
  developer: 'Fellow developer',
  'startup-founder': 'Startup founder',
  student: 'Student',
  researcher: 'Researcher',
  other: 'Other',
});

/** "some-new-slug" -> "Some new slug": older rows and future form options still read as words. */
export const humanize = (value) => {
  const text = String(value ?? '').trim().replace(/[-_]+/g, ' ').replace(/\s+/g, ' ');
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : '';
};
export const inquiryLabel = (slug) => INQUIRY_LABELS[slug] || humanize(slug);
export const roleLabel = (slug) => ROLE_LABELS[slug] || humanize(slug);
export const priorityOf = (message) => (PRIORITY_RANK[String(message?.priority || '').toLowerCase()] ? String(message.priority).toLowerCase() : 'normal');
export const priorityLabel = (value) => PRIORITIES.find((p) => p.value === value)?.label || 'Normal';

export const isUnread = (m) => m.status !== 'read';
const isSpam = (m) => m.is_spam === true;

const FILTER_TESTS = {
  all: (m) => !isSpam(m),
  unread: (m) => !isSpam(m) && isUnread(m),
  starred: (m) => !isSpam(m) && m.is_starred === true,
  archived: (m) => !isSpam(m) && m.is_archived === true,
  spam: isSpam,
};

/** The text a search looks in: the five fields the classic manager searched. */
export const searchText = (m) => [m.name, m.email, m.subject, m.message, m.organization].filter(Boolean).join(' \n ').toLowerCase();

const time = (iso) => { const t = Date.parse(iso); return Number.isFinite(t) ? t : 0; };
const byNewest = (a, b) => time(b.created_at) - time(a.created_at);
const COMPARE = {
  date: byNewest,
  priority: (a, b) => PRIORITY_RANK[priorityOf(b)] - PRIORITY_RANK[priorityOf(a)] || byNewest(a, b),
  status: (a, b) => Number(isUnread(b)) - Number(isUnread(a)) || byNewest(a, b),
};

/**
 * The messages a view shows: one filter, an optional search, one sort.
 * Ties always fall back to newest first, so the order never jumps around.
 */
export function visibleMessages(messages, { filter = 'all', query = '', sort = 'date' } = {}) {
  const test = FILTER_TESTS[filter] || FILTER_TESTS.all;
  const q = query.trim().toLowerCase();
  return messages.filter((m) => test(m) && (!q || searchText(m).includes(q))).sort(COMPARE[sort] || COMPARE.date);
}

/** How many messages each filter holds (without the search), for the toolbar. */
export const countMessages = (messages) => Object.fromEntries(FILTERS.map((f) => [f.id, messages.filter(FILTER_TESTS[f.id]).length]));

// ---- actions ----

/**
 * What each action writes to a row (the service adds updated_at). `now` is
 * passed in so the timestamps are testable.
 */
export const ACTIONS = Object.freeze({
  read: { label: 'Mark read', done: 'marked read', patch: (now) => ({ status: 'read', read_at: now }) },
  unread: { label: 'Mark unread', done: 'marked unread', patch: () => ({ status: 'unread', read_at: null }) },
  star: { label: 'Star', done: 'starred', patch: () => ({ is_starred: true }) },
  unstar: { label: 'Unstar', done: 'unstarred', patch: () => ({ is_starred: false }) },
  archive: { label: 'Archive', done: 'archived', patch: (now) => ({ is_archived: true, archived_at: now }) },
  unarchive: { label: 'Unarchive', done: 'moved back to the inbox', patch: () => ({ is_archived: false, archived_at: null }) },
  spam: { label: 'Mark spam', done: 'marked as spam', patch: (now) => ({ is_spam: true, marked_spam_at: now }) },
  notSpam: { label: 'Not spam', done: 'moved out of spam', patch: () => ({ is_spam: false, marked_spam_at: null }) },
});

/** The row patch for an action; `priority` takes its value, `notes` its text (empty notes are stored as NULL). */
export function patchFor(action, { now = new Date().toISOString(), value } = {}) {
  if (action === 'priority') {
    if (!PRIORITY_RANK[value]) throw new Error(`Unknown priority "${value}".`);
    return { priority: value };
  }
  if (action === 'notes') return { admin_notes: String(value ?? '').trim() || null };
  const entry = ACTIONS[action];
  if (!entry) throw new Error(`Unknown inbox action "${action}".`);
  return entry.patch(now);
}

/** The list with a patch applied to some ids: the optimistic picture before the server answers. */
export const applyPatch = (messages, ids, patch) => {
  const set = new Set(ids);
  return messages.map((m) => (set.has(m.id) ? { ...m, ...patch } : m));
};

/** Server rows merged back over the list (the saved row is the truth, including its new updated_at). */
export const mergeRows = (messages, rows) => {
  const byId = new Map((rows || []).map((r) => [r.id, r]));
  return messages.map((m) => (byId.has(m.id) ? { ...m, ...byId.get(m.id) } : m));
};

/**
 * The bulk actions worth offering for a selection: an action is shown only
 * when it would change at least one selected message, so the bar never
 * offers "Mark read" for a selection that is all read already.
 */
export function bulkActionsFor(selected) {
  if (!selected.length) return [];
  const some = (fn) => selected.some(fn);
  const list = [];
  if (some(isUnread)) list.push('read');
  if (some((m) => !isUnread(m))) list.push('unread');
  if (some((m) => m.is_starred !== true)) list.push('star');
  if (some((m) => m.is_starred === true)) list.push('unstar');
  if (some((m) => m.is_archived !== true)) list.push('archive');
  if (some((m) => m.is_archived === true)) list.push('unarchive');
  if (some((m) => !isSpam(m))) list.push('spam');
  if (some(isSpam)) list.push('notSpam');
  return list;
}

/** "1 message" / "3 messages". */
export const messagesWord = (n) => `${n} ${n === 1 ? 'message' : 'messages'}`;

// ---- selection ----

/** Adds or removes one id. Returns a new Set. */
export const toggleId = (selected, id) => { const next = new Set(selected); if (next.has(id)) next.delete(id); else next.add(id); return next; };

/** Whether every visible message is selected (the select-all box), and whether some are (its mixed state). */
export function selectionState(selected, visibleIds) {
  const chosen = visibleIds.filter((id) => selected.has(id)).length;
  return { all: visibleIds.length > 0 && chosen === visibleIds.length, some: chosen > 0 && chosen < visibleIds.length };
}

/** Select-all toggles between every visible id and none. */
export const toggleAll = (selected, visibleIds) => (selectionState(selected, visibleIds).all ? new Set() : new Set(visibleIds));

/** Drops ids that are no longer visible (after a filter, a search or a delete). */
export const pruneSelection = (selected, visibleIds) => {
  const keep = new Set(visibleIds);
  const next = new Set([...selected].filter((id) => keep.has(id)));
  return next.size === selected.size ? selected : next;
};

// ---- presentation ----

/**
 * Attachments of a message as stored paths inside the private bucket. The
 * form writes `attachment_urls` and `attachment_names`; rows from before that
 * carry one `attachment_url`, `attachment_name` and `attachment_size`. Same
 * reading as `normalizeContactAttachments` in adminDataService.js, kept here
 * so the model stays free of the Supabase client.
 */
export function attachmentsOf(message = {}) {
  const list = Array.isArray(message.attachment_urls) ? message.attachment_urls.filter(Boolean) : [];
  const names = Array.isArray(message.attachment_names) ? message.attachment_names : [];
  const paths = list.length ? list : [message.attachment_url].filter(Boolean);
  return paths.map((path, i) => ({
    key: `${i}-${path}`,
    path: String(path),
    name: names[i] || (i === 0 ? message.attachment_name : null) || String(path).split('/').pop() || `Attachment ${i + 1}`,
    size: i === 0 ? message.attachment_size || null : null,
  }));
}

/** "No. 0042": the telegram number the inbox files a message under. */
export const telegramNumber = (m) => (Number.isFinite(Number(m?.message_number)) && m?.message_number !== null ? `No. ${String(m.message_number).padStart(4, '0')}` : 'No number');

/** "18 Nov 2026, 14:08" in the viewer's time zone, or an empty string. */
export function formatStamp(iso) {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '';
  const d = new Date(t);
  return `${d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}, ${d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`;
}

/** The first `max` characters of a message as one line, cut at a word. */
export function preview(text, max = 160) {
  const flat = String(text ?? '').replace(/\s+/g, ' ').trim();
  if (flat.length <= max) return flat;
  const cut = flat.slice(0, max);
  const space = cut.lastIndexOf(' ');
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,.;:]+$/, '')}…`;
}

/** The stamps a message carries, in reading order. Normal priority has none: it is the default. */
export function stampsFor(m) {
  const stamps = [];
  if (isSpam(m)) stamps.push({ id: 'spam', label: 'Spam', tone: 'bad' });
  if (isUnread(m)) stamps.push({ id: 'unread', label: 'Unread', tone: 'accent' });
  const p = priorityOf(m);
  if (p !== 'normal') stamps.push({ id: `priority-${p}`, label: priorityLabel(p), tone: p === 'urgent' ? 'bad' : p === 'high' ? 'warn' : 'muted' });
  if (m.is_starred) stamps.push({ id: 'starred', label: 'Starred', tone: 'warn' });
  if (m.is_archived) stamps.push({ id: 'archived', label: 'Archived', tone: 'muted' });
  return stamps;
}

/** A plain address for a mailto link, or null when the stored email is not one (never trust a row to build a URL). */
export const replyAddress = (email) => {
  const value = String(email ?? '').trim();
  return /^[^\s@?&#/:<>"]+@[^\s@?&#/:<>"]+\.[^\s@?&#/:<>"]+$/.test(value) ? value : null;
};

/** mailto: link with "Re: <subject>", or null when there is no usable address. */
export function replyHref(m) {
  const to = replyAddress(m?.email);
  if (!to) return null;
  const subject = String(m.subject || '').trim();
  return `mailto:${to}?subject=${encodeURIComponent(subject ? `Re: ${subject}` : 'Re: your message')}`;
}
