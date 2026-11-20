import fs from 'fs';
import path from 'path';
import { supabase } from './supabaseClient';
import {
  collectReferencedMediaPaths,
  createMediaSignedUrl,
  REFERENCE_TABLES,
  createMediaLibraryItem,
  getMediaLibrarySnapshot,
  LIST_PAGE_SIZE,
  PREVIEW_LINK_SECONDS,
  extractStoragePathFromPublicUrl,
  formatFileSize,
  getMediaFileKind
} from './mediaLibraryService';

jest.mock('./supabaseClient', () => ({
  supabase: {
    from: jest.fn(),
    storage: {
      from: jest.fn()
    }
  }
}));

describe('mediaLibraryService helpers', () => {
  it('extracts bucket file paths from Supabase public URLs and raw paths', () => {
    expect(extractStoragePathFromPublicUrl(
      'https://example.supabase.co/storage/v1/object/public/project-images/projects/app/hero.png',
      'project-images'
    )).toBe('projects/app/hero.png');

    expect(extractStoragePathFromPublicUrl(
      'project-images/projects/app/hero.png',
      'project-images'
    )).toBe('projects/app/hero.png');

    expect(extractStoragePathFromPublicUrl(
      'documents/internships/offer.pdf',
      'documents'
    )).toBe('internships/offer.pdf');

    expect(extractStoragePathFromPublicUrl(
      'https://github.com/raunak-choudhary',
      'project-images'
    )).toBe(null);
  });

  it('collects referenced media paths by bucket from portfolio rows', () => {
    const references = collectReferencedMediaPaths({
      projects: [
        {
          image_urls: [
            'https://example.supabase.co/storage/v1/object/public/project-images/projects/app/hero.png'
          ]
        }
      ],
      education: [
        {
          institution_logo_url: 'https://example.supabase.co/storage/v1/object/public/organization-logos/education/nyu.png'
        }
      ],
      contact_messages: [
        {
          attachment_urls: ['contact-attachments/resume.pdf']
        }
      ]
    });

    expect(references.has('project-images:projects/app/hero.png')).toBe(true);
    expect(references.has('organization-logos:education/nyu.png')).toBe(true);
    expect(references.has('contact-attachments:resume.pdf')).toBe(true);
    // the contact form's key keeps the bucket name as a folder inside the bucket
    expect(references.has('contact-attachments:contact-attachments/resume.pdf')).toBe(true);
  });

  it('counts a contact attachment stored under its bucket-named folder as referenced', async () => {
    const references = collectReferencedMediaPaths({
      contact_messages: [{ attachment_urls: ['contact-attachments/contact-1763-0-cv.pdf'] }]
    });
    const item = await createMediaLibraryItem({
      bucket: { id: 'contact-attachments', label: 'Contact Attachments', isPublic: false },
      file: { name: 'contact-1763-0-cv.pdf', metadata: { size: 10 } },
      filePath: 'contact-attachments/contact-1763-0-cv.pdf',
      referencedPaths: references,
      createSignedUrl: async () => 'https://example.com/signed'
    });
    expect(item.status).toBe('referenced');
  });

  it('creates public and private media library items with safe preview metadata', async () => {
    const publicItem = await createMediaLibraryItem({
      bucket: {
        id: 'project-images',
        label: 'Project Images',
        isPublic: true
      },
      file: {
        name: 'hero.png',
        updated_at: '2026-06-01T00:00:00.000Z',
        metadata: {
          mimetype: 'image/png',
          size: 2048
        }
      },
      filePath: 'projects/app/hero.png',
      referencedPaths: new Set(['project-images:projects/app/hero.png']),
      getPublicUrl: () => 'https://example.supabase.co/storage/v1/object/public/project-images/projects/app/hero.png'
    });

    expect(publicItem).toEqual(expect.objectContaining({
      bucketId: 'project-images',
      bucketLabel: 'Project Images',
      path: 'projects/app/hero.png',
      kind: 'image',
      sizeLabel: '2 KB',
      isPrivate: false,
      isReferenced: true,
      previewUrl: 'https://example.supabase.co/storage/v1/object/public/project-images/projects/app/hero.png'
    }));

    const privateItem = await createMediaLibraryItem({
      bucket: {
        id: 'contact-attachments',
        label: 'Contact Attachments',
        isPublic: false
      },
      file: {
        name: 'resume.pdf',
        metadata: {
          mimetype: 'application/pdf',
          size: 1024
        }
      },
      filePath: 'resume.pdf',
      referencedPaths: new Set(),
      createSignedUrl: async () => 'https://example.supabase.co/signed/resume.pdf'
    });

    expect(privateItem).toEqual(expect.objectContaining({
      kind: 'pdf',
      sizeLabel: '1 KB',
      isPrivate: true,
      isReferenced: false,
      previewUrl: 'https://example.supabase.co/signed/resume.pdf',
      previewExpiresIn: 300
    }));
  });

  it('classifies common file types and sizes', () => {
    expect(getMediaFileKind({ name: 'logo.svg', metadata: { mimetype: 'image/svg+xml' } })).toBe('image');
    expect(getMediaFileKind({ name: 'offer.pdf', metadata: { mimetype: 'application/pdf' } })).toBe('pdf');
    expect(getMediaFileKind({ name: 'resume.docx', metadata: {} })).toBe('document');
    expect(getMediaFileKind({ name: 'archive.zip', metadata: {} })).toBe('file');

    expect(formatFileSize(0)).toBe('0 B');
    expect(formatFileSize(1536)).toBe('1.5 KB');
    expect(formatFileSize(1048576)).toBe('1 MB');
  });

  it('signs one private file on demand and surfaces a refusal', async () => {
    const createSignedUrl = jest.fn()
      .mockResolvedValueOnce({ data: { signedUrl: 'https://example.com/fresh' }, error: null })
      .mockResolvedValueOnce({ data: null, error: new Error('Object not found') });
    supabase.storage.from.mockReturnValue({ createSignedUrl });
    await expect(createMediaSignedUrl('contact-attachments', 'contact-attachments/cv.pdf')).resolves.toBe('https://example.com/fresh');
    expect(supabase.storage.from).toHaveBeenCalledWith('contact-attachments');
    expect(createSignedUrl).toHaveBeenCalledWith('contact-attachments/cv.pdf', 300);
    await expect(createMediaSignedUrl('contact-attachments', 'gone.pdf')).rejects.toThrow('Object not found');
  });
});

