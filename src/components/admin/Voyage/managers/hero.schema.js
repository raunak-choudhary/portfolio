// src/components/admin/Voyage/managers/hero.schema.js
//
// The hero section: one row in hero_content, edited in place (singleton
// mode), never listed, created only when the table is empty, never deleted.
// Limits match the classic HeroContentManager. The call-to-action link may
// be a web address, a site path or an anchor (the live row points at
// #navigation), so it uses the `link` kind, not `url`.
//
// The resume is a PDF in the public documents bucket under resume/. The
// database accepts only a link of that shape (migration 20261121150000), and
// the public site shows its Resume buttons only for one (utils/resumeLink.js).
// A new upload replaces the old file, which leaves storage once the row stops
// pointing at it.

import { MB } from './sectionKit';

export const resumeUpload = Object.freeze({
  bucket: 'documents',
  accept: ['application/pdf'],
  typesLabel: 'a PDF',
  maxBytes: 5 * MB,
  maxCount: 1,
  removeReplaced: true,
  path: ({ stamp }) => `resume/raunak-choudhary-resume-${stamp}.pdf`,
});

export const heroSchema = Object.freeze({
  table: 'hero_content',
  singular: 'hero section',
  plural: 'hero section',
  mode: 'singleton',
  titleKey: 'title',
  /** The public site reads the hero with is_active = true. */
  visibility: [{ key: 'is_active', publicValues: [true] }],
  fields: [
    { key: 'title', label: 'Main title', kind: 'text', required: true, min: 5, max: 100, placeholder: 'Enter the main hero title' },
    { key: 'subtitle', label: 'Subtitle', kind: 'text', max: 150 },
    { key: 'description', label: 'Description', kind: 'textarea', max: 500, rows: 4 },
    { key: 'highlights', label: 'Key highlights', kind: 'tags', max: 6, itemMax: 100, editable: true, help: 'Each line can be edited in place.' },
    { key: 'cta_text', label: 'Button text', kind: 'text', max: 50, placeholder: 'e.g. Explore my work' },
    { key: 'cta_link', label: 'Button link', kind: 'link', max: 500, placeholder: 'https://, /projects or #section', help: 'A web address, a page path or an anchor on the page.' },
    { key: 'resume_url', label: 'Resume', kind: 'file', upload: resumeUpload, help: 'PDF, up to 5 MB. Shown as the Resume button on the home screen and in the menu; a new upload replaces the old file.' },
    { key: 'is_active', label: 'Show the hero to visitors', kind: 'toggle', default: true },
  ],
  groups: [
    { label: 'Headline', keys: ['title', 'subtitle', 'description'] },
    { label: 'Highlights and button', keys: ['highlights', 'cta_text', 'cta_link'] },
    { label: 'Resume', keys: ['resume_url'] },
    { label: 'Visibility', keys: ['is_active'] },
  ],
  card: (row) => ({
    title: row.title || 'Hero section',
    subtitle: row.subtitle || '',
    chips: (Array.isArray(row.highlights) ? row.highlights : []).slice(0, 3),
    image: null,
    flags: [],
  }),
  searchText: (row) => [row.title, row.subtitle, row.description].filter(Boolean).join(' ').toLowerCase(),
});
