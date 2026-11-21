import { supabase } from './supabaseClient';

export const MEDIA_LIBRARY_BUCKETS = [
  { id: 'project-images', label: 'Project images', isPublic: true },
  { id: 'profile-images', label: 'Profile images', isPublic: true },
  { id: 'organization-logos', label: 'Organization logos', isPublic: true },
  { id: 'certification-badges', label: 'Certification files', isPublic: true },
  { id: 'achievement-images', label: 'Achievement files', isPublic: true },
  { id: 'skill-icons', label: 'Skill icons', isPublic: true },
  { id: 'documents', label: 'Documents', isPublic: true },
  { id: 'contact-attachments', label: 'Contact attachments', isPublic: false }
];

// Every column named here must exist: PostgREST refuses the whole select
// (400) for one unknown column, and that table's files then cannot be
// checked. projects.image_url, internships.certificate_url and the three
// leadership columns never existed, which once hid every project image and
// internship file. A test checks this list (file columns and title columns)
// against the recorded fixtures' columns.
//
// Each table also says how the library names an entry that uses a file:
// `section` is the chapter's name, `titleFields` are joined with " · " into
// the entry's title, and `fieldLabels` name each file column in plain words
// ("Company logo points at a missing file"). The two single-row sections
// (hero, about) have no title of their own, so the field label stands in
// (`singleton`). The order is the voyage's chapter order, which is also the
// order the Files pop-up groups its sections in.
export const REFERENCE_TABLES = [
  {
    table: 'hero_content',
    section: 'Hero',
    singleton: true,
    titleFields: [],
    fieldLabels: { resume_url: 'Resume' },
    bucketFields: {
      documents: ['resume_url']
    }
  },
  {
    table: 'about_content',
    section: 'About',
    singleton: true,
    titleFields: [],
    fieldLabels: { profile_image_about: 'About picture', profile_image_info: 'Info picture', profile_image_url: 'Profile picture' },
    bucketFields: {
      'profile-images': ['profile_image_about', 'profile_image_info', 'profile_image_url']
    }
  },
  {
    table: 'projects',
    section: 'Projects',
    titleFields: ['title'],
    fieldLabels: { image_urls: 'Images' },
    bucketFields: {
      'project-images': ['image_urls']
    }
  },
  {
    table: 'internships',
    section: 'Internships',
    titleFields: ['title', 'company'],
    fieldLabels: { company_logo_url: 'Company logo', certificate_urls: 'Certificates' },
    bucketFields: {
      'organization-logos': ['company_logo_url'],
      documents: ['certificate_urls']
    }
  },
  {
    table: 'education',
    section: 'Education',
    titleFields: ['degree', 'institution'],
    fieldLabels: { institution_logo_url: 'Institution logo' },
    bucketFields: {
      'organization-logos': ['institution_logo_url']
    }
  },
  {
    table: 'work_experience',
    section: 'Work experience',
    titleFields: ['title', 'company'],
    fieldLabels: { company_logo_url: 'Company logo' },
    bucketFields: {
      'organization-logos': ['company_logo_url']
    }
  },
  {
    table: 'skills',
    section: 'Skills',
    titleFields: ['skill_name'],
    fieldLabels: { icon_url: 'Icon', certifications: 'Certificates' },
    bucketFields: {
      'skill-icons': ['icon_url', 'certifications']
    }
  },
  {
    table: 'certifications',
    section: 'Certifications',
    titleFields: ['title'],
    fieldLabels: { issuer_logo_url: 'Issuer logo', badge_image_url: 'Badge', certificate_pdf_url: 'Certificate' },
    bucketFields: {
      'certification-badges': ['issuer_logo_url', 'badge_image_url', 'certificate_pdf_url']
    }
  },
  {
    table: 'recommendations',
    section: 'Recommendations',
    titleFields: ['recommender_name', 'organization'],
    fieldLabels: { profile_image_url: 'Profile picture' },
    bucketFields: {
      'profile-images': ['profile_image_url'],
      documents: ['profile_image_url']
    }
  },
  {
    table: 'achievements',
    section: 'Achievements',
    titleFields: ['title'],
    fieldLabels: { certificate_url: 'Certificate' },
    bucketFields: {
      'achievement-images': ['certificate_url']
    }
  },
  {
    table: 'contact_messages',
    section: 'Inbox',
    titleFields: ['subject'],
    fieldLabels: { attachment_urls: 'Attachments', attachment_url: 'Attachment' },
    bucketFields: {
      'contact-attachments': ['attachment_urls', 'attachment_url']
    }
  }
];

