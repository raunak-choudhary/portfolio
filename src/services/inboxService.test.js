import { ATTACHMENT_BUCKET, deleteMessages, listMessages, signedAttachmentUrl, updateMessages } from './inboxService';
import { patchFor } from '../components/admin/Voyage/inboxModel';

// The real describeAdminWriteError is kept (it is pure); only the client is faked.
// The Supabase client module needs env at import, so it is stubbed first.
jest.mock('./supabaseClient', () => ({ supabase: {} }));
jest.mock('./adminDataService', () => {
  const actual = jest.requireActual('./adminDataService');
  return { describeAdminWriteError: actual.describeAdminWriteError, getAdminSupabaseClient: jest.fn(), createContactAttachmentSignedUrl: jest.fn() };
});
const adminData = jest.requireMock('./adminDataService');

/**
 * A chainable stand-in for the Supabase query builder. Each terminal call
 * resolves with the next queued answer for that table; every call is logged.
 */
function fakeClient({ rows = [], storage = [] } = {}) {
  const calls = [];
  const queue = [...rows];
  const builder = (table) => {
    const q = { table, ops: [] };
    calls.push(q);
    const chain = new Proxy({}, {
      get(_, op) {
        if (op === 'then') { const answer = queue.shift() ?? { data: [], error: null }; return (res, rej) => Promise.resolve(answer).then(res, rej); }
        return (...args) => { q.ops.push([op, ...args]); return chain; };
      },
    });
    return chain;
  };
  const storageQueue = [...storage];
  const removed = [];
  return {
    calls,
    removed,
    from: jest.fn(builder),
    storage: { from: jest.fn((bucket) => ({ remove: jest.fn((paths) => { removed.push({ bucket, paths }); return Promise.resolve(storageQueue.shift() ?? { data: paths.map((name) => ({ name })), error: null }); }) })) },
  };
}

const withFiles = { id: 'm1', attachment_urls: ['contact-attachments/contact-1-0-cv.pdf', 'contact-attachments/contact-1-1-a.png'], attachment_names: ['cv.pdf', 'a.png'] };
const plain = { id: 'm2', attachment_urls: [] };

describe('inboxService', () => {
  let client;
  const use = (c) => { client = c; adminData.getAdminSupabaseClient.mockReturnValue(c); };

  it('lists every message newest first', async () => {
    use(fakeClient({ rows: [{ data: [{ id: 'm1' }], error: null }] }));
    await expect(listMessages()).resolves.toEqual([{ id: 'm1' }]);
    expect(client.calls[0].ops).toEqual([['select', '*'], ['order', 'created_at', { ascending: false }]]);
  });

  it('types a failed load so the view can explain it', async () => {
    use(fakeClient({ rows: [{ data: null, error: { status: 401, message: 'JWT expired' } }] }));
    await expect(listMessages()).rejects.toMatchObject({ code: 'SESSION_EXPIRED' });
  });

  it.each(['read', 'unread', 'star', 'unstar', 'archive', 'unarchive', 'spam', 'notSpam'])('sends the %s patch with a fresh updated_at to every id', async (action) => {
    use(fakeClient({ rows: [{ data: [{ id: 'm1' }, { id: 'm2' }], error: null }] }));
    const patch = patchFor(action, { now: '2026-11-18T12:00:00.000Z' });
    await updateMessages(['m1', 'm2'], patch);
    const [update, inIds, select] = client.calls[0].ops;
    expect(update[0]).toBe('update');
    expect(update[1]).toEqual({ ...patch, updated_at: expect.any(String) });
    expect(inIds).toEqual(['in', 'id', ['m1', 'm2']]);
    expect(select).toEqual(['select']);
  });

  it('sends priority and notes patches unchanged', async () => {
    use(fakeClient({ rows: [{ data: [{ id: 'm1' }], error: null }, { data: [{ id: 'm1' }], error: null }] }));
    await updateMessages(['m1'], patchFor('priority', { value: 'high' }));
    await updateMessages(['m1'], patchFor('notes', { value: 'Call back' }));
    expect(client.calls[0].ops[0][1]).toMatchObject({ priority: 'high' });
    expect(client.calls[1].ops[0][1]).toMatchObject({ admin_notes: 'Call back' });
  });

  it('treats an update that changed no rows as refused, since RLS hides refusals that way', async () => {
    use(fakeClient({ rows: [{ data: [], error: null }] }));
    await expect(updateMessages(['m1'], { is_starred: true })).rejects.toMatchObject({ code: 'SECOND_FACTOR_REQUIRED' });
  });

  it('does not call the server for an empty selection', async () => {
    use(fakeClient());
    await expect(updateMessages([], { is_starred: true })).resolves.toEqual([]);
    expect(client.calls).toHaveLength(0);
  });

  it('removes attachments by their raw stored paths before deleting the rows', async () => {
    use(fakeClient({ rows: [{ data: [{ id: 'm1' }, { id: 'm2' }], error: null }] }));
    const result = await deleteMessages([withFiles, plain]);
    // the bucket prefix stays: the objects really live under contact-attachments/ inside the bucket
    expect(client.removed).toEqual([{ bucket: ATTACHMENT_BUCKET, paths: withFiles.attachment_urls }]);
    expect(client.calls[0].ops).toEqual([['delete'], ['in', 'id', ['m1', 'm2']], ['select', 'id']]);
    expect(result).toEqual({ deletedIds: ['m1', 'm2'], filesRemoved: 2, filesExpected: 2 });
  });

  it('skips storage when no message carries files', async () => {
    use(fakeClient({ rows: [{ data: [{ id: 'm2' }], error: null }] }));
    await expect(deleteMessages([plain])).resolves.toEqual({ deletedIds: ['m2'], filesRemoved: 0, filesExpected: 0 });
    expect(client.removed).toEqual([]);
  });

  it('deletes nothing when the files cannot be removed', async () => {
    use(fakeClient({ storage: [{ data: null, error: { message: 'Bucket unavailable' } }] }));
    await expect(deleteMessages([withFiles])).rejects.toMatchObject({ message: 'The attachments could not be removed, so nothing was deleted.', filesRemoved: false });
    expect(client.calls).toHaveLength(0);
  });

  it('says the files are gone when the row delete fails after them', async () => {
    use(fakeClient({ rows: [{ data: null, error: { message: 'permission denied for table contact_messages' } }] }));
    const err = await deleteMessages([withFiles]).catch((e) => e);
    expect(err.filesRemoved).toBe(true);
    expect(err.code).toBe('SECOND_FACTOR_REQUIRED');
    expect(err.message).toMatch(/^The attachments were removed, but the message could not be deleted\./);
  });

  it('treats a delete that removed no rows as refused', async () => {
    use(fakeClient({ rows: [{ data: [], error: null }] }));
    await expect(deleteMessages([plain])).rejects.toMatchObject({ code: 'SECOND_FACTOR_REQUIRED' });
  });

  it('signs an attachment for five minutes', async () => {
    adminData.createContactAttachmentSignedUrl.mockResolvedValue({ signedUrl: 'https://example.com/signed' });
    await expect(signedAttachmentUrl('contact-attachments/x.pdf')).resolves.toBe('https://example.com/signed');
    expect(adminData.createContactAttachmentSignedUrl).toHaveBeenCalledWith('contact-attachments/x.pdf', 300);
  });
});
