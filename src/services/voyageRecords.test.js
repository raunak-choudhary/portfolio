import { IMAGE_MAX_BYTES, deleteRecord, failureKind, fetchUpdatedAt, fileProblems, getRecord, imageProblems, listRecords, removeImage, removeStoredFiles, reorderGroups, reorderRecords, saveRecord, sizeLabel, uploadFieldFiles, uploadImages } from './voyageRecords';
import { skillsSchema, certificateUpload, iconUpload } from '../components/admin/Voyage/managers/skills.schema';
// jest.mock is hoisted above the import by babel-jest, so the service sees the mocks
jest.mock('./adminDataService', () => ({ describeAdminWriteError: jest.fn(), getAdminSupabaseClient: jest.fn(), removeAdminStorageFiles: jest.fn(), saveAdminData: jest.fn(), uploadAdminPublicFile: jest.fn() }));
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

it('checks each chosen image on its own and rejects a choice over the limit', () => {
  const png = { name: 'shot.PNG', type: 'image/png', size: 1000 };
  const gif = { name: 'a.gif', type: 'image/gif', size: 10 };
  const big = { name: 'big.png', type: 'image/png', size: IMAGE_MAX_BYTES + 1 };
  expect(imageProblems([]).problems).toEqual([{ name: null, message: 'Choose at least one image.' }]);
  expect(imageProblems([png], { existing: 10, max: 10 })).toEqual({ accepted: [], problems: [{ name: null, message: 'At most 10 images per record. Remove one first.' }] });
  expect(imageProblems([png, png, png], { existing: 8, max: 10 }).problems[0].message).toBe('At most 10 images per record. There is room for 2 more; 3 were chosen.');
  const mixed = imageProblems([png, gif, big]);
  expect(mixed.accepted).toEqual([png]);
  expect(mixed.problems).toEqual([{ name: 'a.gif', message: 'is not a JPEG, PNG or WebP image.' }, { name: 'big.png', message: 'is 5.0 MB; the limit is 5 MB.' }]);
  expect(imageProblems([png])).toEqual({ accepted: [png], problems: [] });
});

it('uploads into the record folder and reports a failed file by name while the others land', async () => {
  const png = { name: 'shot.PNG', type: 'image/png', size: 1000 };
  admin.uploadAdminPublicFile.mockImplementation(async ({ filePath }) => ({ publicUrl: `https://cdn/${filePath}` }));
  const ok = await uploadImages(schema, 'p1', [png, { name: 'b.webp', type: 'image/webp', size: 5 }]);
  expect(ok.failed).toEqual([]);
  expect(ok.urls[0]).toMatch(/^https:\/\/cdn\/projects\/p1\/project-\d+-1\.png$/);
  expect(ok.urls[1]).toMatch(/-2\.webp$/);
  expect(admin.uploadAdminPublicFile.mock.calls[0][0].bucket).toBe('project-images');
  admin.uploadAdminPublicFile.mockImplementation(async ({ file }) => {
    if (file.name === 'net.png') throw new TypeError('Failed to fetch');
    if (file.name === 'deny.png') throw new Error('Upload failed: new row violates policy');
    return { publicUrl: 'https://cdn/ok.png' };
  });
  const mixed = await uploadImages(schema, 'p1', [png, { ...png, name: 'net.png' }, { ...png, name: 'deny.png' }]);
  expect(mixed.urls).toEqual(['https://cdn/ok.png']);
  expect(mixed.failed).toEqual([{ name: 'net.png', message: 'did not upload: the connection dropped.' }, { name: 'deny.png', message: 'did not upload: storage refused it.' }]);
});

it('sorts failures into session, permission, network and unknown', () => {
  const coded = (code) => Object.assign(new Error('x'), { code });
  expect(failureKind(coded('SESSION_EXPIRED'))).toBe('session');
  expect(failureKind(coded('SECOND_FACTOR_REQUIRED'))).toBe('permission');
  expect(failureKind(new Error('TypeError: Failed to fetch'))).toBe('network');
  expect(failureKind(Object.assign(new Error('The change could not be saved.'), { cause: new TypeError('Load failed') }))).toBe('network');
  expect(failureKind(new Error('duplicate key'), false)).toBe('network');
  expect(failureKind(new Error('duplicate key'), true)).toBe('unknown');
});