const isPlainObject = (value) => (
  value !== null &&
  typeof value === 'object' &&
  !Array.isArray(value)
);

const flattenValues = (value) => {
  if (Array.isArray(value)) {
    return value.flatMap(flattenValues);
  }

  if (isPlainObject(value)) {
    return Object.values(value).flatMap(flattenValues);
  }

  return [value].filter(Boolean);
};

export const extractStoragePathFromPublicUrl = (value, bucketId) => {
  if (!value || !bucketId || typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  const publicMarker = `/storage/v1/object/public/${bucketId}/`;
  const signedMarker = `/storage/v1/object/sign/${bucketId}/`;

  if (trimmed.includes(publicMarker)) {
    return decodeURIComponent(trimmed.split(publicMarker)[1].split('?')[0]);
  }

  if (trimmed.includes(signedMarker)) {
    return decodeURIComponent(trimmed.split(signedMarker)[1].split('?')[0]);
  }

  if (trimmed.startsWith(`${bucketId}/`)) {
    return trimmed.slice(bucketId.length + 1);
  }

  if (!trimmed.includes('://') && !trimmed.startsWith('/') && trimmed.length > 0) {
    return trimmed;
  }

  return null;
};

const storageMarkers = (bucketId) => [
  `/storage/v1/object/public/${bucketId}/`,
  `/storage/v1/object/sign/${bucketId}/`
];

/** The entry's name in the library: its title columns joined, or the field label for hero and about. */
const entryTitle = (row, { singleton, titleFields = [] }, fieldLabel) => {
  if (singleton) return fieldLabel;
  const parts = titleFields
    .map((field) => row?.[field])
    .filter((value) => typeof value === 'string' && value.trim())
    .map((value) => value.trim());
  return parts.length ? parts.join(' · ') : 'Untitled entry';
};

/**
 * Every place an entry points at a stored file, one reference per value:
 *
 *   { keys, bucketId, path, table, section, rowId, title, field, fieldLabel,
 *     position, count, explicit }
 *
 * `keys` are the `bucket:path` ids the value may name. A relative value that
 * starts with the bucket's name is ambiguous: the contact form stores
 * `contact-attachments/contact-...` as the object key INSIDE the bucket of
 * that name, so the prefix is part of the real path. Both readings are
 * recorded and the listing then matches whichever object actually exists;
 * a file matched by either reading counts as in use (the current rule).
 *
 * `explicit` is true only when the value is certainly a file in this bucket
 * (a storage URL naming the bucket, or a path starting with the bucket's
 * name). Only explicit references can be called broken: a bare relative
 * string may be plain text in a JSON column, and must never be reported as
 * a missing file. `position` and `count` place the value among the field's
 * file values ("file 3 of 4").
 */
export const collectReferences = (rowsByTable = {}, referenceTables = REFERENCE_TABLES) => {
  const references = [];

  referenceTables.forEach((spec) => {
    const { table, bucketFields, section = table, fieldLabels = {} } = spec;
    const rows = rowsByTable[table] || [];

    rows.forEach(row => {
      Object.entries(bucketFields).forEach(([bucketId, fields]) => {
        fields.forEach(field => {
          const fileValues = flattenValues(row?.[field])
            .map((value) => String(value).trim())
            .map((raw) => {
              const keys = [];
              const filePath = extractStoragePathFromPublicUrl(raw, bucketId);
              if (filePath) keys.push(`${bucketId}:${filePath}`);
              const prefixed = raw.startsWith(`${bucketId}/`) && !raw.includes('://');
              if (prefixed) keys.push(`${bucketId}:${raw}`);
              const explicit = prefixed || storageMarkers(bucketId).some((marker) => raw.includes(marker));
              return { raw, keys: Array.from(new Set(keys)), filePath, explicit };
            })
            .filter((value) => value.keys.length > 0);

          const fieldLabel = fieldLabels[field] || field;
          fileValues.forEach((value, index) => {
            references.push({
              keys: value.keys,
              bucketId,
              path: value.filePath || value.raw,
              table,
              section,
              rowId: row?.id ?? null,
              title: entryTitle(row, spec, fieldLabel),
              field,
              fieldLabel,
              position: index + 1,
              count: fileValues.length,
              explicit: value.explicit
            });
          });
        });
      });
    });
  });

  return references;
};

/** The `bucket:path` ids any entry points at (every reading of every value). */
export const collectReferencedMediaPaths = (rowsByTable = {}, referenceTables = REFERENCE_TABLES) => (
  new Set(collectReferences(rowsByTable, referenceTables).flatMap((reference) => reference.keys))
);

export const getMediaFileKind = (file = {}) => {
  const mimeType = String(file.metadata?.mimetype || file.metadata?.mime_type || '').toLowerCase();
  const extension = String(file.name || '').split('.').pop()?.toLowerCase();

  if (mimeType.startsWith('image/') || ['jpg', 'jpeg', 'png', 'webp', 'gif', 'svg'].includes(extension)) {
    return 'image';
  }

  if (mimeType === 'application/pdf' || extension === 'pdf') {
    return 'pdf';
  }

  if (
    mimeType.includes('word') ||
    mimeType.includes('document') ||
    ['doc', 'docx', 'txt'].includes(extension)
  ) {
    return 'document';
  }

  return 'file';
};

export const formatFileSize = (bytes = 0) => {
  const size = Number(bytes) || 0;

  if (size < 1024) {
    return `${size} B`;
  }

  const units = ['KB', 'MB', 'GB'];
  let normalized = size / 1024;
  let unitIndex = 0;

  while (normalized >= 1024 && unitIndex < units.length - 1) {
    normalized /= 1024;
    unitIndex += 1;
  }

  const rounded = Math.round(normalized * 10) / 10;
  return `${Number.isInteger(rounded) ? rounded.toFixed(0) : rounded} ${units[unitIndex]}`;
};

const getFileTimestamp = (file = {}) => (
  file.updated_at ||
  file.created_at ||
  file.last_accessed_at ||
  null
);

export const createMediaLibraryItem = async ({
  bucket,
  file,
  filePath,
  referencedPaths = new Set(),
  getPublicUrl,
  createSignedUrl,
  signedUrlExpiresIn = 300
}) => {
  const isReferenced = referencedPaths.has(`${bucket.id}:${filePath}`);
  const kind = getMediaFileKind(file);
  const size = Number(file.metadata?.size || 0);
  let previewUrl = null;
  let previewExpiresIn = null;

  if (bucket.isPublic) {
    previewUrl = getPublicUrl ? getPublicUrl(filePath) : null;
  } else if (createSignedUrl) {
    // One file that cannot be signed must not fail its whole bucket: it is
    // listed without a preview, and opening it asks for a fresh link.
    try {
      previewUrl = await createSignedUrl(filePath, signedUrlExpiresIn);
      previewExpiresIn = signedUrlExpiresIn;
    } catch {
      previewUrl = null;
    }
  }

  return {
    id: `${bucket.id}:${filePath}`,
    bucketId: bucket.id,
    bucketLabel: bucket.label,
    path: filePath,
    name: file.name,
    kind,
    size,
    sizeLabel: formatFileSize(size),
    mimeType: file.metadata?.mimetype || file.metadata?.mime_type || null,
    updatedAt: getFileTimestamp(file),
    isPrivate: !bucket.isPublic,
    isReferenced,
    status: isReferenced ? 'referenced' : 'unknown',
    previewUrl,
    previewExpiresIn
  };
};

/**
 * Storage lists a folder as an entry with neither an id nor metadata; a file
 * always has both. The name is not consulted: a folder may contain a dot.
 */
const isFolderEntry = (entry = {}) => !entry.id && !entry.metadata;

/** Entries asked for per storage request; a full page means there may be more. */
export const LIST_PAGE_SIZE = 100;
/** A stop for a listing that never comes back short (50 pages is 5,000 entries per folder). */
const LIST_MAX_PAGES = 50;
/** How deep the listing walks into folders; the portfolio's own paths are at most three deep. */
export const LIST_MAX_DEPTH = 6;

/**
 * Lists every file in a bucket. `state.complete` turns false when the walk
 * had to stop early (a folder deeper than LIST_MAX_DEPTH, or a folder with
 * more than LIST_MAX_PAGES pages): the files it did list are still right,
 * but a file missing from the list may only be unlisted, so the library
 * never calls a link into that bucket broken. A folder is never returned as
 * a file.
 */
const listBucketFiles = async ({ bucket, prefix = '', depth = 0, maxDepth = LIST_MAX_DEPTH, state = { complete: true } }) => {
  const storage = supabase.storage.from(bucket.id);
  // Read the folder page by page until a page comes back short: one request
  // returns at most LIST_PAGE_SIZE entries, and the rest would be dropped
  // without a word. Sorted by name so the pages are stable between requests.
  const entries = [];
  let short = false;
  for (let page = 0; page < LIST_MAX_PAGES; page += 1) {
    const { data, error } = await storage.list(prefix, {
      limit: LIST_PAGE_SIZE,
      offset: page * LIST_PAGE_SIZE,
      sortBy: { column: 'name', order: 'asc' }
    });

    if (error) {
      throw error;
    }

    entries.push(...(data || []));
    if ((data || []).length < LIST_PAGE_SIZE) { short = true; break; }
  }
  if (!short) state.complete = false;

  const files = [];

  for (const entry of entries) {
    const entryPath = prefix ? `${prefix}/${entry.name}` : entry.name;

    if (isFolderEntry(entry)) {
      if (depth < maxDepth) {
        const nestedFiles = await listBucketFiles({
          bucket,
          prefix: entryPath,
          depth: depth + 1,
          maxDepth,
          state
        });
        files.push(...nestedFiles);
      } else {
        state.complete = false;
      }
    } else {
      files.push({
        ...entry,
        path: entryPath
      });
    }
  }

  return files;
};

/**
 * The rows that may point at stored files. A table that cannot be read is
 * named in `failedTables`: without its rows every file it uses would read
 * "Unknown", and the library has to say so instead of looking sure.
 */
const getReferenceRows = async (referenceTables = REFERENCE_TABLES) => {
  const rowsByTable = {};
  const failedTables = [];

  await Promise.all(referenceTables.map(async ({ table, bucketFields, titleFields = [] }) => {
    const columns = Array.from(new Set(
      Object.values(bucketFields)
        .flat()
        .concat(titleFields)
        .concat(['id'])
    )).join(',');

    const { data, error } = await supabase
      .from(table)
      .select(columns);

    if (error) failedTables.push(table);
    rowsByTable[table] = error ? [] : (data || []);
  }));

  return { rowsByTable, failedTables: failedTables.sort() };
};

/** The section names ("Skills") of failed tables, in the library's order. */
const sectionsFor = (tables, referenceTables) => referenceTables
  .filter((spec) => tables.includes(spec.table))
  .map((spec) => spec.section || spec.table);

/**
 * Reads every reference again, for the check made immediately before a
 * deletion. `failedTables` non-empty means the check is incomplete and the
 * caller must not delete anything.
 */
export const readReferences = async (referenceTables = REFERENCE_TABLES) => {
  const { rowsByTable, failedTables } = await getReferenceRows(referenceTables);
  return {
    references: collectReferences(rowsByTable, referenceTables),
    failedTables,
    failedSections: sectionsFor(failedTables, referenceTables)
  };
};

/**
 * True for an object key the library may hand to storage: relative, no
 * empty, "." or ".." segment, no backslash or control character. Paths come
 * from the bucket listing, never from typed text; this is the second guard.
 */
export const isSafeStoragePath = (value) => {
  if (typeof value !== 'string' || !value || value.length > 1024) return false;
  if (value.startsWith('/') || value.includes('\\')) return false;
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(value)) return false;
  return value.split('/').every((segment) => segment && segment !== '.' && segment !== '..');
};

