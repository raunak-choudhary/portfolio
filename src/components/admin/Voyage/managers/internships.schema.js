// src/components/admin/Voyage/managers/internships.schema.js
//
// Internships: where you trained. Limits are the classic InternshipsManager's
// (admin data spec, section 6). Choices made against the classic manager:
// - The public page orders internships by order number (low first), then
//   the latest start, so this deck does the same and a drag rewrites the
//   order numbers 1..n. The "Display order" field stays for typing a number.
// - The end date may fall on the start date (classic allowed the same day).
// - Certificates go to the documents bucket, which accepts PDF, Word, JPEG,
//   PNG and GIF but not WebP; classic offered WebP and the upload then failed
//   at the bucket, so WebP is not offered here.
// - The logo is capped at 2 MiB, the organization-logos bucket's limit.
// - Deleting an internship removes its logo and certificates from storage,
//   as the classic manager did.
// - internship_number had no input in the classic form; it is editable here.

import { ACTIVE_ONLY, MB, asOptions, firstOf, joinSet, logoUpload, orderThenDate, searchOf, sortWith, statusField } from './sectionKit';
import { slugSegment } from './schemaModel';

export const INTERNSHIP_TYPES = Object.freeze(['Remote', 'On-site', 'Hybrid', 'Part-time', 'Full-time', 'Paid', 'Unpaid', 'Academic Credit', 'Summer Internship', 'Winter Internship', 'Co-op']);
export const TECHNOLOGY_SUGGESTIONS = Object.freeze(['Python', 'R', 'SQL', 'JavaScript', 'Java', 'C++', 'MATLAB', 'Tableau', 'Power BI', 'Excel', 'Google Analytics', 'TensorFlow', 'PyTorch', 'Pandas', 'NumPy', 'Scikit-learn', 'Jupyter', 'Git', 'Docker', 'AWS', 'Azure', 'Google Cloud', 'MongoDB', 'PostgreSQL', 'MySQL', 'Apache Spark', 'Hadoop']);

export const internshipLogoUpload = logoUpload('internships', (form) => form.company || 'company');

/** Up to five certificate files, 10 MB each, in the documents bucket. */
export const internshipCertificateUpload = Object.freeze({
  bucket: 'documents',
  accept: ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  typesLabel: 'a PDF, Word, JPEG, PNG or GIF file',
  maxBytes: 10 * MB,
  maxCount: 5,
  removeReplaced: true,
  path: ({ form, index, stamp, ext }) => `internships/${slugSegment(form.title, 'internship')}-certificate-${stamp}-${index + 1}.${ext}`,
});

export const internshipsSchema = Object.freeze({
  table: 'internships',
  singular: 'internship',
  plural: 'internships',
  cardImage: 'logo',
  titleKey: 'title',
  orderKey: 'order_index',
  orderDirection: 'asc',
  sort: sortWith(orderThenDate('start_date')),
  visibility: ACTIVE_ONLY,
  cleanup: [{ key: 'company_logo_url', bucket: 'organization-logos' }, { key: 'certificate_urls', bucket: 'documents' }],
  dateOrder: [{ start: 'start_date', end: 'end_date' }],
  fields: [
    { key: 'title', label: 'Internship title', kind: 'text', required: true, min: 5, max: 100 },
    { key: 'company', label: 'Company', kind: 'text', required: true, min: 2, max: 100 },
    { key: 'internship_type', label: 'Type', kind: 'select', options: asOptions(INTERNSHIP_TYPES), allowEmpty: true, emptyLabel: 'Select a type', tolerateUnknown: true, max: 50 },
    { key: 'location', label: 'Location', kind: 'text', max: 100 },
    { key: 'duration', label: 'Duration', kind: 'text', max: 50, placeholder: 'e.g. 9 weeks', help: 'Shown as typed; not worked out from the dates.' },
    { key: 'internship_number', label: 'Internship number', kind: 'number', integer: true, min: 1, help: 'Your own numbering.' },
    { key: 'start_date', label: 'Start date', kind: 'date' },
    { key: 'end_date', label: 'End date', kind: 'date', help: 'On or after the start date.' },
    { key: 'description', label: 'Description', kind: 'textarea', max: 2000, rows: 5 },
    { key: 'key_responsibilities', label: 'Key responsibilities', kind: 'tags', max: 15, itemMax: 200 },
    { key: 'technologies', label: 'Technologies', kind: 'tags', max: 20, itemMax: 50, suggestions: TECHNOLOGY_SUGGESTIONS },
    { key: 'achievements', label: 'Achievements', kind: 'tags', max: 10, itemMax: 200 },
    { key: 'skills_gained', label: 'Skills gained', kind: 'tags', max: 15, itemMax: 100 },
    { key: 'company_logo_url', label: 'Company logo', kind: 'image', upload: internshipLogoUpload, help: 'JPEG, PNG or WebP, up to 2 MB.' },
    { key: 'certificate_urls', label: 'Certificates', kind: 'files', max: 5, upload: internshipCertificateUpload, help: 'PDF, Word, JPEG, PNG or GIF, up to 10 MB each, five in all.' },
    { key: 'order_index', label: 'Display order', kind: 'number', integer: true, min: 0, max: 999, help: 'Lower comes first. Dragging cards in the deck rewrites it.' },
    statusField(),
  ],
  groups: [
    { label: 'The internship', keys: ['title', 'company', 'internship_type', 'location', 'duration', 'internship_number'] },
    { label: 'Dates', keys: ['start_date', 'end_date'] },
    { label: 'What you did', keys: ['description', 'key_responsibilities', 'technologies', 'achievements', 'skills_gained'] },
    { label: 'Logo and certificates', keys: ['company_logo_url', 'certificate_urls'] },
    { label: 'Placement', keys: ['order_index', 'status'] },
  ],
  card: (row) => ({
    title: row.title || 'Untitled internship',
    subtitle: joinSet(row.company, row.duration),
    chips: firstOf(row.technologies, 3),
    image: row.company_logo_url || null,
    flags: [],
  }),
  searchText: (row) => searchOf(row.title, row.company, row.internship_type, row.location, row.technologies),
});