it('reads the row stamp for the conflict check and a full row for reload, typing their errors', async () => {
  admin.describeAdminWriteError.mockImplementation((e) => (e.status === 401 ? { code: 'SESSION_EXPIRED', message: 'Your session expired.' } : { code: 'WRITE_FAILED', message: e.message }));
  const client = fakeClient({ rows: { updated_at: '2026-11-18T10:00:00Z' } });
  admin.getAdminSupabaseClient.mockReturnValue(client);
  await expect(fetchUpdatedAt(schema, 'p1')).resolves.toBe('2026-11-18T10:00:00Z');
  expect(client.calls[0].ops).toEqual([['select', 'updated_at'], ['eq', 'id', 'p1'], ['maybeSingle']]);
  admin.getAdminSupabaseClient.mockReturnValue(fakeClient({ rows: null }));
  await expect(fetchUpdatedAt(schema, 'p1')).resolves.toBeUndefined();
  await expect(getRecord(schema, 'p1')).rejects.toThrow('This project no longer exists.');
  admin.getAdminSupabaseClient.mockReturnValue(fakeClient({ rows: { id: 'p1', title: 'T' } }));
  await expect(getRecord(schema, 'p1')).resolves.toEqual({ id: 'p1', title: 'T' });
  admin.getAdminSupabaseClient.mockReturnValue(fakeClient({ error: { status: 401, message: 'JWT expired' } }));
  await expect(fetchUpdatedAt(schema, 'p1')).rejects.toMatchObject({ code: 'SESSION_EXPIRED', message: 'Your session expired.' });
});

it('removes an image file and swallows storage misses', async () => {
  admin.removeAdminStorageFiles.mockResolvedValue({});
  await removeImage(schema, 'https://cdn/projects/p1/x.png');
  expect(admin.removeAdminStorageFiles).toHaveBeenCalledWith('project-images', 'https://cdn/projects/p1/x.png');
  admin.removeAdminStorageFiles.mockRejectedValue(new Error('gone'));
  await expect(removeImage(schema, 'u')).resolves.toBeUndefined();
});

const STORE = 'https://x.supabase.co/storage/v1/object/public/skill-icons/';

it('deletes a skill row first, then its icon and certificate files, leaving typed names and other hosts alone', async () => {
  const client = fakeClient();
  admin.getAdminSupabaseClient.mockReturnValue(client);
  admin.removeAdminStorageFiles.mockResolvedValue({});
  const row = { id: 's1', icon_url: `${STORE}icons/a.png`, certifications: ['AWS Certified Developer', `${STORE}certifications/c.pdf`, 'https://elsewhere.example/c.pdf'] };
  await deleteRecord(skillsSchema, 's1', row);
  expect(client.calls[0].ops).toEqual([['delete'], ['eq', 'id', 's1']]);
  expect(admin.removeAdminStorageFiles).toHaveBeenCalledTimes(1);
  expect(admin.removeAdminStorageFiles).toHaveBeenCalledWith('skill-icons', [`${STORE}icons/a.png`, `${STORE}certifications/c.pdf`]);
  // a refused cleanup does not fail a delete that already happened
  admin.removeAdminStorageFiles.mockRejectedValue(new Error('storage down'));
  await expect(deleteRecord(skillsSchema, 's1', row)).resolves.toBeUndefined();
  // a refused row delete keeps the files
  admin.removeAdminStorageFiles.mockClear();
  admin.getAdminSupabaseClient.mockReturnValue(fakeClient({ error: { message: 'no' } }));
  await expect(deleteRecord(skillsSchema, 's1', row)).rejects.toThrow('The skill could not be deleted.');
  expect(admin.removeAdminStorageFiles).not.toHaveBeenCalled();
});