/**
 * Deletes files from storage under the admin's session (storage policies
 * allow it only at the second factor). A file is sent only when its bucket
 * is one of the library's buckets, its path is safe, its id matches its
 * bucket and path, and its id is in `listedIds`, the ids of the listing the
 * owner is looking at; anything else is returned in `failed` untouched.
 *
 * Storage answers a refused removal with an empty list and no error, so a
 * file counts as deleted only when storage names it in its answer.
 *
 * @param {Array<{id: string, bucketId: string, path: string}>} files
 * @param {{listedIds: Set<string>, buckets?: Array<{id: string}>}} options
 * @returns {Promise<{deleted: object[], failed: object[]}>}
 */
export const deleteMediaFiles = async (files = [], { listedIds, buckets = MEDIA_LIBRARY_BUCKETS } = {}) => {
  const known = new Set(buckets.map((bucket) => bucket.id));
  const deleted = [];
  const failed = [];
  const byBucket = new Map();

  files.forEach((file) => {
    const valid = file
      && listedIds instanceof Set
      && known.has(file.bucketId)
      && isSafeStoragePath(file.path)
      && file.id === `${file.bucketId}:${file.path}`
      && listedIds.has(file.id);
    if (!valid) { failed.push(file); return; }
    if (!byBucket.has(file.bucketId)) byBucket.set(file.bucketId, []);
    byBucket.get(file.bucketId).push(file);
  });

  for (const [bucketId, bucketFiles] of byBucket) {
    try {
      const { data, error } = await supabase.storage.from(bucketId).remove(bucketFiles.map((file) => file.path));
      if (error) throw error;
      const gone = new Set((data || []).map((object) => object?.name));
      bucketFiles.forEach((file) => (gone.has(file.path) ? deleted : failed).push(file));
    } catch {
      failed.push(...bucketFiles);
    }
  }

  return { deleted, failed };
};

