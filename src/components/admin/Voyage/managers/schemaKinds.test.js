// The field kinds, cross-field rules and deck helpers added for V3a. Each
// kind is checked for its empty value, its validation sentences, its
// normalisation and its dirty check, on small schemas built here so a test
// never depends on a real manager's limits.

import {
  applyChange, buildForm, canDrag, cardFlags, cleanupTargets, emptyValue, fileExtension, fileNameFromUrl, groupMoveWrites, groupRows,
  isDirty, isIsoDate, isPublic, moveItem, nextOrderValue, normalizeForm, orderWritesFor, pickSingleton, priorityForGroup, slugSegment,
  sortRows, toPairs, todayIso, validateForm, withHttps,
} from './schemaModel';

const one = (field) => ({ fields: [field] });
const check = (field, value, form = {}) => validateForm(one(field), { ...form, [field.key]: value })[field.key];

describe('dates', () => {
  const date = { key: 'd', label: 'Issue date', kind: 'date' };
  it('reads real calendar dates only and uses the local calendar for today', () => {
    expect(isIsoDate('2026-02-28')).toBe(true); expect(isIsoDate('2026-02-30')).toBe(false); expect(isIsoDate('18/11/2026')).toBe(false);
    expect(todayIso(new Date(2026, 10, 18, 23, 30))).toBe('2026-11-18');
  });
  it('validates, normalises and compares', () => {
    expect(emptyValue(date)).toBe('');
    expect(check(date, '')).toBeUndefined();
    expect(check({ ...date, required: true }, '')).toBe('Issue date is required.');
    expect(check(date, '2026-13-01')).toBe('Issue date must be a full date.');
    expect(check({ ...date, max: 'today' }, '2999-01-01')).toBe('Issue date cannot be in the future.');
    expect(check({ ...date, max: 'today' }, todayIso())).toBeUndefined();
    expect(check({ ...date, min: '2020-01-01' }, '2019-12-31')).toBe('Issue date must be on or after 2020-01-01.');
    expect(buildForm(one(date), { d: '2026-11-18T00:00:00' }).d).toBe('2026-11-18');
    expect(normalizeForm(one(date), { d: '' }).d).toBeNull();
    expect(isDirty(one(date), { d: '2026-11-18' }, { d: '2026-11-18' })).toBe(false);
    expect(isDirty(one(date), { d: '2026-11-19' }, { d: '2026-11-18' })).toBe(true);
  });
  it('orders start and end, strictly or not, and skips the rule while the record is current', () => {
    const schema = {
      fields: [{ key: 'start', label: 'Start date', kind: 'date' }, { key: 'end', label: 'End date', kind: 'date', disabledWhen: 'current' }, { key: 'current', label: 'Current', kind: 'toggle', clears: 'end' }],
      dateOrder: [{ start: 'start', end: 'end', strict: true, unless: 'current' }],
    };
    expect(validateForm(schema, { start: '2026-01-02', end: '2026-01-02', current: false }).end).toBe('End date must be after the start date.');
    expect(validateForm(schema, { start: '2026-01-02', end: '2026-01-03', current: false })).toEqual({});
    expect(validateForm(schema, { start: '2026-01-02', end: '2025-01-01', current: true })).toEqual({});
    const loose = { ...schema, dateOrder: [{ start: 'start', end: 'end' }] };
    expect(validateForm(loose, { start: '2026-01-02', end: '2026-01-02', current: false })).toEqual({});
    expect(validateForm(loose, { start: '2026-01-02', end: '2026-01-01', current: false }).end).toBe('End date cannot be before the start date.');
    // switching "current" on clears the end date in the form, and a disabled date always saves as null
    const form = applyChange(schema, { start: '2026-01-02', end: '2026-05-01', current: false }, 'current', true);
    expect(form.end).toBe('');
    expect(normalizeForm(schema, { start: '2026-01-02', end: '2026-05-01', current: true }).end).toBeNull();
    expect(applyChange(schema, form, 'start', '2026-01-03')).toEqual({ ...form, start: '2026-01-03' });
  });
});

