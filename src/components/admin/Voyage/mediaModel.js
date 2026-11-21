// src/components/admin/Voyage/mediaModel.js
//
// The Files pop-up's rules, kept pure so every decision about deleting is
// tested without a browser or a database.
//
// A stored file is in one of two states, and an entry's link can be a third:
//   in use         some entry points at the file; it cannot be deleted here,
//                  the owner detaches it in that entry first;
//   not connected  no entry points at it; it may be deleted, after one more
//                  check of every section immediately before the deletion;
//   broken link    an entry points at a file that is not in storage.
//
// Two locks keep a deletion honest:
//   - if any section could not be read, a file it uses would look not
//     connected, so nothing can be deleted anywhere until a reload reads
//     every section (`canDelete` is false for every file);
//   - the check made right before a deletion (`planDeletion`) keeps any
//     file that has become used since the list loaded, and refuses to
//     delete anything when that check itself could not read every section.
//
// A link is called broken only when it certainly names a file in one of the
// library's buckets (a storage URL or a bucket-prefixed path) and that
// bucket was listed completely; a bucket that failed to list, or whose walk
// stopped early, never produces a broken link.

/** The free plan's storage allowance, which the summary meter measures against. */
export const QUOTA_BYTES = 1024 * 1024 * 1024;

/** Rows shown per tab before "Show more". */
export const PAGE_SIZE = 40;

export const TABS = Object.freeze([
  { id: 'in-use', label: 'In use' },
  { id: 'not-connected', label: 'Not connected' },
  { id: 'broken', label: 'Broken links' },
]);

export const SORTS = Object.freeze([
  { id: 'newest', label: 'Newest' },
  { id: 'largest', label: 'Largest' },
  { id: 'name', label: 'Name' },
]);

/** Section order for grouping: the voyage's chapter order. */
export const SECTION_ORDER = Object.freeze(['Hero', 'About', 'Projects', 'Internships', 'Education', 'Work experience', 'Skills', 'Certifications', 'Recommendations', 'Achievements', 'Inbox']);

// Supabase writes this zero-byte marker to keep an empty folder alive; it is
// not a file anyone uploaded, so the library never shows it
const PLACEHOLDER = '.emptyFolderPlaceholder';

/** The snapshot's items without storage's own folder markers. */
export const cleanItems = (items = []) => (items || []).filter((item) => item && item.name !== PLACEHOLDER);

const stamp = (item) => { const t = Date.parse(item.updatedAt); return Number.isFinite(t) ? t : 0; };
const sectionRank = (section) => { const i = SECTION_ORDER.indexOf(section); return i === -1 ? SECTION_ORDER.length : i; };

/** "1.2 MB" for sizes and the summary. */
export function bytesLabel(bytes) {
  const n = Number(bytes) || 0;
  if (n < 1024) return `${n} B`;
  if (n < 1048576) return `${Math.round(n / 102.4) / 10} KB`;
  if (n < 1073741824) return `${Math.round(n / 104857.6) / 10} MB`;
  return `${Math.round(n / 107374182.4) / 10} GB`;
}

/** The short mark a file without a picture shows instead: its extension, or its kind. */
export function fileMark(item) {
  const name = String(item?.name || '');
  const ext = name.includes('.') ? name.split('.').pop() : '';
  if (ext && ext.length <= 5) return ext.toUpperCase();
  return { image: 'IMG', pdf: 'PDF', document: 'DOC' }[item?.kind] || 'FILE';
}

/** A thumbnail is worth loading only for an image with a link the page may load. */
export const hasThumbnail = (item) => item?.kind === 'image' && Boolean(safeHttpUrl(item.previewUrl));

/** The URL itself when it is http or https, else null: nothing else is ever rendered as a link or an image source. */
export function safeHttpUrl(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const url = new URL(value.trim());
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
}

/**
 * The entries a reference list names, one per entry (an entry that points
 * at the same file from two fields is named once), in section order.
 */
