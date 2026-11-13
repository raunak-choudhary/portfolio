// src/components/admin/Voyage/managers/projects.schema.js
//
// The Projects manager as a schema: the richest form in the admin (images,
// links, awards, order, featured), so it sets the pattern for the eleven
// managers that follow. Limits match the classic manager so nothing that
// saved before stops saving now.

import { toHttpsUrl } from '../../../sections/Projects/projectFormat';

export const projectsSchema = Object.freeze({
  table: 'projects',
  singular: 'project',
  plural: 'projects',
  /** Deck order: newest build first (a higher order_index is a later project); a drag rewrites the whole column. */
  orderKey: 'order_index',
  images: { bucket: 'project-images', folder: 'projects', max: 10 },
  fields: [
    { key: 'title', label: 'Title', kind: 'text', required: true, min: 5, max: 100, help: 'Resume style, no parentheses.' },
    { key: 'short_description', label: 'Short description', kind: 'textarea', max: 300, rows: 3, help: 'The front of the public card.' },
    { key: 'detailed_description', label: 'Overview', kind: 'textarea', max: 2000, rows: 7, help: 'The back of the card: what it is and why it matters.' },
    { key: 'project_type', label: 'Type', kind: 'text', max: 50, help: 'Web app, Research, Hackathon…' },
    { key: 'duration', label: 'Duration', kind: 'text', max: 50, help: 'Oct to Nov 2026' },
    { key: 'team_size', label: 'Team size', kind: 'number', min: 1, max: 100, integer: true, default: 1, help: '1 shows as Solo.' },
    { key: 'featured', label: 'Starred on the public page', kind: 'toggle' },
    { key: 'awards', label: 'Award', kind: 'text', max: 200, help: 'Shown only when set.' },
    { key: 'technologies', label: 'Technologies', kind: 'tags', max: 20, itemMax: 40 },
    { key: 'key_features', label: 'Key features', kind: 'tags', max: 10, itemMax: 160, help: 'Three to five, more for strong projects.' },
    { key: 'github_urls', label: 'Repository links', kind: 'urls', max: 5 },
    { key: 'live_url', label: 'Live link', kind: 'url', max: 300 },
    { key: 'image_urls', label: 'Images', kind: 'images', max: 10 },
    { key: 'status', label: 'Visibility', kind: 'select', options: [{ value: 'active', label: 'Public' }, { value: 'inactive', label: 'Hidden' }], default: 'active' },
    { key: 'challenges', label: 'Challenges', kind: 'textarea', max: 1000, rows: 4 },
    { key: 'learnings', label: 'Learnings', kind: 'textarea', max: 1000, rows: 4 },
  ],
  groups: [
    { label: 'The card', keys: ['title', 'short_description', 'detailed_description', 'project_type', 'duration', 'team_size', 'featured', 'awards'] },
    { label: 'Stack and features', keys: ['technologies', 'key_features'] },
    { label: 'Links and images', keys: ['github_urls', 'live_url', 'image_urls'] },
    { label: 'More', keys: ['status', 'challenges', 'learnings'] },
  ],
  /** What the deck shows for a row. */
  card: (row) => ({
    title: row.title || 'Untitled project',
    subtitle: [row.project_type, row.duration].filter(Boolean).join(' · '),
    chips: (Array.isArray(row.technologies) ? row.technologies : []).slice(0, 3),
    image: Array.isArray(row.image_urls) && row.image_urls.length ? row.image_urls[0] : null,
    flags: [row.featured ? 'starred' : null, row.awards ? 'award' : null, row.status === 'inactive' ? 'hidden' : null].filter(Boolean),
  }),
  /** Text the deck's search box matches against. */
  searchText: (row) => [row.title, row.short_description, row.project_type, ...(row.technologies || [])].filter(Boolean).join(' ').toLowerCase(),
  /** Public link helper reused for the card's link chip. */
  linkFor: (row) => (row.live_url ? toHttpsUrl(row.live_url) : null),
});

/** Order newest first for the deck: higher order_index first, then newer created_at. */
export function deckOrder(rows) {
  return [...rows].sort((a, b) => {
    const ao = Number.isFinite(a.order_index) ? a.order_index : -Infinity, bo = Number.isFinite(b.order_index) ? b.order_index : -Infinity;
    if (ao !== bo) return bo - ao;
    return String(b.created_at || '').localeCompare(String(a.created_at || ''));
  });
}

/** The order_index a new record takes: after the latest. */
export const nextOrderIndex = (rows) => rows.reduce((m, r) => (Number.isFinite(r.order_index) && r.order_index > m ? r.order_index : m), 0) + 1;

/** order_index values for a deck order (newest first): the first card gets the highest. */
export const orderWrites = (orderedIds) => orderedIds.map((id, i) => ({ id, order_index: orderedIds.length - i }));
