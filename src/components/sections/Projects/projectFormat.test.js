import { sortProjects, teamLabel, toHttpsUrl } from './projectFormat';

describe('teamLabel', () => {
  it('labels one person, or an unknown size, as Solo', () => {
    expect(teamLabel(1)).toBe('Solo');
    expect(teamLabel(null)).toBe('Solo');
    expect(teamLabel(undefined)).toBe('Solo');
    expect(teamLabel(0)).toBe('Solo');
    expect(teamLabel('abc')).toBe('Solo');
  });

  it('labels larger teams with their size', () => {
    expect(teamLabel(2)).toBe('Team of 2');
    expect(teamLabel('5')).toBe('Team of 5');
  });
});

describe('toHttpsUrl', () => {
  it('keeps a full https address as it is, without a trailing slash', () => {
    expect(toHttpsUrl('https://github.com/raunak-choudhary/tallyproof')).toBe(
      'https://github.com/raunak-choudhary/tallyproof',
    );
    expect(toHttpsUrl('https://github.com/raunak-choudhary/tallyproof/')).toBe(
      'https://github.com/raunak-choudhary/tallyproof',
    );
  });

  it('completes addresses stored without a scheme and upgrades http', () => {
    expect(toHttpsUrl('github.com/raunak-choudhary/dj-buddy')).toBe('https://github.com/raunak-choudhary/dj-buddy');
    expect(toHttpsUrl('  http://github.com/raunak-choudhary/knaq-iot-triage ')).toBe(
      'https://github.com/raunak-choudhary/knaq-iot-triage',
    );
  });

  it('rejects empty, non-web and malformed values', () => {
    expect(toHttpsUrl('')).toBe('');
    expect(toHttpsUrl(null)).toBe('');
    // Built at runtime so the linter does not mistake the test value for a real script URL.
    expect(toHttpsUrl(['javascript', 'alert(1)'].join(':'))).toBe('');
    expect(toHttpsUrl('mailto:someone@example.com')).toBe('');
    expect(toHttpsUrl('not a url')).toBe('');
  });
});

describe('sortProjects', () => {
  const project = (id, featured, order_index, created_at = '2025-01-01T00:00:00Z') => ({
    id,
    featured,
    order_index,
    created_at,
  });

  it('puts featured projects first, each group newest build first', () => {
    const sorted = sortProjects([
      project('old', false, 1),
      project('star-old', true, 20),
      project('new', false, 12),
      project('star-new', true, 30),
    ]);
    expect(sorted.map((p) => p.id)).toEqual(['star-new', 'star-old', 'new', 'old']);
  });

  it('places projects without an order after numbered ones, newest created first', () => {
    const sorted = sortProjects([
      project('none-old', false, null, '2024-01-01T00:00:00Z'),
      project('numbered', false, 3),
      project('none-new', false, undefined, '2025-06-01T00:00:00Z'),
    ]);
    expect(sorted.map((p) => p.id)).toEqual(['numbered', 'none-new', 'none-old']);
  });

  it('breaks equal order values by newest created first', () => {
    const sorted = sortProjects([
      project('a', false, 5, '2024-01-01T00:00:00Z'),
      project('b', false, 5, '2025-01-01T00:00:00Z'),
    ]);
    expect(sorted.map((p) => p.id)).toEqual(['b', 'a']);
  });

  it('handles empty and invalid input and does not mutate the input', () => {
    expect(sortProjects([])).toEqual([]);
    expect(sortProjects(null)).toEqual([]);
    const input = [project('x', false, 1), project('y', true, 2)];
    sortProjects(input);
    expect(input.map((p) => p.id)).toEqual(['x', 'y']);
  });
});
