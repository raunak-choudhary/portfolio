// src/components/admin/Voyage/managers/about.schema.js
//
// The about section: one row in about_content (singleton mode). Two images
// upload to profile-images under about/ the way the classic manager did, and
// the basic info is an ordered list of label and value pairs stored as
// [{key, value, order_index}] (a legacy {key: value} object still loads).
// The legacy profile_image_url column has no field, so it is never written.
// Birth date, nationality and residence were removed from basic info by the
// owner (personal data rule); nothing here suggests them.

import { slugSegment } from './schemaModel';

const PROFILE_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];

/** The upload rule for one of the two profile images; `which` names the file (about or info). */
export const profileUpload = (which) => Object.freeze({
  bucket: 'profile-images',
  accept: PROFILE_TYPES,
  typesLabel: 'a JPEG, PNG or WebP image',
  maxBytes: 5 * 1024 * 1024,
  maxCount: 1,
  // replaced files leave storage once the row points at the new one, so the bucket does not collect orphans
  removeReplaced: true,
  path: ({ stamp, ext }) => `about/${slugSegment(which)}-profile-${stamp}.${ext}`,
});

export const aboutSchema = Object.freeze({
  table: 'about_content',
  singular: 'about section',
  plural: 'about section',
  mode: 'singleton',
  titleKey: 'about_me_title',
  visibility: [{ key: 'is_active', publicValues: [true] }],
  fields: [
    { key: 'about_me_title', label: 'About me title', kind: 'text', required: true, min: 3, max: 100, default: 'About Me' },
    { key: 'about_me_content', label: 'About me', kind: 'textarea', max: 2000, rows: 8 },
    { key: 'profile_image_about', label: 'About me photo', kind: 'image', upload: profileUpload('about'), help: 'JPEG, PNG or WebP, up to 5 MB.' },
    { key: 'basic_info_title', label: 'Basic info title', kind: 'text', required: true, min: 3, max: 100, default: 'Basic Info' },
    { key: 'basic_info', label: 'Basic info', kind: 'pairs', required: true, max: 10, keyMax: 50, valueMax: 200, help: 'Shown in this order. Labels must be unique.' },
    { key: 'profile_image_info', label: 'Basic info photo', kind: 'image', upload: profileUpload('info'), help: 'JPEG, PNG or WebP, up to 5 MB.' },
    { key: 'is_active', label: 'Show the about section to visitors', kind: 'toggle', default: true },
  ],
  groups: [
    { label: 'About me', keys: ['about_me_title', 'about_me_content', 'profile_image_about'] },
    { label: 'Basic info', keys: ['basic_info_title', 'basic_info', 'profile_image_info'] },
    { label: 'Visibility', keys: ['is_active'] },
  ],
  card: (row) => {
    const info = Array.isArray(row.basic_info) ? row.basic_info : [];
    return {
      title: row.about_me_title || 'About',
      subtitle: info.length ? `${info.length} basic info ${info.length === 1 ? 'item' : 'items'}` : '',
      chips: [],
      image: row.profile_image_about || null,
      flags: [],
    };
  },
  searchText: (row) => [row.about_me_title, row.about_me_content].filter(Boolean).join(' ').toLowerCase(),
});
