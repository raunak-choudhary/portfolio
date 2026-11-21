import {
  PAGE_SIZE, QUOTA_BYTES, SECTION_ORDER, TABS, brokenText, bytesLabel, classify, cleanItems, dayLabel, deletionReport, duplicateOf, entriesOf,
  fileMark, filterBroken, filterFiles, groupBroken, groupBySection, hasThumbnail, joinNames, nameStem, planDeletion, safeHttpUrl, sortFiles,
  summarize, totalBytes, usedByText,
} from './mediaModel';

// a script URL, built so the linter does not read the test itself as one
const SCRIPT_URL = ['javascript', 'alert(1)'].join(':');

// ---- builders: a listed file, and a reference an entry makes to one ----
const item = (bucketId, path, extra = {}) => ({
  id: `${bucketId}:${path}`, bucketId, bucketLabel: bucketId, path, name: path.split('/').pop(),
  kind: 'image', size: 1024, isPrivate: false, previewUrl: `https://example.com/${path}`, updatedAt: '2026-11-10T00:00:00Z', ...extra,
});
const ref = (bucketId, path, extra = {}) => ({
  keys: [`${bucketId}:${path}`], bucketId, path, table: 'projects', section: 'Projects', rowId: 'p1', title: 'LoRA',
  field: 'image_urls', fieldLabel: 'Images', position: 1, count: 1, explicit: true, ...extra,
});
const bucket = (id, extra = {}) => ({ id, label: id, status: 'available', complete: true, ...extra });
const ids = (list) => list.map((f) => f.id);

describe('classify', () => {
  const snapshot = {
    buckets: [bucket('project-images'), bucket('documents')],
    items: [
      item('project-images', 'lora/a.png'),
      item('project-images', 'lora/old.png'),
      item('documents', 'cv.pdf', { kind: 'pdf' }),
      item('project-images', '.emptyFolderPlaceholder'),
    ],
    references: [
      ref('project-images', 'lora/a.png'),
      ref('project-images', 'lora/a.png', { table: 'achievements', section: 'Achievements', rowId: 'a1', title: 'Award' }),
      ref('documents', 'cv.pdf', { table: 'hero_content', section: 'Hero', rowId: 'h1', title: 'Resume', field: 'resume_url', fieldLabel: 'Resume' }),
      ref('project-images', 'lora/gone.png', { position: 2, count: 2 }),
    ],
    referenceErrors: [],
    referenceErrorSections: [],
  };

  it('splits the listing into in use and not connected, naming who uses each file', () => {
    const view = classify(snapshot);
    expect(ids(view.inUse)).toEqual(['project-images:lora/a.png', 'documents:cv.pdf']);
    expect(ids(view.notConnected)).toEqual(['project-images:lora/old.png']);
    expect(view.files).toHaveLength(3);   // the folder marker is not a file
    const a = view.inUse[0];
    expect(a.state).toBe('in-use');
    expect(a.canDelete).toBe(false);
    expect(a.entries.map((e) => e.section)).toEqual(['Projects', 'Achievements']);   // chapter order
    expect(view.notConnected[0]).toMatchObject({ state: 'not-connected', canDelete: true, entries: [] });
    expect(view.refsFailed).toBe(false);
    expect(view.listedIds.has('documents:cv.pdf')).toBe(true);
  });

  it('reports an explicit link to a missing file in a fully listed bucket as broken', () => {
    const view = classify(snapshot);
    expect(view.broken).toHaveLength(1);
    expect(view.broken[0]).toMatchObject({ title: 'LoRA', section: 'Projects', fullPath: 'project-images/lora/gone.png', position: 2, count: 2 });
  });

  it('never calls a link broken when the bucket failed, stopped early, or the value may be plain text', () => {
    const missing = ref('project-images', 'lora/gone.png');
    expect(classify({ ...snapshot, references: [missing], buckets: [bucket('project-images', { status: 'error', complete: false })] }).broken).toEqual([]);
    expect(classify({ ...snapshot, references: [missing], buckets: [bucket('project-images', { complete: false })] }).broken).toEqual([]);
    expect(classify({ ...snapshot, references: [{ ...missing, explicit: false }] }).broken).toEqual([]);
    // a bucket that was never listed is not complete either
    expect(classify({ ...snapshot, references: [ref('skill-icons', 'x.svg')] }).broken).toEqual([]);
  });

  it('matches a contact attachment by either reading of its path', () => {
    const view = classify({
      buckets: [bucket('contact-attachments')],
      items: [item('contact-attachments', 'contact-attachments/cv.pdf', { isPrivate: true })],
      references: [ref('contact-attachments', 'cv.pdf', { keys: ['contact-attachments:cv.pdf', 'contact-attachments:contact-attachments/cv.pdf'], table: 'contact_messages', section: 'Inbox', title: 'Hi' })],
      referenceErrors: [],
    });
    expect(view.inUse).toHaveLength(1);
    expect(view.broken).toEqual([]);
  });

  it('turns delete off for every file when any section could not be read', () => {
    const view = classify({ ...snapshot, referenceErrors: ['skills', 'certifications'], referenceErrorSections: ['Skills', 'Certifications'] });
    expect(view.refsFailed).toBe(true);
    expect(view.failedSections).toEqual(['Skills', 'Certifications']);
    expect(view.files.every((f) => f.canDelete === false)).toBe(true);
    expect(view.notConnected[0].canDelete).toBe(false);
  });

  it('names failed buckets and copes with an empty snapshot', () => {
    expect(classify({ ...snapshot, buckets: [bucket('documents', { status: 'error' })] }).failedBuckets.map((b) => b.id)).toEqual(['documents']);
    expect(classify()).toMatchObject({ files: [], inUse: [], notConnected: [], broken: [], refsFailed: false });
  });

  it('dedupes a broken link listed twice', () => {
    const missing = ref('project-images', 'lora/gone.png');
    expect(classify({ ...snapshot, references: [missing, { ...missing }] }).broken).toHaveLength(1);
  });
});

