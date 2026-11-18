// src/components/admin/Voyage/managers/schemaModel.js
//
// The shape every manager shares. A manager is a schema: the table it edits,
// how a row becomes a card in the deck, and a list of fields with a kind and
// limits. The deck and the record dialog are written once against this shape; a new
// manager is a new schema file, not a new form. Everything here is pure and
// tested: building a form from a row, validating it, normalising it back
// into a row, telling whether anything changed, ordering and grouping rows,
// and naming the stored files a row owns. The full contract for a schema
// file is in ./README.md.
//
// Field kinds (each has an empty value, validation with fixed sentences,
// normalisation, a form control in Field.js and a read rendering in
// RecordView.js):
//   text, textarea      plain text with optional min and max length
//   numeric             a number kept as text ("3.50" stays "3.50")
//   number, rating      numbers; rating is a whole number from 1 to max (default 5)
//   toggle              true or false; `clears` empties other fields when switched on
//   select              one of `options`; `allowEmpty` adds a blank choice,
//                       `tolerateUnknown` keeps stored values the list does not know
//   url                 a web address; `loose` accepts bare domains and adds https://,
//                       `pattern` + `patternMessage` restrict the host or path
//   link                a web address, a site path (/x) or an anchor (#x)
//   date                YYYY-MM-DD; `max: 'today'`, `disabledWhen` (a toggle key)
//   urls, tags          lists of strings; tags take `suggestions` and `editable`
//   images              the projects image gallery (schema.images)
//   image, file         one uploaded file URL (field.upload)
//   files               uploaded file URLs; `allowText` also keeps typed entries
//   pairs               an ordered list of {key, value} rows (stored with order_index)
//   derived             read only, computed from the form by `compute(form)` on save

export const FIELD_KINDS = Object.freeze(['text', 'textarea', 'numeric', 'number', 'rating', 'toggle', 'select', 'url', 'link', 'date', 'urls', 'tags', 'images', 'image', 'file', 'files', 'pairs', 'derived']);
const LIST_KINDS = new Set(['urls', 'tags', 'images', 'files']);
const TEXT_KINDS = new Set(['text', 'textarea', 'url', 'link', 'numeric']);
/** Kinds whose values are uploaded files; they persist at once and need a saved record. */
export const UPLOAD_KINDS = new Set(['images', 'image', 'file', 'files']);
/** Kinds that show a character counter against `max`. */
export const COUNTED_KINDS = new Set(['text', 'textarea', 'url', 'link']);

