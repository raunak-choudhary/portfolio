import { FIELD_KINDS, addListItem, buildForm, changedColumns, emptyValue, fieldsForGroup, isBucketUrl, isDirty, normalizeForm, validateForm } from './schemaModel';
import { deckOrder, nextOrderIndex, orderWrites, projectsSchema } from './projects.schema';
import { SCHEMAS, schemaForTable } from './index';
import { CHAPTERS } from '../chapters';

const row = {
  id: 'p1', title: 'Tallyproof', short_description: ' Counting with proofs ', detailed_description: null, project_type: 'Web app', duration: 'Oct to Nov 2026',
  team_size: 1, featured: true, awards: null, technologies: ['React', 'Supabase', 'Postgres', 'Playwright'], key_features: ['a', 'b', 'c'],
  github_urls: ['https://github.com/raunak-choudhary/tallyproof'], live_url: 'https://tallyproof.example', image_urls: [], status: 'active', challenges: null, learnings: null, order_index: 30, created_at: '2026-11-01',
};

describe('schema registry', () => {
  it('exposes each schema by its table, and every field of every schema has a known kind and a group', () => {
    expect(schemaForTable('projects')).toBe(projectsSchema);
    expect(schemaForTable('contact_messages')).toBeNull(); expect(schemaForTable(null)).toBeNull();
    expect(Object.keys(SCHEMAS)).toEqual(['hero_content', 'about_content', 'projects', 'skills', 'education', 'work_experience', 'internships', 'certifications', 'achievements', 'leadership', 'recommendations']);
    // every deck chapter with a table now has its manager (media has no table; the inbox is not a form)
    CHAPTERS.filter((c) => c.kind === 'deck' && c.table).forEach((c) => expect(schemaForTable(c.table)).not.toBeNull());
    Object.entries(SCHEMAS).forEach(([table, schema]) => {
      expect(schema.table).toBe(table);
      schema.fields.forEach((f) => expect(FIELD_KINDS).toContain(f.kind));
      const claimed = schema.groups.flatMap((g) => g.keys);
      schema.fields.forEach((f) => expect(claimed).toContain(f.key));
      schema.fields.filter((f) => ['image', 'file', 'files'].includes(f.kind)).forEach((f) => expect(f.upload).toEqual(expect.objectContaining({ bucket: expect.any(String), accept: expect.any(Array), maxBytes: expect.any(Number), path: expect.any(Function) })));
    });
  });
});

describe('forms', () => {
  it('builds a form from a row, with every field present and typed', () => {
    const form = buildForm(projectsSchema, row);
    expect(form.title).toBe('Tallyproof'); expect(form.detailed_description).toBe(''); expect(form.team_size).toBe(1);
    expect(form.featured).toBe(true); expect(form.image_urls).toEqual([]); expect(form.status).toBe('active'); expect(form.awards).toBe('');
    const fresh = buildForm(projectsSchema, null);
    expect(fresh.team_size).toBe(1); expect(fresh.status).toBe('active'); expect(fresh.technologies).toEqual([]); expect(fresh.featured).toBe(false);
    expect(emptyValue({ kind: 'select', options: [{ value: 'x' }] })).toBe('x');
  });

  it('validates with fixed sentences', () => {
    const form = buildForm(projectsSchema, row);
    expect(validateForm(projectsSchema, form)).toEqual({});
    expect(validateForm(projectsSchema, { ...form, title: '  ' }).title).toBe('Title is required.');
    expect(validateForm(projectsSchema, { ...form, title: 'abc' }).title).toBe('Title needs at least 5 characters.');
    expect(validateForm(projectsSchema, { ...form, short_description: 'x'.repeat(301) }).short_description).toBe('Short description is over 300 characters.');
    expect(validateForm(projectsSchema, { ...form, team_size: 0 }).team_size).toBe('Team size must be at least 1.');
    expect(validateForm(projectsSchema, { ...form, team_size: 2.5 }).team_size).toBe('Team size must be a whole number.');
    expect(validateForm(projectsSchema, { ...form, live_url: 'tallyproof.example' }).live_url).toBe('Live link must start with https://.');
    expect(validateForm(projectsSchema, { ...form, github_urls: ['github.com/x'] }).github_urls).toBe('Every repository links entry must start with https://.');
    expect(validateForm(projectsSchema, { ...form, technologies: Array.from({ length: 21 }, (_, i) => `t${i}`) }).technologies).toBe('Technologies allows at most 20 entries.');
    expect(validateForm(projectsSchema, { ...form, status: 'odd' }).status).toBe('Visibility has an unknown value.');
    expect(validateForm(projectsSchema, { ...form, team_size: '' })).toEqual({});   // optional number may be blank
  });

  it('normalises into a row payload and detects changes', () => {
    const form = buildForm(projectsSchema, row);
    const payload = normalizeForm(projectsSchema, { ...form, awards: '  ', technologies: [' React ', '', 'Supabase'], team_size: '3' });
    expect(payload.awards).toBeNull(); expect(payload.technologies).toEqual(['React', 'Supabase']); expect(payload.team_size).toBe(3);
    expect(payload.short_description).toBe('Counting with proofs'); expect(payload.featured).toBe(true);
    expect(payload).not.toHaveProperty('order_index');   // order is written by the deck, not the dialog
    expect(isDirty(projectsSchema, form, row)).toBe(false);
    expect(isDirty(projectsSchema, { ...form, title: 'Tallyproof 2' }, row)).toBe(true);
    expect(isDirty(projectsSchema, { ...form, short_description: 'Counting with proofs' }, row)).toBe(false);   // whitespace only
    expect(isDirty(projectsSchema, buildForm(projectsSchema, null), null)).toBe(false);
  });

  it('adds list items cleanly and groups fields', () => {
    expect(addListItem(['a'], ' b ')).toEqual(['a', 'b']); expect(addListItem(['a'], 'a')).toEqual(['a']); expect(addListItem(['a'], '  ')).toEqual(['a']);
    const groups = projectsSchema.groups.map((g, i) => fieldsForGroup(projectsSchema, g, i).map((f) => f.key));
    expect(groups[0][0]).toBe('title'); expect(groups[2]).toEqual(['github_urls', 'live_url', 'image_urls']);
    expect(fieldsForGroup({ fields: [{ key: 'x' }, { key: 'y' }], groups: [{ keys: ['y'] }] }, { keys: ['y'] }, 0).map((f) => f.key)).toEqual(['x', 'y']);
  });
});