describe('a cross-field rules hook', () => {
  it('adds errors after the field checks without replacing a field error', () => {
    const schema = {
      fields: [{ key: 'org', label: 'Issuing organization', kind: 'text', max: 5 }, { key: 'comp', label: 'Competition', kind: 'text' }],
      rules: (f) => (f.org && f.comp ? { org: 'Give an organization or a competition, not both.', comp: 'Give an organization or a competition, not both.' } : {}),
    };
    expect(validateForm(schema, { org: 'ACM', comp: 'ICPC' })).toEqual({ org: 'Give an organization or a competition, not both.', comp: 'Give an organization or a competition, not both.' });
    expect(validateForm(schema, { org: 'Too long', comp: 'ICPC' }).org).toBe('Issuing organization is over 5 characters.');
    expect(validateForm(schema, { org: 'ACM', comp: '' })).toEqual({});
  });
});

describe('links and web addresses', () => {
  it('accepts a web address, a site path or an anchor for the link kind', () => {
    const link = { key: 'l', label: 'Button link', kind: 'link' };
    ['https://x.dev', '/projects', '#navigation'].forEach((v) => expect(check(link, v)).toBeUndefined());
    expect(check(link, 'projects')).toBe('Button link must be a web address, a path starting with /, or an anchor starting with #.');
    expect(normalizeForm(one(link), { l: '  #navigation ' }).l).toBe('#navigation');
  });
  it('loosens a url to accept bare domains and saves them with https://', () => {
    const url = { key: 'u', label: 'Credential URL', kind: 'url', loose: true };
    expect(withHttps('coursera.org/verify/X')).toBe('https://coursera.org/verify/X');
    expect(withHttps('http://a.io')).toBe('http://a.io');
    expect(check(url, 'coursera.org/verify/ABC?x=1')).toBeUndefined();
    expect(check(url, 'not a site')).toBe('Credential URL must be a web address, such as https://example.com.');
    expect(normalizeForm(one(url), { u: 'coursera.org/v' }).u).toBe('https://coursera.org/v');
    expect(isDirty(one(url), { u: 'coursera.org/v' }, { u: 'https://coursera.org/v' })).toBe(false);
    expect(check({ ...url, loose: false }, 'coursera.org')).toBe('Credential URL must start with https://.');
  });
  it('restricts a url to a host pattern with its own sentence', () => {
    const li = { key: 'u', label: 'LinkedIn', kind: 'url', loose: true, pattern: /^https?:\/\/(www\.)?linkedin\.com\/in\/[a-z0-9-]+\/?$/i, patternMessage: 'Use a LinkedIn profile address, such as https://linkedin.com/in/name.' };
    expect(check(li, 'linkedin.com/in/raunak')).toBeUndefined();
    expect(check(li, 'https://github.com/raunak')).toBe('Use a LinkedIn profile address, such as https://linkedin.com/in/name.');
    expect(check({ ...li, patternMessage: undefined }, 'https://github.com/x')).toBe('LinkedIn is not in the expected form.');
  });
});

