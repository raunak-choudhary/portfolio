import fs from 'fs';
import path from 'path';
import {
  SECTION_HEALTH_RULES,
  evaluateContentSectionHealth,
  summarizePortfolioHealth
} from './analyticsService';

jest.mock('./supabaseClient', () => ({
  supabase: {
    from: jest.fn(),
    rpc: jest.fn()
  }
}));

describe('analyticsService portfolio health helpers', () => {
  it('scores section completeness from required fields and quality groups', () => {
    const result = evaluateContentSectionHealth({
      name: 'Projects',
      weight: 25,
      minItems: 2,
      requiredFields: ['title', 'short_description'],
      qualityGroups: [
        { name: 'images', label: 'image', fields: ['image_urls', 'image_url'], issueType: 'missing_image' },
        { name: 'proof', label: 'proof link', fields: ['github_urls', 'github_url', 'live_url'], issueType: 'missing_proof_link' }
      ],
      descriptionFields: ['short_description']
    }, [
      {
        title: 'Portfolio CMS',
        short_description: 'Too short',
        image_urls: [],
        github_urls: [],
        live_url: '',
        status: 'active'
      },
      {
        title: 'Secure Admin Dashboard',
        short_description: 'A secure portfolio admin dashboard with contact attachment handling and content management.',
        image_urls: ['https://example.com/admin.png'],
        github_urls: ['https://github.com/example/admin'],
        status: 'active'
      }
    ]);

    expect(result).toEqual(expect.objectContaining({
      name: 'Projects',
      weight: 25,
      totalItems: 2,
      activeItems: 2,
      completeness: 68,
      hasContent: true
    }));
    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'missing_image', severity: 'warning' }),
      expect.objectContaining({ type: 'missing_proof_link', severity: 'warning' }),
      expect.objectContaining({ type: 'weak_description', severity: 'info' })
    ]));
  });

  it('marks required sections with no active rows as inactive', () => {
    const result = evaluateContentSectionHealth({
      name: 'Education',
      weight: 15,
      minItems: 1,
      requiredFields: ['degree', 'institution']
    }, [
      {
        degree: 'MS Computer Science',
        institution: 'NYU',
        status: 'draft'
      }
    ]);

    expect(result).toEqual(expect.objectContaining({
      completeness: 0,
      hasContent: false,
      activeItems: 0
    }));
    expect(result.issues).toContainEqual(expect.objectContaining({
      type: 'inactive_required_section',
      severity: 'critical'
    }));
  });

  it('summarizes weighted health and prioritizes issues', () => {
    const summary = summarizePortfolioHealth([
      {
        name: 'Projects',
        weight: 25,
        completeness: 68,
        issues: [
          { type: 'missing_image', severity: 'warning', message: 'Project missing image' }
        ]
      },
      {
        name: 'Education',
        weight: 15,
        completeness: 0,
        issues: [
          { type: 'inactive_required_section', severity: 'critical', message: 'Education has no active entries' }
        ]
      },
      {
        name: 'Skills',
        weight: 10,
        completeness: 100,
        issues: []
      }
    ]);

    expect(summary.score).toBe(54);
    expect(summary.status).toBe('needs_attention');
    expect(summary.issueCounts).toEqual({
      critical: 1,
      warning: 1,
      info: 0
    });
    expect(summary.topIssues[0]).toEqual(expect.objectContaining({
      severity: 'critical',
      section: 'Education'
    }));
  });
});

describe('portfolio health rules against the real columns', () => {
  // Each recorded fixture holds live rows of its table, so its keys are the
  // table's columns. A rule naming a column that does not exist reports a gap
  // on every row (the skills, work and recommendations rules once did).
  const columnsOf = (table) => {
    const file = path.join(__dirname, '../../e2e/fixtures', `${table}.json`);
    const rows = JSON.parse(fs.readFileSync(file, 'utf8'));
    return new Set(rows.flatMap((row) => Object.keys(row)));
  };

  it.each(SECTION_HEALTH_RULES.map((rule) => [rule.name, rule]))('%s names only columns its table has', (name, rule) => {
    const columns = columnsOf(rule.table);
    [...rule.requiredFields, ...(rule.descriptionFields || [])].forEach((field) => expect([name, field, columns.has(field)]).toEqual([name, field, true]));
    (rule.qualityGroups || []).forEach((group) => {
      expect([name, group.name, group.fields.some((field) => columns.has(field))]).toEqual([name, group.name, true]);
    });
  });
});