export function entriesOf(references = []) {
  const seen = new Map();
  references.forEach((ref) => {
    const key = `${ref.table}:${ref.rowId}`;
    if (!seen.has(key)) seen.set(key, { table: ref.table, rowId: ref.rowId, section: ref.section, title: ref.title, fields: [ref.fieldLabel] });
    else if (!seen.get(key).fields.includes(ref.fieldLabel)) seen.get(key).fields.push(ref.fieldLabel);
  });
  return [...seen.values()].sort((a, b) => sectionRank(a.section) - sectionRank(b.section) || String(a.title).localeCompare(String(b.title)));
}

/** Map of file id to the references naming it (any reading of the value). */
export function usersById(references = []) {
  const map = new Map();
  references.forEach((ref) => (ref.keys || []).forEach((key) => {
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(ref);
  }));
  return map;
}

/** "Projects · LoRA Fine-Tuning" for one entry. */
export const entryLabel = (entry) => `${entry.section} · ${entry.title}`;

/** "Projects · X", "Projects · X and 1 more entry", "... and 2 more entries". */
export function usedByText(entries = []) {
  if (!entries.length) return '';
  const first = entryLabel(entries[0]);
  const rest = entries.length - 1;
  if (!rest) return first;
  return `${first} and ${rest} more ${rest === 1 ? 'entry' : 'entries'}`;
}

/**
 * The name stem two copies of one file share: lower case, no extension, no
 * trailing " (1)", "-copy", " copy 2" or "_2", separators folded to "-".
 */
export function nameStem(name) {
  let stem = String(name || '').toLowerCase();
  const dot = stem.lastIndexOf('.');
  if (dot > 0) stem = stem.slice(0, dot);
  let previous;
  do {
    previous = stem;
    stem = stem.replace(/\s*\(\d+\)$/, '').replace(/[\s_-]*copy(?:[\s_-]*\d+)?$/, '').replace(/[\s_-]+\d{1,2}$/, '').trim();
  } while (stem !== previous && stem);
  return stem.replace(/[\s_-]+/g, '-');
}

const extensionOf = (name) => { const s = String(name || '').toLowerCase(); const dot = s.lastIndexOf('.'); return dot > 0 ? s.slice(dot + 1) : ''; };

/**
 * The in-use file a not-connected file is most likely a copy of: exactly the
 * same size (more than zero bytes), the same extension and the same name
 * stem. Only a hint: the file stays selectable.
 */
export function duplicateOf(file, inUseFiles = []) {
  const size = Number(file?.size) || 0;
  if (!size) return null;
  const stem = nameStem(file.name), ext = extensionOf(file.name);
  if (!stem) return null;
  return inUseFiles.find((other) => other.id !== file.id && (Number(other.size) || 0) === size && extensionOf(other.name) === ext && nameStem(other.name) === stem) || null;
}

/**
 * Sorts the snapshot into the three lists.
 *
 * @param {{items?: object[], references?: object[], referenceErrors?: string[], referenceErrorSections?: string[], buckets?: object[]}} snapshot
 * @returns {{files: object[], inUse: object[], notConnected: object[], broken: object[], refsFailed: boolean, failedSections: string[], failedBuckets: object[], listedIds: Set<string>}}
 *   Each file gains `entries` (who uses it), `state` ('in-use' or 'not-connected'),
 *   `canDelete`, and for a not-connected file `duplicate` (the in-use file it may copy).
 */
