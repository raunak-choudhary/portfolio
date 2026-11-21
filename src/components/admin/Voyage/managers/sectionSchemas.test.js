// The hero, about and skills managers: each declares the columns the admin
// data spec lists, with the classic limits, and its helpers (card, upload
// paths, order) behave on rows shaped like the live ones.

import { heroSchema } from './hero.schema';
import { aboutSchema, profileUpload } from './about.schema';
import { LEARNING_SOURCES, SKILL_TYPES, certificateUpload, iconUpload, skillOrder, skillsSchema } from './skills.schema';
import { buildForm, canDrag, groupRows, isDirty, isPublic, normalizeForm, validateForm } from './schemaModel';

const keys = (schema) => schema.fields.map((f) => f.key);
const field = (schema, key) => schema.fields.find((f) => f.key === key);

describe('hero schema', () => {
  const live = { id: 'h1', title: 'Hi, I am Raunak', subtitle: 'Engineer', description: 'Builds things.', highlights: ['One', 'Two', 'Three', 'Four'], cta_text: 'Explore', cta_link: '#navigation', is_active: true };
  it('is a singleton over every hero column', () => {
    expect(heroSchema.mode).toBe('singleton');
    expect(keys(heroSchema)).toEqual(['title', 'subtitle', 'description', 'highlights', 'cta_text', 'cta_link', 'resume_url', 'is_active']);
    expect(canDrag(heroSchema)).toBe(false);
  });
  it('accepts the live row unchanged and keeps the anchor link', () => {
    const form = buildForm(heroSchema, live);
    expect(validateForm(heroSchema, form)).toEqual({});
    expect(isDirty(heroSchema, form, live)).toBe(false);
    expect(normalizeForm(heroSchema, form).cta_link).toBe('#navigation');
  });
  it('enforces the classic limits', () => {
    const errors = validateForm(heroSchema, { ...buildForm(heroSchema, live), title: 'Hey', highlights: ['1', '2', '3', '4', '5', '6', '7'], cta_link: 'navigation' });
    expect(Object.keys(errors).sort()).toEqual(['cta_link', 'highlights', 'title']);
  });
  it('shows three highlights on its card and is hidden when switched off', () => {
    expect(heroSchema.card(live).chips).toEqual(['One', 'Two', 'Three']);
    expect(isPublic(heroSchema, { ...live, is_active: false })).toBe(false);
  });
});

describe('about schema', () => {
  const live = {
    id: 'a1', about_me_title: 'About Me', about_me_content: 'Text', basic_info_title: 'Basic Info', is_active: true,
    basic_info: [{ key: 'Degree', value: 'MS', order_index: 0 }, { key: 'City', value: 'New York', order_index: 1 }],
    profile_image_about: 'https://x.supabase.co/storage/v1/object/public/profile-images/about/a.png', profile_image_info: null, profile_image_url: null,
  };
  it('covers every edited column and never the legacy profile_image_url', () => {
    expect(keys(aboutSchema)).toEqual(['about_me_title', 'about_me_content', 'profile_image_about', 'basic_info_title', 'basic_info', 'profile_image_info', 'is_active']);
    expect(keys(aboutSchema)).not.toContain('profile_image_url');
    expect(normalizeForm(aboutSchema, buildForm(aboutSchema, live))).not.toHaveProperty('profile_image_url');
  });
  it('round-trips the live basic info without a change', () => {
    const form = buildForm(aboutSchema, live);
    expect(validateForm(aboutSchema, form)).toEqual({});
    expect(isDirty(aboutSchema, form, live)).toBe(false);
    expect(aboutSchema.card(live).subtitle).toBe('2 basic info items');
  });
  it('requires basic info and uploads profile images under about/', () => {
    expect(validateForm(aboutSchema, { ...buildForm(aboutSchema, live), basic_info: [] }).basic_info).toBe('Basic info needs at least one entry.');
    const up = profileUpload('info');
    expect(up.bucket).toBe('profile-images');
    expect(up.path({ stamp: 99, ext: 'webp' })).toBe('about/info-profile-99.webp');
    expect(field(aboutSchema, 'profile_image_about').upload.maxBytes).toBe(5 * 1024 * 1024);
  });
});

