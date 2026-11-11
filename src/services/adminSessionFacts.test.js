import { SESSION_FACTS_KEY, clearSession, readSessionFacts, recordSave, recordSectionVisit, startSession } from './adminSessionFacts';

const memory = (seed = {}) => { const data = { ...seed }; return { getItem: (k) => (k in data ? data[k] : null), setItem: (k, v) => { data[k] = v; }, removeItem: (k) => { delete data[k]; }, data }; };

describe('admin session facts', () => {
  it('starts once and keeps the first start time', () => {
    const store = memory();
    const first = startSession(new Date('2026-11-11T19:08:00Z'), store);
    const again = startSession(new Date('2026-11-11T20:00:00Z'), store);
    expect(first.signedInAt).toBe('2026-11-11T19:08:00.000Z');
    expect(again.signedInAt).toBe(first.signedInAt);
    expect(readSessionFacts(store)).toEqual({ signedInAt: first.signedInAt, sections: [], saves: 0 });
  });

  it('records sections once each and counts saves, starting a session if needed', () => {
    const store = memory();
    recordSectionVisit('projects', store);
    recordSectionVisit('skills', store);
    recordSectionVisit('projects', store);
    recordSave(store); recordSave(store);
    const facts = readSessionFacts(store);
    expect(facts.sections).toEqual(['projects', 'skills']);
    expect(facts.saves).toBe(2);
    expect(typeof facts.signedInAt).toBe('string');
  });

  it('ignores junk in storage and junk arguments', () => {
    const store = memory({ [SESSION_FACTS_KEY]: '{bad json' });
    expect(readSessionFacts(store)).toBeNull();
    const odd = memory({ [SESSION_FACTS_KEY]: JSON.stringify({ signedInAt: 5, sections: ['a', 7, null], saves: -3 }) });
    expect(readSessionFacts(odd)).toEqual({ signedInAt: null, sections: ['a'], saves: 0 });
    recordSectionVisit('', odd); recordSectionVisit(null, odd);
    expect(readSessionFacts(odd).sections).toEqual(['a']);
  });

  it('clears the record at the end', () => {
    const store = memory();
    startSession(new Date(), store);
    clearSession(store);
    expect(readSessionFacts(store)).toBeNull();
    expect(() => clearSession(null)).not.toThrow();
  });
});