export function classify(snapshot = {}) {
  const items = cleanItems(snapshot.items);
  const references = Array.isArray(snapshot.references) ? snapshot.references : [];
  const failedTables = Array.isArray(snapshot.referenceErrors) ? snapshot.referenceErrors : [];
  const failedSections = Array.isArray(snapshot.referenceErrorSections) && snapshot.referenceErrorSections.length ? snapshot.referenceErrorSections : failedTables;
  const refsFailed = failedTables.length > 0;
  const byId = usersById(references);

  const files = items.map((item) => {
    const entries = entriesOf(byId.get(item.id) || []);
    const state = entries.length ? 'in-use' : 'not-connected';
    return { ...item, entries, state, canDelete: state === 'not-connected' && !refsFailed };
  });
  const inUse = files.filter((f) => f.state === 'in-use');
  const notConnected = files.filter((f) => f.state === 'not-connected').map((f) => ({ ...f, duplicate: duplicateOf(f, inUse) }));

  const listedIds = new Set(items.map((i) => i.id));
  const bucketList = Array.isArray(snapshot.buckets) ? snapshot.buckets : [];
  const completeBuckets = new Set(bucketList.filter((b) => b.status === 'available' && b.complete !== false).map((b) => b.id));
  const failedBuckets = bucketList.filter((b) => b.status === 'error');
  const seen = new Set();
  const broken = references
    .filter((ref) => ref.explicit && completeBuckets.has(ref.bucketId) && !(ref.keys || []).some((k) => listedIds.has(k)))
    .filter((ref) => { const key = `${ref.table}:${ref.rowId}:${ref.field}:${ref.position}:${ref.bucketId}`; if (seen.has(key)) return false; seen.add(key); return true; })
    .map((ref) => ({ ...ref, id: `${ref.table}:${ref.rowId}:${ref.field}:${ref.position}:${ref.bucketId}`, fullPath: `${ref.bucketId}/${ref.path}` }));

  return { files, inUse, notConnected, broken, refsFailed, failedSections, failedBuckets, listedIds };
}

/** "Company logo points at a missing file", "Images: file 3 of 4 points at a missing file". */
export function brokenText(ref) {
  return ref.count > 1 ? `${ref.fieldLabel}: file ${ref.position} of ${ref.count} points at a missing file` : `${ref.fieldLabel} points at a missing file`;
}

const matches = (q, ...texts) => !q || texts.some((t) => String(t || '').toLowerCase().includes(q));

/** Files for the search (file name, path, entry titles and sections) and the bucket filter. */
export function filterFiles(files = [], { query = '', bucket = 'all' } = {}) {
  const q = query.trim().toLowerCase();
  return files.filter((f) => (bucket === 'all' || f.bucketId === bucket)
    && matches(q, f.name, f.path, ...(f.entries || []).flatMap((e) => [e.title, e.section])));
}

/** Broken links for the search (entry title, section, path, field) and the bucket filter. */
export function filterBroken(broken = [], { query = '', bucket = 'all' } = {}) {
  const q = query.trim().toLowerCase();
  return broken.filter((b) => (bucket === 'all' || b.bucketId === bucket) && matches(q, b.title, b.section, b.path, b.fieldLabel));
}

/** Newest first, largest first, or by name; ties fall back to the name, then the path, so the order is stable. */
export function sortFiles(files = [], sort = 'newest') {
  const byName = (a, b) => String(a.name).localeCompare(String(b.name)) || String(a.path).localeCompare(String(b.path));
  const order = {
    newest: (a, b) => stamp(b) - stamp(a) || byName(a, b),
    largest: (a, b) => (Number(b.size) || 0) - (Number(a.size) || 0) || byName(a, b),
    name: byName,
  }[sort] || ((a, b) => stamp(b) - stamp(a) || byName(a, b));
  return [...files].sort(order);
}

/** In-use files grouped under the section of their first entry, in section order. */
export function groupBySection(files = []) {
  const groups = new Map();
  files.forEach((f) => {
    const section = f.entries?.[0]?.section || 'Other';
    if (!groups.has(section)) groups.set(section, []);
    groups.get(section).push(f);
  });
  return [...groups.entries()].sort((a, b) => sectionRank(a[0]) - sectionRank(b[0])).map(([section, list]) => ({ section, files: list }));
}