describe('duplicate hint', () => {
  const inUse = [item('documents', 'verzeo-certificate.pdf', { size: 1100 })];
  it.each([
    ['verzeo-certificate (1).pdf', 1100, true],
    ['verzeo-certificate-copy.pdf', 1100, true],
    ['verzeo_certificate copy 2.pdf', 1100, true],
    ['Verzeo Certificate.pdf', 1100, true],
    ['verzeo-certificate (1).pdf', 1200, false],   // a different size is a different file
    ['verzeo-certificate (1).png', 1100, false],   // a different kind of file
    ['other.pdf', 1100, false],
    ['verzeo-certificate (1).pdf', 0, false],
  ])('%s at %d bytes: %p', (name, size, expected) => {
    expect(Boolean(duplicateOf(item('documents', `old/${name}`, { size }), inUse))).toBe(expected);
  });

  it('folds copy suffixes into one stem', () => {
    expect(nameStem('Hero Image (2).PNG')).toBe('hero-image');
    expect(nameStem('hero_image-copy-3.png')).toBe('hero-image');
    expect(nameStem('report 2.pdf')).toBe('report');
    expect(nameStem('')).toBe('');
  });

  it('marks a not-connected copy and leaves it selectable', () => {
    const view = classify({
      buckets: [bucket('documents')],
      items: [item('documents', 'a/cert.pdf', { size: 50 }), item('documents', 'b/cert (1).pdf', { size: 50 })],
      references: [ref('documents', 'a/cert.pdf')],
      referenceErrors: [],
    });
    expect(view.notConnected[0].duplicate.id).toBe('documents:a/cert.pdf');
    expect(view.notConnected[0].canDelete).toBe(true);
  });
});

describe('planDeletion: the check right before deleting', () => {
  const a = item('project-images', 'a.png'), b = item('project-images', 'b.png');

  it('deletes what is still unused and keeps a file that became used, naming its entry', () => {
    const plan = planDeletion([a, b], { references: [ref('project-images', 'b.png', { title: 'New project' })], failedTables: [] });
    expect(plan.blocked).toBe(false);
    expect(ids(plan.toDelete)).toEqual([a.id]);
    expect(plan.kept).toHaveLength(1);
    expect(plan.kept[0].file.id).toBe(b.id);
    expect(plan.kept[0].entries[0].title).toBe('New project');
  });

  it('deletes nothing when the check missed a section', () => {
    const plan = planDeletion([a, b], { references: [], failedTables: ['skills'], failedSections: ['Skills'] });
    expect(plan).toMatchObject({ blocked: true, failedSections: ['Skills'], toDelete: [] });
  });

  it('deletes nothing when the check did not come back at all', () => {
    expect(planDeletion([a], null)).toMatchObject({ blocked: true, toDelete: [] });
    expect(planDeletion([a], {})).toMatchObject({ blocked: true, toDelete: [] });
    expect(planDeletion([a], { failedTables: [] })).toMatchObject({ blocked: true, toDelete: [] });
  });
});