describe('media references against the real columns', () => {
  // the recorded fixtures hold live rows, so their keys are the tables' columns;
  // contact_messages is not recorded (private), its columns come from the form
  const columnsOf = (table) => {
    if (table === 'contact_messages') return new Set(['attachment_urls', 'attachment_url']);
    const rows = JSON.parse(fs.readFileSync(path.join(__dirname, '../../e2e/fixtures', `${table}.json`), 'utf8'));
    return new Set(rows.flatMap((row) => Object.keys(row)));
  };

  it.each(REFERENCE_TABLES.map((t) => [t.table, t]))('%s names only columns its table has', (table, { bucketFields }) => {
    const columns = columnsOf(table);
    Object.values(bucketFields).flat().forEach((field) => expect([table, field, columns.has(field)]).toEqual([table, field, true]));
  });
});

describe('reading the buckets (deep pass 2026-11-20)', () => {
  const file = (name) => ({ id: `id-${name}`, name, metadata: { size: 10, mimetype: 'image/png' }, updated_at: '2026-11-10T00:00:00Z' });
  const bucket = { id: 'project-images', label: 'Project Images', isPublic: true };
  const privateBucket = { id: 'contact-attachments', label: 'Contact Attachments', isPublic: false };
  const tableOk = () => ({ select: jest.fn().mockResolvedValue({ data: [], error: null }) });

  beforeEach(() => { jest.clearAllMocks(); });

  it('reads a folder page by page until a short page, so nothing past the first 100 is dropped', async () => {
    const full = Array.from({ length: LIST_PAGE_SIZE }, (_, i) => file(`a${String(i).padStart(3, '0')}.png`));
    const list = jest.fn()
      .mockResolvedValueOnce({ data: full, error: null })
      .mockResolvedValueOnce({ data: [file('z1.png'), file('z2.png')], error: null });
    supabase.storage.from.mockReturnValue({ list, getPublicUrl: (p) => ({ data: { publicUrl: `https://example.com/${p}` } }) });
    supabase.from.mockImplementation(tableOk);

    const snap = await getMediaLibrarySnapshot({ buckets: [bucket], referenceTables: [] });
    expect(snap.items).toHaveLength(LIST_PAGE_SIZE + 2);
    expect(list).toHaveBeenCalledTimes(2);
    expect(list.mock.calls[0][1]).toMatchObject({ limit: LIST_PAGE_SIZE, offset: 0 });
    expect(list.mock.calls[1][1]).toMatchObject({ limit: LIST_PAGE_SIZE, offset: LIST_PAGE_SIZE });
  });

  it('walks into a folder whose name has a dot, and lists the file inside', async () => {
    const list = jest.fn((prefix) => Promise.resolve(prefix === ''
      ? { data: [{ id: null, name: 'v1.2', metadata: null }], error: null }
      : { data: [file('inside.png')], error: null }));
    supabase.storage.from.mockReturnValue({ list, getPublicUrl: (p) => ({ data: { publicUrl: `https://example.com/${p}` } }) });
    const snap = await getMediaLibrarySnapshot({ buckets: [bucket], referenceTables: [] });
    expect(snap.items.map((i) => i.path)).toEqual(['v1.2/inside.png']);
  });

  it('keeps a private bucket listed when one file cannot be signed, and signs thumbnails for an hour', async () => {
    const list = jest.fn().mockResolvedValue({ data: [file('ok.png'), file('gone.png')], error: null });
    const createSignedUrl = jest.fn((p) => Promise.resolve(p === 'gone.png'
      ? { data: null, error: new Error('Object not found') }
      : { data: { signedUrl: `https://example.com/signed/${p}` }, error: null }));
    supabase.storage.from.mockReturnValue({ list, createSignedUrl });

    const snap = await getMediaLibrarySnapshot({ buckets: [privateBucket], referenceTables: [] });
    expect(snap.buckets[0]).toMatchObject({ status: 'available', fileCount: 2 });
    expect(snap.items.find((i) => i.name === 'ok.png').previewUrl).toBe('https://example.com/signed/ok.png');
    expect(snap.items.find((i) => i.name === 'gone.png').previewUrl).toBeNull();
    expect(createSignedUrl).toHaveBeenCalledWith('ok.png', PREVIEW_LINK_SECONDS);
    expect(PREVIEW_LINK_SECONDS).toBe(3600);
  });

  it('names the tables it could not read instead of treating them as empty', async () => {
    supabase.storage.from.mockReturnValue({ list: jest.fn().mockResolvedValue({ data: [], error: null }) });
    supabase.from.mockImplementation((table) => ({ select: jest.fn().mockResolvedValue(table === 'skills' ? { data: null, error: { message: 'denied' } } : { data: [], error: null }) }));
    const snap = await getMediaLibrarySnapshot({
      buckets: [bucket],
      referenceTables: [{ table: 'projects', bucketFields: { 'project-images': ['image_urls'] } }, { table: 'skills', bucketFields: { 'skill-icons': ['icon_url'] } }],
    });
    expect(snap.referenceErrors).toEqual(['skills']);
  });
});
