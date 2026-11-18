// src/components/admin/Voyage/managers/workExperience.schema.js
//
// Work experience: roles and what they taught. Limits are the classic
// WorkExperienceManager's (admin data spec, section 5). Salary, performance
// rating and reason for leaving were removed from the database (personal data
// rule) and have no field here.
// - "This is my current position" clears and disables the end date, the save
//   writes no end date, and the date order is checked only for a past role.
// - The company logo is capped at 2 MiB, the organization-logos bucket's own
//   limit (classic allowed 5 MB). Deleting a role removes its logo too.
// - No order input exists, so there is no drag: the deck shows the order the
//   public page uses (order number first, then the latest start).

import { ACTIVE_ONLY, asOptions, dateRange, joinSet, logoUpload, orderThenDate, searchOf, sortWith, statusField } from './sectionKit';

export const EMPLOYMENT_TYPES = Object.freeze(['Full-time', 'Part-time', 'Contract', 'Freelance', 'Internship', 'Temporary', 'Remote', 'Hybrid']);

export const companyLogoUpload = logoUpload('work', (form) => form.company || 'company');

export const workExperienceSchema = Object.freeze({
  table: 'work_experience',
  singular: 'role',
  plural: 'roles',
  cardImage: 'logo',
  titleKey: 'title',
  sort: sortWith(orderThenDate('start_date')),
  visibility: ACTIVE_ONLY,
  cleanup: [{ key: 'company_logo_url', bucket: 'organization-logos' }],
  dateOrder: [{ start: 'start_date', end: 'end_date', strict: true, unless: 'is_current' }],
  fields: [
    { key: 'title', label: 'Job title', kind: 'text', required: true, min: 3, max: 200 },
    { key: 'company', label: 'Company', kind: 'text', required: true, min: 2, max: 200 },
    { key: 'employment_type', label: 'Employment type', kind: 'select', options: asOptions(EMPLOYMENT_TYPES), allowEmpty: true, emptyLabel: 'Select a type', tolerateUnknown: true, max: 50 },
    { key: 'department', label: 'Department', kind: 'text', max: 100 },
    { key: 'location', label: 'Location', kind: 'text', max: 100 },
    { key: 'job_number', label: 'Job number', kind: 'number', integer: true, min: 1, help: 'Your own numbering, e.g. 1 for the first job.' },
    { key: 'team_size', label: 'Team size', kind: 'number', integer: true, min: 0 },
    { key: 'start_date', label: 'Start date', kind: 'date' },
    { key: 'is_current', label: 'This is my current position', kind: 'toggle', default: false, clears: 'end_date' },
    { key: 'end_date', label: 'End date', kind: 'date', disabledWhen: 'is_current', disabledHelp: 'A current position has no end date.', help: 'After the start date.' },
    { key: 'description', label: 'Description', kind: 'textarea', max: 2000, rows: 5 },
    { key: 'key_responsibilities', label: 'Key responsibilities', kind: 'tags', max: 50, itemMax: 200 },
    { key: 'achievements', label: 'Achievements', kind: 'tags', max: 30, itemMax: 200 },
    { key: 'technologies', label: 'Technologies', kind: 'tags', max: 40, itemMax: 50 },
    { key: 'clients_served', label: 'Clients served', kind: 'tags', max: 25, itemMax: 100 },
    { key: 'company_logo_url', label: 'Company logo', kind: 'image', upload: companyLogoUpload, help: 'JPEG, PNG or WebP, up to 2 MB.' },
    statusField(),
  ],
  groups: [
    { label: 'The role', keys: ['title', 'company', 'employment_type', 'department', 'location', 'job_number', 'team_size'] },
    { label: 'Dates', keys: ['start_date', 'is_current', 'end_date'] },
    { label: 'What you did', keys: ['description', 'key_responsibilities', 'achievements', 'technologies', 'clients_served'] },
    { label: 'Logo and visibility', keys: ['company_logo_url', 'status'] },
  ],
  card: (row) => ({
    title: row.title || 'Untitled role',
    subtitle: joinSet(row.company, row.location),
    chips: [row.employment_type, dateRange(row.start_date, row.end_date, row.is_current)].filter(Boolean),
    image: row.company_logo_url || null,
    flags: [row.is_current ? 'current' : null].filter(Boolean),
  }),
  searchText: (row) => searchOf(row.title, row.company, row.department, row.location, row.employment_type, row.technologies),
});