describe('deletionReport', () => {
  const file = (name) => ({ id: name, name });
  it('says how many went and names every kept or failed file', () => {
    const report = deletionReport({
      deleted: [file('a'), file('b'), file('c')],
      kept: [{ file: file('d.png'), entries: [{ section: 'Projects', title: 'X' }] }],
      failed: [],
    });
    expect(report.title).toBe('3 files deleted, 1 kept');
    expect(report.tone).toBe('warn');
    expect(report.lines[0]).toMatchObject({ kind: 'kept', name: 'd.png' });
    expect(report.lines[0].text).toContain('Projects · X');
  });

  it('is good news when everything went, and singular for one', () => {
    expect(deletionReport({ deleted: [file('a')] })).toEqual({ title: '1 file deleted', lines: [], tone: 'good' });
    expect(deletionReport({ deleted: [], failed: [file('z')] }).title).toBe('0 files deleted, 1 not deleted');
  });
});

describe('search, filter and sort', () => {
  const files = classify({
    buckets: [bucket('project-images'), bucket('documents')],
    items: [
      item('project-images', 'x/zeta.png', { size: 10, updatedAt: '2026-11-01T00:00:00Z' }),
      item('project-images', 'x/alpha.png', { size: 30, updatedAt: '2026-11-03T00:00:00Z' }),
      item('documents', 'cv.pdf', { size: 20, updatedAt: null }),
    ],
    references: [ref('project-images', 'x/zeta.png', { title: 'Tallyproof' })],
    referenceErrors: [],
  }).files;

  it('searches file names, paths and entry titles, case-insensitively', () => {
    expect(ids(filterFiles(files, { query: 'TALLY' }))).toEqual(['project-images:x/zeta.png']);
    expect(ids(filterFiles(files, { query: 'cv' }))).toEqual(['documents:cv.pdf']);
    expect(ids(filterFiles(files, { query: 'x/' }))).toHaveLength(2);
    expect(filterFiles(files, { query: '   ' })).toHaveLength(3);
  });

  it('filters by bucket', () => {
    expect(ids(filterFiles(files, { bucket: 'documents' }))).toEqual(['documents:cv.pdf']);
  });

  it('sorts by newest, largest or name, undated last on newest', () => {
    expect(sortFiles(files, 'newest').map((f) => f.name)).toEqual(['alpha.png', 'zeta.png', 'cv.pdf']);
    expect(sortFiles(files, 'largest').map((f) => f.name)).toEqual(['alpha.png', 'cv.pdf', 'zeta.png']);
    expect(sortFiles(files, 'name').map((f) => f.name)).toEqual(['alpha.png', 'cv.pdf', 'zeta.png']);
    expect(sortFiles(files, 'nonsense').map((f) => f.name)).toEqual(['alpha.png', 'zeta.png', 'cv.pdf']);
    expect(sortFiles(files, 'name')).not.toBe(files);   // never sorts in place
  });

  it('filters broken links by entry, section, path and bucket', () => {
    const broken = [ref('documents', 'gone.pdf', { title: 'Award', section: 'Achievements' }), ref('project-images', 'p.png')];
    expect(filterBroken(broken, { query: 'award' })).toHaveLength(1);
    expect(filterBroken(broken, { query: 'achievements' })).toHaveLength(1);
    expect(filterBroken(broken, { bucket: 'project-images' })).toHaveLength(1);
    expect(filterBroken(broken, {})).toHaveLength(2);
  });
});

