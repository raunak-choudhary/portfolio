// src/components/admin/Voyage/managers/achievements.schema.js
//
// Achievements: awards and recognitions. Limits are the classic
// AchievementsManager's (admin data spec, section 8). Choices made against the
// classic manager:
// - An achievement comes either from an issuing organization or from a
//   competition, never both (neither is required): the cross-field rule
//   marks both fields when both are filled.
// - Category and position keep stored values outside their lists (the live
//   rows hold "Appointment Letter" and "Joint Secretary", for example).
// - The certificate goes to achievement-images, which refuses Word files;
//   classic offered .doc and .docx and the upload then failed at the bucket,
//   so only PDF and images are offered.
// - The verification link accepts a bare domain and saves it with https://.
// - Display order is saved as a whole number (classic passed the raw text).
// - The public page shows featured achievements first, then by order number,
//   then the latest date; the deck does the same, and the order is set with
//   the Display order field (a drag could not move a row past the featured).
// - Deleting an achievement removes its certificate from storage, as classic did.

import { ACTIVE_ONLY, MB, asOptions, featuredFirst, joinSet, monthYear, orderThenDate, searchOf, sortWith, statusField } from './sectionKit';
import { slugSegment } from './schemaModel';

export const ACHIEVEMENT_CATEGORIES = Object.freeze(['Professional Recognition', 'Academic Excellence', 'Competition Winner', 'Certification Achievement', 'Leadership Award', 'Innovation Award', 'Performance Award', 'Community Service', 'Research Achievement', 'Technical Excellence', 'Team Achievement', 'Industry Recognition', 'Other']);
export const POSITIONS = Object.freeze(['Winner', 'First Place', '1st Position', 'Runner-up', 'Second Place', '2nd Position', 'Third Place', '3rd Position', 'Finalist', 'Semi-finalist', 'Quarter-finalist', 'Top 5', 'Top 10', 'Top 25', 'Top 50', 'Top 100', 'Gold Medal', 'Silver Medal', 'Bronze Medal', 'Excellence Award', 'Merit Award', 'Honor Roll', 'Star Performer', 'Outstanding Performance', 'Best Performer', 'Top Performer', 'Distinguished Achievement', 'Special Recognition']);

export const achievementCertificateUpload = Object.freeze({
  bucket: 'achievement-images',
  accept: ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png', 'image/webp'],
  typesLabel: 'a PDF, JPEG, PNG or WebP file',
  maxBytes: 10 * MB,
  maxCount: 1,
  removeReplaced: true,
  path: ({ form, stamp, ext }) => `certificates/${slugSegment(form.title, 'achievement')}-certificate-${stamp}.${ext}`,
});

const EITHER_OR = 'Give an issuing organization or a competition name, not both.';

export const achievementsSchema = Object.freeze({
  table: 'achievements',
  singular: 'achievement',
  plural: 'achievements',
  titleKey: 'title',
  sort: sortWith(featuredFirst(orderThenDate('date_achieved'))),
  visibility: ACTIVE_ONLY,
  cleanup: [{ key: 'certificate_url', bucket: 'achievement-images' }],
  rules: (form) => (String(form.issuing_organization ?? '').trim() && String(form.competition_name ?? '').trim()
    ? { issuing_organization: EITHER_OR, competition_name: EITHER_OR }
    : {}),
  fields: [
    { key: 'title', label: 'Achievement title', kind: 'text', required: true, min: 3, max: 200 },
    { key: 'category', label: 'Category', kind: 'select', options: asOptions(ACHIEVEMENT_CATEGORIES), allowEmpty: true, emptyLabel: 'Select a category', tolerateUnknown: true, max: 100 },
    { key: 'date_achieved', label: 'Date achieved', kind: 'date', max: 'today' },
    { key: 'achievement_number', label: 'Achievement number', kind: 'number', integer: true, min: 1, help: 'Your own numbering.' },
    { key: 'issuing_organization', label: 'Issuing organization', kind: 'text', max: 200, help: 'Or a competition name below, not both.' },
    { key: 'competition_name', label: 'Competition name', kind: 'text', max: 200 },
    { key: 'position', label: 'Position or rank', kind: 'select', options: asOptions(POSITIONS), allowEmpty: true, emptyLabel: 'Select a position', tolerateUnknown: true, max: 100 },
    { key: 'participants_count', label: 'Participants', kind: 'number', integer: true, min: 0 },
    { key: 'description', label: 'Description', kind: 'textarea', max: 1000, rows: 4 },
    { key: 'impact', label: 'Impact', kind: 'textarea', max: 1000, rows: 4 },
    { key: 'certificate_url', label: 'Certificate', kind: 'file', upload: achievementCertificateUpload, help: 'PDF, JPEG, PNG or WebP, up to 10 MB.' },
    { key: 'verification_url', label: 'Verification link', kind: 'url', loose: true, max: 500, placeholder: 'https://', help: 'A bare domain gets https:// added.' },
    { key: 'is_featured', label: 'Featured', kind: 'toggle', default: false, help: 'Featured achievements come first on the public page.' },
    { key: 'order_index', label: 'Display order', kind: 'number', integer: true, min: 1, help: 'Lower comes first, after featured ones.' },
    statusField(),
  ],
  groups: [
    { label: 'The achievement', keys: ['title', 'category', 'date_achieved', 'achievement_number'] },
    { label: 'Awarded by', keys: ['issuing_organization', 'competition_name', 'position', 'participants_count'] },
    { label: 'Story and proof', keys: ['description', 'impact', 'certificate_url', 'verification_url'] },
    { label: 'Placement', keys: ['is_featured', 'order_index', 'status'] },
  ],
  card: (row) => ({
    title: row.title || 'Untitled achievement',
    subtitle: joinSet(row.issuing_organization || row.competition_name, monthYear(row.date_achieved)),
    chips: [row.category, row.position].filter(Boolean),
    image: null,
    flags: [row.is_featured ? 'featured' : null].filter(Boolean),
  }),
  searchText: (row) => searchOf(row.title, row.category, row.issuing_organization, row.competition_name, row.position),
});
