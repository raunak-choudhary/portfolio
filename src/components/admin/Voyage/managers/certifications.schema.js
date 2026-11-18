// src/components/admin/Voyage/managers/certifications.schema.js
//
// Certifications: certificates with proof. Limits are the classic
// CertificationsManager's (admin data spec, section 7). Choices made against
// the classic manager:
// - The credential link accepts a bare domain and saves it with https://, as
//   the classic validator accepted bare domains; unlike that validator it
//   also accepts query strings and anchors (a live NYU link has one).
// - The issue date cannot be in the future (classic blocked it in the picker
//   only); the expiry must come after the issue date.
// - Display order is saved as a whole number (classic saved the raw text).
// - Skills covered had no limits in classic; 40 entries of 100 characters
//   each are allowed (the live maximum is 12 entries of 45 characters), and
//   an empty list is saved as null, as classic did.
// - The public page shows featured certificates first, then by order number,
//   then the latest issue; the deck does the same. Because featured always
//   leads, a drag could not decide the order, so the order is set with the
//   Display order field and there is no drag.
// - Deleting a certification removes its issuer logo, badge and certificate
//   file from storage, as the classic manager did.

import { ACTIVE_ONLY, MB, asOptions, featuredFirst, imageUpload, isPast, joinSet, monthYear, orderThenDate, searchOf, sortWith, statusField } from './sectionKit';
import { slugSegment } from './schemaModel';

export const CERTIFICATION_TYPES = Object.freeze(['Professional', 'Academic', 'Vendor', 'Industry', 'Government', 'Technical', 'Management', 'Compliance', 'Security', 'Other']);
export const DIFFICULTY_LEVELS = Object.freeze(['Foundational', 'Associate', 'Professional', 'Expert', 'Specialist']);
const BUCKET = 'certification-badges';

export const issuerLogoUpload = imageUpload({ bucket: BUCKET, path: ({ form, stamp, ext }) => `issuer_logos/issuer-logo-${slugSegment(form.issuer, 'issuer')}-${stamp}.${ext}` });
export const badgeUpload = imageUpload({ bucket: BUCKET, path: ({ form, stamp, ext }) => `badges/badge-${slugSegment(form.title, 'certification')}-${stamp}.${ext}` });
export const certificateFileUpload = Object.freeze({
  bucket: BUCKET,
  accept: ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'],
  typesLabel: 'a PDF, JPEG or PNG file',
  maxBytes: 10 * MB,
  maxCount: 1,
  removeReplaced: true,
  path: ({ form, stamp, ext }) => `certifications/certificate-${slugSegment(form.title, 'certification')}-${stamp}.${ext}`,
});

export const certificationsSchema = Object.freeze({
  table: 'certifications',
  singular: 'certification',
  plural: 'certifications',
  titleKey: 'title',
  sort: sortWith(featuredFirst(orderThenDate('issue_date'))),
  visibility: ACTIVE_ONLY,
  cleanup: [{ key: 'badge_image_url', bucket: BUCKET }, { key: 'issuer_logo_url', bucket: BUCKET }, { key: 'certificate_pdf_url', bucket: BUCKET }],
  dateOrder: [{ start: 'issue_date', end: 'expiry_date', strict: true }],
  fields: [
    { key: 'title', label: 'Certification title', kind: 'text', required: true, min: 3, max: 200 },
    { key: 'issuer', label: 'Issuing organization', kind: 'text', required: true, min: 2, max: 200 },
    { key: 'certification_type', label: 'Type', kind: 'select', options: asOptions(CERTIFICATION_TYPES), allowEmpty: true, emptyLabel: 'Select a type', tolerateUnknown: true, max: 50 },
    { key: 'difficulty_level', label: 'Difficulty', kind: 'select', options: asOptions(DIFFICULTY_LEVELS), allowEmpty: true, emptyLabel: 'Select a level', tolerateUnknown: true, max: 50 },
    { key: 'certification_number', label: 'Certification number', kind: 'number', integer: true, min: 1, help: 'Your own numbering.' },
    { key: 'issue_date', label: 'Issue date', kind: 'date', max: 'today' },
    { key: 'expiry_date', label: 'Expiry date', kind: 'date', help: 'Leave empty if it never expires.' },
    { key: 'credential_id', label: 'Credential ID', kind: 'text', max: 100 },
    { key: 'credential_url', label: 'Credential link', kind: 'url', loose: true, max: 500, placeholder: 'https://', help: 'Where anyone can verify it. A bare domain gets https:// added.' },
    { key: 'verification_status', label: 'Verification', kind: 'select', default: 'verified', options: [{ value: 'verified', label: 'Verified' }, { value: 'pending', label: 'Pending' }, { value: 'unverified', label: 'Unverified' }] },
    { key: 'description', label: 'Description', kind: 'textarea', max: 1000, rows: 4 },
    { key: 'skills_covered', label: 'Skills covered', kind: 'tags', max: 40, itemMax: 100, nullWhenEmpty: true },
    { key: 'badge_image_url', label: 'Badge', kind: 'image', upload: badgeUpload, help: 'JPEG, PNG or WebP, up to 5 MB.' },
    { key: 'issuer_logo_url', label: 'Issuer logo', kind: 'image', upload: issuerLogoUpload, help: 'JPEG, PNG or WebP, up to 5 MB.' },
    { key: 'certificate_pdf_url', label: 'Certificate file', kind: 'file', upload: certificateFileUpload, help: 'PDF, JPEG or PNG, up to 10 MB.' },
    { key: 'is_featured', label: 'Featured', kind: 'toggle', default: false, help: 'Featured certifications come first on the public page.' },
    { key: 'order_index', label: 'Display order', kind: 'number', integer: true, min: 1, help: 'Lower comes first, after featured ones.' },
    statusField(),
  ],
  groups: [
    { label: 'The certificate', keys: ['title', 'issuer', 'certification_type', 'difficulty_level', 'certification_number'] },
    { label: 'Dates and proof', keys: ['issue_date', 'expiry_date', 'credential_id', 'credential_url', 'verification_status'] },
    { label: 'Details', keys: ['description', 'skills_covered'] },
    { label: 'Images and file', keys: ['badge_image_url', 'issuer_logo_url', 'certificate_pdf_url'] },
    { label: 'Placement', keys: ['is_featured', 'order_index', 'status'] },
  ],
  card: (row) => ({
    title: row.title || 'Untitled certification',
    subtitle: joinSet(row.issuer, monthYear(row.issue_date)),
    chips: [row.certification_type, row.difficulty_level].filter(Boolean),
    image: row.badge_image_url || row.issuer_logo_url || null,
    flags: [row.is_featured ? 'featured' : null, isPast(row.expiry_date) ? 'expired' : null].filter(Boolean),
  }),
  searchText: (row) => searchOf(row.title, row.issuer, row.certification_type, row.credential_id, row.skills_covered),
});
