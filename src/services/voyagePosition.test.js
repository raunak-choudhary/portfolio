import { CHAPTERS } from '../components/admin/Voyage/chapters';
import { VOYAGE_POSITION_KEY, clearVoyagePosition, readVoyagePosition, recordVoyagePosition } from './voyagePosition';

/** An in-memory stand-in for sessionStorage. */
const memoryStorage = () => {
  const map = new Map();
  return { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)), removeItem: (k) => map.delete(k), raw: map };
};

describe('voyagePosition', () => {
  it('records the route coordinate, its chapter and the theme, and reads them back', () => {
    const storage = memoryStorage();
    recordVoyagePosition({ f: 4.2345, theme: 'light' }, storage);
    expect(JSON.parse(storage.getItem(VOYAGE_POSITION_KEY))).toEqual({ f: 4.235, chapter: 'projects', theme: 'light' });
    expect(readVoyagePosition(storage)).toEqual({ f: 4.235, chapter: 'projects', theme: 'light' });
  });

  it('keeps only what it needs: no time, no record content', () => {
    const storage = memoryStorage();
    recordVoyagePosition({ f: 2, theme: 'dark', title: 'secret', email: 'a@b.c' }, storage);
    expect(Object.keys(JSON.parse(storage.getItem(VOYAGE_POSITION_KEY))).sort()).toEqual(['chapter', 'f', 'theme']);
  });

  it('clamps coordinates past either end and ignores a non-number', () => {
    const storage = memoryStorage();
    recordVoyagePosition({ f: 99 }, storage);
    expect(readVoyagePosition(storage)).toEqual({ f: CHAPTERS.length - 1, chapter: CHAPTERS[CHAPTERS.length - 1].id, theme: null });
    recordVoyagePosition({ f: -3 }, storage);
    expect(readVoyagePosition(storage).f).toBe(0);
    clearVoyagePosition(storage);
    recordVoyagePosition({ f: NaN }, storage);
    recordVoyagePosition({}, storage);
    expect(readVoyagePosition(storage)).toBeNull();
  });

  it('returns null when nothing was recorded, or the record does not parse', () => {
    const storage = memoryStorage();
    expect(readVoyagePosition(storage)).toBeNull();
    storage.setItem(VOYAGE_POSITION_KEY, '{not json');
    expect(readVoyagePosition(storage)).toBeNull();
    storage.setItem(VOYAGE_POSITION_KEY, JSON.stringify({ f: 'far', chapter: 'nowhere' }));
    expect(readVoyagePosition(storage)).toBeNull();
    expect(readVoyagePosition(null)).toBeNull();
  });

  it('falls back to the chapter id when the coordinate is broken, and drops an unknown theme', () => {
    const storage = memoryStorage();
    storage.setItem(VOYAGE_POSITION_KEY, JSON.stringify({ f: 1e9, chapter: 'skills', theme: 'neon' }));
    expect(readVoyagePosition(storage)).toEqual({ f: 8, chapter: 'skills', theme: null });
  });

  it('forgets the position, and survives storage that throws', () => {
    const storage = memoryStorage();
    recordVoyagePosition({ f: 1 }, storage);
    clearVoyagePosition(storage);
    expect(readVoyagePosition(storage)).toBeNull();
    const broken = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); }, removeItem: () => { throw new Error('blocked'); } };
    expect(() => recordVoyagePosition({ f: 1 }, broken)).not.toThrow();
    expect(readVoyagePosition(broken)).toBeNull();
    expect(() => clearVoyagePosition(broken)).not.toThrow();
  });

  it('uses sessionStorage by default', () => {
    recordVoyagePosition({ f: 1, theme: 'dark' });
    expect(window.sessionStorage.getItem(VOYAGE_POSITION_KEY)).toContain('"overview"');
    clearVoyagePosition();
    expect(window.sessionStorage.getItem(VOYAGE_POSITION_KEY)).toBeNull();
  });
});
