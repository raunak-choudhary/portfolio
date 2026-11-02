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

const REFERENCE_TABLES = [
  {
    table: 'about_content',
    bucketFields: {
      'profile-images': ['profile_image_about', 'profile_image_info', 'profile_image_url']
    }
  },
  {
    table: 'projects',
    bucketFields: {
      'project-images': ['image_urls', 'image_url']
    }
  },
  {
    table: 'internships',
    bucketFields: {
      'organization-logos': ['company_logo_url'],
      documents: ['certificate_urls', 'certificate_url']
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
    table: 'leadership',
    bucketFields: {
      'achievement-images': ['image_url', 'proof_url'],
      'organization-logos': ['organization_logo_url']
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
            const filePath = extractStoragePathFromPublicUrl(String(value), bucketId);
            if (filePath) {
              referencedPaths.add(`${bucketId}:${filePath}`);
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
    previewUrl = await createSignedUrl(filePath, signedUrlExpiresIn);
    previewExpiresIn = signedUrlExpiresIn;
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

const isFolderEntry = (entry = {}) => (
  !entry.id &&
  !entry.metadata &&
  !String(entry.name || '').includes('.')
);

const listBucketFiles = async ({ bucket, prefix = '', depth = 0, maxDepth = 3 }) => {
  const storage = supabase.storage.from(bucket.id);
  const { data, error } = await storage.list(prefix, {
    limit: 100,
    sortBy: { column: 'updated_at', order: 'desc' }
  });

  if (error) {
    throw error;
  }

  const files = [];

  for (const entry of data || []) {
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

const getReferenceRows = async (referenceTables = REFERENCE_TABLES) => {
  const rowsByTable = {};

  await Promise.all(referenceTables.map(async ({ table, bucketFields }) => {
    const columns = Array.from(new Set(
      Object.values(bucketFields)
        .flat()
        .concat(['id'])
    )).join(',');

    const { data, error } = await supabase
      .from(table)
      .select(columns);

    rowsByTable[table] = error ? [] : (data || []);
  }));

  return rowsByTable;
};

export const getMediaLibrarySnapshot = async ({
  buckets = MEDIA_LIBRARY_BUCKETS,
  referenceTables = REFERENCE_TABLES
} = {}) => {
  const rowsByTable = await getReferenceRows(referenceTables);
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
    generatedAt: new Date().toISOString()
  };
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
