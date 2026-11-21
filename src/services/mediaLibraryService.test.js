import fs from 'fs';
import path from 'path';
import { supabase } from './supabaseClient';
import {
  collectReferences,
  collectReferencedMediaPaths,
  deleteMediaFiles,
  isSafeStoragePath,
  LIST_MAX_DEPTH,
  MEDIA_LIBRARY_BUCKETS,
  readReferences,
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
    if (table === 'contact_messages') return new Set(['id', 'subject', 'attachment_urls', 'attachment_url']);
    const rows = JSON.parse(fs.readFileSync(path.join(__dirname, '../../e2e/fixtures', `${table}.json`), 'utf8'));
    return new Set(rows.flatMap((row) => Object.keys(row)));
  };

  it.each(REFERENCE_TABLES.map((t) => [t.table, t]))('%s names only columns its table has', (table, { bucketFields, titleFields = [], fieldLabels = {} }) => {
    const columns = columnsOf(table);
    Object.values(bucketFields).flat().concat(titleFields).forEach((field) => expect([table, field, columns.has(field)]).toEqual([table, field, true]));
    // every file column has a plain-words label for the library's rows
    Object.values(bucketFields).flat().forEach((field) => expect([table, field, typeof fieldLabels[field]]).toEqual([table, field, 'string']));
  });

  it('lists the sections in chapter order, each with a name', () => {
    expect(REFERENCE_TABLES.map((t) => t.section)).toEqual(['Hero', 'About', 'Projects', 'Internships', 'Education', 'Work experience', 'Skills', 'Certifications', 'Recommendations', 'Achievements', 'Inbox']);
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

describe('references for the Files pop-up', () => {
  const PUBLIC = 'https://example.supabase.co/storage/v1/object/public';
  const tables = REFERENCE_TABLES;

  it('names the entry, section and field behind every file value, with its place in the field', () => {
    const refs = collectReferences({
      projects: [{ id: 'p1', title: 'LoRA Fine-Tuning', image_urls: [`${PUBLIC}/project-images/lora/a.png`, `${PUBLIC}/project-images/lora/b.png`] }],
      internships: [{ id: 'i1', title: 'ML intern', company: 'Verzeo', company_logo_url: `${PUBLIC}/organization-logos/verzeo.png`, certificate_urls: [] }],
      hero_content: [{ id: 'h1', resume_url: `${PUBLIC}/documents/resume.pdf` }],
    }, tables);
    expect(refs.find((r) => r.path === 'lora/b.png')).toMatchObject({
      keys: ['project-images:lora/b.png'], bucketId: 'project-images', table: 'projects', section: 'Projects', rowId: 'p1',
      title: 'LoRA Fine-Tuning', field: 'image_urls', fieldLabel: 'Images', position: 2, count: 2, explicit: true,
    });
    expect(refs.find((r) => r.table === 'internships')).toMatchObject({ title: 'ML intern · Verzeo', fieldLabel: 'Company logo', section: 'Internships' });
    // the hero has no title of its own: the field names the entry
    expect(refs.find((r) => r.table === 'hero_content')).toMatchObject({ title: 'Resume', section: 'Hero' });
  });

  it('falls back to "Untitled entry" and keeps a bare relative value as a non-explicit reference', () => {
    const refs = collectReferences({ skills: [{ id: 's1', skill_name: '  ', icon_url: 'python.svg', certifications: null }] }, tables);
    expect(refs).toHaveLength(1);
    expect(refs[0]).toMatchObject({ title: 'Untitled entry', keys: ['skill-icons:python.svg'], explicit: false });
  });

  it('records both readings of a bucket-prefixed contact attachment', () => {
    const [ref] = collectReferences({ contact_messages: [{ id: 'm1', subject: 'Hi', attachment_urls: ['contact-attachments/contact-1-cv.pdf'] }] }, tables);
    expect(ref.keys).toEqual(['contact-attachments:contact-1-cv.pdf', 'contact-attachments:contact-attachments/contact-1-cv.pdf']);
    expect(ref).toMatchObject({ section: 'Inbox', title: 'Hi', explicit: true });
  });

  it('ignores values that are not files in that bucket', () => {
    const refs = collectReferences({ projects: [{ id: 'p1', title: 'X', image_urls: ['https://github.com/someone/x.png', '', null] }] }, tables);
    expect(refs).toEqual([]);
  });
});

describe('reading references again before a deletion', () => {
  beforeEach(() => { jest.clearAllMocks(); });

  it('returns the references and no failures when every table reads', async () => {
    supabase.from.mockImplementation(() => ({ select: jest.fn().mockResolvedValue({ data: [{ id: 'p1', title: 'X', image_urls: ['project-images/a.png'] }], error: null }) }));
    const fresh = await readReferences([REFERENCE_TABLES.find((t) => t.table === 'projects')]);
    expect(fresh.failedTables).toEqual([]);
    expect(fresh.references.map((r) => r.keys[0])).toEqual(['project-images:a.png']);
  });

  it('names the failed sections in plain words', async () => {
    supabase.from.mockImplementation((table) => ({ select: jest.fn().mockResolvedValue(table === 'skills' ? { data: null, error: { message: 'denied' } } : { data: [], error: null }) }));
    const fresh = await readReferences(REFERENCE_TABLES);
    expect(fresh.failedTables).toEqual(['skills']);
    expect(fresh.failedSections).toEqual(['Skills']);
  });

  it('asks for the title columns with the file columns', async () => {
    const select = jest.fn().mockResolvedValue({ data: [], error: null });
    supabase.from.mockImplementation(() => ({ select }));
    await readReferences([REFERENCE_TABLES.find((t) => t.table === 'internships')]);
    expect(select.mock.calls[0][0].split(',').sort()).toEqual(['certificate_urls', 'company', 'company_logo_url', 'id', 'title']);
  });
});

describe('listing completeness', () => {
  const folder = (name) => ({ id: null, name, metadata: null });
  const file = (name) => ({ id: `id-${name}`, name, metadata: { size: 1 }, updated_at: '2026-11-10T00:00:00Z' });
  const bucket = { id: 'project-images', label: 'Project images', isPublic: true };
  beforeEach(() => { jest.clearAllMocks(); });

  it('marks a bucket complete when the walk reaches every folder', async () => {
    const list = jest.fn((prefix) => Promise.resolve({ data: prefix === '' ? [folder('a'), file('top.png')] : [file('in.png')], error: null }));
    supabase.storage.from.mockReturnValue({ list, getPublicUrl: (p) => ({ data: { publicUrl: `https://example.com/${p}` } }) });
    const snap = await getMediaLibrarySnapshot({ buckets: [bucket], referenceTables: [] });
    expect(snap.buckets[0]).toMatchObject({ status: 'available', complete: true });
    expect(snap.items.map((i) => i.path).sort()).toEqual(['a/in.png', 'top.png']);
  });

  it('marks a bucket incomplete when a folder sits deeper than the walk goes, and never lists the folder as a file', async () => {
    // every folder holds one more folder, forever
    const list = jest.fn(() => Promise.resolve({ data: [folder('deeper')], error: null }));
    supabase.storage.from.mockReturnValue({ list, getPublicUrl: (p) => ({ data: { publicUrl: `https://example.com/${p}` } }) });
    const snap = await getMediaLibrarySnapshot({ buckets: [bucket], referenceTables: [] });
    expect(snap.buckets[0].complete).toBe(false);
    expect(snap.items).toEqual([]);
    expect(list).toHaveBeenCalledTimes(LIST_MAX_DEPTH + 1);
  });

  it('marks a failed bucket incomplete and carries the references and failed sections', async () => {
    supabase.storage.from.mockReturnValue({ list: jest.fn().mockResolvedValue({ data: null, error: { message: 'down' } }) });
    supabase.from.mockImplementation((table) => ({ select: jest.fn().mockResolvedValue(table === 'projects' ? { data: [{ id: 'p1', title: 'X', image_urls: ['project-images/a.png'] }], error: null } : { data: null, error: { message: 'no' } }) }));
    const snap = await getMediaLibrarySnapshot({ buckets: [bucket], referenceTables: REFERENCE_TABLES.filter((t) => ['projects', 'education'].includes(t.table)) });
    expect(snap.buckets[0]).toMatchObject({ status: 'error', complete: false });
    expect(snap.references).toHaveLength(1);
    expect(snap.referenceErrors).toEqual(['education']);
    expect(snap.referenceErrorSections).toEqual(['Education']);
  });
});

describe('safe storage paths', () => {
  it.each([
    ['a.png', true], ['folder/sub/a b (1).pdf', true], ['contact-attachments/x.pdf', true],
    ['', false], ['/abs.png', false], ['../up.png', false], ['a/../b.png', false], ['a/./b.png', false], ['a//b.png', false],
    ['a\\b.png', false], ['a\u0000b.png', false], ['line\nbreak.png', false], [null, false], [42, false],
  ])('%p is %p', (value, expected) => {
    expect(isSafeStoragePath(value)).toBe(expected);
  });

  it('refuses a path longer than storage allows', () => {
    expect(isSafeStoragePath('x'.repeat(1024))).toBe(true);
    expect(isSafeStoragePath('x'.repeat(1025))).toBe(false);
  });
});

describe('deleting files', () => {
  const f = (bucketId, path) => ({ id: `${bucketId}:${path}`, bucketId, path, name: path.split('/').pop() });
  let remove;
  beforeEach(() => {
    jest.clearAllMocks();
    remove = jest.fn((paths) => Promise.resolve({ data: paths.map((name) => ({ name })), error: null }));
    supabase.storage.from.mockReturnValue({ remove });
  });

  it('removes listed files per bucket and reports each one deleted', async () => {
    const files = [f('project-images', 'a.png'), f('project-images', 'b/c.png'), f('documents', 'cv.pdf')];
    const result = await deleteMediaFiles(files, { listedIds: new Set(files.map((x) => x.id)) });
    expect(result.deleted.map((x) => x.id)).toEqual(files.map((x) => x.id));
    expect(result.failed).toEqual([]);
    expect(supabase.storage.from).toHaveBeenCalledWith('project-images');
    expect(supabase.storage.from).toHaveBeenCalledWith('documents');
    expect(remove).toHaveBeenCalledWith(['a.png', 'b/c.png']);
    expect(remove).toHaveBeenCalledWith(['cv.pdf']);
  });

  it('never sends a file that is not in the listing, in an unknown bucket, with an unsafe path or a mismatched id', async () => {
    const listed = f('project-images', 'ok.png');
    const unlisted = f('project-images', 'not-listed.png');
    const unknownBucket = f('secrets', 'a.png');
    const unsafe = f('project-images', '../etc/passwd');
    const mismatched = { ...f('project-images', 'x.png'), path: 'y.png' };
    const listedIds = new Set([listed.id, unknownBucket.id, unsafe.id, mismatched.id]);
    const result = await deleteMediaFiles([listed, unlisted, unknownBucket, unsafe, mismatched], { listedIds });
    expect(result.deleted).toEqual([listed]);
    expect(result.failed).toEqual([unlisted, unknownBucket, unsafe, mismatched]);
    expect(remove).toHaveBeenCalledTimes(1);
    expect(remove).toHaveBeenCalledWith(['ok.png']);
  });

  it('sends nothing without a listing to check against', async () => {
    const result = await deleteMediaFiles([f('project-images', 'a.png')], {});
    expect(result.failed).toHaveLength(1);
    expect(remove).not.toHaveBeenCalled();
  });

  it('counts a silently refused removal as not deleted', async () => {
    remove.mockResolvedValue({ data: [], error: null });
    const file = f('documents', 'cv.pdf');
    const result = await deleteMediaFiles([file], { listedIds: new Set([file.id]) });
    expect(result).toEqual({ deleted: [], failed: [file] });
  });

  it('keeps going after one bucket fails', async () => {
    supabase.storage.from.mockImplementation((bucketId) => ({ remove: bucketId === 'documents' ? jest.fn().mockRejectedValue(new Error('offline')) : remove }));
    const a = f('project-images', 'a.png'), b = f('documents', 'b.pdf');
    const result = await deleteMediaFiles([a, b], { listedIds: new Set([a.id, b.id]) });
    expect(result).toEqual({ deleted: [a], failed: [b] });
  });

  it('knows exactly the library buckets', () => {
    expect(MEDIA_LIBRARY_BUCKETS.map((b) => b.id)).toEqual(['project-images', 'profile-images', 'organization-logos', 'certification-badges', 'achievement-images', 'skill-icons', 'documents', 'contact-attachments']);
  });
});
