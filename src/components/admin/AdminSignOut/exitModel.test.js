import {
  FAREWELLS, REDUCED_TIMELINE, TIMELINE, buildScript, creditFacts, leaderNumber, phaseClasses, planeState, sceneLine, takeLine, wheelBoost,
} from './exitModel';

describe('timeline', () => {
  it('runs the phases in order and finishes within twenty seconds', () => {
    expect(TIMELINE.login).toBeLessThanOrEqual(20000);
    expect(phaseClasses(0)).toEqual(['dim']);
    expect(phaseClasses(500)).toEqual(['dim', 'clap-in']);
    expect(phaseClasses(1000)).toEqual(['dim', 'clap-in', 'chalk']);
    expect(phaseClasses(2100)).toEqual(expect.arrayContaining(['snap', 'clap-in']));
    expect(phaseClasses(2350)).toEqual(expect.arrayContaining(['black']));
    expect(phaseClasses(2350)).not.toContain('clap-in');
    expect(phaseClasses(3000)).toContain('leader');
    expect(phaseClasses(7000)).toContain('credits');
    expect(phaseClasses(7000)).not.toContain('leader');
    expect(phaseClasses(15000)).toEqual(expect.arrayContaining(['card', 'card-in']));
    expect(phaseClasses(15000)).not.toContain('credits');
    expect(phaseClasses(17200)).toContain('login');
    expect(phaseClasses(17200)).not.toContain('card');
  });

  it('shows only the card under reduced motion', () => {
    expect(phaseClasses(0, REDUCED_TIMELINE)).toEqual(['dim', 'card']);
    expect(phaseClasses(100, REDUCED_TIMELINE)).toEqual(['dim', 'card', 'card-in']);
    expect(phaseClasses(3200, REDUCED_TIMELINE)).toContain('login');
    expect(REDUCED_TIMELINE.login).toBeLessThan(TIMELINE.login);
  });

  it('counts 3, 2, 1, one second each, and never below 1', () => {
    expect(leaderNumber(0)).toBe(3); expect(leaderNumber(999)).toBe(3); expect(leaderNumber(1000)).toBe(2); expect(leaderNumber(2500)).toBe(1); expect(leaderNumber(9000)).toBe(1); expect(leaderNumber(-5)).toBe(3);
  });
});

describe('chalk lines', () => {
  it('writes the scene in New York time and the take from the save count', () => {
    expect(sceneLine(new Date('2026-11-11T20:08:00Z'))).toBe('11 NOV 2026 · 15:08 EST');
    expect(sceneLine(new Date('2026-07-04T16:00:00Z'))).toBe('04 JUL 2026 · 12:00 EDT');
    expect(takeLine(0)).toBe('0 CHANGES SAVED'); expect(takeLine(1)).toBe('1 CHANGE SAVED'); expect(takeLine(3)).toBe('3 CHANGES SAVED');
  });
});

describe('credit facts', () => {
  const now = new Date('2026-11-11T20:52:00Z');

  it('turns the session record into true lines and omits what was not recorded', () => {
    const lines = creditFacts({ facts: { signedInAt: '2026-11-11T20:08:00Z', sections: ['dashboard', 'projects', 'skills', 'analytics'], saves: 3 }, now, assurance: 'aal2' });
    expect(lines).toEqual([
      ['Signed in', '3:08 PM'], ['Session', '44 minutes'], ['Changes saved', '3'], ['Sections visited', 'Projects · Skills · Analytics'], ['Second factor', 'Verified'],
    ]);
    expect(creditFacts({ facts: null, now, assurance: 'aal1' })).toEqual([]);
    expect(creditFacts({ facts: { signedInAt: null, sections: [], saves: 0 }, now })).toEqual([['Changes saved', '0']]);
  });

  it('rounds long sessions and shortens long section lists', () => {
    const long = creditFacts({ facts: { signedInAt: '2026-11-11T17:00:00Z', sections: ['a', 'b', 'c', 'd', 'e', 'f'], saves: 1 }, now });
    expect(long.find(([r]) => r === 'Session')[1]).toBe('3 h 52 min');
    expect(long.find(([r]) => r === 'Sections visited')[1]).toBe('a · b · c · +3 more');
    expect(creditFacts({ facts: { signedInAt: '2026-11-11T20:51:30Z', sections: [], saves: 0 }, now })[1]).toEqual(['Session', '1 minute']);
    expect(creditFacts({ facts: { signedInAt: '2026-11-11T10:00:00Z', sections: [], saves: 0 }, now })[1]).toEqual(['Session', '11 hours']);
  });
});

describe('credits script and planes', () => {
  it('casts the seven farewells, crews the facts, and ends with the director', () => {
    const facts = [['Signed in', '3:08 PM'], ['Changes saved', '3']];
    const { planes, length } = buildScript({ facts });
    expect(planes.filter((p) => p.kind === 'cast').map((p) => p.content.language)).toEqual(FAREWELLS.map((f) => f.language));
    expect(planes.filter((p) => p.kind === 'crew').map((p) => p.content.role)).toEqual(['Signed in', 'Changes saved']);
    expect(planes.at(-1)).toMatchObject({ kind: 'title', content: 'Raunak Choudhary' });
    expect(length).toBeGreaterThan(planes.at(-1).at);
    planes.forEach((p) => { expect(p.at).toBeGreaterThanOrEqual(0); expect(p.dur).toBeGreaterThan(0); });
  });

  it('leaves the crew out when nothing was recorded', () => {
    const { planes } = buildScript({ facts: [] });
    expect(planes.some((p) => p.kind === 'crew')).toBe(false);
    expect(planes.some((p) => p.content === 'Crew · this session')).toBe(false);
  });

  it('moves a plane from its start to its end and fades it at both ends', () => {
    const plane = { at: 1000, dur: 1000, from: [10, 0], to: [-10, 0], depth: 50 };
    expect(planeState(plane, 0, 1)).toBeNull();
    expect(planeState(plane, 1000, 1)).toMatchObject({ x: 10, opacity: 0 });
    expect(planeState(plane, 1500, 1)).toMatchObject({ x: 0, opacity: 1, depth: 50, rotate: 5 });
    expect(planeState(plane, 2000, 1)).toMatchObject({ x: -10, opacity: 0 });
    expect(planeState(plane, 2200, 1)).toBeNull();
    // scale stretches the script to its slot; squeeze shortens sideways travel on phones
    expect(planeState(plane, 3000, 2)).toMatchObject({ x: 0 });
    expect(planeState(plane, 1000, 1, 0.35)).toMatchObject({ x: 3.5 });
  });

  it('caps how far one scroll event pushes the credits', () => {
    expect(wheelBoost(10)).toBe(60); expect(wheelBoost(500)).toBe(300); expect(wheelBoost(-500)).toBe(-300);
  });
});