describe('numbers', () => {
  it('keeps numeric text as typed and checks its value', () => {
    const gpa = { key: 'g', label: 'GPA', kind: 'numeric', min: 0, max: 10 };
    expect(check(gpa, '3.50')).toBeUndefined();
    expect(check(gpa, '3.5.0')).toBe('GPA must be a number.');
    expect(check(gpa, '11')).toBe('GPA must be at most 10.');
    expect(check(gpa, '-1')).toBe('GPA must be at least 0.');
    expect(normalizeForm(one(gpa), { g: ' 3.50 ' }).g).toBe('3.50');
    expect(normalizeForm(one(gpa), { g: '' }).g).toBeNull();
  });
  it('rates in whole steps from 1 to max', () => {
    const rating = { key: 'r', label: 'Rating', kind: 'rating' };
    expect(emptyValue(rating)).toBe('');
    expect(check(rating, 0)).toBe('Rating must be from 1 to 5.');
    expect(check(rating, 6)).toBe('Rating must be from 1 to 5.');
    expect(check(rating, 2.5)).toBe('Rating must be a whole number.');
    expect(check(rating, 4)).toBeUndefined(); expect(check(rating, '')).toBeUndefined();
    expect(check({ ...rating, max: 10 }, 9)).toBeUndefined();
    expect(normalizeForm(one(rating), { r: 4 }).r).toBe(4); expect(normalizeForm(one(rating), { r: '' }).r).toBeNull();
    expect(buildForm(one(rating), { r: '3' }).r).toBe(3);
  });
});

describe('selects', () => {
  const opts = [{ value: 'A', label: 'A' }, { value: 'B', label: 'B' }];
  it('offers an empty choice that saves as null', () => {
    const sel = { key: 's', label: 'Type', kind: 'select', options: opts, allowEmpty: true };
    expect(emptyValue(sel)).toBe('');
    expect(check(sel, '')).toBeUndefined();
    expect(check({ ...sel, required: true }, '')).toBe('Type is required.');
    expect(normalizeForm(one(sel), { s: '' }).s).toBeNull();
    expect(isDirty(one(sel), { s: '' }, { s: null })).toBe(false);
    expect(check({ key: 's', label: 'Type', kind: 'select', options: opts }, '')).toBe('Type has an unknown value.');
  });
  it('keeps a stored value the list does not know, within its length', () => {
    const sel = { key: 's', label: 'Type', kind: 'select', options: opts, allowEmpty: true, tolerateUnknown: true, max: 6 };
    expect(buildForm(one(sel), { s: 'Legacy' }).s).toBe('Legacy');
    expect(check(sel, 'Legacy')).toBeUndefined();
    expect(check(sel, 'Far too long')).toBe('Type is over 6 characters.');
    expect(check({ ...sel, tolerateUnknown: false }, 'Legacy')).toBe('Type has an unknown value.');
    expect(isDirty(one(sel), buildForm(one(sel), { s: 'Legacy' }), { s: 'Legacy' })).toBe(false);
  });
  it('reads a stored value in another case as its option, and saves the option spelling', () => {
    const sel = { key: 's', label: 'Status', kind: 'select', options: [{ value: 'Completed', label: 'Completed' }, { value: 'In Progress', label: 'In progress' }], allowEmpty: true, ignoreCase: true };
    const form = buildForm(one(sel), { s: 'completed' });
    expect(form.s).toBe('Completed');
    expect(check(sel, form.s)).toBeUndefined();
    expect(normalizeForm(one(sel), form).s).toBe('Completed');
    expect(buildForm(one(sel), { s: 'in progress' }).s).toBe('In Progress');
    expect(buildForm(one(sel), { s: 'Paused' }).s).toBe('Paused');   // unknown values pass through untouched
    expect(buildForm(one({ ...sel, ignoreCase: false }), { s: 'completed' }).s).toBe('completed');
  });
});

describe('single uploads and file lists', () => {
  it('holds one URL for image and file, null when empty', () => {
    const image = { key: 'i', label: 'Icon', kind: 'image' };
    expect(emptyValue(image)).toBe('');
    expect(normalizeForm(one(image), { i: '' }).i).toBeNull();
    expect(check({ ...image, required: true }, '')).toBe('Icon is required.');
    expect(isDirty(one(image), { i: 'https://a/b.png' }, { i: null })).toBe(true);
  });
  it('limits only typed entries by length in a mixed files list, and can save an empty list as null', () => {
    const files = { key: 'f', label: 'Certifications', kind: 'files', allowText: true, max: 3, itemMax: 10 };
    expect(emptyValue(files)).toEqual([]);
    expect(check(files, ['Short', `https://x.supabase.co/${'a'.repeat(80)}.pdf`])).toBeUndefined();
    expect(check(files, ['Much too long here'])).toBe('Each certifications entry is at most 10 characters.');
    expect(check(files, ['a', 'b', 'c', 'd'])).toBe('Certifications allows at most 3 entries.');
    expect(normalizeForm(one({ ...files, nullWhenEmpty: true }), { f: [] }).f).toBeNull();
    expect(normalizeForm(one(files), { f: [] }).f).toEqual([]);
    expect(fileNameFromUrl('https://x/a/b/My%20Cert.pdf?t=1')).toBe('My Cert.pdf');
    expect(fileNameFromUrl('%E0%A4%A')).toBe('%E0%A4%A');
  });
});

