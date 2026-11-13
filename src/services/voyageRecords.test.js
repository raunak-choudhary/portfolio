import { IMAGE_MAX_BYTES, deleteRecord, imageProblem, listRecords, removeImage, reorderRecords, saveRecord, uploadImages } from './voyageRecords';
// jest.mock is hoisted above the import by babel-jest, so the service sees the mocks
jest.mock('./adminDataService', () => ({ getAdminSupabaseClient: jest.fn(), removeAdminStorageFiles: jest.fn(), saveAdminData: jest.fn(), uploadAdminPublicFile: jest.fn() }));
jest.mock('./dataService', () => ({ deleteProject: jest.fn() }));

const admin = jest.requireMock('./adminDataService');
const data = jest.requireMock('./dataService');
const schema = { table: 'projects', singular: 'project', orderKey: 'order_index', images: { bucket: 'project-images', folder: 'projects', max: 10 } };
const other = { table: 'skills', singular: 'skill', orderKey: 'order_index' };

/** A chainable fake of the parts of the Supabase query builder the service touches. */
function fakeClient({ rows = [], error = null } = {}) {
  const calls = [];
  const chain = (table) => {
    const q = { table, ops: [] };
    const self = new Proxy(q, { get(t, p) {
      if (p === 'then') return (resolve) => resolve({ data: rows, error });
      if (p === 'table' || p === 'ops') return t[p];
      return (...args) => { t.ops.push([p, ...args]); return self; };
    } });
    calls.push(q);
    return self;
  };
  return { from: (table) => chain(table), calls };
}

beforeEach(() => { jest.resetAllMocks(); });

it('lists rows newest order first', async () => {
  const client = fakeClient({ rows: [{ id: 'a' }] });
  admin.getAdminSupabaseClient.mockReturnValue(client);
  await expect(listRecords(schema)).resolves.toEqual([{ id: 'a' }]);
  expect(client.calls[0].table).toBe('projects');
  expect(client.calls[0].ops).toEqual([['select', '*'], ['order', 'order_index', { ascending: false }], ['order', 'created_at', { ascending: false }]]);
  admin.getAdminSupabaseClient.mockReturnValue(fakeClient({ error: { message: 'boom' } }));
  await expect(listRecords(schema)).rejects.toThrow('The list could not be loaded.');
});

it('saves through the shared admin write path', async () => {
  admin.saveAdminData.mockResolvedValue({ success: true, data: { id: 'n1', title: 'T' } });
  await expect(saveRecord(schema, { title: 'T' })).resolves.toEqual({ id: 'n1', title: 'T' });
  expect(admin.saveAdminData).toHaveBeenCalledWith('projects', { title: 'T' }, null);
  await saveRecord(schema, { title: 'U' }, 'p1');
  expect(admin.saveAdminData).toHaveBeenLastCalledWith('projects', { title: 'U' }, 'p1');
});

it('deletes projects through the data service and other tables directly', async () => {
  data.deleteProject.mockResolvedValue({ success: true });
  await deleteRecord(schema, 'p1');
  expect(data.deleteProject).toHaveBeenCalledWith('p1');
  data.deleteProject.mockResolvedValue({ success: false });
  await expect(deleteRecord(schema, 'p1')).rejects.toThrow('The project could not be deleted.');
  const client = fakeClient();
  admin.getAdminSupabaseClient.mockReturnValue(client);
  await deleteRecord(other, 's1');
  expect(client.calls[0].ops).toEqual([['delete'], ['eq', 'id', 's1']]);
});

it('rewrites the order column in one go and fails on any error', async () => {
  const client = fakeClient();
  admin.getAdminSupabaseClient.mockReturnValue(client);
  await reorderRecords(schema, [{ id: 'a', order_index: 2 }, { id: 'b', order_index: 1 }]);
  expect(client.calls).toHaveLength(2);
  expect(client.calls[0].ops[0][0]).toBe('update'); expect(client.calls[0].ops[0][1]).toMatchObject({ order_index: 2 }); expect(client.calls[0].ops[1]).toEqual(['eq', 'id', 'a']);
  admin.getAdminSupabaseClient.mockReturnValue(fakeClient({ error: { message: 'no' } }));
  await expect(reorderRecords(schema, [{ id: 'a', order_index: 1 }])).rejects.toThrow('The new order could not be saved.');
});

it('checks images before upload and uploads into the record folder', async () => {
  const png = { name: 'shot.PNG', type: 'image/png', size: 1000 };
  expect(imageProblem([])).toBe('Choose at least one image.');
  expect(imageProblem([png], { existing: 10, max: 10 })).toBe('At most 10 images per record.');
  expect(imageProblem([{ name: 'a.gif', type: 'image/gif', size: 10 }])).toBe('Images must be JPEG, PNG or WebP.');
  expect(imageProblem([{ ...png, size: IMAGE_MAX_BYTES + 1 }])).toBe('Each image must be under 5 MB.');
  expect(imageProblem([png])).toBeNull();
  admin.uploadAdminPublicFile.mockImplementation(async ({ filePath }) => ({ publicUrl: `https://cdn/${filePath}` }));
  const urls = await uploadImages(schema, 'p1', [png, { name: 'b.webp', type: 'image/webp', size: 5 }]);
  expect(urls).toHaveLength(2);
  expect(urls[0]).toMatch(/^https:\/\/cdn\/projects\/p1\/project-\d+-1\.png$/);
  expect(urls[1]).toMatch(/-2\.webp$/);
  expect(admin.uploadAdminPublicFile.mock.calls[0][0].bucket).toBe('project-images');
});

it('removes an image file and swallows storage misses', async () => {
  admin.removeAdminStorageFiles.mockResolvedValue({});
  await removeImage(schema, 'https://cdn/projects/p1/x.png');
  expect(admin.removeAdminStorageFiles).toHaveBeenCalledWith('project-images', 'https://cdn/projects/p1/x.png');
  admin.removeAdminStorageFiles.mockRejectedValue(new Error('gone'));
  await expect(removeImage(schema, 'u')).resolves.toBeUndefined();
});
