import { TILE_IDS, moveTile, percentChange, sanitizeOrder, sectionTallies, topIssues, weakestSections } from './bentoModel';

describe('bento model', () => {
  it('accepts only a complete permutation of the tiles as a stored order', () => {
    expect(sanitizeOrder(null)).toEqual(TILE_IDS);
    expect(sanitizeOrder(['health'])).toEqual(TILE_IDS);
    expect(sanitizeOrder([...TILE_IDS, 'bogus'])).toEqual(TILE_IDS);
    const reversed = [...TILE_IDS].reverse();
    expect(sanitizeOrder([...reversed, 'health'])).toEqual(reversed);
  });

  it('moves a tile and ignores bad indices', () => {
    expect(moveTile(['a', 'b', 'c'], 0, 2)).toEqual(['b', 'c', 'a']);
    expect(moveTile(['a', 'b', 'c'], 2, 0)).toEqual(['c', 'a', 'b']);
    expect(moveTile(['a', 'b', 'c'], 1, 1)).toEqual(['a', 'b', 'c']);
    expect(moveTile(['a', 'b', 'c'], 5, 0)).toEqual(['a', 'b', 'c']);
  });

  it('ranks issues critical first and tallies strong sections', () => {
    const sections = [
      { name: 'Work', completeness: 30, issues: [{ severity: 'critical', message: 'missing position' }] },
      { name: 'Skills', completeness: 94, issues: [{ severity: 'info', message: 'fine' }] },
      { name: 'Leadership', completeness: 85, issues: [{ severity: 'warning', message: 'missing image' }, { severity: 'critical', message: 'no name' }] },
    ];
    expect(topIssues(sections, 3).map((i) => `${i.section}:${i.severity}`)).toEqual(['Work:critical', 'Leadership:critical', 'Leadership:warning']);
    expect(weakestSections(sections, 2).map((s) => s.name)).toEqual(['Work', 'Leadership']);
    expect(sectionTallies(sections)).toEqual({ strong: 1, attention: 2, total: 3 });
    expect(sectionTallies(undefined)).toEqual({ strong: 0, attention: 0, total: 0 });
  });

  it('computes percentage change safely', () => {
    expect(percentChange(120, 100)).toBe(20); expect(percentChange(80, 100)).toBe(-20); expect(percentChange(5, 0)).toBeNull();
  });
});
