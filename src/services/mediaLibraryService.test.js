import {
  collectReferencedMediaPaths,
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
});