describe('tags with inline editing', () => {
  it('refuses empty and repeated entries only when editable', () => {
    const tags = { key: 't', label: 'Highlights', kind: 'tags', editable: true, max: 6, itemMax: 100 };
    expect(check(tags, ['One', ''])).toBe('Every highlights entry needs some text; remove the empty one.');
    expect(check(tags, ['One', 'One'])).toBe('Highlights lists the same entry twice.');
    expect(check({ ...tags, editable: false }, ['One', 'One'])).toBeUndefined();
    expect(moveItem(['a', 'b', 'c'], 0, 1)).toEqual(['b', 'a', 'c']);
    expect(moveItem(['a'], 0, -1)).toEqual(['a']);
  });
});

describe('pairs', () => {
  const pairs = { key: 'p', label: 'Basic info', kind: 'pairs', required: true, max: 3, keyMax: 5, valueMax: 8 };
  it('loads the array shape in order and the legacy object shape in insertion order', () => {
    expect(toPairs([{ key: 'b', value: '2', order_index: 1 }, { key: 'a', value: 1, order_index: 0 }])).toEqual([{ key: 'a', value: '1' }, { key: 'b', value: '2' }]);
    expect(toPairs({ Degree: 'MS', City: 'NYC' })).toEqual([{ key: 'Degree', value: 'MS' }, { key: 'City', value: 'NYC' }]);
    expect(toPairs(null)).toEqual([]); expect(toPairs('x')).toEqual([]);
    expect(buildForm(one(pairs), { p: { A: 'b' } }).p).toEqual([{ key: 'A', value: 'b' }]);
  });
  it('validates every row with fixed sentences, ignoring fully blank rows', () => {
    expect(check(pairs, [])).toBe('Basic info needs at least one entry.');
    expect(check(pairs, [{ key: '', value: '' }])).toBe('Basic info needs at least one entry.');
    expect(check(pairs, [{ key: 'A', value: '' }])).toBe('Every basic info row needs a label and a value.');
    expect(check(pairs, [{ key: 'Longer', value: 'x' }])).toBe('Each basic info label is at most 5 characters.');
    expect(check(pairs, [{ key: 'A', value: 'Much longer' }])).toBe('Each basic info value is at most 8 characters.');
    expect(check(pairs, [{ key: 'A', value: '1' }, { key: 'A', value: '2' }])).toBe('Basic info uses the label "A" twice.');
    expect(check(pairs, [1, 2, 3, 4].map((n) => ({ key: `k${n}`, value: 'v' })))).toBe('Basic info allows at most 3 entries.');
    expect(check(pairs, [{ key: 'A', value: '1' }, { key: '', value: '' }])).toBeUndefined();
  });
  it('saves trimmed rows with a fresh order and compares by content', () => {
    expect(normalizeForm(one(pairs), { p: [{ key: ' City ', value: ' NYC ' }, { key: '', value: '' }, { key: 'Degree', value: 'MS' }] }).p)
      .toEqual([{ key: 'City', value: 'NYC', order_index: 0 }, { key: 'Degree', value: 'MS', order_index: 1 }]);
    const row = { p: [{ key: 'A', value: '1', order_index: 0 }, { key: 'B', value: '2', order_index: 1 }] };
    expect(isDirty(one(pairs), buildForm(one(pairs), row), row)).toBe(false);
    expect(isDirty(one(pairs), { p: moveItem(buildForm(one(pairs), row).p, 0, 1) }, row)).toBe(true);
  });
});

