import { supabase } from './supabaseClient';

export const MEDIA_LIBRARY_BUCKETS = [
  { id: 'project-images', label: 'Project Images', isPublic: true },
  { id: 'profile-images', label: 'Profile Images', isPublic: true },
  { id: 'organization-logos', label: 'Organization Logos', isPublic: true },
  { id: 'certification-badges', label: 'Certification Files', isPublic: true },
  { id: 'achievement-images', label: 'Achievement Files', isPublic: true },
  { id: 'skill-icons', label: 'Skill Icons', isPublic: true },
  { id: 'documents', label: 'Documents', isPublic: true },
  { id: 'contact-attachments', label: 'Contact Attachments', isPublic: false }
];

// Every column named here must exist: PostgREST refuses the whole select
// (400) for one unknown column, and that table's files then all read as
// Unknown. projects.image_url, internships.certificate_url and the three
// leadership columns never existed, which hid every project image and
// internship file as Unknown. A test checks this list against the recorded
// fixtures' columns.
export const REFERENCE_TABLES = [
  {
    table: 'hero_content',
    bucketFields: {
      documents: ['resume_url']
    }
  },
  {
    table: 'about_content',
    bucketFields: {
      'profile-images': ['profile_image_about', 'profile_image_info', 'profile_image_url']
    }
  },
  {
    table: 'projects',
    bucketFields: {
      'project-images': ['image_urls']
    }
  },
  {
    table: 'internships',
    bucketFields: {
      'organization-logos': ['company_logo_url'],
      documents: ['certificate_urls']
    }
  },
  {
    table: 'education',
    bucketFields: {
      'organization-logos': ['institution_logo_url']
    }
  },
  {
    table: 'work_experience',
    bucketFields: {
      'organization-logos': ['company_logo_url']
    }
  },
  {
    table: 'recommendations',
    bucketFields: {
      'profile-images': ['profile_image_url'],
      documents: ['profile_image_url']
    }
  },
  {
    table: 'skills',
    bucketFields: {
      'skill-icons': ['icon_url', 'certifications']
    }
  },
  {
    table: 'certifications',
    bucketFields: {
      'certification-badges': ['issuer_logo_url', 'badge_image_url', 'certificate_pdf_url']
    }
  },
  {
    table: 'achievements',
    bucketFields: {
      'achievement-images': ['certificate_url']
    }
  },
  {
    table: 'contact_messages',
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

export const collectReferencedMediaPaths = (rowsByTable = {}, referenceTables = REFERENCE_TABLES) => {
  const referencedPaths = new Set();

  referenceTables.forEach(({ table, bucketFields }) => {
    const rows = rowsByTable[table] || [];

    rows.forEach(row => {
      Object.entries(bucketFields).forEach(([bucketId, fields]) => {
        fields.forEach(field => {
          flattenValues(row?.[field]).forEach(value => {
            const raw = String(value).trim();
            const filePath = extractStoragePathFromPublicUrl(raw, bucketId);
            if (filePath) {
              referencedPaths.add(`${bucketId}:${filePath}`);
            }
            // A relative value that starts with the bucket's name is ambiguous:
            // the contact form stores `contact-attachments/contact-...` as the
            // object key INSIDE the bucket of that name, so the prefix is part
            // of the real path. Both readings are recorded; the listing then
            // matches whichever object actually exists.
            if (raw.startsWith(`${bucketId}/`) && !raw.includes('://')) {
              referencedPaths.add(`${bucketId}:${raw}`);
            }
          });
        });
      });
    });
  });

  return referencedPaths;
};

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

const listBucketFiles = async ({ bucket, prefix = '', depth = 0, maxDepth = 3 }) => {
  const storage = supabase.storage.from(bucket.id);
  // Read the folder page by page until a page comes back short: one request
  // returns at most LIST_PAGE_SIZE entries, and the rest would be dropped
  // without a word. Sorted by name so the pages are stable between requests.
  const entries = [];
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
    if ((data || []).length < LIST_PAGE_SIZE) break;
  }

  const files = [];

  for (const entry of entries) {
    const entryPath = prefix ? `${prefix}/${entry.name}` : entry.name;

    if (isFolderEntry(entry) && depth < maxDepth) {
      const nestedFiles = await listBucketFiles({
        bucket,
        prefix: entryPath,
        depth: depth + 1,
        maxDepth
      });
      files.push(...nestedFiles);
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

  await Promise.all(referenceTables.map(async ({ table, bucketFields }) => {
    const columns = Array.from(new Set(
      Object.values(bucketFields)
        .flat()
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
  const referencedPaths = collectReferencedMediaPaths(rowsByTable, referenceTables);
  const bucketSummaries = [];
  const items = [];

  for (const bucket of buckets) {
    try {
      const files = await listBucketFiles({ bucket });
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
    // tables whose rows could not be read; their files show as Unknown for that reason alone
    referenceErrors: failedTables,
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
  collectReferencedMediaPaths,
  createMediaLibraryItem,
  extractStoragePathFromPublicUrl,
  formatFileSize,
  getMediaFileKind,
  getMediaLibrarySnapshot
};

export default mediaLibraryService;
