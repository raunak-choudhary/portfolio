// src/components/admin/Voyage/managers/schemaModel.js
//
// The shape every manager shares. A manager is a schema: the table it edits,
// how a row becomes a card in the deck, and a list of fields with a kind and
// limits. The deck and the sheet are written once against this shape; a new
// manager is a new schema file, not a new form. Everything here is pure and
// tested: building a form from a row, validating it, normalising it back
// into a row, and telling whether anything changed.
//
// Field kinds: text, textarea, number, toggle, select, url, urls (a list of
// links), tags (a list of short strings), images (a list of uploaded URLs).

export const FIELD_KINDS = Object.freeze(['text', 'textarea', 'number', 'toggle', 'select', 'url', 'urls', 'tags', 'images']);
const LIST_KINDS = new Set(['urls', 'tags', 'images']);
const HTTP_URL = /^https?:\/\/\S+$/i;

export const isListKind = (kind) => LIST_KINDS.has(kind);

/** The empty value a field starts with. */
export function emptyValue(field) {
  if (isListKind(field.kind)) return [];
  if (field.kind === 'toggle') return Boolean(field.default);
  if (field.kind === 'number') return field.default ?? '';
  if (field.kind === 'select') return field.default ?? field.options?.[0]?.value ?? '';
  return field.default ?? '';
}

/** Form values for a row (or for a new record when row is null): one key per field, never undefined. */
export function buildForm(schema, row) {
  const form = {};
  for (const field of schema.fields) {
    const raw = row ? row[field.key] : undefined;
    if (raw === undefined || raw === null) { form[field.key] = emptyValue(field); continue; }
    if (isListKind(field.kind)) form[field.key] = Array.isArray(raw) ? raw.map(String) : [];
    else if (field.kind === 'toggle') form[field.key] = Boolean(raw);
    else if (field.kind === 'number') form[field.key] = Number.isFinite(Number(raw)) ? Number(raw) : '';
    else form[field.key] = String(raw);
  }
  return form;
}

/**
 * Field errors for a form, keyed by field; an empty object means it can be saved.
 * Messages are fixed sentences in the dashboard voice (no server text).
 */
export function validateForm(schema, form) {
  const errors = {};
  for (const field of schema.fields) {
    const value = form[field.key];
    const label = field.label;
    if (field.kind === 'text' || field.kind === 'textarea' || field.kind === 'url') {
      const text = String(value ?? '').trim();
      if (field.required && !text) { errors[field.key] = `${label} is required.`; continue; }
      if (text && field.min && text.length < field.min) { errors[field.key] = `${label} needs at least ${field.min} characters.`; continue; }
      if (field.max && text.length > field.max) { errors[field.key] = `${label} is over ${field.max} characters.`; continue; }
      if (field.kind === 'url' && text && !HTTP_URL.test(text)) { errors[field.key] = `${label} must start with https://.`; }
    } else if (field.kind === 'number') {
      if (value === '' || value === null || value === undefined) { if (field.required) errors[field.key] = `${label} is required.`; continue; }
      const n = Number(value);
      if (!Number.isFinite(n)) { errors[field.key] = `${label} must be a number.`; continue; }
      if (field.integer && !Number.isInteger(n)) { errors[field.key] = `${label} must be a whole number.`; continue; }
      if (field.min !== undefined && n < field.min) { errors[field.key] = `${label} must be at least ${field.min}.`; continue; }
      if (field.max !== undefined && n > field.max) { errors[field.key] = `${label} must be at most ${field.max}.`; }
    } else if (field.kind === 'select') {
      if (!(field.options || []).some((o) => o.value === value)) errors[field.key] = `${label} has an unknown value.`;
    } else if (isListKind(field.kind)) {
      const list = Array.isArray(value) ? value : [];
      if (field.required && list.length === 0) { errors[field.key] = `${label} needs at least one entry.`; continue; }
      if (field.max && list.length > field.max) { errors[field.key] = `${label} allows at most ${field.max} entries.`; continue; }
      if (field.kind === 'urls' && list.some((u) => !HTTP_URL.test(String(u).trim()))) { errors[field.key] = `Every ${label.toLowerCase()} entry must start with https://.`; continue; }
      if (field.itemMax && list.some((t) => String(t).trim().length > field.itemMax)) { errors[field.key] = `Each ${label.toLowerCase()} entry is at most ${field.itemMax} characters.`; }
    }
  }
  return errors;
}

/** The row payload for a form: trimmed text, null for empty optional text, numbers as numbers, lists of clean strings. */
export function normalizeForm(schema, form) {
  const row = {};
  for (const field of schema.fields) {
    const value = form[field.key];
    if (field.kind === 'text' || field.kind === 'textarea' || field.kind === 'url') {
      const text = String(value ?? '').trim();
      row[field.key] = text || (field.required ? '' : null);
    } else if (field.kind === 'number') {
      row[field.key] = value === '' || value === null || value === undefined ? null : Number(value);
    } else if (field.kind === 'toggle') {
      row[field.key] = Boolean(value);
    } else if (field.kind === 'select') {
      row[field.key] = value;
    } else if (isListKind(field.kind)) {
      row[field.key] = (Array.isArray(value) ? value : []).map((v) => String(v).trim()).filter(Boolean);
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

/** The fields of a group, in schema order; fields in no group fall into the first group. */
export function fieldsForGroup(schema, group, index) {
  const claimed = new Set((schema.groups || []).flatMap((g) => g.keys));
  return schema.fields.filter((f) => group.keys.includes(f.key) || (index === 0 && !claimed.has(f.key)));
}
