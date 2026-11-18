// src/components/admin/Voyage/managers/leadership.schema.js
//
// Leadership: teams led and roles held. Limits are the classic
// LeadershipManager's (admin data spec, section 9). The table has no file
// columns, so nothing uploads and a delete removes only the row.
// - "Current position" clears and disables the end date; the date order is
//   checked only for a past role.
// - No order input exists, so there is no drag: the deck shows the order the
//   public page uses (featured first, then the latest start).

import { ACTIVE_ONLY, asOptions, dateRange, featuredFirst, newestBy, searchOf, sortWith, statusField } from './sectionKit';

export const ORGANIZATION_TYPES = Object.freeze(['Corporate', 'Non-Profit', 'Government', 'Educational', 'Healthcare', 'Technology', 'Financial', 'Consulting', 'Manufacturing', 'Retail', 'Startup', 'Other']);
export const INITIATIVE_TYPES = Object.freeze(['Professional', 'Volunteer', 'Community Service', 'Academic', 'Social Impact', 'Environmental', 'Cultural', 'Sports', 'Technology', 'Healthcare', 'Education', 'Other']);

export const leadershipSchema = Object.freeze({
  table: 'leadership',
  singular: 'leadership role',
  plural: 'leadership roles',
  titleKey: 'title',
  sort: sortWith(featuredFirst(newestBy('start_date'))),
  visibility: ACTIVE_ONLY,
  dateOrder: [{ start: 'start_date', end: 'end_date', strict: true, unless: 'is_current' }],
  fields: [
    { key: 'title', label: 'Position title', kind: 'text', required: true, min: 3, max: 200 },
    { key: 'organization', label: 'Organization', kind: 'text', required: true, min: 2, max: 200 },
    { key: 'organization_type', label: 'Organization type', kind: 'select', options: asOptions(ORGANIZATION_TYPES), allowEmpty: true, emptyLabel: 'Select a type', tolerateUnknown: true, max: 50 },
    { key: 'initiative_type', label: 'Initiative type', kind: 'select', options: asOptions(INITIATIVE_TYPES), allowEmpty: true, emptyLabel: 'Select a type', tolerateUnknown: true, max: 50 },
    { key: 'location', label: 'Location', kind: 'text', max: 100 },
    { key: 'position_number', label: 'Position number', kind: 'number', integer: true, min: 1, help: 'Your own numbering.' },
    { key: 'start_date', label: 'Start date', kind: 'date' },
    { key: 'is_current', label: 'This is a current position', kind: 'toggle', default: false, clears: 'end_date' },
    { key: 'end_date', label: 'End date', kind: 'date', disabledWhen: 'is_current', disabledHelp: 'A current position has no end date.', help: 'After the start date.' },
    { key: 'description', label: 'Description', kind: 'textarea', max: 2000, rows: 5 },
    { key: 'team_size', label: 'Team size', kind: 'number', integer: true, min: 0 },
    { key: 'mentees_count', label: 'Mentees', kind: 'number', integer: true, min: 0 },
    { key: 'volunteer_hours', label: 'Volunteer hours', kind: 'number', integer: true, min: 0 },
    { key: 'budget_managed', label: 'Budget managed', kind: 'text', max: 100, placeholder: 'e.g. $50K' },
    { key: 'key_responsibilities', label: 'Key responsibilities', kind: 'tags', max: 50, itemMax: 200 },
    { key: 'achievements', label: 'Achievements', kind: 'tags', max: 30, itemMax: 200 },
    { key: 'skills_developed', label: 'Skills developed', kind: 'tags', max: 40, itemMax: 100 },
    { key: 'recognition_received', label: 'Recognition received', kind: 'tags', max: 20, itemMax: 150 },
    { key: 'training_provided', label: 'Training provided', kind: 'tags', max: 25, itemMax: 150 },
    { key: 'challenges_overcome', label: 'Challenges overcome', kind: 'textarea', max: 2000, rows: 4 },
    { key: 'impact', label: 'Impact', kind: 'textarea', max: 2000, rows: 4 },
    { key: 'is_featured', label: 'Featured', kind: 'toggle', default: false, help: 'Featured roles come first on the public page.' },
    statusField(),
  ],
  groups: [
    { label: 'The role', keys: ['title', 'organization', 'organization_type', 'initiative_type', 'location', 'position_number'] },
    { label: 'Dates', keys: ['start_date', 'is_current', 'end_date'] },
    { label: 'Scale', keys: ['team_size', 'mentees_count', 'volunteer_hours', 'budget_managed'] },
    { label: 'What you did', keys: ['description', 'key_responsibilities', 'achievements', 'skills_developed', 'recognition_received', 'training_provided', 'challenges_overcome', 'impact'] },
    { label: 'Placement', keys: ['is_featured', 'status'] },
  ],
  card: (row) => ({
    title: row.title || 'Untitled role',
    subtitle: row.organization || '',
    chips: [row.organization_type, row.initiative_type, dateRange(row.start_date, row.end_date, row.is_current)].filter(Boolean),
    image: null,
    flags: [row.is_featured ? 'featured' : null, row.is_current ? 'current' : null].filter(Boolean),
  }),
  searchText: (row) => searchOf(row.title, row.organization, row.organization_type, row.initiative_type, row.location),
});