it('moves whole groups by writing the priority to every row of each group, matching a missing group with IS NULL', async () => {
  const client = fakeClient();
  admin.getAdminSupabaseClient.mockReturnValue(client);
  await reorderGroups(skillsSchema, [{ value: 'Cloud Platforms', priority: 1 }, { value: null, priority: 2 }]);
  expect(client.calls[0].ops[0][1]).toMatchObject({ skill_type_priority: 1 });
  expect(client.calls[0].ops[1]).toEqual(['eq', 'skill_type', 'Cloud Platforms']);
  expect(client.calls[1].ops[1]).toEqual(['is', 'skill_type', null]);
  admin.getAdminSupabaseClient.mockReturnValue(fakeClient({ error: { message: 'no' } }));
  await expect(reorderGroups(skillsSchema, [{ value: 'x', priority: 1 }])).rejects.toThrow('The new group order could not be saved.');
});

it('checks files against a field upload rule: types, size, per choice and total', () => {
  const pdf = { name: 'cert.pdf', type: 'application/pdf', size: 1000 };
  const exe = { name: 'run.exe', type: 'application/x-msdownload', size: 10 };
  const huge = { name: 'big.pdf', type: 'application/pdf', size: 11 * 1048576 };
  expect(sizeLabel(10 * 1048576)).toBe('10 MB'); expect(sizeLabel(2 * 1048576)).toBe('2 MB'); expect(sizeLabel(512 * 1024)).toBe('512 KB');
  expect(fileProblems([], certificateUpload).problems[0].message).toBe('Choose at least one file.');
  expect(fileProblems([pdf, pdf, pdf, pdf, pdf, pdf], certificateUpload).problems[0].message).toBe('At most 5 files at a time; 6 were chosen.');
  expect(fileProblems([pdf, pdf], certificateUpload, { existing: 19 }).problems[0].message).toBe('At most 20 entries here. There is room for 1 more; 2 were chosen.');
  expect(fileProblems([pdf], certificateUpload, { existing: 20 }).problems[0].message).toBe('At most 20 entries here. Remove one first.');
  const mixed = fileProblems([pdf, exe, huge], certificateUpload);
  expect(mixed.accepted).toEqual([pdf]);
  expect(mixed.problems).toEqual([{ name: 'run.exe', message: 'is not a PDF, JPEG, PNG, WebP or Word file.' }, { name: 'big.pdf', message: 'is 11.0 MB; the limit is 10 MB.' }]);
  const svg = { name: 'i.svg', type: 'image/svg+xml', size: 100 };
  expect(fileProblems([svg], iconUpload)).toEqual({ accepted: [svg], problems: [] });
  expect(fileProblems([svg, svg], iconUpload).problems[0].message).toBe('Choose one file.');
});

it('uploads field files to the schema path and reports failures by name', async () => {
  admin.uploadAdminPublicFile.mockImplementation(async ({ bucket, filePath }) => ({ publicUrl: `https://cdn/${bucket}/${filePath}` }));
  const file = { name: 'My Icon.SVG', type: 'image/svg+xml', size: 10 };
  const { urls, failed } = await uploadFieldFiles(iconUpload, { id: 's1', form: { skill_name: 'C++ & Rust' } }, [file]);
  expect(failed).toEqual([]);
  expect(urls[0]).toMatch(/^https:\/\/cdn\/skill-icons\/icons\/skill_s1\/c-rust-icon-\d+\.svg$/);
  admin.uploadAdminPublicFile.mockRejectedValue(new TypeError('Failed to fetch'));
  const lost = await uploadFieldFiles(certificateUpload, { id: 's1', form: { skill_name: 'Go' } }, [{ name: 'a.pdf', type: 'application/pdf', size: 1 }]);
  expect(lost).toEqual({ urls: [], failed: [{ name: 'a.pdf', message: 'did not upload: the connection dropped.' }] });
});

it('removes stored files quietly', async () => {
  admin.removeAdminStorageFiles.mockRejectedValue(new Error('miss'));
  await expect(removeStoredFiles('skill-icons', ['u'])).resolves.toBeUndefined();
  expect(admin.removeAdminStorageFiles).toHaveBeenCalledWith('skill-icons', ['u']);
});
