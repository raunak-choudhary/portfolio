import {
  CAUGHT_LINE,
  GREETING,
  RARE_OPENINGS,
  TIMELINE,
  VOICE_LINES,
  buildStatusLines,
  bumpRabbitTally,
  decodeFrame,
  formatNewYork,
  isInitialsColumn,
  pickGreeting,
  readMuted,
  readRabbitTally,
  writeMuted,
} from './entryModel';

const memoryStorage = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) }; };

describe('pickGreeting', () => {
  it('greets normally nineteen times in twenty', () => {
    expect(pickGreeting(() => 0.5)).toBe(GREETING);
    expect(pickGreeting(() => 0.0501)).toBe(GREETING);
  });

  it('opens with a film line on the rare draw and never corrects it', () => {
    const draws = [0.01, 0.1];
    expect(pickGreeting(() => draws.shift())).toBe(RARE_OPENINGS[0]);
    const draws2 = [0.01, 0.9];
    expect(pickGreeting(() => draws2.shift())).toBe(RARE_OPENINGS[1]);
  });

  it('has a voice clip for every line that can be shown as the title', () => {
    for (const line of [GREETING, ...RARE_OPENINGS, CAUGHT_LINE]) expect(VOICE_LINES[line]).toMatch(/^[a-z]+$/);
  });
});

describe('buildStatusLines', () => {
  const now = new Date('2026-11-10T19:08:22Z');

  it('states only what is true: two factors, counts, rabbits', () => {
    const lines = buildStatusLines({ now, secondFactorPassed: true, enrollmentPending: false, projects: 30, unread: 2, rabbits: 7 });
    expect(lines[0]).toBe(`TRACE PROGRAM · ${formatNewYork(now)} · SESSION VERIFIED`);
    expect(lines[0]).toContain('10 NOV 2026');
    expect(lines[0]).toMatch(/14:08:22 EST/);
    expect(lines.slice(1)).toEqual(['IDENTITY VERIFIED · 2 FACTORS', '30 PROJECTS LIVE · 2 UNREAD MESSAGES', 'WHITE RABBITS FOLLOWED · 7']);
  });

  it('never claims a second factor before it was passed', () => {
    expect(buildStatusLines({ now, secondFactorPassed: false, enrollmentPending: true, projects: null, unread: null, rabbits: 0 })).toEqual([
      expect.stringContaining('TRACE PROGRAM'),
      'IDENTITY VERIFIED · AUTHENTICATOR SETUP PENDING',
    ]);
    expect(buildStatusLines({ now, secondFactorPassed: false, enrollmentPending: false, projects: null, unread: null, rabbits: 0 })[1]).toBe('IDENTITY VERIFIED');
  });

  it('omits unknown counts instead of inventing them, and handles singulars', () => {
    const lines = buildStatusLines({ now, secondFactorPassed: true, enrollmentPending: false, projects: 1, unread: null, rabbits: 0 });
    expect(lines).toHaveLength(3);
    expect(lines[2]).toBe('1 PROJECT LIVE');
    expect(buildStatusLines({ now, secondFactorPassed: true, enrollmentPending: false, projects: null, unread: 1, rabbits: 0 })[2]).toBe('1 UNREAD MESSAGE');
  });
});

describe('remembered flags', () => {
  it('reads and writes the mute flag and the rabbit tally without personal data', () => {
    const storage = memoryStorage();
    expect(readMuted(storage)).toBe(false);
    writeMuted(true, storage);
    expect(readMuted(storage)).toBe(true);
    expect(readRabbitTally(storage)).toBe(0);
    expect(bumpRabbitTally(storage)).toBe(1);
    expect(bumpRabbitTally(storage)).toBe(2);
    expect(readRabbitTally(storage)).toBe(2);
  });

  it('survives a missing or throwing storage', () => {
    expect(readMuted(null)).toBe(false);
    expect(() => writeMuted(true, { setItem: () => { throw new Error('quota'); }, getItem: () => null })).not.toThrow();
    expect(readRabbitTally({ getItem: () => 'nonsense' })).toBe(0);
  });
});

describe('decodeFrame and the rain plan', () => {
  it('locks characters from the left as progress grows and keeps spaces', () => {
    const start = decodeFrame('AB CD', 0, () => 0);
    expect(start.map((c) => c.pending)).toEqual([true, true, false, true, true]);
    const half = decodeFrame('AB CD', 0.5, () => 0);
    expect(half.slice(0, 2).map((c) => c.ch)).toEqual(['A', 'B']);
    const done = decodeFrame('AB CD', 1, () => 0);
    expect(done.map((c) => c.ch).join('')).toBe('AB CD');
    expect(done.every((c) => !c.pending)).toBe(true);
  });

  it('spells the initials in one column out of forty', () => {
    const marked = Array.from({ length: 200 }, (_, i) => isInitialsColumn(i)).filter(Boolean).length;
    expect(marked).toBe(5);
    expect(isInitialsColumn(7)).toBe(true);
    expect(isInitialsColumn(8)).toBe(false);
  });

  it('keeps the whole run, with a caught rabbit, under eight seconds', () => {
    const total = TIMELINE.drainStart + TIMELINE.liftAfterDrain + TIMELINE.doneAfterLift + TIMELINE.caughtPauseMs;
    expect(total).toBeLessThan(8000);
  });
});
