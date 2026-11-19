import fs from 'fs';
import path from 'path';
import { SECTION_HEALTH_RULES } from '../../../services/analyticsService';
import {
  NOTE_MAX, STALE_DAYS, availableFilters, buildFixQueue, chapterForTable, checkItem, filterGroups, findRuleTarget, gainText,
  resolveTargetField, round1, ruleKeyFor, scoreExplainer, staleSections, stepIntent, walkIntent,
} from './fixQueueModel';
import { projectsSchema } from './managers/projects.schema';

jest.mock('../../../services/supabaseClient', () => ({ supabase: { from: jest.fn(), rpc: jest.fn() } }));

const fixture = (table) => JSON.parse(fs.readFileSync(path.join(__dirname, '../../../../e2e/fixtures', `${table}.json`), 'utf8'));
const allFixtures = () => Object.fromEntries(SECTION_HEALTH_RULES.map((r) => [r.table, fixture(r.table)]));

/** Fills the gap one item has, the way an owner would in the form. */
function fix(rowsByTable, group, item) {
  const rows = rowsByTable[group.table];
  const i = rows.findIndex((r) => String(r.id) === String(item.recordId));
  rows[i] = { ...rows[i], [group.fields[0]]: group.kind === 'quality' ? ['https://example.com/proof'] : 'A description long enough to pass the forty character check.' };
}

// a small, hand-checkable rule set: total weight 100
const RULES = [
  { name: 'Projects', table: 'projects', weight: 60, minItems: 2, requiredFields: ['title', 'short_description'], descriptionFields: ['short_description'],
    qualityGroups: [{ name: 'images', label: 'project image', fields: ['image_urls'], issueType: 'missing_image' }, { name: 'proof', label: 'GitHub or live link', fields: ['github_urls'], issueType: 'missing_proof_link' }] },
  { name: 'Skills', table: 'skills', weight: 40, minItems: 4, requiredFields: ['skill_name'],
    qualityGroups: [{ name: 'category', label: 'category', fields: ['category'], issueType: 'missing_required_field' }] },
];
const LONG = 'A description that is comfortably longer than forty characters.';
const rowsSmall = () => ({
  projects: [
    { id: 1, title: 'Alpha', short_description: LONG, image_urls: [], github_urls: ['https://github.com/a'] },
    { id: 2, title: 'Beta', short_description: 'Too short', image_urls: ['x.png'], github_urls: [] },
    { id: 3, title: 'Gamma', short_description: '', image_urls: [], github_urls: [], status: 'inactive' },
  ],
  skills: [{ id: 's1', skill_name: 'Go', category: '' }, { id: 's2', skill_name: 'Rust', category: 'Languages' }],
});

