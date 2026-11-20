// deleteProject removes the row first and its files second, so a refused or
// failed delete never leaves a live project pointing at files that are gone.

import { deleteProject } from './dataService';

jest.mock('./supabaseClient', () => ({ supabase: { from: jest.fn(), storage: { from: jest.fn() } } }));
jest.mock('./authService', () => ({ requireAdminAuth: jest.fn() }));
jest.mock('./adminDataService', () => ({ extractPublicStoragePaths: jest.fn(), removeAdminStorageFiles: jest.fn() }));

const { supabase } = jest.requireMock('./supabaseClient');
const auth = jest.requireMock('./authService');
const MARKER = 'https://x.supabase.co/storage/v1/object/public/project-images/';

/** Wires the fake client: the row read, the delete answer, and a recording storage bucket. */
function wire({ info, removed = [{ id: 'p1' }], deleteError = null, folder = [], readError = null }) {
  const order = [];
  supabase.from.mockImplementation(() => ({
    select: () => ({ eq: () => ({ maybeSingle: async () => (readError ? { data: null, error: readError } : { data: info, error: null }) }) }),
    delete: () => ({ eq: () => ({ select: async () => { order.push('row'); return { data: removed, error: deleteError }; } }) }),
  }));
  const bucket = {
    remove: jest.fn(async (paths) => { order.push(`files:${paths.join(',')}`); return { error: null }; }),
    list: jest.fn(async () => ({ data: folder })),
  };
  supabase.storage.from.mockReturnValue(bucket);
  return { order, bucket };
}

describe('deleteProject', () => {
  let errorSpy, logSpy, warnSpy;
  beforeEach(() => {
    auth.requireAdminAuth.mockResolvedValue({ success: true });
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => { errorSpy.mockRestore(); logSpy.mockRestore(); warnSpy.mockRestore(); });

  it('deletes the row, then the listed files, then whatever is left in the project folder, and prints nothing', async () => {
    const { order, bucket } = wire({ info: { title: 'T', image_urls: [`${MARKER}projects/p1/a.png`, 'https://elsewhere.example/b.png'] }, folder: [{ name: 'stray.png' }] });
    await expect(deleteProject('p1')).resolves.toMatchObject({ success: true, data: { id: 'p1', title: 'T' } });
    expect(order).toEqual(['row', 'files:projects/p1/a.png', 'files:projects/p1/stray.png']);
    expect(bucket.list).toHaveBeenCalledWith('projects/p1');
    expect(errorSpy).not.toHaveBeenCalled(); expect(logSpy).not.toHaveBeenCalled(); expect(warnSpy).not.toHaveBeenCalled();
  });

  it('sweeps the folder even when the row names no image', async () => {
    const { order } = wire({ info: { title: 'T', image_urls: [] }, folder: [{ name: 'never-listed.png' }] });
    await deleteProject('p1');
    expect(order).toEqual(['row', 'files:projects/p1/never-listed.png']);
  });

  it('keeps every file when the row delete fails or is refused', async () => {
    let wired = wire({ info: { title: 'T', image_urls: [`${MARKER}projects/p1/a.png`] }, deleteError: { message: 'boom' } });
    await expect(deleteProject('p1')).resolves.toMatchObject({ success: false, error: 'Failed to delete project: boom' });
    expect(wired.bucket.remove).not.toHaveBeenCalled();
    // row level security: no error, no row removed, and the row is still there
    wired = wire({ info: { title: 'T', image_urls: [`${MARKER}projects/p1/a.png`] }, removed: [] });
    await expect(deleteProject('p1')).resolves.toMatchObject({ success: false });
    expect(wired.bucket.remove).not.toHaveBeenCalled();
  });

  it('still succeeds when the storage cleanup throws, and refuses without a session or an id', async () => {
    const { bucket } = wire({ info: { title: 'T', image_urls: [`${MARKER}projects/p1/a.png`] } });
    bucket.remove.mockRejectedValue(new Error('storage down'));
    await expect(deleteProject('p1')).resolves.toMatchObject({ success: true });
    await expect(deleteProject('')).resolves.toMatchObject({ success: false, error: 'Project ID is required' });
    auth.requireAdminAuth.mockResolvedValue({ success: false });
    await expect(deleteProject('p1')).resolves.toMatchObject({ success: false, error: 'Authentication required' });
  });

  it('does not report a delete when nothing was removed and the row cannot be looked up', async () => {
    // the first read failed too, so "no row came back" proves nothing: refused and already-gone look alike
    const { bucket } = wire({ info: null, removed: [], readError: { message: 'offline' } });
    await expect(deleteProject('p1')).resolves.toMatchObject({ success: false, error: 'Failed to delete project: the delete was refused' });
    expect(bucket.remove).not.toHaveBeenCalled();
  });
});
