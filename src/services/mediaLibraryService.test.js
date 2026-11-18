import { supabase } from './supabaseClient';
import {
  collectReferencedMediaPaths,
  createMediaSignedUrl,
  createMediaLibraryItem,
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
