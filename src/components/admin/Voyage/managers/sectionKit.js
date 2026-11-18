// src/components/admin/Voyage/managers/sectionKit.js
//
// Pieces the list sections (education to recommendations) share, so each
// schema file only states what is particular to its table: the status field
// every list table carries, upload rules sized to the real buckets, the deck
// orders that mirror what visitors see, and the short date text cards use.
// Pure and tested in sectionSchemas.test.js.

import { slugSegment, todayIso } from './schemaModel';

export const MB = 1024 * 1024;

/** Select options whose stored value is also the label. */
export const asOptions = (values) => values.map((v) => ({ value: v, label: v }));

/** The publish state every list table uses; only active rows are public. */
export const statusField = () => ({
  key: 'status', label: 'Status', kind: 'select', default: 'active',
  options: [{ value: 'active', label: 'Active' }, { value: 'draft', label: 'Draft' }, { value: 'archived', label: 'Archived' }],
  help: 'Only active entries are shown to visitors.',
});

export const ACTIVE_ONLY = Object.freeze([{ key: 'status', publicValues: ['active'] }]);

const IMAGE_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];

/**
 * A logo in organization-logos. The bucket refuses anything over 2 MiB, so
 * the client limit is 2 MiB too: the classic managers allowed 5 MB, and a
 * 2 to 5 MB logo passed their check and then failed at the bucket.
 * `name(form)` picks the text the file is named after.
 */
export const logoUpload = (folder, name) => Object.freeze({
  bucket: 'organization-logos',
  accept: IMAGE_TYPES,
  typesLabel: 'a JPEG, PNG or WebP image',
  maxBytes: 2 * MB,
  maxCount: 1,
  // a replaced or removed logo leaves storage once the row stops pointing at it
  // (the classic form only cleared the URL and left the file behind)
  removeReplaced: true,
  path: ({ form, stamp, ext }) => `${folder}/${slugSegment(name(form), 'organization')}-logo-${stamp}.${ext}`,
});

/** One JPEG, PNG or WebP image (5 MB unless the bucket needs less) into `bucket` at the schema's own `path`. */
export const imageUpload = ({ bucket, maxBytes = 5 * MB, path }) => Object.freeze({
  bucket, accept: IMAGE_TYPES, typesLabel: 'a JPEG, PNG or WebP image', maxBytes, maxCount: 1, removeReplaced: true, path,
});

const finite = (v) => typeof v === 'number' && Number.isFinite(v);
const byText = (a, b) => String(b || '').localeCompare(String(a || ''));

/**
 * Compares rows the way the public queries order them: the order number
 * ascending with unset ones last (Postgres puts NULL last in ascending order),
 * then `dateKey` newest first, then the newest created.
 */
export const orderThenDate = (dateKey) => (a, b) => {
  const ao = finite(a.order_index) ? a.order_index : Infinity, bo = finite(b.order_index) ? b.order_index : Infinity;
  if (ao !== bo) return ao - bo;
  return byText(a[dateKey], b[dateKey]) || byText(a.created_at, b.created_at);
};

/** Featured rows first (the public pages sort them to the front), then `then`. */
export const featuredFirst = (then) => (a, b) => (Boolean(a.is_featured) !== Boolean(b.is_featured) ? (a.is_featured ? -1 : 1) : then(a, b));

/** Newest first by one date column, then newest created. */
export const newestBy = (dateKey) => (a, b) => byText(a[dateKey], b[dateKey]) || byText(a.created_at, b.created_at);

/** A sort for schema.sort from a comparator. */
export const sortWith = (compare) => (rows) => [...rows].sort(compare);

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "2021-08-05" as "Aug 2021"; anything else as empty. */
export const monthYear = (iso) => {
  const m = /^(\d{4})-(\d{2})/.exec(String(iso ?? ''));
  return m && +m[2] >= 1 && +m[2] <= 12 ? `${MONTHS[+m[2] - 1]} ${m[1]}` : '';
};

/** A card's date range: "Aug 2021 to Jul 2024", "Aug 2021 to now" while current, or the one end that is known. */
export function dateRange(start, end, current = false) {
  const from = monthYear(start), to = current ? 'now' : monthYear(end);
  if (from && to) return from === to ? from : `${from} to ${to}`;
  return from ? (current ? `Since ${from}` : from) : to && !current ? `Until ${to}` : '';
}

/** True when an ISO date lies before today (in the browser's calendar). */
export const isPast = (iso, today = todayIso()) => /^\d{4}-\d{2}-\d{2}$/.test(String(iso ?? '').slice(0, 10)) && String(iso).slice(0, 10) < today;

/** Joins the parts that are set with a middle dot. */
export const joinSet = (...parts) => parts.filter((p) => p !== null && p !== undefined && String(p).trim()).join(' · ');

/** The first `n` entries of a list column, safely. */
export const firstOf = (list, n = 3) => (Array.isArray(list) ? list.filter(Boolean).slice(0, n) : []);

/** Lower-case search text from the values that are set. */
export const searchOf = (...parts) => parts.flat().filter(Boolean).join(' ').toLowerCase();