describe('derived fields', () => {
  it('computes on save and never counts as a change by itself', () => {
    const schema = { fields: [{ key: 'content', label: 'Content', kind: 'textarea' }, { key: 'word_count', label: 'Words', kind: 'derived', compute: (f) => String(f.content || '').trim().split(/\s+/).filter(Boolean).length }] };
    expect(buildForm(schema, { content: 'a b', word_count: 2 }).word_count).toBe('');
    expect(normalizeForm(schema, { content: ' one two  three ' }).word_count).toBe(3);
    expect(isDirty(schema, buildForm(schema, { content: 'a b', word_count: 99 }), { content: 'a b', word_count: 99 })).toBe(false);
    expect(validateForm(schema, { content: '' })).toEqual({});
  });
});

describe('visibility', () => {
  it('applies every rule the public site applies', () => {
    const schema = { visibility: [{ key: 'status', publicValues: ['active'] }, { key: 'is_public', publicValues: [true], fallback: true }] };
    expect(isPublic(schema, { status: 'active', is_public: true })).toBe(true);
    expect(isPublic(schema, { status: 'active' })).toBe(true);                 // missing column falls back
    expect(isPublic(schema, { status: 'draft', is_public: true })).toBe(false);
    expect(isPublic(schema, { status: 'active', is_public: false })).toBe(false);
    expect(isPublic({}, {})).toBe(true);
    expect(cardFlags(schema, { status: 'draft' }, { flags: ['featured'] })).toEqual(['featured', 'hidden']);
    expect(cardFlags(schema, { status: 'draft' }, { flags: ['hidden'] })).toEqual(['hidden']);
    expect(cardFlags({ visibility: [{ key: 'is_active', publicValues: [true] }] }, { is_active: false }, {})).toEqual(['hidden']);
  });
});

describe('deck order', () => {
  const rows = [{ id: 'a', n: 2, created_at: '1' }, { id: 'b', n: 5, created_at: '2' }, { id: 'c', n: null, created_at: '3' }];
  it('sorts by the order column in either direction with unordered rows last, or by the schema sort', () => {
    expect(sortRows({ orderKey: 'n' }, rows).map((r) => r.id)).toEqual(['b', 'a', 'c']);
    expect(sortRows({ orderKey: 'n', orderDirection: 'asc' }, rows).map((r) => r.id)).toEqual(['a', 'b', 'c']);
    expect(sortRows({}, rows).map((r) => r.id)).toEqual(['c', 'b', 'a']);       // no order column: newest first
    expect(sortRows({ sort: (r) => r.reverse() }, rows).map((r) => r.id)).toEqual(['c', 'b', 'a']);
    expect(rows.map((r) => r.id)).toEqual(['a', 'b', 'c']);                      // the input is never mutated
  });
  it('gives a new record the next value and rewrites the column after a drag', () => {
    expect(nextOrderValue({ orderKey: 'n' }, rows)).toBe(6); expect(nextOrderValue({ orderKey: 'n' }, [])).toBe(1);
    expect(orderWritesFor({ orderKey: 'n' }, ['b', 'a'])).toEqual([{ id: 'b', n: 2 }, { id: 'a', n: 1 }]);
    expect(orderWritesFor({ orderKey: 'n', orderDirection: 'asc' }, ['b', 'a'])).toEqual([{ id: 'b', n: 1 }, { id: 'a', n: 2 }]);
  });
  it('allows dragging only for a flat deck that owns an order column', () => {
    expect(canDrag({ orderKey: 'n' })).toBe(true);
    expect(canDrag({})).toBe(false);
    expect(canDrag({ orderKey: 'n', group: { key: 'g' } })).toBe(false);
    expect(canDrag({ orderKey: 'n', mode: 'singleton' })).toBe(false);
  });
});