describe('skills schema', () => {
  const row = { id: 7, skill_name: 'C++ & Rust', category: 'Languages', skill_type: 'Programming Languages', skill_type_priority: 1, proficiency_level: 8, learning_source: 'Self-learning', certifications: ['AWS SAA'], projects_used: [], is_featured: false, order_index: 0, status: 'active', icon_url: null, description: '' };
  it('covers every skills column, groups by type and declares its cleanup', () => {
    expect(keys(skillsSchema)).toEqual(['skill_name', 'category', 'skill_type', 'proficiency_level', 'learning_source', 'description', 'icon_url', 'certifications', 'projects_used', 'is_featured', 'order_index', 'status']);
    expect(skillsSchema.group).toEqual(expect.objectContaining({ key: 'skill_type', priorityKey: 'skill_type_priority' }));
    expect(skillsSchema.cleanup.map((c) => c.key)).toEqual(['icon_url', 'certifications']);
    expect(canDrag(skillsSchema)).toBe(false);
    expect(SKILL_TYPES).toHaveLength(17); expect(LEARNING_SOURCES).toHaveLength(12);
  });
  it('keeps order 0, an unknown stored type and typed certification names', () => {
    const legacy = { ...row, skill_type: 'Quantum', learning_source: 'Dreams' };
    const form = buildForm(skillsSchema, legacy);
    expect(validateForm(skillsSchema, form)).toEqual({});
    expect(isDirty(skillsSchema, form, legacy)).toBe(false);
    const out = normalizeForm(skillsSchema, form);
    expect(out.order_index).toBe(0); expect(out.skill_type).toBe('Quantum'); expect(out.certifications).toEqual(['AWS SAA']);
    expect(normalizeForm(skillsSchema, { ...form, skill_type: '' }).skill_type).toBeNull();
  });
  it('checks proficiency from 1 to 10 in whole numbers', () => {
    const form = buildForm(skillsSchema, row);
    expect(validateForm(skillsSchema, { ...form, proficiency_level: 11 }).proficiency_level).toBeTruthy();
    expect(validateForm(skillsSchema, { ...form, proficiency_level: 2.5 }).proficiency_level).toBeTruthy();
  });
  it('builds storage paths per skill id with a clean name', () => {
    expect(iconUpload.path({ id: 7, form: row, stamp: 5, ext: 'svg' })).toBe('icons/skill_7/c-rust-icon-5.svg');
    expect(certificateUpload.path({ id: 7, form: { skill_name: '' }, index: 1, stamp: 5, ext: 'pdf' })).toBe('certifications/skill_7/skill-cert-5-2.pdf');
    expect(iconUpload.accept).toContain('image/svg+xml');
    expect(certificateUpload.perBatch).toBe(5);
  });
  it('orders featured first, then order number with unset last, then name', () => {
    const rows = [
      { id: 1, skill_name: 'B', order_index: 2 }, { id: 2, skill_name: 'A', order_index: null }, { id: 3, skill_name: 'Z', order_index: 9, is_featured: true },
      { id: 4, skill_name: 'A', order_index: 2 }, { id: 5, skill_name: 'C', order_index: 0 },
    ];
    expect(skillOrder(rows).map((r) => r.id)).toEqual([3, 5, 4, 1, 2]);
  });
  it('shows a compact card and groups rows by type priority', () => {
    expect(skillsSchema.card(row)).toEqual(expect.objectContaining({ title: 'C++ & Rust', chips: ['8/10', 'Self-learning'], flags: [] }));
    expect(skillsSchema.card({ ...row, is_featured: true, proficiency_level: null }).chips).toEqual(['Self-learning']);
    const groups = groupRows(skillsSchema, [row, { ...row, id: 8, skill_type: 'Other', skill_type_priority: 99 }]);
    expect(groups.map((g) => g.label)).toEqual(['Programming Languages', 'Other']);
    expect(isPublic(skillsSchema, { ...row, status: 'draft' })).toBe(false);
  });
});
