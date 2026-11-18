// src/components/admin/Voyage/managers/recommendations.schema.js
//
// Recommendations: what others say. Limits are the classic
// RecommendationsManager's (admin data spec, section 10). Choices made:
// - Visitors see a recommendation only while its status is active AND it is
//   marked public; the card shows it as hidden when either fails.
// - word_count is derived from the text on every save, as classic did, so
//   the column never drifts from the words it counts.
// - The LinkedIn link must be a profile address (linkedin.com/in/<name>);
//   a bare one gets https:// added.
// - Rating is a 1 to 5 star control; Display order is saved as a whole number.
// - The public page shows featured recommendations first, then the newest
//   added; it ignores the order number, so the deck does the same and there
//   is no drag (the number is still editable for a later public page).
// - The photo keeps the classic path in profile-images (profile-images/...)
//   so existing and new files sit together; deleting a recommendation
//   removes the photo, as classic did.

import { ACTIVE_ONLY, featuredFirst, imageUpload, joinSet, newestBy, searchOf, sortWith, statusField } from './sectionKit';
import { slugSegment } from './schemaModel';

export const LINKEDIN_PROFILE = /^https?:\/\/(www\.)?linkedin\.com\/in\/[a-zA-Z0-9-]+\/?$/i;

/** Words in the text, the way the classic manager counted them. */
export const countWords = (text) => String(text ?? '').trim().split(/\s+/).filter(Boolean).length;

export const recommenderPhotoUpload = imageUpload({
  bucket: 'profile-images',
  path: ({ form, stamp, ext }) => `profile-images/${slugSegment(form.recommender_name, 'recommender')}-profile-${stamp}.${ext}`,
});

export const recommendationsSchema = Object.freeze({
  table: 'recommendations',
  singular: 'recommendation',
  plural: 'recommendations',
  titleKey: 'recommender_name',
  sort: sortWith(featuredFirst(newestBy('created_at'))),
  visibility: [...ACTIVE_ONLY, { key: 'is_public', publicValues: [true] }],
  cleanup: [{ key: 'profile_image_url', bucket: 'profile-images' }],
  fields: [
    { key: 'recommender_name', label: 'Recommender name', kind: 'text', required: true, min: 2, max: 200 },
    { key: 'recommender_title', label: 'Recommender title', kind: 'text', max: 200 },
    { key: 'organization', label: 'Organization', kind: 'text', max: 200 },
    { key: 'relationship', label: 'Relationship', kind: 'text', max: 100, placeholder: 'e.g. Direct manager' },
    { key: 'recommendation_type', label: 'Type', kind: 'text', max: 50, placeholder: 'e.g. LinkedIn or Written letter' },
    { key: 'date_received', label: 'Date received', kind: 'date', max: 'today' },
    { key: 'recommendation_number', label: 'Recommendation number', kind: 'number', integer: true, min: 1, help: 'Your own numbering.' },
    { key: 'content', label: 'Recommendation', kind: 'textarea', required: true, max: 8000, rows: 10 },
    { key: 'word_count', label: 'Word count', kind: 'derived', compute: (form) => countWords(form.content), help: 'Counted from the text when you save.' },
    { key: 'rating', label: 'Rating', kind: 'rating', max: 5 },
    { key: 'linkedin_profile_url', label: 'LinkedIn profile', kind: 'url', loose: true, max: 500, pattern: LINKEDIN_PROFILE, patternMessage: 'LinkedIn profile must look like https://linkedin.com/in/name.', placeholder: 'https://linkedin.com/in/name' },
    { key: 'profile_image_url', label: 'Photo', kind: 'image', upload: recommenderPhotoUpload, help: 'JPEG, PNG or WebP, up to 5 MB.' },
    { key: 'is_public', label: 'Show on the public page', kind: 'toggle', default: true, help: 'Hidden while off, even when active.' },
    { key: 'is_featured', label: 'Featured', kind: 'toggle', default: false, help: 'Featured recommendations come first on the public page.' },
    { key: 'order_index', label: 'Display order', kind: 'number', integer: true, min: 1, help: 'Not used by the current public page, which shows featured first, then newest.' },
    statusField(),
  ],
  groups: [
    { label: 'The recommender', keys: ['recommender_name', 'recommender_title', 'organization', 'relationship', 'linkedin_profile_url', 'profile_image_url'] },
    { label: 'The recommendation', keys: ['content', 'word_count', 'recommendation_type', 'date_received', 'rating', 'recommendation_number'] },
    { label: 'Visibility and placement', keys: ['is_public', 'is_featured', 'order_index', 'status'] },
  ],
  card: (row) => ({
    title: row.recommender_name || 'Unnamed recommender',
    subtitle: joinSet(row.recommender_title, row.organization),
    chips: [row.relationship, Number.isFinite(row.rating) ? `${row.rating}/5` : null].filter(Boolean),
    image: row.profile_image_url || null,
    flags: [row.is_featured ? 'featured' : null].filter(Boolean),
  }),
  searchText: (row) => searchOf(row.recommender_name, row.recommender_title, row.organization, row.relationship, row.content),
});