/** Broken links grouped by section, in section order, each group by entry title. */
export function groupBroken(broken = []) {
  const groups = new Map();
  broken.forEach((b) => { if (!groups.has(b.section)) groups.set(b.section, []); groups.get(b.section).push(b); });
  return [...groups.entries()].sort((a, b) => sectionRank(a[0]) - sectionRank(b[0]))
    .map(([section, list]) => ({ section, links: [...list].sort((x, y) => String(x.title).localeCompare(String(y.title)) || x.position - y.position) }));
}

/** The header's numbers: every listed file, bytes against the allowance, and what is not connected. */
export function summarize({ files = [], notConnected = [] } = {}) {
  const bytes = files.reduce((sum, f) => sum + (Number(f.size) || 0), 0);
  return {
    count: files.length,
    bytes,
    quotaShare: Math.min(1, bytes / QUOTA_BYTES),
    notConnectedCount: notConnected.length,
    notConnectedBytes: notConnected.reduce((sum, f) => sum + (Number(f.size) || 0), 0),
  };
}

/** Total bytes of a set of files. */
export const totalBytes = (files = []) => files.reduce((sum, f) => sum + (Number(f.size) || 0), 0);

/**
 * The check made immediately before deleting. `fresh` is a new read of every
 * reference (readReferences). When that read missed any section nothing is
 * deleted (`blocked`); otherwise every chosen file that some entry now uses
 * is kept, with the entries that use it, and the rest may go.
 *
 * @param {object[]} chosen the files the owner confirmed.
 * @param {{references: object[], failedTables: string[], failedSections?: string[]}} fresh
 * @returns {{blocked: boolean, failedSections: string[], toDelete: object[], kept: Array<{file: object, entries: object[]}>}}
 */
export function planDeletion(chosen = [], fresh = {}) {
  const failedTables = Array.isArray(fresh?.failedTables) ? fresh.failedTables : ['unknown'];
  if (failedTables.length || !Array.isArray(fresh?.references)) {
    const failedSections = fresh?.failedSections?.length ? fresh.failedSections : failedTables;
    return { blocked: true, failedSections, toDelete: [], kept: chosen.map((file) => ({ file, entries: [] })) };
  }
  const byId = usersById(fresh.references);
  const toDelete = [], kept = [];
  chosen.forEach((file) => {
    const entries = entriesOf(byId.get(file.id) || []);
    if (entries.length) kept.push({ file, entries }); else toDelete.push(file);
  });
  return { blocked: false, failedSections: [], toDelete, kept };
}

/** "14 Oct 2026" on the New York calendar, or '' for a missing or bad date. */
export function dayLabel(iso) {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '';
  return new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'America/New_York' });
}

/** "Skills", "Skills and Certifications", "Hero, Skills and Certifications". */
export function joinNames(names = []) {
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

const countOf = (n, one, many) => `${n} ${n === 1 ? one : many}`;

/**
 * The report after a deletion: a title such as "3 files deleted, 1 kept" and
 * one plain sentence per kept or failed file, naming it.
 *
 * @param {{deleted: object[], kept: Array<{file: object, entries: object[]}>, failed: object[]}} outcome
 */
export function deletionReport({ deleted = [], kept = [], failed = [] } = {}) {
  const parts = [`${countOf(deleted.length, 'file', 'files')} deleted`];
  if (kept.length) parts.push(`${kept.length} kept`);
  if (failed.length) parts.push(`${failed.length} not deleted`);
  const lines = [
    ...kept.map(({ file, entries }) => ({ kind: 'kept', id: file.id, name: file.name, text: `is now used by ${usedByText(entries)}. It was attached after this list loaded, so the last check kept it and moved it to In use.` })),
    ...failed.map((file) => ({ kind: 'failed', id: file?.id, name: file?.name || 'A file', text: 'was not deleted: storage refused it or the connection dropped. It is still in storage.' })),
  ];
  return { title: parts.join(', '), lines, tone: kept.length || failed.length ? 'warn' : 'good' };
}