describe('rule keys and groups', () => {
  it('keys a group as table:name with hyphens and a required field as table:field', () => {
    expect(ruleKeyFor('internships', 'company logo')).toBe('internships:company-logo');
    expect(ruleKeyFor('skills', 'category')).toBe('skills:category');
    expect(findRuleTarget('projects:images').group.name).toBe('images');
    expect(findRuleTarget('leadership:organization').field).toBe('organization');
    expect(findRuleTarget('nope:none')).toBeNull();
  });

  it('builds one group per gap with the right items, skipping inactive rows', () => {
    const q = buildFixQueue({ rowsByTable: rowsSmall(), rules: RULES });
    const keys = q.groups.map((g) => g.ruleKey).sort();
    expect(keys).toEqual(['projects:images', 'projects:proof', 'projects:short_description', 'skills:category']);
    const images = q.groups.find((g) => g.ruleKey === 'projects:images');
    expect(images.items.map((i) => i.label)).toEqual(['Alpha']);   // Gamma is inactive
    expect(images.chapterId).toBe('projects');
    expect(images.title).toBe('1 project has no picture');
  });

  it('computes gains from the rule arithmetic', () => {
    const q = buildFixQueue({ rowsByTable: rowsSmall(), rules: RULES });
    const by = Object.fromEntries(q.groups.map((g) => [g.ruleKey, g]));
    // projects: share .6, N 2, volume 1; quality item = .6 * 15 / 2 = 4.5; required item = .6 * 35 / 2 = 10.5
    expect(by['projects:images'].gain).toBeCloseTo(4.5, 10);
    expect(by['projects:proof'].gain).toBeCloseTo(4.5, 10);
    expect(by['projects:short_description'].gain).toBeCloseTo(10.5, 10);
    // skills: share .4, N 2 of 4 so volume .5; one quality group: .4 * 30 / 2 * .5 = 3
    expect(by['skills:category'].gain).toBeCloseTo(3, 10);
    expect(gainText(by['skills:category'].gain)).toBe('+3.0');
  });

  it('sorts by gain, then severity', () => {
    const q = buildFixQueue({ rowsByTable: rowsSmall(), rules: RULES });
    expect(q.groups.map((g) => g.ruleKey)).toEqual(['projects:short_description', 'projects:proof', 'projects:images', 'skills:category']);
    // equal gains: the critical group comes first
    const tie = buildFixQueue({
      rules: [{ name: 'S', table: 'skills', weight: 100, minItems: 1, requiredFields: [], qualityGroups: [
        { name: 'b', label: 'b', fields: ['b'], issueType: 'missing_image' }, { name: 'a', label: 'a', fields: ['a'], issueType: 'missing_required_field' }] }],
      rowsByTable: { skills: [{ id: 1 }] },
    });
    expect(tie.groups.map((g) => g.severity)).toEqual(['critical', 'warning']);
  });
});

describe('severity and copy', () => {
  it('marks missing required critical, weak descriptions as tips and quality gaps as warnings', () => {
    const q = buildFixQueue({ rowsByTable: rowsSmall(), rules: RULES });
    const by = Object.fromEntries(q.groups.map((g) => [g.ruleKey, g]));
    expect(by['projects:short_description'].severity).toBe('info');
    expect(by['projects:short_description'].items[0]).toMatchObject({ state: 'weak', task: 'write a longer short description' });
    expect(by['projects:short_description'].title).toBe('1 project has a short description under 40 characters');
    expect(by['projects:images'].severity).toBe('warning');
    expect(by['skills:category'].severity).toBe('critical');   // the rule marks a missing category as a required gap
  });

  it('gives every group a recruiter-facing reason and a field label', () => {
    const q = buildFixQueue({ rowsByTable: allFixtures() });
    q.groups.forEach((g) => { expect(g.why.length).toBeGreaterThan(30); expect(g.fieldLabel).toBeTruthy(); expect(g.items.every((i) => i.task)).toBe(true); });
    const leadership = q.groups.find((g) => g.table === 'leadership');
    expect(leadership).toMatchObject({ severity: 'critical', kind: 'required' });
    expect(leadership.items[0].task).toMatch(/^fill in the /);
  });

  it('names singleton sections without a count', () => {
    const q = buildFixQueue({ rules: [SECTION_HEALTH_RULES[0]], rowsByTable: { hero_content: [{ id: 1, title: 'Hi', description: LONG }] } });
    expect(q.groups[0].title).toBe('The hero section has no call-to-action link');
  });

  it('describes a mixed required group without claiming every row is short', () => {
    const rows = rowsSmall();
    rows.projects[0].short_description = '';
    const g = buildFixQueue({ rowsByTable: rows, rules: RULES }).groups.find((x) => x.ruleKey === 'projects:short_description');
    expect(g.title).toBe('2 projects need a short description of 40 characters or more');
    expect(g.severity).toBe('critical');
  });
});