/**
 * How long a private file's thumbnail link lasts. An hour, so plates shown
 * later by "Show more" still load; opening a file always signs a fresh,
 * short link (createMediaSignedUrl).
 */
export const PREVIEW_LINK_SECONDS = 3600;

export const getMediaLibrarySnapshot = async ({
  buckets = MEDIA_LIBRARY_BUCKETS,
  referenceTables = REFERENCE_TABLES
} = {}) => {
  const { rowsByTable, failedTables } = await getReferenceRows(referenceTables);
  const references = collectReferences(rowsByTable, referenceTables);
  const referencedPaths = new Set(references.flatMap((reference) => reference.keys));
  const bucketSummaries = [];
  const items = [];

  for (const bucket of buckets) {
    try {
      const listing = { complete: true };
      const files = await listBucketFiles({ bucket, state: listing });
      const storage = supabase.storage.from(bucket.id);
      const bucketItems = await Promise.all(files.map(file => createMediaLibraryItem({
        bucket,
        file,
        filePath: file.path,
        referencedPaths,
        getPublicUrl: (path) => storage.getPublicUrl(path).data.publicUrl,
        signedUrlExpiresIn: PREVIEW_LINK_SECONDS,
        createSignedUrl: async (path, expiresIn) => {
          const { data, error } = await storage.createSignedUrl(path, expiresIn);
          if (error) {
            throw error;
          }
          return data.signedUrl;
        }
      })));

      items.push(...bucketItems);
      bucketSummaries.push({
        id: bucket.id,
        label: bucket.label,
        isPublic: bucket.isPublic,
        status: 'available',
        complete: listing.complete,
        fileCount: bucketItems.length,
        referencedCount: bucketItems.filter(item => item.isReferenced).length,
        unknownCount: bucketItems.filter(item => !item.isReferenced).length
      });
    } catch (error) {
      bucketSummaries.push({
        id: bucket.id,
        label: bucket.label,
        isPublic: bucket.isPublic,
        status: 'error',
        complete: false,
        fileCount: 0,
        referencedCount: 0,
        unknownCount: 0,
        error: error.message
      });
    }
  }

  return {
    buckets: bucketSummaries,
    items,
    summary: {
      totalFiles: items.length,
      referencedFiles: items.filter(item => item.isReferenced).length,
      unknownFiles: items.filter(item => !item.isReferenced).length,
      privateFiles: items.filter(item => item.isPrivate).length,
      publicFiles: items.filter(item => !item.isPrivate).length
    },
    // every place an entry points at a file (collectReferences)
    references,
    // tables whose rows could not be read: while any is listed, nothing may be deleted
    referenceErrors: failedTables,
    referenceErrorSections: sectionsFor(failedTables, referenceTables),
    generatedAt: new Date().toISOString()
  };
};

/**
 * A fresh short-lived link to one file in a private bucket. The snapshot
 * signs private files once at load; a click after those links lapse asks
 * for a new one here instead of opening a dead link.
 */
export const createMediaSignedUrl = async (bucketId, filePath, expiresIn = 300) => {
  const { data, error } = await supabase.storage.from(bucketId).createSignedUrl(filePath, expiresIn);
  if (error) {
    throw error;
  }
  return data.signedUrl;
};

const mediaLibraryService = {
  MEDIA_LIBRARY_BUCKETS,
  collectReferences,
  collectReferencedMediaPaths,
  deleteMediaFiles,
  readReferences,
  createMediaLibraryItem,
  extractStoragePathFromPublicUrl,
  formatFileSize,
  getMediaFileKind,
  getMediaLibrarySnapshot
};

export default mediaLibraryService;