describe('deck order', () => {
  it('shows newest first, gives a new record the next index, and rewrites the column after a drag', () => {
    const rows = [{ id: 'a', order_index: 2 }, { id: 'b', order_index: 30 }, { id: 'c', order_index: null, created_at: '2026-01-01' }, { id: 'd', order_index: null, created_at: '2026-06-01' }];
    expect(deckOrder(rows).map((r) => r.id)).toEqual(['b', 'a', 'd', 'c']);
    expect(nextOrderIndex(rows)).toBe(31); expect(nextOrderIndex([])).toBe(1);
    expect(orderWrites(['b', 'a', 'c'])).toEqual([{ id: 'b', order_index: 3 }, { id: 'a', order_index: 2 }, { id: 'c', order_index: 1 }]);
  });

  it('describes a card', () => {
    const card = projectsSchema.card(row);
    expect(card).toMatchObject({ title: 'Tallyproof', subtitle: 'Web app · Oct to Nov 2026', chips: ['React', 'Supabase', 'Postgres'], image: null, flags: ['starred'] });
    expect(projectsSchema.card({ awards: 'First prize', status: 'inactive' }).flags).toEqual(['award', 'hidden']);
    expect(projectsSchema.searchText(row)).toContain('tallyproof');
    expect(projectsSchema.linkFor(row)).toBe('https://tallyproof.example');
  });
});

describe('changedColumns', () => {
  it('keeps only what the form changed, so a display default never reaches an empty column', () => {
    // status and team size are null in the row; the form shows "active" and 1 for them
    const sparse = { ...row, status: null, team_size: null };
    const form = { ...buildForm(projectsSchema, sparse), title: 'Tallyproof two' };
    const full = normalizeForm(projectsSchema, form);
    expect(full.status).toBe('active');                    // what a full payload would have written
    expect(changedColumns(projectsSchema, full, sparse)).toEqual({ title: 'Tallyproof two' });
    // an untouched form changes nothing; a real change to the defaulted column is kept
    expect(changedColumns(projectsSchema, normalizeForm(projectsSchema, buildForm(projectsSchema, sparse)), sparse)).toEqual({});
    expect(changedColumns(projectsSchema, { ...full, status: 'inactive' }, sparse)).toMatchObject({ status: 'inactive' });
  });

  it('writes a field the owner changed when the row stores something else than the form shows, and no other', () => {
    // status is null in the row; the owner switched Visibility away and back to Public, and renamed the project
    const sparse = { ...row, status: null, team_size: null };
    const full = normalizeForm(projectsSchema, { ...buildForm(projectsSchema, sparse), title: 'Tallyproof two' });
    expect(changedColumns(projectsSchema, full, sparse, new Set(['status', 'title']))).toEqual({ title: 'Tallyproof two', status: 'active' });
    // team size shows 1 for its null too, but the owner never changed it
    expect(changedColumns(projectsSchema, full, sparse, ['status'])).not.toHaveProperty('team_size');
    // a changed field whose stored value already is what the form shows adds nothing
    expect(changedColumns(projectsSchema, normalizeForm(projectsSchema, buildForm(projectsSchema, row)), row, ['status', 'title'])).toEqual({});
  });

  it('always keeps columns the form does not own (a group priority added by the deck)', () => {
    const full = normalizeForm(projectsSchema, buildForm(projectsSchema, row));
    expect(changedColumns(projectsSchema, { ...full, skill_type_priority: 3 }, row)).toEqual({ skill_type_priority: 3 });
  });

  it('tells a file in a bucket from any other web address', () => {
    expect(isBucketUrl('https://x.supabase.co/storage/v1/object/public/skill-icons/certifications/a.pdf', 'skill-icons')).toBe(true);
    expect(isBucketUrl('https://example.com/a.pdf', 'skill-icons')).toBe(false);
    expect(isBucketUrl('https://x.supabase.co/storage/v1/object/public/other/a.pdf', 'skill-icons')).toBe(false);
    expect(isBucketUrl('AWS SAA', 'skill-icons')).toBe(false);
    expect(isBucketUrl('https://example.com/a.pdf', undefined)).toBe(false);
  });
});