describe('scores', () => {
  it('reports the same integer score as the existing health summary', () => {
    expect(buildFixQueue({ rowsByTable: allFixtures() }).score).toBe(97);
  });

  it('keeps the precise score within rounding of the integer score', () => {
    const q = buildFixQueue({ rowsByTable: allFixtures() });
    expect(Math.abs(q.preciseScore - q.score)).toBeLessThan(1);
    expect(q.afterEveryFix).toBeCloseTo(q.scoreWithDismissals + q.totalGain, 10);
  });

  it('reaches the predicted after-every-fix score when every item is fixed (fixtures)', () => {
    const rows = allFixtures();
    const q = buildFixQueue({ rowsByTable: rows });
    expect(q.groups.length).toBeGreaterThan(0);
    q.groups.forEach((g) => g.items.forEach((item) => fix(rows, g, item)));
    const after = buildFixQueue({ rowsByTable: rows });
    expect(after.groups).toEqual([]);
    expect(Math.abs(after.preciseScore - q.afterEveryFix)).toBeLessThan(0.05);
    expect(round1(after.preciseScore)).toBe(round1(q.afterEveryFix));
  });

  it('reaches the predicted score with a volume multiplier below one', () => {
    const rows = rowsSmall();
    const q = buildFixQueue({ rowsByTable: rows, rules: RULES });
    q.groups.forEach((g) => g.items.forEach((item) => fix(rows, g, item)));
    const after = buildFixQueue({ rowsByTable: rows, rules: RULES });
    // projects 60 at full volume, skills 40 at half volume: 60 + 20
    expect(after.preciseScore).toBeCloseTo(80, 10);
    expect(q.afterEveryFix).toBeCloseTo(80, 10);
  });

  it('counts a table that failed to load as zero and names it', () => {
    const q = buildFixQueue({ rowsByTable: { projects: rowsSmall().projects }, rules: RULES });
    expect(q.unavailable).toEqual(['Skills']);
    expect(q.groups.every((g) => g.table === 'projects')).toBe(true);
  });
});

describe('dismissals', () => {
  const D = (over) => ({ id: 'd1', ruleKey: 'projects:images', recordId: null, note: null, createdAt: '2026-11-12T10:00:00Z', ...over });

  it('hides a whole group and counts its items as passing in scoreWithDismissals only', () => {
    const plain = buildFixQueue({ rowsByTable: rowsSmall(), rules: RULES });
    const q = buildFixQueue({ rowsByTable: rowsSmall(), rules: RULES, dismissals: [D()] });
    expect(q.groups.find((g) => g.ruleKey === 'projects:images')).toBeUndefined();
    expect(q.preciseScore).toBeCloseTo(plain.preciseScore, 10);
    expect(q.scoreWithDismissals).toBeCloseTo(plain.preciseScore + 4.5, 10);
    expect(q.score).toBe(plain.score);
    expect(q.dismissed[0]).toMatchObject({ title: 'All projects that have no picture', covers: 1, section: 'Projects' });
  });

  it('hides a single item and keeps the rest of its group', () => {
    const rows = rowsSmall();
    rows.projects[1].image_urls = [];
    const q = buildFixQueue({ rowsByTable: rows, rules: RULES, dismissals: [D({ recordId: '2', note: 'Not worth a picture' })] });
    const images = q.groups.find((g) => g.ruleKey === 'projects:images');
    expect(images.items.map((i) => i.label)).toEqual(['Alpha']);
    expect(q.dismissed[0]).toMatchObject({ title: 'Beta has no picture', note: 'Not worth a picture', covers: 1 });
  });

  it('describes a dismissal whose record or rule is gone', () => {
    const q = buildFixQueue({ rowsByTable: rowsSmall(), rules: RULES, dismissals: [D({ id: 'a', recordId: 99 }), D({ id: 'b', ruleKey: 'old:rule' })] });
    expect(q.dismissed.map((d) => d.title)).toEqual(['A removed project has no picture', 'A check that no longer exists']);
    expect(q.dismissed.map((d) => d.covers)).toEqual([0, 0]);
  });

  it('caps notes at the table limit', () => { expect(NOTE_MAX).toBe(140); });
});

describe('filters', () => {
  it('filters by severity and category and offers only useful chips', () => {
    const q = buildFixQueue({ rowsByTable: rowsSmall(), rules: RULES });
    expect(filterGroups(q.groups, 'critical').map((g) => g.ruleKey)).toEqual(['skills:category']);
    expect(filterGroups(q.groups, 'images').map((g) => g.ruleKey)).toEqual(['projects:images']);
    expect(filterGroups(q.groups, 'proof').map((g) => g.ruleKey)).toEqual(['projects:proof']);
    expect(filterGroups(q.groups, 'writing').map((g) => g.ruleKey).sort()).toEqual(['projects:short_description', 'skills:category']);
    expect(filterGroups(q.groups, 'all')).toHaveLength(4);
    expect(availableFilters([]).map((f) => f.id)).toEqual(['all']);
  });
});