describe('grouping and wording', () => {
  it('groups in-use files by their first entry\'s section, in chapter order', () => {
    const files = [
      { id: '1', entries: [{ section: 'Inbox' }] },
      { id: '2', entries: [{ section: 'Hero' }] },
      { id: '3', entries: [{ section: 'Projects' }] },
      { id: '4', entries: [{ section: 'Hero' }] },
      { id: '5', entries: [] },
    ];
    expect(groupBySection(files).map((g) => [g.section, g.files.length])).toEqual([['Hero', 2], ['Projects', 1], ['Inbox', 1], ['Other', 1]]);
  });

  it('groups broken links by section and orders them by entry then position', () => {
    const groups = groupBroken([ref('a', 'x', { section: 'Skills', title: 'B' }), ref('a', 'y', { section: 'Hero', title: 'Resume' }), ref('a', 'z', { section: 'Skills', title: 'A', position: 2 }), ref('a', 'w', { section: 'Skills', title: 'A', position: 1 })]);
    expect(groups.map((g) => g.section)).toEqual(['Hero', 'Skills']);
    expect(groups[1].links.map((l) => l.path)).toEqual(['w', 'z', 'x']);
  });

  it('names one entry, or the first and how many more', () => {
    const e = (title) => ({ section: 'Projects', title });
    expect(usedByText([])).toBe('');
    expect(usedByText([e('A')])).toBe('Projects · A');
    expect(usedByText([e('A'), e('B')])).toBe('Projects · A and 1 more entry');
    expect(usedByText([e('A'), e('B'), e('C')])).toBe('Projects · A and 2 more entries');
  });

  it('lists an entry once even when two of its fields use the file', () => {
    const entries = entriesOf([ref('a', 'x', { fieldLabel: 'Badge' }), ref('a', 'x', { fieldLabel: 'Issuer logo' })]);
    expect(entries).toHaveLength(1);
    expect(entries[0].fields).toEqual(['Badge', 'Issuer logo']);
  });

  it('describes a broken link by field, and by place among several files', () => {
    expect(brokenText({ fieldLabel: 'Company logo', count: 1, position: 1 })).toBe('Company logo points at a missing file');
    expect(brokenText({ fieldLabel: 'Images', count: 4, position: 3 })).toBe('Images: file 3 of 4 points at a missing file');
  });

  it('joins names in plain English', () => {
    expect(joinNames([])).toBe('');
    expect(joinNames(['Skills'])).toBe('Skills');
    expect(joinNames(['Skills', 'Hero'])).toBe('Skills and Hero');
    expect(joinNames(['A', 'B', 'C'])).toBe('A, B and C');
  });
});

describe('small helpers', () => {
  it('drops storage\'s folder markers', () => {
    expect(cleanItems([{ name: '.emptyFolderPlaceholder' }, { name: 'a.png' }, null])).toEqual([{ name: 'a.png' }]);
    expect(cleanItems(null)).toEqual([]);
  });

  it('labels sizes and sums them against the 1 GB allowance', () => {
    expect(bytesLabel(512)).toBe('512 B');
    expect(bytesLabel(2048)).toBe('2 KB');
    expect(bytesLabel(5 * 1048576)).toBe('5 MB');
    expect(bytesLabel(QUOTA_BYTES)).toBe('1 GB');
    expect(bytesLabel('nope')).toBe('0 B');
    expect(totalBytes([{ size: 1 }, { size: 2 }, {}])).toBe(3);
    const s = summarize({ files: [{ size: QUOTA_BYTES / 4 }, { size: QUOTA_BYTES / 4 }], notConnected: [{ size: 7 }] });
    expect(s).toMatchObject({ count: 2, quotaShare: 0.5, notConnectedCount: 1, notConnectedBytes: 7 });
    expect(summarize({ files: [{ size: QUOTA_BYTES * 2 }] }).quotaShare).toBe(1);
  });

  it('marks a file without a picture by its extension or kind', () => {
    expect(fileMark({ name: 'cv.pdf' })).toBe('PDF');
    expect(fileMark({ name: 'README', kind: 'document' })).toBe('DOC');
    expect(fileMark({ name: 'x.verylongext' })).toBe('FILE');
  });

  it('renders links and thumbnails only for http and https', () => {
    expect(safeHttpUrl('https://example.com/a.png')).toBe('https://example.com/a.png');
    expect(safeHttpUrl('http://example.com/a')).toBe('http://example.com/a');
    [SCRIPT_URL, 'data:image/png;base64,AAAA', 'blob:https://x/y', '/relative.png', '', null, 42].forEach((v) => expect(safeHttpUrl(v)).toBeNull());
    expect(hasThumbnail({ kind: 'image', previewUrl: 'https://e.com/a.png' })).toBe(true);
    expect(hasThumbnail({ kind: 'image', previewUrl: SCRIPT_URL })).toBe(false);
    expect(hasThumbnail({ kind: 'pdf', previewUrl: 'https://e.com/a.pdf' })).toBe(false);
  });

  it('writes the day on the New York calendar', () => {
    expect(dayLabel('2026-10-14T12:00:00Z')).toBe('14 Oct 2026');
    expect(dayLabel('2026-10-15T02:00:00Z')).toBe('14 Oct 2026');   // still the 14th in New York
    expect(dayLabel(null)).toBe('');
  });

  it('keeps its constants in line with the pop-up', () => {
    expect(TABS.map((t) => t.label)).toEqual(['In use', 'Not connected', 'Broken links']);
    expect(SECTION_ORDER[0]).toBe('Hero');
    expect(PAGE_SIZE).toBeGreaterThan(0);
  });
});
