import {
  buildAdminStoragePath,
  createContactAttachmentSignedUrl,
  extractPublicStoragePath,
  extractPublicStoragePaths,
  getAdminSupabaseClient,
  normalizeContactAttachments,
  removeAdminStorageFiles,
  sanitizeStorageSegment,
  saveAdminData,
  triggerPublicRefresh,
  uploadAdminPublicFile
} from './adminDataService';
import { supabase } from './supabaseClient';

jest.mock('./supabaseClient', () => ({
  supabase: {
    from: jest.fn(),
    storage: {
      from: jest.fn()
    }
  }
}));

const createQueryBuilder = (singleResult) => ({
  update: jest.fn().mockReturnThis(),
  insert: jest.fn().mockReturnThis(),
  eq: jest.fn().mockReturnThis(),
  select: jest.fn().mockReturnThis(),
  single: jest.fn().mockResolvedValue(singleResult)
});

describe('adminDataService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  it('updates existing admin data through the shared Supabase client', async () => {
    const updatedRecord = { id: 'hero-1', title: 'Updated hero' };
    const queryBuilder = createQueryBuilder({ data: updatedRecord, error: null });
    supabase.from.mockReturnValue(queryBuilder);

    const result = await saveAdminData('hero_content', { title: 'Updated hero' }, 'hero-1');

    expect(supabase.from).toHaveBeenCalledWith('hero_content');
    expect(queryBuilder.update).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Updated hero',
      updated_at: expect.any(String)
    }));
    expect(queryBuilder.eq).toHaveBeenCalledWith('id', 'hero-1');
    expect(result).toEqual({ success: true, data: updatedRecord });
  });

  it('inserts new admin data through the shared Supabase client', async () => {
    const newRecord = { id: 'project-1', title: 'New project' };
    const queryBuilder = createQueryBuilder({ data: newRecord, error: null });
    supabase.from.mockReturnValue(queryBuilder);

    const result = await saveAdminData('projects', { title: 'New project' });

    expect(supabase.from).toHaveBeenCalledWith('projects');
    expect(queryBuilder.insert).toHaveBeenCalledWith([{ title: 'New project' }]);
    expect(result).toEqual({ success: true, data: newRecord });
  });

  it('emits immediate and delayed refresh events after admin data changes', () => {
    const dispatchSpy = jest.spyOn(window, 'dispatchEvent').mockImplementation(() => true);

    triggerPublicRefresh('projects');
    jest.runOnlyPendingTimers();

    expect(dispatchSpy).toHaveBeenCalledTimes(2);
    expect(dispatchSpy.mock.calls[0][0].type).toBe('adminDataChange');
    expect(dispatchSpy.mock.calls[0][0].detail.table).toBe('projects');
    expect(dispatchSpy.mock.calls[1][0].type).toBe('portfolioDataUpdated');
    expect(dispatchSpy.mock.calls[1][0].detail.table).toBe('projects');

    dispatchSpy.mockRestore();
  });

  it('returns the shared Supabase singleton for admin operations', () => {
    expect(getAdminSupabaseClient()).toBe(supabase);
  });

  it('sanitizes storage path segments safely', () => {
    expect(sanitizeStorageSegment('New York University!')).toBe('new-york-university');
    expect(sanitizeStorageSegment('  NYU / Tandon  ')).toBe('nyu-tandon');
    expect(sanitizeStorageSegment('')).toBe('file');
  });

  it('builds stable admin storage paths', () => {
    const file = { name: 'Logo.PNG' };

    expect(buildAdminStoragePath({
      folder: 'education',
      entityName: 'New York University',
      label: 'logo',
      file,
      timestamp: 123
    })).toBe('education/new-york-university-logo-123.png');
  });

  it('uploads a public admin file and returns its public URL and storage path', async () => {
    const upload = jest.fn().mockResolvedValue({ error: null });
    const getPublicUrl = jest.fn().mockReturnValue({
      data: {
        publicUrl: 'https://example.supabase.co/storage/v1/object/public/organization-logos/education/logo.png'
      }
    });
    supabase.storage.from.mockReturnValue({ upload, getPublicUrl });

    const file = { name: 'logo.png', type: 'image/png' };
    const result = await uploadAdminPublicFile({
      bucket: 'organization-logos',
      filePath: 'education/logo.png',
      file,
      cacheControl: '7200',
      upsert: true
    });

    expect(supabase.storage.from).toHaveBeenCalledWith('organization-logos');
    expect(upload).toHaveBeenCalledWith('education/logo.png', file, {
      cacheControl: '7200',
      upsert: true
    });
    expect(getPublicUrl).toHaveBeenCalledWith('education/logo.png');
    expect(result).toEqual({
      success: true,
      bucket: 'organization-logos',
      filePath: 'education/logo.png',
      publicUrl: 'https://example.supabase.co/storage/v1/object/public/organization-logos/education/logo.png'
    });
  });

  it('extracts storage paths from public URLs and bucket-prefixed values', () => {
    expect(extractPublicStoragePath(
      'https://example.supabase.co/storage/v1/object/public/project-images/projects/app/hero%20image.png?t=123',
      'project-images'
    )).toBe('projects/app/hero image.png');

    expect(extractPublicStoragePath(
      'project-images/projects/app/hero.png',
      'project-images'
    )).toBe('projects/app/hero.png');

    expect(extractPublicStoragePath(
      'projects/app/hero.png',
      'project-images'
    )).toBe('projects/app/hero.png');
  });

  it('does not extract paths from external URLs or empty values', () => {
    expect(extractPublicStoragePath(
      'https://cdn.example.com/project-images/projects/app/hero.png',
      'project-images'
    )).toBeNull();

    expect(extractPublicStoragePath('', 'project-images')).toBeNull();
    expect(extractPublicStoragePath(null, 'project-images')).toBeNull();
  });

  it('deduplicates extracted storage paths', () => {
    expect(extractPublicStoragePaths([
      'https://example.supabase.co/storage/v1/object/public/skill-icons/icons/react.png',
      'skill-icons/icons/react.png',
      '',
      'https://cdn.example.com/icons/react.png'
    ], 'skill-icons')).toEqual(['icons/react.png']);
  });

  it('removes admin storage files using extracted paths', async () => {
    const remove = jest.fn().mockResolvedValue({ data: [{ name: 'react.png' }], error: null });
    supabase.storage.from.mockReturnValue({ remove });

    const result = await removeAdminStorageFiles('skill-icons', [
      'https://example.supabase.co/storage/v1/object/public/skill-icons/icons/react.png',
      'skill-icons/certs/react.pdf',
      null
    ]);

    expect(supabase.storage.from).toHaveBeenCalledWith('skill-icons');
    expect(remove).toHaveBeenCalledWith(['icons/react.png', 'certs/react.pdf']);
    expect(result).toEqual({
      success: true,
      bucket: 'skill-icons',
      filePaths: ['icons/react.png', 'certs/react.pdf'],
      data: [{ name: 'react.png' }]
    });
  });

  it('skips storage removal when no owned paths can be extracted', async () => {
    const result = await removeAdminStorageFiles('skill-icons', [
      'https://cdn.example.com/icons/react.png',
      ''
    ]);

    expect(supabase.storage.from).not.toHaveBeenCalled();
    expect(result).toEqual({
      success: true,
      bucket: 'skill-icons',
      filePaths: [],
      skipped: true
    });
  });

  it('normalizes array-based contact attachments', () => {
    expect(normalizeContactAttachments({
      attachment_urls: ['contact-attachments/contact-a.pdf', 'contact-attachments/contact-b.pdf'],
      attachment_names: ['A.pdf', 'B.pdf']
    })).toEqual([
      {
        key: '0-contact-attachments/contact-a.pdf',
        path: 'contact-attachments/contact-a.pdf',
        name: 'A.pdf',
        size: null
      },
      {
        key: '1-contact-attachments/contact-b.pdf',
        path: 'contact-attachments/contact-b.pdf',
        name: 'B.pdf',
        size: null
      }
    ]);
  });

  it('normalizes legacy contact attachment fields', () => {
    expect(normalizeContactAttachments({
      attachment_url: 'contact-attachments/contact-resume.pdf',
      attachment_name: 'resume.pdf',
      attachment_size: 1234
    })).toEqual([
      {
        key: '0-contact-attachments/contact-resume.pdf',
        path: 'contact-attachments/contact-resume.pdf',
        name: 'resume.pdf',
        size: 1234
      }
    ]);
  });

  it('creates signed URLs for private contact attachments', async () => {
    const createSignedUrl = jest.fn().mockResolvedValue({
      data: {
        signedUrl: 'https://example.supabase.co/signed/contact-resume.pdf'
      },
      error: null
    });
    supabase.storage.from.mockReturnValue({ createSignedUrl });

    const result = await createContactAttachmentSignedUrl(
      'contact-attachments/contact-resume.pdf',
      600
    );

    expect(supabase.storage.from).toHaveBeenCalledWith('contact-attachments');
    expect(createSignedUrl).toHaveBeenCalledWith('contact-attachments/contact-resume.pdf', 600);
    expect(result).toEqual({
      success: true,
      filePath: 'contact-attachments/contact-resume.pdf',
      signedUrl: 'https://example.supabase.co/signed/contact-resume.pdf',
      expiresIn: 600
    });
  });

  it('rejects empty contact attachment paths before signing', async () => {
    await expect(createContactAttachmentSignedUrl('')).rejects.toThrow('Attachment path is required');
  });
});

describe('describeAdminWriteError', () => {
  // Imported lazily so the existing mocks above stay untouched.
  const { describeAdminWriteError } = require('./adminDataService');

  it('reads an expired or invalid token as a session problem', () => {
    expect(describeAdminWriteError({ status: 401, message: 'JWT expired' }).code).toBe('SESSION_EXPIRED');
    expect(describeAdminWriteError({ message: 'invalid claim: missing sub' }).code).toBe('SESSION_EXPIRED');
  });

  it('reads a policy refusal as the second factor being required', () => {
    expect(describeAdminWriteError({ code: '42501', message: 'permission denied for table projects' }).code).toBe('SECOND_FACTOR_REQUIRED');
    expect(describeAdminWriteError({ status: 403, message: 'forbidden' }).code).toBe('SECOND_FACTOR_REQUIRED');
    expect(describeAdminWriteError({ message: 'new row violates row-level security policy' }).code).toBe('SECOND_FACTOR_REQUIRED');
  });

  it('passes other errors through with their own message', () => {
    expect(describeAdminWriteError({ status: 500, message: 'boom' })).toEqual({ code: 'WRITE_FAILED', message: 'boom' });
    expect(describeAdminWriteError(undefined).code).toBe('WRITE_FAILED');
  });
});
