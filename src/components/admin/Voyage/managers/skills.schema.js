// src/components/admin/Voyage/managers/skills.schema.js
//
// Skills as a grouped deck: one section per skill type, in the type's
// priority (skill_type_priority, lower first), moved as a whole with Up and
// Down. Inside a group: featured first, then the order number, then the
// name, as the classic list did. Cards are compact because there are over a
// hundred skills and most have no icon.
//
// Choices made against the classic manager (see the admin data spec, section 3):
// - Skill type and learning source keep stored values the option list does
//   not know (tolerateUnknown) and allow an empty choice.
// - `certifications` mixes typed names with URLs of uploaded certificate
//   files, so it is a `files` field with `allowText`: both kinds of entry
//   are kept, files open by name, typed names stay chips.
// - The icon and the certificate files upload only after the first save.
//   The classic manager uploaded for an unsaved skill with the id "temp",
//   which always failed and deleted the file again.
// - Deleting a skill removes its icon and its certificate files from the
//   skill-icons bucket, as the classic manager did.
// - order_index 0 is kept as 0 (classic turned it into null).

import { slugSegment } from './schemaModel';

const STATUS_OPTIONS = [{ value: 'active', label: 'Active' }, { value: 'draft', label: 'Draft' }, { value: 'archived', label: 'Archived' }];
const asOptions = (values) => values.map((v) => ({ value: v, label: v }));

export const SKILL_TYPES = Object.freeze(['Programming Languages', 'Frontend Development', 'Backend Development', 'Database Technologies', 'Cloud Platforms', 'DevOps & Tools', 'Mobile Development', 'Data Science & Analytics', 'Machine Learning & AI', 'Cybersecurity', 'Software Testing', 'Project Management', 'Design & UI/UX', 'Version Control', 'Operating Systems', 'Networking', 'Other']);
export const LEARNING_SOURCES = Object.freeze(['University/College', 'Online Courses', 'Self-learning', 'Bootcamp', 'Work Experience', 'Mentorship', 'Certification Programs', 'Books & Documentation', 'Open Source Contributions', 'Personal Projects', 'YouTube & Tutorials', 'Professional Training']);

const MB = 1024 * 1024;

/** Icon: one image in skill-icons (SVG allowed), replaced and removed files leave storage. */
export const iconUpload = Object.freeze({
  bucket: 'skill-icons',
  accept: ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/svg+xml'],
  typesLabel: 'a JPEG, PNG, WebP or SVG image',
  maxBytes: 5 * MB,
  maxCount: 1,
  removeReplaced: true,
  path: ({ id, form, stamp, ext }) => `icons/skill_${id}/${slugSegment(form.skill_name, 'skill')}-icon-${stamp}.${ext}`,
});

/** Certificates: up to five files per choice, twenty entries in all (typed names count), 10 MB each. */
export const certificateUpload = Object.freeze({
  bucket: 'skill-icons',
  accept: ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  typesLabel: 'a PDF, JPEG, PNG, WebP or Word file',
  maxBytes: 10 * MB,
  maxCount: 20,
  perBatch: 5,
  removeReplaced: true,
  path: ({ id, form, index, stamp, ext }) => `certifications/skill_${id}/${slugSegment(form.skill_name, 'skill')}-cert-${stamp}-${index + 1}.${ext}`,
});

const finite = (v) => typeof v === 'number' && Number.isFinite(v);

/** Inside a group: featured first, then order number (unset last), then name. */
export function skillOrder(rows) {
  return [...rows].sort((a, b) => {
    if (Boolean(a.is_featured) !== Boolean(b.is_featured)) return a.is_featured ? -1 : 1;
    const ao = finite(a.order_index) ? a.order_index : Infinity, bo = finite(b.order_index) ? b.order_index : Infinity;
    if (ao !== bo) return ao - bo;
    return String(a.skill_name || '').localeCompare(String(b.skill_name || ''));
  });
}

export const skillsSchema = Object.freeze({
  table: 'skills',
  singular: 'skill',
  plural: 'skills',
  titleKey: 'skill_name',
  cardStyle: 'compact',
  group: { key: 'skill_type', priorityKey: 'skill_type_priority', emptyLabel: 'No type', defaultPriority: 50 },
  sort: skillOrder,
  visibility: [{ key: 'status', publicValues: ['active'] }],
  cleanup: [{ key: 'icon_url', bucket: 'skill-icons' }, { key: 'certifications', bucket: 'skill-icons' }],
  fields: [
    { key: 'skill_name', label: 'Skill name', kind: 'text', required: true, min: 2, max: 100, placeholder: 'e.g. Python' },
    { key: 'category', label: 'Category', kind: 'text', required: true, min: 2, max: 100, placeholder: 'e.g. Programming languages' },
    { key: 'skill_type', label: 'Skill type', kind: 'select', options: asOptions(SKILL_TYPES), allowEmpty: true, emptyLabel: 'Select a skill type', tolerateUnknown: true, max: 100, help: 'The group it is shown in.' },
    { key: 'proficiency_level', label: 'Proficiency (1 to 10)', kind: 'number', integer: true, min: 1, max: 10 },
    { key: 'learning_source', label: 'Learning source', kind: 'select', options: asOptions(LEARNING_SOURCES), allowEmpty: true, emptyLabel: 'Select a source', tolerateUnknown: true, max: 200 },
    { key: 'description', label: 'Description', kind: 'textarea', max: 1000, rows: 4 },
    { key: 'icon_url', label: 'Icon', kind: 'image', upload: iconUpload, help: 'JPEG, PNG, WebP or SVG, up to 5 MB.' },
    { key: 'certifications', label: 'Certifications', kind: 'files', allowText: true, max: 20, itemMax: 300, upload: certificateUpload, help: 'Type a certificate name or upload the file (PDF, image or Word, up to 10 MB, five at a time).' },
    { key: 'projects_used', label: 'Projects used in', kind: 'tags', max: 30, itemMax: 200 },
    { key: 'is_featured', label: 'Featured', kind: 'toggle', default: false },
    { key: 'order_index', label: 'Order in its group', kind: 'number', integer: true, min: 0, help: 'Lower comes first, after featured skills.' },
    { key: 'status', label: 'Status', kind: 'select', options: STATUS_OPTIONS, default: 'active', help: 'Only active skills are public.' },
  ],
  groups: [
    { label: 'The skill', keys: ['skill_name', 'category', 'skill_type', 'proficiency_level', 'learning_source', 'description'] },
    { label: 'Proof', keys: ['icon_url', 'certifications', 'projects_used'] },
    { label: 'Placement', keys: ['is_featured', 'order_index', 'status'] },
  ],
  card: (row) => ({
    title: row.skill_name || 'Untitled skill',
    subtitle: row.category || '',
    chips: [finite(row.proficiency_level) ? `${row.proficiency_level}/10` : null, row.learning_source || null].filter(Boolean),
    image: row.icon_url || null,
    flags: [row.is_featured ? 'featured' : null].filter(Boolean),
  }),
  searchText: (row) => [row.skill_name, row.category, row.skill_type, row.description].filter(Boolean).join(' ').toLowerCase(),
});