const HTTP_URL = /^https?:\/\/\S+$/i;
const WEB_ADDRESS = /^https?:\/\/[^\s/?#]+\.[^\s/?#]{2,}(?:[/?#]\S*)?$/i;
const SITE_LINK = /^(https?:\/\/\S+|\/\S*|#\S+)$/i;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DECIMAL = /^-?\d+(\.\d+)?$/;

export const isListKind = (kind) => LIST_KINDS.has(kind);
export const isTextKind = (kind) => TEXT_KINDS.has(kind);
const lower = (label) => label.toLowerCase();

/** Today's date in the browser's own calendar (a UTC date would flip a day early in New York evenings). */
export function todayIso(now = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** True for a real calendar date in YYYY-MM-DD form (rejects 2026-02-30). */
export function isIsoDate(value) {
  const m = ISO_DATE.exec(String(value ?? ''));
  if (!m) return false;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3];
}

/** A bare domain gains https://; anything with a scheme is left alone. */
export const withHttps = (text) => (/^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `https://${text.replace(/^\/+/, '')}`);

/** An uploaded file URL as opposed to a typed entry in a mixed list. */
export const isFileUrl = (value) => HTTP_URL.test(String(value ?? '').trim());

/**
 * Stored key/value rows in any of the shapes the database has held:
 * an array of {key, value, order_index} (sorted by order_index) or a legacy
 * object {key: value} (insertion order). Anything else is empty.
 */
export function toPairs(raw) {
  if (Array.isArray(raw)) {
    return raw
      .map((e, i) => ({ e: e || {}, i }))
      .sort((a, b) => (Number.isFinite(a.e.order_index) ? a.e.order_index : a.i) - (Number.isFinite(b.e.order_index) ? b.e.order_index : b.i))
      .map(({ e }) => ({ key: String(e.key ?? ''), value: String(e.value ?? '') }));
  }
  if (raw && typeof raw === 'object') return Object.entries(raw).map(([key, value]) => ({ key, value: String(value ?? '') }));
  return [];
}

const blankPair = (p) => !String(p.key ?? '').trim() && !String(p.value ?? '').trim();

/** The empty value a field starts with. */
export function emptyValue(field) {
  if (isListKind(field.kind) || field.kind === 'pairs') return [];
  if (field.kind === 'toggle') return Boolean(field.default);
  if (field.kind === 'number' || field.kind === 'rating') return field.default ?? '';
  if (field.kind === 'select') return field.default ?? (field.allowEmpty ? '' : field.options?.[0]?.value ?? '');
  return field.default ?? '';
}

/** Form values for a row (or for a new record when row is null): one key per field, never undefined. */
export function buildForm(schema, row) {
  const form = {};
  for (const field of schema.fields) {
    const raw = row ? row[field.key] : undefined;
    if (field.kind === 'derived') { form[field.key] = ''; continue; }
    if (raw === undefined || raw === null) { form[field.key] = emptyValue(field); continue; }
    if (field.kind === 'pairs') form[field.key] = toPairs(raw);
    else if (isListKind(field.kind)) form[field.key] = Array.isArray(raw) ? raw.map(String) : [];
    else if (field.kind === 'toggle') form[field.key] = Boolean(raw);
    else if (field.kind === 'number' || field.kind === 'rating') form[field.key] = Number.isFinite(Number(raw)) ? Number(raw) : '';
    else if (field.kind === 'date') form[field.key] = String(raw).slice(0, 10);   // a timestamp column still edits as a date
    else form[field.key] = String(raw);
  }
  return form;
}

/**
 * A form after one field changes. A toggle with `clears` empties the fields
 * it names when it switches on (a current job has no end date), so the form
 * never holds a value the save would silently drop.
 */
export function applyChange(schema, form, key, value) {
  const next = { ...form, [key]: value };
  const field = schema.fields.find((f) => f.key === key);
  if (field?.kind === 'toggle' && value && field.clears) {
    for (const k of [].concat(field.clears)) {
      const target = schema.fields.find((f) => f.key === k);
      if (target) next[k] = emptyValue({ ...target, default: undefined });
    }
  }
  return next;
}

/** True when a field is switched off by another field's toggle (a date while "current" is on). */
export const isDisabledBy = (field, form) => Boolean(field.disabledWhen && form?.[field.disabledWhen]);

function validateText(field, value) {
  const label = field.label;
  const text = String(value ?? '').trim();
  if (field.required && !text) return `${label} is required.`;
  if (!text) return null;
  if (field.kind === 'numeric') {
    if (!DECIMAL.test(text)) return `${label} must be a number.`;
    const n = Number(text);
    if (field.min !== undefined && n < field.min) return `${label} must be at least ${field.min}.`;
    if (field.max !== undefined && n > field.max) return `${label} must be at most ${field.max}.`;
    return null;
  }
  if (field.min && text.length < field.min) return `${label} needs at least ${field.min} characters.`;
  if (field.max && text.length > field.max) return `${label} is over ${field.max} characters.`;
  if (field.kind === 'url') {
    if (field.loose) { if (!WEB_ADDRESS.test(withHttps(text))) return `${label} must be a web address, such as https://example.com.`; } else if (!HTTP_URL.test(text)) return `${label} must start with https://.`;
    if (field.pattern && !field.pattern.test(field.loose ? withHttps(text) : text)) return field.patternMessage || `${label} is not in the expected form.`;
  }
  if (field.kind === 'link' && !SITE_LINK.test(text)) return `${label} must be a web address, a path starting with /, or an anchor starting with #.`;
  return null;
}

function validateNumber(field, value) {
  const label = field.label;
  if (value === '' || value === null || value === undefined) return field.required ? `${label} is required.` : null;
  const n = Number(value);
  if (!Number.isFinite(n)) return `${label} must be a number.`;
  if ((field.integer || field.kind === 'rating') && !Number.isInteger(n)) return `${label} must be a whole number.`;
  const min = field.kind === 'rating' ? 1 : field.min;
  const max = field.kind === 'rating' ? field.max || 5 : field.max;
  if (field.kind === 'rating' && (n < min || n > max)) return `${label} must be from ${min} to ${max}.`;
  if (min !== undefined && n < min) return `${label} must be at least ${min}.`;
  if (max !== undefined && n > max) return `${label} must be at most ${max}.`;
  return null;
}

function validateDate(field, value, form) {
  const label = field.label;
  if (isDisabledBy(field, form)) return null;
  const text = String(value ?? '').trim();
  if (!text) return field.required ? `${label} is required.` : null;
  if (!isIsoDate(text)) return `${label} must be a full date.`;
  const max = field.max === 'today' ? todayIso() : field.max;
  const min = field.min === 'today' ? todayIso() : field.min;
  if (max && text > max) return field.max === 'today' ? `${label} cannot be in the future.` : `${label} must be on or before ${max}.`;
  if (min && text < min) return `${label} must be on or after ${min}.`;
  return null;
}

function validateList(field, value) {
  const label = field.label;
  const list = (Array.isArray(value) ? value : []).map((v) => String(v).trim());
  if (field.required && list.filter(Boolean).length === 0) return `${label} needs at least one entry.`;
  if (field.max && list.length > field.max) return `${label} allows at most ${field.max} entries.`;
  if (field.kind === 'urls' && list.some((u) => !HTTP_URL.test(u))) return `Every ${lower(label)} entry must start with https://.`;
  if (field.kind === 'tags' && field.editable && list.some((t) => !t)) return `Every ${lower(label)} entry needs some text; remove the empty one.`;
  if (field.kind === 'tags' && field.editable && new Set(list).size !== list.length) return `${label} lists the same entry twice.`;
  // in a mixed files list only typed entries have a length limit; file URLs are as long as storage makes them
  const counted = field.kind === 'files' ? list.filter((t) => !isFileUrl(t)) : list;
  if (field.itemMax && counted.some((t) => t.length > field.itemMax)) return `Each ${lower(label)} entry is at most ${field.itemMax} characters.`;
  return null;
}

function validatePairs(field, value) {
  const label = field.label;
  const rows = (Array.isArray(value) ? value : []).filter((p) => !blankPair(p));
  if (field.required && !rows.length) return `${label} needs at least one entry.`;
  if (field.max && rows.length > field.max) return `${label} allows at most ${field.max} entries.`;
  if (rows.some((p) => !String(p.key ?? '').trim() || !String(p.value ?? '').trim())) return `Every ${lower(label)} row needs a label and a value.`;
  if (field.keyMax && rows.some((p) => String(p.key).trim().length > field.keyMax)) return `Each ${lower(label)} label is at most ${field.keyMax} characters.`;
  if (field.valueMax && rows.some((p) => String(p.value).trim().length > field.valueMax)) return `Each ${lower(label)} value is at most ${field.valueMax} characters.`;
  const seen = new Set();
  for (const p of rows) {
    const k = String(p.key).trim();
    if (seen.has(k)) return `${label} uses the label "${k}" twice.`;
    seen.add(k);
  }
  return null;
}

function validateSelect(field, value) {
  const label = field.label;
  if (value === '' || value === null || value === undefined) {
    if (field.required) return `${label} is required.`;
    return field.allowEmpty ? null : `${label} has an unknown value.`;
  }
  if ((field.options || []).some((o) => o.value === value)) return null;
  if (!field.tolerateUnknown) return `${label} has an unknown value.`;
  if (field.max && String(value).length > field.max) return `${label} is over ${field.max} characters.`;
  return null;
}

/**
 * Field errors for a form, keyed by field; an empty object means it can be saved.
 * Messages are fixed sentences in the dashboard voice (no server text).
 * After the per-field checks come the schema's date-order rules and its own
 * cross-field `rules(form)`; a field keeps its first error.
 */
export function validateForm(schema, form) {
  const errors = {};
  for (const field of schema.fields) {
    const value = form[field.key];
    let message = null;
    if (isTextKind(field.kind)) message = validateText(field, value);
    else if (field.kind === 'number' || field.kind === 'rating') message = validateNumber(field, value);
    else if (field.kind === 'date') message = validateDate(field, value, form);
    else if (field.kind === 'select') message = validateSelect(field, value);
    else if (field.kind === 'pairs') message = validatePairs(field, value);
    else if (isListKind(field.kind)) message = validateList(field, value);
    else if ((field.kind === 'image' || field.kind === 'file') && field.required && !String(value ?? '').trim()) message = `${field.label} is required.`;
    if (message) errors[field.key] = message;
  }
  for (const rule of schema.dateOrder || []) {
    const start = form[rule.start], end = form[rule.end];
    if (errors[rule.start] || errors[rule.end] || (rule.unless && form[rule.unless])) continue;
    if (!isIsoDate(start) || !isIsoDate(end)) continue;
    const startField = schema.fields.find((f) => f.key === rule.start), endField = schema.fields.find((f) => f.key === rule.end);
    if (rule.strict ? end <= start : end < start) errors[rule.end] = rule.strict ? `${endField.label} must be after the ${lower(startField.label)}.` : `${endField.label} cannot be before the ${lower(startField.label)}.`;
  }
  if (typeof schema.rules === 'function') {
    for (const [key, message] of Object.entries(schema.rules(form) || {})) if (message && !errors[key]) errors[key] = message;
  }
  return errors;
}

/**
 * The row payload for a form: trimmed text, null for empty optional values,
 * numbers as numbers, lists of clean strings, pairs with their order, derived
 * values computed. Columns no field names are never written, so legacy
 * columns (about_content.profile_image_url) and columns the deck owns
 * (order and group priority) stay as they are.
 */
export function normalizeForm(schema, form) {
  const row = {};
  for (const field of schema.fields) {
    const value = form[field.key];
    if (isTextKind(field.kind)) {
      let text = String(value ?? '').trim();
      if (text && field.kind === 'url' && field.loose) text = withHttps(text);
      row[field.key] = text || (field.required ? '' : null);
    } else if (field.kind === 'number' || field.kind === 'rating') {
      row[field.key] = value === '' || value === null || value === undefined ? null : Number(value);
    } else if (field.kind === 'toggle') {
      row[field.key] = Boolean(value);
    } else if (field.kind === 'select') {
      row[field.key] = value === '' || value === undefined ? (field.allowEmpty ? null : value) : value;
    } else if (field.kind === 'date') {
      const text = String(value ?? '').trim();
      row[field.key] = isDisabledBy(field, form) || !text ? null : text;
    } else if (field.kind === 'image' || field.kind === 'file') {
      row[field.key] = String(value ?? '').trim() || null;
    } else if (field.kind === 'pairs') {
      row[field.key] = (Array.isArray(value) ? value : []).filter((p) => !blankPair(p)).map((p, i) => ({ key: String(p.key).trim(), value: String(p.value).trim(), order_index: i }));
    } else if (field.kind === 'derived') {
      row[field.key] = field.compute(form);
    } else if (isListKind(field.kind)) {
      const list = (Array.isArray(value) ? value : []).map((v) => String(v).trim()).filter(Boolean);
      row[field.key] = list.length || !field.nullWhenEmpty ? list : null;
    }
  }
  return row;
}

/** True when the form would write anything different from the row it was built from (or from an empty record). */
export function isDirty(schema, form, row) {
  const before = normalizeForm(schema, buildForm(schema, row));
  const after = normalizeForm(schema, form);
  return JSON.stringify(before) !== JSON.stringify(after);
}

/** Adds one clean entry to a list field, ignoring blanks and duplicates. */
export function addListItem(list, item) {
  const clean = String(item ?? '').trim();
  if (!clean || list.includes(clean)) return list;
  return [...list, clean];
}

/** Moves one entry of a list by delta places (pairs and editable tags); out-of-range moves return the list unchanged. */
export function moveItem(list, index, delta) {
  const to = index + delta;
  if (index < 0 || index >= list.length || to < 0 || to >= list.length) return list;
  const next = [...list];
  const [item] = next.splice(index, 1);
  next.splice(to, 0, item);
  return next;
}

/** The fields of a group, in schema order; fields in no group fall into the first group. */
export function fieldsForGroup(schema, group, index) {
  const claimed = new Set((schema.groups || []).flatMap((g) => g.keys));
  return schema.fields.filter((f) => group.keys.includes(f.key) || (index === 0 && !claimed.has(f.key)));
}

// ---- visibility -----------------------------------------------------------

/**
 * Whether visitors see a row. `schema.visibility` lists every condition the
 * public site applies, e.g. [{ key: 'status', publicValues: ['active'] }] or
 * [{ key: 'is_active', publicValues: [true] }]; all must hold.
 */
export function isPublic(schema, row) {
  return (schema.visibility || []).every((rule) => rule.publicValues.includes(row?.[rule.key] ?? rule.fallback));
}

/** The card's flags plus "hidden" when the visibility rules say visitors cannot see the row. */
export function cardFlags(schema, row, card) {
  const flags = [...(card.flags || [])];
  if (!isPublic(schema, row) && !flags.includes('hidden')) flags.push('hidden');
  return flags;
}

// ---- deck order -----------------------------------------------------------

const finite = (v) => typeof v === 'number' && Number.isFinite(v);

/**
 * Rows in deck order. A schema with its own `sort` decides; otherwise a
 * drag-ordered schema (`orderKey`) sorts by that column in `orderDirection`
 * ('desc' default: higher first) with unordered rows last, newest first.
 */
export function sortRows(schema, rows) {
  if (typeof schema.sort === 'function') return schema.sort([...rows]);
  const key = schema.orderKey;
  const asc = schema.orderDirection === 'asc';
  return [...rows].sort((a, b) => {
    if (key) {
      const ao = finite(a[key]) ? a[key] : null, bo = finite(b[key]) ? b[key] : null;
      if (ao !== bo) {
        if (ao === null) return 1;
        if (bo === null) return -1;
        return asc ? ao - bo : bo - ao;
      }
    }
    return String(b.created_at || '').localeCompare(String(a.created_at || ''));
  });
}

/** The order value a new record takes: after every existing one (top of a 'desc' deck, end of an 'asc' deck). */
export const nextOrderValue = (schema, rows) => rows.reduce((m, r) => (finite(r[schema.orderKey]) && r[schema.orderKey] > m ? r[schema.orderKey] : m), 0) + 1;

/** Order column writes for ids in their new deck order. */
export function orderWritesFor(schema, orderedIds) {
  const asc = schema.orderDirection === 'asc';
  return orderedIds.map((id, i) => ({ id, [schema.orderKey]: asc ? i + 1 : orderedIds.length - i }));
}

/** True when cards can be dragged: only schemas that own an order column and no grouping. */
export const canDrag = (schema) => Boolean(schema.orderKey) && !schema.group && schema.mode !== 'singleton';

// ---- groups ---------------------------------------------------------------

/**
 * Rows split into the schema's groups (`group.key`), in group order
 * (`group.priorityKey`, lower first; a group takes its rows' lowest
 * priority, so one stray value never splits it), then by name. Rows keep
 * their order inside a group.
 * @returns {Array<{value: string|null, label: string, priority: number, rows: object[]}>}
 */
export function groupRows(schema, rows) {
  const { key, priorityKey, emptyLabel = 'Ungrouped', defaultPriority = 999 } = schema.group;
  const byValue = new Map();
  for (const row of rows) {
    const raw = row[key];
    const value = raw === undefined || raw === null || raw === '' ? null : String(raw);
    if (!byValue.has(value)) byValue.set(value, { value, label: value ?? emptyLabel, priority: Infinity, rows: [] });
    const g = byValue.get(value);
    g.rows.push(row);
    const p = priorityKey && finite(row[priorityKey]) ? row[priorityKey] : defaultPriority;
    if (p < g.priority) g.priority = p;
  }
  return [...byValue.values()].sort((a, b) => a.priority - b.priority || a.label.localeCompare(b.label));
}

/**
 * Priority writes after moving one group up or down: every group is
 * renumbered 1..n in the new order (two groups that shared a priority could
 * never be swapped otherwise), and only groups whose priority changes are written.
 * @returns {Array<{value: string|null, priority: number}>}
 */
export function groupMoveWrites(groups, index, delta) {
  const moved = moveItem(groups, index, delta);
  if (moved === groups) return [];
  return moved.map((g, i) => ({ value: g.value, priority: i + 1, before: g.priority })).filter((w) => w.priority !== w.before).map(({ value, priority }) => ({ value, priority }));
}

/** The priority a row should carry for a group value: that group's current one, or the schema default for a new group. */
export function priorityForGroup(schema, rows, value) {
  const groups = groupRows(schema, rows);
  const clean = value === undefined || value === null || value === '' ? null : String(value);
  const found = groups.find((g) => g.value === clean);
  return found && Number.isFinite(found.priority) ? found.priority : schema.group.defaultPriority ?? 999;
}

// ---- singleton --------------------------------------------------------------

/**
 * The one row a singleton manager edits. Never filtered by is_active: a
 * deactivated row must still load, or the next save would insert a second
 * row. Prefers an active row, then the most recently updated.
 */
export function pickSingleton(rows) {
  if (!rows?.length) return null;
  return [...rows].sort((a, b) => Number(Boolean(b.is_active)) - Number(Boolean(a.is_active)) || String(b.updated_at || b.created_at || '').localeCompare(String(a.updated_at || a.created_at || '')))[0];
}

// ---- stored files -----------------------------------------------------------

/**
 * The stored files a row owns, per bucket, from `schema.cleanup`
 * ([{ key, bucket }]). Only public URLs inside that bucket count, so typed
 * text in a mixed list and links to other hosts are never sent to storage.
 * @returns {Array<{bucket: string, urls: string[]}>}
 */
export function cleanupTargets(schema, row) {
  const byBucket = new Map();
  for (const { key, bucket } of schema.cleanup || []) {
    const marker = `/storage/v1/object/public/${bucket}/`;
    const values = [].concat(row?.[key] ?? []).map((v) => String(v)).filter((v) => v.includes(marker));
    if (!values.length) continue;
    byBucket.set(bucket, [...new Set([...(byBucket.get(bucket) || []), ...values])]);
  }
  return [...byBucket.entries()].map(([bucket, urls]) => ({ bucket, urls }));
}

/** A storage path segment: lower case, letters and digits joined by single dashes. */
export const slugSegment = (text, fallback = 'file') => String(text ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || fallback;

/** A file's extension, cleaned for a storage path. */
export const fileExtension = (name) => (String(name ?? '').split('.').length > 1 ? String(name).split('.').pop().toLowerCase().replace(/[^a-z0-9]/g, '') : '') || 'bin';

/** The readable name of a stored file: the last path segment, decoded. */
export function fileNameFromUrl(url) {
  const last = String(url ?? '').split('?')[0].split('/').filter(Boolean).pop() || String(url ?? '');
  try { return decodeURIComponent(last); } catch { return last; }
}