describe('stale sections', () => {
  const now = new Date('2026-11-19T12:00:00Z');
  it('lists sections over 90 days, oldest first, with their chapter', () => {
    const out = staleSections([
      { table: 'leadership', section: 'Leadership', at: '2026-06-29T12:00:00Z' },
      { table: 'projects', section: 'Projects', at: '2026-11-10T12:00:00Z' },
      { table: 'recommendations', section: 'Recommendations', at: '2026-07-24T12:00:00Z' },
      { table: 'skills', section: 'Skills', at: null },
    ], now);
    expect(out.map((s) => [s.section, s.days, s.chapterId])).toEqual([['Leadership', 143, 'leadership'], ['Recommendations', 118, 'recommendations']]);
  });
  it('treats exactly 90 days as fresh', () => {
    expect(STALE_DAYS).toBe(90);
    expect(staleSections([{ table: 'projects', section: 'Projects', at: '2026-08-21T12:00:00Z' }], now)).toEqual([]);
  });
});

describe('how the score works', () => {
  it('quotes the real weights and shares', () => {
    const text = scoreExplainer();
    expect(text).toContain('Projects 20');
    expect(text).toContain('Hero 12');
    expect(text).toContain('100 in all');
    expect(text).toContain('earns 70');
    expect(text).toContain('30 for its quality checks');
    expect(text).toContain('Skills 8');
    expect(text).not.toContain('Projects 22');
  });
});

describe('checkItem', () => {
  it('says whether a saved row now passes', () => {
    expect(checkItem('projects:images', { id: 1, image_urls: ['a.png'] })).toEqual({ passes: true, state: null });
    expect(checkItem('projects:images', { id: 1, image_urls: [] })).toEqual({ passes: false, state: 'missing' });
    expect(checkItem('projects:short_description', { id: 1, short_description: 'short' })).toEqual({ passes: false, state: 'weak' });
    expect(checkItem('projects:short_description', { id: 1, short_description: LONG })).toEqual({ passes: true, state: null });
    expect(checkItem('projects:images', { id: 1, status: 'inactive' })).toMatchObject({ passes: true, inactive: true });
    expect(checkItem('nope:x', { id: 1 }).passes).toBe(false);
  });
});

describe('walk intents', () => {
  const group = () => buildFixQueue({ rowsByTable: (() => { const r = rowsSmall(); r.projects[1].image_urls = []; return r; })(), rules: RULES }).groups.find((g) => g.ruleKey === 'projects:images');

  it('starts at the first item, or at a chosen one', () => {
    const intent = walkIntent(group(), { field: 'image_urls', score: 90 });
    expect(intent).toMatchObject({ table: 'projects', recordId: 1, mode: 'edit', field: 'image_urls', walk: { ruleKey: 'projects:images', ids: [1, 2], index: 0, score: 90 } });
    expect(walkIntent(group(), { startId: '2' }).walk.index).toBe(1);
  });

  it('steps forward, adding a fixed item to the running score, and ends', () => {
    const first = walkIntent(group(), { score: 90 });
    const second = stepIntent(first, { fixedGain: 2.25 });
    expect(second).toMatchObject({ recordId: 2, walk: { index: 1, score: 92.25, fixed: [1] } });
    expect(stepIntent(second)).toBeNull();
    expect(stepIntent(null)).toBeNull();
  });

  it('resolves the target field against the form', () => {
    expect(resolveTargetField(projectsSchema, ['image_urls', 'image_url'])).toBe('image_urls');
    expect(resolveTargetField(projectsSchema, ['github_urls', 'github_url', 'live_url'])).toBe('github_urls');
    expect(resolveTargetField(projectsSchema, ['nope'])).toBeNull();
  });

  it('maps tables to chapters', () => {
    expect(chapterForTable('work_experience')).toBe('work');
    expect(chapterForTable('missing')).toBeNull();
  });
});
