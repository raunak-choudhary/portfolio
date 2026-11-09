import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildImportSql, sqlJson, sqlText, validateSeed } from './projects-import.mjs';

const project = (overrides = {}) => ({
  order_index: 1,
  existing_title: null,
  title: 'Example Platform',
  github_urls: ['https://github.com/raunak-choudhary/example'],
  team_size: 1,
  duration: 'Jan 2026',
  project_type: 'Backend Platform',
  short_description: 'Does something useful.',
  detailed_description: 'Explains how it works.',
  technologies: ['Python'],
  key_features: ['One', 'Two', 'Three'],
  featured: false,
  awards: null,
  ...overrides,
});

describe('sql quoting', () => {
  it('escapes single quotes and renders null', () => {
    assert.equal(sqlText("Visitor's browser"), "'Visitor''s browser'");
    assert.equal(sqlText(null), 'null');
    assert.equal(sqlText(undefined), 'null');
  });

  it('renders arrays as jsonb literals with quotes escaped', () => {
    assert.equal(sqlJson(["user's cards"]), `'["user''s cards"]'::jsonb`);
    assert.equal(sqlJson(undefined), `'[]'::jsonb`);
  });
});

describe('validateSeed', () => {
  it('accepts a well-formed seed', () => {
    assert.equal(validateSeed({ projects: [project()] }).length, 1);
  });

  const rejects = (overrides, pattern) => assert.throws(() => validateSeed({ projects: [project(overrides)] }), pattern);

  it('rejects parentheses in titles', () => rejects({ title: 'Game (C++)' }, /parentheses/));
  it('rejects GitHub URLs that are not full https addresses', () => {
    rejects({ github_urls: ['github.com/raunak-choudhary/example'] }, /full https/);
    rejects({ github_urls: [] }, /at least one GitHub URL/);
  });
  it('rejects fewer than 3 or more than 5 key features', () => {
    rejects({ key_features: ['One', 'Two'] }, /3 to 5/);
    rejects({ key_features: ['1', '2', '3', '4', '5', '6'] }, /3 to 5/);
  });
  it('rejects a missing team size and empty descriptions', () => {
    rejects({ team_size: 0 }, /team_size/);
    rejects({ short_description: ' ' }, /short_description is required/);
  });
  it('rejects text that would end the dollar-quoted block', () => rejects({ detailed_description: 'a $$ b' }, /\$\$/));
  it('rejects duplicate titles and duplicate order values', () => {
    assert.throws(() => validateSeed({ projects: [project(), project({ order_index: 2 })] }), /duplicate title/);
    assert.throws(() => validateSeed({ projects: [project(), project({ title: 'Other' })] }), /order_index/);
  });
  it('rejects an empty seed', () => assert.throws(() => validateSeed({ projects: [] }), /no projects/));
  it('accepts a full https live URL or none, and rejects anything else', () => {
    assert.equal(validateSeed({ projects: [project({ live_url: 'https://example.github.io/demo/' })] }).length, 1);
    assert.equal(validateSeed({ projects: [project({ live_url: null })] }).length, 1);
    rejects({ live_url: 'example.github.io/demo' }, /live_url must be a full https address/);
    rejects({ live_url: 'http://example.com' }, /live_url must be a full https address/);
  });
});

describe('buildImportSql', () => {
  const seed = {
    projects: [
      project({ order_index: 2, title: 'New One', awards: 'First Prize, Example Hackathon' }),
      project({ order_index: 1, title: 'Renamed', existing_title: "Old Title's Name", featured: true, team_size: 3 }),
    ],
  };
  const sql = buildImportSql(seed);

  it('wraps everything in one block that checks the final active count', () => {
    assert.match(sql, /^-- Projects import/);
    assert.match(sql, /do \$\$\n/);
    assert.match(sql, /expected 2 active projects after the import/);
    assert.match(sql, /end \$\$;\n$/);
  });

  it('updates an existing row by its current title and requires exactly one match', () => {
    assert.match(sql, /where title = 'Old Title''s Name';/);
    assert.match(sql, /if affected <> 1 then raise exception/);
    assert.match(sql, /title = 'Renamed'/);
    assert.match(sql, /featured = true/);
    assert.match(sql, /team_size = 3/);
  });

  it('inserts a new row only when the title is free, with the award', () => {
    assert.match(sql, /if exists \(select 1 from public\.projects where title = 'New One'\)/);
    assert.match(sql, /'First Prize, Example Hackathon'/);
  });

  it('never deletes, never touches images, and clears challenges and learnings', () => {
    assert.doesNotMatch(sql, /\bdelete\b/i);
    assert.doesNotMatch(sql, /image_urls/);
    assert.match(sql, /challenges = null/);
    assert.match(sql, /learnings = null/);
  });

  it('orders statements by build order', () => {
    assert.ok(sql.indexOf('-- 1. Renamed') < sql.indexOf('-- 2. New One'));
  });

  it('builds the committed import from the committed seed without errors', () => {
    const real = JSON.parse(readFileSync('supabase/seed/projects.json', 'utf8'));
    const out = buildImportSql(real);
    assert.match(out, /expected 30 active projects/);
    assert.equal((out.match(/insert into public\.projects/g) || []).length, 14);
    assert.equal((out.match(/get diagnostics affected/g) || []).length, 16);
    assert.equal((out.match(/live_url = 'https:/g) || []).length + (out.match(/, 'https:\/\/[^']+', null, null, 'active'\)/g) || []).length, 5);
  });
});
