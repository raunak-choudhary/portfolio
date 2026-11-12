// src/components/admin/Voyage/bentoModel.js
//
// Pure helpers for mission control: the tile list, a remembered order, and
// the health facts the tiles show. No React, no storage, tested in full.

export const TILE_IDS = Object.freeze(['health', 'visitors', 'inbox', 'fixes', 'sections', 'edits', 'pages', 'tonight']);
export const BENTO_ORDER_KEY = 'rc-admin-bento-order';

/** A stored order is used only if it names every tile exactly once; otherwise the default. */
export function sanitizeOrder(raw) {
  if (!Array.isArray(raw)) return [...TILE_IDS];
  const seen = new Set();
  const order = raw.filter((id) => TILE_IDS.includes(id) && !seen.has(id) && seen.add(id));
  return order.length === TILE_IDS.length ? order : [...TILE_IDS];
}

/** Moves the tile at `from` to `to`. */
export function moveTile(order, from, to) {
  if (from === to || from < 0 || to < 0 || from >= order.length || to >= order.length) return order;
  const next = [...order]; const [item] = next.splice(from, 1); next.splice(to, 0, item); return next;
}

/** Severity rank for sorting issues: critical first. */
const RANK = { critical: 0, warning: 1, info: 2 };

/**
 * The top issues across all sections, critical first, with the section name attached.
 * @param {Array<{name: string, issues?: Array<{severity: string, message: string}>}>} sections
 */
export function topIssues(sections, limit = 4) {
  return (sections || [])
    .flatMap((s) => (s.issues || []).map((issue) => ({ ...issue, section: s.name })))
    .sort((a, b) => (RANK[a.severity] ?? 3) - (RANK[b.severity] ?? 3))
    .slice(0, limit);
}

/** Sections sorted by completeness, weakest first, for the bars tile. */
export const weakestSections = (sections, limit = 5) => [...(sections || [])].sort((a, b) => (a.completeness || 0) - (b.completeness || 0)).slice(0, limit);

/** Strong = completeness 80 or more and no critical issue. */
export function sectionTallies(sections) {
  const list = sections || [];
  const strong = list.filter((s) => (s.completeness || 0) >= 80 && !(s.issues || []).some((i) => i.severity === 'critical')).length;
  return { strong, attention: list.length - strong, total: list.length };
}

/** Percentage change between two counts, rounded; null when there is no previous value. */
export const percentChange = (now, before) => (before > 0 ? Math.round(((now - before) / before) * 100) : null);