describe('groups', () => {
  const schema = { group: { key: 't', priorityKey: 'p', emptyLabel: 'No type', defaultPriority: 50 } };
  const rows = [
    { id: 1, t: 'Cloud', p: 2 }, { id: 2, t: 'Languages', p: 1 }, { id: 3, t: 'Cloud', p: 9 }, { id: 4, t: null, p: null }, { id: 5, t: 'Design', p: 2 },
  ];
  it('splits rows into groups by priority, then name, keeping row order inside', () => {
    const groups = groupRows(schema, rows);
    expect(groups.map((g) => [g.label, g.priority, g.rows.map((r) => r.id)])).toEqual([['Languages', 1, [2]], ['Cloud', 2, [1, 3]], ['Design', 2, [5]], ['No type', 50, [4]]]);
    expect(groups[3].value).toBeNull();
  });
  it('renumbers groups after a move and writes only the changed ones', () => {
    const groups = groupRows(schema, rows);
    // Design (2) moves above Cloud (2): Design keeps 2, Cloud becomes 3 and the untyped group is renumbered to 4
    expect(groupMoveWrites(groups, 2, -1)).toEqual([{ value: 'Cloud', priority: 3 }, { value: null, priority: 4 }]);
    expect(groupMoveWrites(groups, 0, -1)).toEqual([]);
    expect(groupMoveWrites(groups, 3, -1)).toEqual([{ value: null, priority: 3 }, { value: 'Design', priority: 4 }]);
  });
  it('gives a row its group priority, or the default for a new group', () => {
    expect(priorityForGroup(schema, rows, 'Cloud')).toBe(2);
    expect(priorityForGroup(schema, rows, 'Brand new')).toBe(50);
    expect(priorityForGroup(schema, rows, '')).toBe(50);
  });
});

describe('singletons', () => {
  it('picks the active row, else the latest, and never returns nothing while rows exist', () => {
    expect(pickSingleton([])).toBeNull(); expect(pickSingleton(null)).toBeNull();
    expect(pickSingleton([{ id: 'old', is_active: false, updated_at: '2026-11-18' }, { id: 'on', is_active: true, updated_at: '2026-01-01' }]).id).toBe('on');
    // the surprise from the spec: an inactive row must still load, or the next save would insert a second row
    expect(pickSingleton([{ id: 'off', is_active: false, updated_at: '2026-01-01' }]).id).toBe('off');
    expect(pickSingleton([{ id: 'a', is_active: false, updated_at: '2026-01-01' }, { id: 'b', is_active: false, updated_at: '2026-06-01' }]).id).toBe('b');
  });
});

describe('stored files', () => {
  it('names only files inside each declared bucket, once each', () => {
    const base = 'https://x.supabase.co/storage/v1/object/public/';
    const schema = { cleanup: [{ key: 'icon', bucket: 'skill-icons' }, { key: 'certs', bucket: 'skill-icons' }, { key: 'logo', bucket: 'organization-logos' }] };
    const row = { icon: `${base}skill-icons/a.png`, certs: ['Typed name', `${base}skill-icons/c.pdf`, `${base}skill-icons/a.png`, 'https://other.host/x.pdf'], logo: null };
    expect(cleanupTargets(schema, row)).toEqual([{ bucket: 'skill-icons', urls: [`${base}skill-icons/a.png`, `${base}skill-icons/c.pdf`] }]);
    expect(cleanupTargets({}, row)).toEqual([]);
  });
  it('builds clean path segments and extensions', () => {
    expect(slugSegment('C++ & Rust!')).toBe('c-rust'); expect(slugSegment('', 'skill')).toBe('skill');
    expect(fileExtension('A.PNG')).toBe('png'); expect(fileExtension('noext')).toBe('bin'); expect(fileExtension('x.p?g')).toBe('pg');
  });
});
