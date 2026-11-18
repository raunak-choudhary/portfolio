// src/components/admin/Voyage/managers/education.schema.js
//
// Education: degrees and schools. Limits are the classic EducationManager's
// (admin data spec, section 4). Choices made against the classic manager:
// - education_status: the classic form defaulted to 'completed' while its
//   options were 'Completed', 'In Progress' and so on, so the live rows hold
//   lower case. The options keep the capitalised spelling the public card
//   prints, `ignoreCase` reads the old rows as those options, and the next
//   save stores the capitalised value.
// - GPA and scale are text columns ("3.50", "10.0"), so they are `numeric`
//   fields: checked as numbers, saved exactly as typed.
// - The institution logo is capped at 2 MiB, the organization-logos bucket's
//   own limit (classic allowed 5 MB, and anything above 2 MiB failed upload).
// - Deleting an entry also removes its logo from storage (classic left it).
// - No order input exists, so there is no drag: the deck shows the order
//   the public page uses (order number first, then the latest start).

import { ACTIVE_ONLY, asOptions, joinSet, logoUpload, orderThenDate, searchOf, sortWith, statusField } from './sectionKit';
import { canonicalOption } from './schemaModel';

export const EDUCATION_LEVELS = Object.freeze(['PhD', 'Doctorate', "Master's Degree", "Bachelor's Degree", 'Associate Degree', 'Diploma', 'Certificate', 'High School', 'Secondary School', 'Primary School']);
export const DEGREE_TYPES = Object.freeze(['Graduate', 'Undergraduate', 'Postgraduate', 'Professional', 'Research']);
export const EDUCATION_STATUSES = Object.freeze(['Completed', 'In Progress', 'Graduated', 'Transferred', 'Withdrawn', 'Deferred']);

export const institutionLogoUpload = logoUpload('education', (form) => form.institution || form.college || 'institution');

const numberOf = (text) => (String(text ?? '').trim() === '' ? null : Number(text));

/** "3.9/4.0", or "74.4%" when the scale is 100 (the classic manager's reading of a percentage). */
export function gradeText(received, scale) {
  const r = String(received ?? '').trim();
  if (!r) return '';
  const s = String(scale ?? '').trim();
  return s && Number(s) === 100 ? `${r}%` : s ? `${r}/${s}` : r;
}

const statusFieldDef = { key: 'education_status', label: 'Education status', kind: 'select', options: asOptions(EDUCATION_STATUSES), allowEmpty: true, emptyLabel: 'Not set', ignoreCase: true, tolerateUnknown: true, max: 50, default: 'Completed' };

export const educationSchema = Object.freeze({
  table: 'education',
  singular: 'education entry',
  plural: 'education entries',
  cardImage: 'logo',
  titleKey: 'degree',
  sort: sortWith(orderThenDate('start_date')),
  visibility: ACTIVE_ONLY,
  cleanup: [{ key: 'institution_logo_url', bucket: 'organization-logos' }],
  dateOrder: [{ start: 'start_date', end: 'end_date', strict: true }],
  rules: (form) => {
    const received = numberOf(form.gpa_received), scale = numberOf(form.max_gpa_scale);
    if (received === null || scale === null || !Number.isFinite(received) || !Number.isFinite(scale)) return {};
    return received > scale ? { gpa_received: 'GPA or grade received cannot be above the maximum scale.' } : {};
  },
  fields: [
    { key: 'degree', label: 'Degree', kind: 'text', required: true, min: 3, max: 200, placeholder: 'e.g. MS in Computer Science' },
    { key: 'college', label: 'College or school', kind: 'text', required: true, min: 2, max: 200, placeholder: 'e.g. Tandon School of Engineering' },
    { key: 'institution', label: 'Institution', kind: 'text', max: 200, placeholder: 'e.g. New York University' },
    { key: 'education_level', label: 'Education level', kind: 'select', options: asOptions(EDUCATION_LEVELS), allowEmpty: true, emptyLabel: 'Select a level', tolerateUnknown: true, max: 50 },
    { key: 'degree_type', label: 'Degree type', kind: 'select', options: asOptions(DEGREE_TYPES), allowEmpty: true, emptyLabel: 'Select a type', tolerateUnknown: true, max: 50 },
    { key: 'major', label: 'Major', kind: 'text', max: 100 },
    { key: 'minor', label: 'Minor', kind: 'text', max: 100 },
    { key: 'location', label: 'Location', kind: 'text', max: 100 },
    { key: 'start_date', label: 'Start date', kind: 'date' },
    { key: 'end_date', label: 'End date', kind: 'date', help: 'After the start date.' },
    statusFieldDef,
    { key: 'gpa_received', label: 'GPA or grade received', kind: 'numeric', min: 0, placeholder: 'e.g. 3.9', help: 'Kept exactly as typed, so 3.50 stays 3.50.' },
    { key: 'max_gpa_scale', label: 'Maximum scale', kind: 'numeric', min: 0, placeholder: 'e.g. 4.0', help: '100 shows the grade as a percentage.' },
    { key: 'thesis_title', label: 'Thesis title', kind: 'text', max: 300 },
    { key: 'description', label: 'Description', kind: 'textarea', max: 2000, rows: 5 },
    { key: 'coursework', label: 'Coursework', kind: 'tags', max: 30, itemMax: 100 },
    { key: 'achievements', label: 'Achievements', kind: 'tags', max: 20, itemMax: 150 },
    { key: 'activities', label: 'Activities', kind: 'tags', max: 15, itemMax: 100 },
    { key: 'institution_logo_url', label: 'Institution logo', kind: 'image', upload: institutionLogoUpload, help: 'JPEG, PNG or WebP, up to 2 MB.' },
    statusField(),
  ],
  groups: [
    { label: 'The degree', keys: ['degree', 'college', 'institution', 'education_level', 'degree_type', 'major', 'minor', 'location'] },
    { label: 'Dates and grade', keys: ['start_date', 'end_date', 'education_status', 'gpa_received', 'max_gpa_scale'] },
    { label: 'Details', keys: ['thesis_title', 'description', 'coursework', 'achievements', 'activities'] },
    { label: 'Logo and visibility', keys: ['institution_logo_url', 'status'] },
  ],
  card: (row) => ({
    title: row.degree || 'Untitled degree',
    subtitle: joinSet(row.college, row.institution),
    chips: [row.education_level, row.education_status ? canonicalOption(statusFieldDef, row.education_status) : null, gradeText(row.gpa_received, row.max_gpa_scale)].filter(Boolean),
    image: row.institution_logo_url || null,
    flags: [],
  }),
  searchText: (row) => searchOf(row.degree, row.college, row.institution, row.major, row.education_level, row.location),
});
