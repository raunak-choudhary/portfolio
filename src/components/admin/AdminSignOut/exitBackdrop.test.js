import { CHAPTERS, chapterIndex } from '../Voyage/chapters';
import { DEFAULT_POSITION, chooseExitBackdrop, skyCovered } from './exitBackdrop';

const last = CHAPTERS.length - 1;

describe('chooseExitBackdrop', () => {
  it('freezes the voyage field where the camera was, in the recorded theme', () => {
    const f = chapterIndex('projects') + 0.25;
    const choice = chooseExitBackdrop({ webgl: true, position: { f, chapter: 'projects', theme: 'light' }, fallbackTheme: 'dark' });
    expect(choice).toEqual({ kind: 'field', scrollFraction: f / last, chapter: 'projects', theme: 'light', recorded: true });
  });

  it('uses the settings theme when the record names none', () => {
    const choice = chooseExitBackdrop({ webgl: true, position: { f: 3, chapter: 'about', theme: null }, fallbackTheme: 'light' });
    expect(choice.theme).toBe('light');
    expect(choice.recorded).toBe(true);
  });

  it('opens on the prologue when nothing was recorded (a direct visit or the classic sign-out)', () => {
    const choice = chooseExitBackdrop({ webgl: true, position: null, fallbackTheme: 'dark' });
    expect(choice).toEqual({ kind: 'field', scrollFraction: 0, chapter: DEFAULT_POSITION.chapter, theme: 'dark', recorded: false });
    expect(choice.chapter).toBe('earth');
  });

  it('falls back to the voyage flat sky without WebGL, recorded position or not', () => {
    expect(chooseExitBackdrop({ webgl: false, position: { f: 5, chapter: 'internships', theme: 'dark' } }).kind).toBe('flat');
    expect(chooseExitBackdrop({ webgl: false, position: null }).kind).toBe('flat');
  });

  it('reaches the last chapter at a scroll fraction of one', () => {
    expect(chooseExitBackdrop({ webgl: true, position: { f: last, chapter: CHAPTERS[last].id, theme: 'dark' } }).scrollFraction).toBe(1);
  });
});

describe('skyCovered', () => {
  it('is true only while the film is opaque black', () => {
    expect(skyCovered('exit dim clap-in chalk')).toBe(false);
    expect(skyCovered('exit dim chalk snap black')).toBe(true);
    expect(skyCovered('exit dim chalk snap leader')).toBe(true);
    expect(skyCovered('exit dim chalk snap credits')).toBe(true);
    expect(skyCovered('exit dim chalk snap card card-in')).toBe(false);
    expect(skyCovered('')).toBe(false);
  });
});
