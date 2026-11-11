// src/services/adminSessionFacts.js
//
// A small record of the admin session for the sign-out credits: when it
// began, which sections were opened, how many saves were made. Kept in
// sessionStorage so it survives the full-page move to /adminsignout and dies
// with the tab. Nothing personal is stored: section ids, a count, a time.

export const SESSION_FACTS_KEY = 'rc-admin-session';

const read = (storage) => {
  try {
    const raw = storage?.getItem(SESSION_FACTS_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if (!parsed || typeof parsed !== 'object') return null;
    return {
      signedInAt: typeof parsed.signedInAt === 'string' ? parsed.signedInAt : null,
      sections: Array.isArray(parsed.sections) ? parsed.sections.filter((s) => typeof s === 'string').slice(0, 32) : [],
      saves: Number.isInteger(parsed.saves) && parsed.saves >= 0 ? parsed.saves : 0,
    };
  } catch {
    return null;
  }
};

const write = (storage, facts) => { try { storage?.setItem(SESSION_FACTS_KEY, JSON.stringify(facts)); } catch { /* storage unavailable: the credits fall back to generic lines */ } };

const defaultStorage = () => (typeof window !== 'undefined' ? window.sessionStorage : null);

/** Marks the start of a session if none is recorded; called when the dashboard mounts. */
export function startSession(now = new Date(), storage = defaultStorage()) {
  const current = read(storage);
  if (current?.signedInAt) return current;
  const facts = { signedInAt: now.toISOString(), sections: [], saves: 0 };
  write(storage, facts);
  return facts;
}

/** Remembers a section the admin opened, once. */
export function recordSectionVisit(sectionId, storage = defaultStorage()) {
  if (typeof sectionId !== 'string' || !sectionId) return;
  const facts = read(storage) || startSession(new Date(), storage);
  if (facts.sections.includes(sectionId)) return;
  write(storage, { ...facts, sections: [...facts.sections, sectionId] });
}

/** Counts one successful save. */
export function recordSave(storage = defaultStorage()) {
  const facts = read(storage) || startSession(new Date(), storage);
  write(storage, { ...facts, saves: facts.saves + 1 });
}

/** The record as it stands, or null when nothing was recorded. */
export function readSessionFacts(storage = defaultStorage()) {
  return read(storage);
}

/** Forgets the session; called when the farewell ends. */
export function clearSession(storage = defaultStorage()) {
  try { storage?.removeItem(SESSION_FACTS_KEY); } catch { /* nothing to clear */ }
}
