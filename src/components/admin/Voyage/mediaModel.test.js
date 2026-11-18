import { PAGE_SIZE, bucketCounts, bytesLabel, cleanItems, fileMark, hasThumbnail, statusStamp, summarize, visibleItems } from './mediaModel';

const item = (id, extra = {}) => ({ id, name: `${id}.png`, path: `folder/${id}.png`, bucketId: 'project-images', bucketLabel: 'Project Images', kind: 'image', size: 1024, status: 'referenced', isPrivate: false, previewUrl: `https://example.com/${id}.png`, updatedAt: '2026-11-10T00:00:00Z', ...extra });
const files = [
  item('a', { updatedAt: '2026-11-12T00:00:00Z' }),
  item('b', { updatedAt: '2026-11-14T00:00:00Z', status: 'unknown', size: 2048 }),
  item('c', { bucketId: 'contact-attachments', bucketLabel: 'Contact Attachments', isPrivate: true, kind: 'pdf', name: 'cv.pdf', path: 'contact-attachments/cv.pdf', updatedAt: '2026-11-13T00:00:00Z' }),
  item('d', { updatedAt: null, name: 'zeta.png' }),
  item('e', { updatedAt: null, name: 'alpha.png' }),
];
const ids = (list) => list.map((i) => i.id);

describe('media model', () => {
  it('drops the folder markers storage keeps for empty folders', () => {
    expect(cleanItems([item('x', { name: '.emptyFolderPlaceholder' }), item('y'), null])).toEqual([item('y')]);
  });

  it('shows newest first and orders undated files by name', () => {
    expect(ids(visibleItems(files))).toEqual(['b', 'c', 'a', 'e', 'd']);
  });

  it('filters by bucket, status and a search over name, path and bucket', () => {
    expect(ids(visibleItems(files, { bucket: 'contact-attachments' }))).toEqual(['c']);
    expect(ids(visibleItems(files, { status: 'unknown' }))).toEqual(['b']);
    expect(ids(visibleItems(files, { status: 'referenced', bucket: 'project-images' }))).toEqual(['a', 'e', 'd']);
    expect(ids(visibleItems(files, { query: 'CONTACT' }))).toEqual(['c']);
    expect(ids(visibleItems(files, { query: 'folder/a' }))).toEqual(['a']);
  });

  it('sums the library and counts files per bucket', () => {
    expect(summarize(files)).toEqual({ total: 5, referenced: 4, unknown: 1, private: 1, bytes: 1024 * 4 + 2048 });
    expect(bucketCounts(files)).toEqual({ 'project-images': 4, 'contact-attachments': 1 });
  });

  it('labels sizes, file marks and stamps', () => {
    expect(bytesLabel(500)).toBe('500 B');
    expect(bytesLabel(1536)).toBe('1.5 KB');
    expect(bytesLabel(5 * 1048576)).toBe('5 MB');
    expect(fileMark({ name: 'cv.pdf', kind: 'pdf' })).toBe('PDF');
    expect(fileMark({ name: 'notes.markdown', kind: 'file' })).toBe('FILE');
    expect(fileMark({ name: 'README', kind: 'document' })).toBe('DOC');
    expect(statusStamp({ status: 'referenced' })).toEqual({ label: 'Referenced', tone: 'good' });
    expect(statusStamp({ status: 'unknown' }).label).toBe('Unknown');
  });

  it('loads a thumbnail only for an image with a link', () => {
    expect(hasThumbnail(files[0])).toBe(true);
    expect(hasThumbnail(files[2])).toBe(false);
    expect(hasThumbnail({ kind: 'image', previewUrl: null })).toBe(false);
    expect(PAGE_SIZE).toBeGreaterThanOrEqual(12);
  });
});
