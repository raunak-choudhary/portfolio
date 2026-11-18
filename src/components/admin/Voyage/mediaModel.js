// src/components/admin/Voyage/mediaModel.js
//
// The media chapter's rules, kept pure: which stored files a filter shows,
// in what order, how many there are of each kind, and how a file without a
// picture is labelled. The chapter is read-only by design. "Unknown" only
// means no record this check reads points at the file; a file can still be
// used from somewhere the check does not look, so nothing here deletes.

export const PAGE_SIZE = 24;

export const STATUS_FILTERS = Object.freeze([
  { id: 'all', label: 'All' },
  { id: 'referenced', label: 'Referenced' },
  { id: 'unknown', label: 'Unknown' },
]);

// Supabase writes this zero-byte marker to keep an empty folder alive; it is
// not a file anyone uploaded, so the library never shows it
const PLACEHOLDER = '.emptyFolderPlaceholder';

/** The snapshot's items without storage's own folder markers. */
export const cleanItems = (items = []) => items.filter((item) => item && item.name !== PLACEHOLDER);

const stamp = (item) => { const t = Date.parse(item.updatedAt); return Number.isFinite(t) ? t : 0; };

/**
 * Files for the current filters, newest first (by name when two share a
 * time, so the order is stable between loads).
 */
export function visibleItems(items, { bucket = 'all', status = 'all', query = '' } = {}) {
  const q = query.trim().toLowerCase();
  return items
    .filter((item) => (bucket === 'all' || item.bucketId === bucket)
      && (status === 'all' || item.status === status)
      && (!q || `${item.name} ${item.path} ${item.bucketLabel}`.toLowerCase().includes(q)))
    .sort((a, b) => stamp(b) - stamp(a) || String(a.name).localeCompare(String(b.name)));
}

/** Totals for the summary line. */
export function summarize(items) {
  return {
    total: items.length,
    referenced: items.filter((i) => i.status === 'referenced').length,
    unknown: items.filter((i) => i.status !== 'referenced').length,
    private: items.filter((i) => i.isPrivate).length,
    bytes: items.reduce((sum, i) => sum + (Number(i.size) || 0), 0),
  };
}

/** Files per bucket id, for the bucket picker. */
export const bucketCounts = (items) => items.reduce((acc, i) => ({ ...acc, [i.bucketId]: (acc[i.bucketId] || 0) + 1 }), {});

/** "1.2 MB" for the summary. */
export function bytesLabel(bytes) {
  const n = Number(bytes) || 0;
  if (n < 1024) return `${n} B`;
  if (n < 1048576) return `${Math.round(n / 102.4) / 10} KB`;
  if (n < 1073741824) return `${Math.round(n / 104857.6) / 10} MB`;
  return `${Math.round(n / 107374182.4) / 10} GB`;
}

/** The short mark a file without a picture shows instead: its extension, or its kind. */
export function fileMark(item) {
  const ext = String(item?.name || '').includes('.') ? String(item.name).split('.').pop() : '';
  if (ext && ext.length <= 5) return ext.toUpperCase();
  return { image: 'IMG', pdf: 'PDF', document: 'DOC' }[item?.kind] || 'FILE';
}

/** "Referenced" or "Unknown", with the tone the stamp takes. */
export const statusStamp = (item) => (item.status === 'referenced' ? { label: 'Referenced', tone: 'good' } : { label: 'Unknown', tone: 'muted' });

/** A thumbnail is worth loading only for an image with a link. */
export const hasThumbnail = (item) => item.kind === 'image' && Boolean(item.previewUrl);
