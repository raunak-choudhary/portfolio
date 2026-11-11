// src/components/admin/AdminSignOut/exitModel.js
//
// Pure model of the sign-out sequence: the timeline, the credits script,
// where each credit plane sits at a moment, and the session facts turned
// into credit lines. No DOM, no timers, so it is unit tested in full.
//
// The sequence, locked by the owner on 2026-11-11 from the preview:
// clapperboard (chalk lines, snap, flash, cut), Academy countdown leader,
// Marvel-style credits (the seven farewells as cast, session facts as crew),
// the शुभम् card, then the login page. Seventeen seconds in all.

/** The seven farewells of the 2025 sign-out page, kept as the cast. */
export const FAREWELLS = Object.freeze([
  { language: 'Hindi', text: 'अलविदा! धन्यवाद!' },
  { language: 'Spanish', text: '¡Adiós! ¡Gracias!' },
  { language: 'French', text: 'Au revoir! Merci!' },
  { language: 'German', text: 'Auf Wiedersehen! Danke!' },
  { language: 'Japanese', text: 'さようなら！ありがとう！' },
  { language: 'Arabic', text: 'وداعا! شكرا لك!', rtl: true },
  { language: 'English', text: 'Bye!! Thank You.' },
]);

/** Milestones in milliseconds from the start of the sequence. */
export const TIMELINE = Object.freeze({
  dim: 0, clapIn: 300, chalk: 900, snap: 2000, black: 2300,
  leader: 2450, leaderEnd: 5450,
  credits: 5450, creditsEnd: 14300,
  card: 14300, cardIn: 14500,
  login: 17200,
});

/** With reduced motion: the card alone, briefly, then the login. */
export const REDUCED_TIMELINE = Object.freeze({
  dim: 0, clapIn: Infinity, chalk: Infinity, snap: Infinity, black: Infinity,
  leader: Infinity, leaderEnd: Infinity, credits: Infinity, creditsEnd: Infinity,
  card: 0, cardIn: 50, login: 3200,
});

export const DIRECTOR = 'Raunak Choudhary';

/** Names for section ids in the "sections visited" line. */
export const SECTION_NAMES = Object.freeze({
  dashboard: 'Overview', hero: 'Hero', about: 'About', projects: 'Projects', internships: 'Internships', education: 'Education',
  work: 'Work', skills: 'Skills', certifications: 'Certifications', recommendations: 'Recommendations', achievements: 'Achievements',
  leadership: 'Leadership', contact: 'Inbox', media: 'Media', analytics: 'Analytics', security: 'Security',
});

/**
 * The CSS state classes that apply at a moment of the sequence.
 * @param {number} t milliseconds since the start.
 * @param {typeof TIMELINE} T the timeline in use.
 * @returns {string[]}
 */
export function phaseClasses(t, T = TIMELINE) {
  const classes = [];
  if (t >= T.dim) classes.push('dim');
  if (t >= T.clapIn && t < T.black) classes.push('clap-in');
  if (t >= T.chalk) classes.push('chalk');
  if (t >= T.snap) classes.push('snap');
  if (t >= T.black && t < T.leader) classes.push('black');
  if (t >= T.leader && t < T.leaderEnd) classes.push('leader');
  if (t >= T.credits && t < T.creditsEnd) classes.push('credits');
  if (t >= T.card && t < T.login) classes.push('card');
  if (t >= T.cardIn && t < T.login) classes.push('card-in');
  if (t >= T.login) classes.push('login');
  return classes;
}

/** Which number the countdown shows, 3 then 2 then 1, one second each. */
export const leaderNumber = (tLeader) => Math.max(1, 3 - Math.floor(Math.max(0, tLeader) / 1000));

/** The chalk SCENE line: date and New York time, e.g. "11 NOV 2026 · 15:08 EST". */
export function sceneLine(date = new Date()) {
  const text = date.toLocaleString('en-GB', { timeZone: 'America/New_York', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
  const zone = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', timeZoneName: 'short' }).formatToParts(date).find((p) => p.type === 'timeZoneName')?.value || 'ET';
  return `${text.replace(',', ' ·').toUpperCase()} ${zone}`;
}

/** The chalk TAKE line. */
export const takeLine = (saves) => `${saves} ${saves === 1 ? 'CHANGE' : 'CHANGES'} SAVED`;

const timeInNewYork = (date) => date.toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit' });

/**
 * Session facts as credit lines. Every line is true or omitted: a fact that
 * was never recorded does not appear.
 * @param {object} input
 * @param {{signedInAt: string|null, sections: string[], saves: number}|null} input.facts
 * @param {Date} input.now
 * @param {string|null} input.assurance 'aal2' when the second factor was verified this session.
 * @returns {Array<[string, string]>} [role, value] pairs.
 */
export function creditFacts({ facts, now = new Date(), assurance = null }) {
  const lines = [];
  const signedIn = facts?.signedInAt ? new Date(facts.signedInAt) : null;
  if (signedIn && !Number.isNaN(signedIn.getTime())) {
    lines.push(['Signed in', timeInNewYork(signedIn)]);
    const minutes = Math.max(1, Math.round((now.getTime() - signedIn.getTime()) / 60000));
    const length = minutes >= 600 ? `${Math.round(minutes / 60)} hours` : minutes >= 60 ? `${Math.floor(minutes / 60)} h ${minutes % 60} min` : `${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`;
    lines.push(['Session', length]);
  }
  if (facts) lines.push(['Changes saved', String(facts.saves)]);
  const visited = (facts?.sections || []).filter((id) => id !== 'dashboard').map((id) => SECTION_NAMES[id] || id);
  if (visited.length) lines.push(['Sections visited', (visited.length > 4 ? [...visited.slice(0, 3), `+${visited.length - 3} more`] : visited).join(' · ')]);
  if (assurance === 'aal2') lines.push(['Second factor', 'Verified']);
  return lines;
}

/**
 * Builds the credit script: planes with a start time, a duration, a start
 * and end position (in viewport units), a depth, and content.
 * @param {object} input
 * @param {ReadonlyArray<{language: string, text: string, rtl?: boolean}>} input.farewells
 * @param {Array<[string, string]>} input.facts
 * @param {string} input.director
 * @returns {{ planes: Array<object>, length: number }} length is the natural running time in ms.
 */
export function buildScript({ farewells = FAREWELLS, facts = [], director = DIRECTOR }) {
  const planes = [];
  const add = (kind, content, at, dur, from, to, depth) => planes.push({ kind, content, at, dur, from, to, depth });
  let t = 0;
  add('big', 'RC PORTFOLIO', t, 2600, [-60, -10], [40, -10], -400);
  add('kicker', 'RC Portfolio Admin presents', t + 150, 1500, [0, -22], [0, -22], 0);
  add('title', `A session by\n${director}`, t + 500, 1900, [8, 8], [-8, 8], 120);
  t += 2300;
  add('kicker', 'Cast · seven farewells', t, 900, [0, -30], [0, -30], 0);
  farewells.forEach((f, i) => {
    const dir = i % 2 ? -1 : 1, band = -20 + (i % 3) * 20;
    add('cast', f, t + 300 + i * 620, 1500, [dir * 14, band], [dir * -6, band], (i % 3) * 90);
  });
  add('big', 'धन्यवाद', t + 600, 4300, [50, 20], [-50, 20], -500);
  t += 300 + farewells.length * 620 + 900;
  if (facts.length) {
    add('kicker', 'Crew · this session', t, 900, [0, -30], [0, -30], 0);
    facts.forEach(([role, value], i) => add('crew', { role, value }, t + 300 + i * 560, 1400, [10, -18 + (i % 4) * 12], [-4, -18 + (i % 4) * 12], (i % 2) * 80));
    t += 300 + facts.length * 560 + 700;
  }
  add('bar', '', t, 1400, [0, 2], [0, 2], 0);
  add('kicker', 'Directed by', t + 100, 1500, [0, -10], [0, -10], 0);
  add('title', director, t + 300, 1600, [0, 6], [0, 6], 60);
  return { planes, length: t + 1900 };
}

/**
 * Where a plane is at a moment of the credits.
 * @param {object} plane from buildScript.
 * @param {number} creditTime ms since the credits began.
 * @param {number} scale slot length divided by the script's natural length.
 * @param {number} squeeze multiplier on sideways travel (smaller on phones).
 * @returns {null | {x: number, y: number, depth: number, rotate: number, opacity: number}} null when not on screen.
 */
export function planeState(plane, creditTime, scale, squeeze = 1) {
  const a = (creditTime / scale - plane.at) / plane.dur;
  if (a < -0.05 || a > 1.05) return null;
  const e = Math.min(1, Math.max(0, a));
  const ease = e < 0.5 ? 2 * e * e : 1 - ((-2 * e + 2) ** 2) / 2;
  const x = (plane.from[0] + (plane.to[0] - plane.from[0]) * ease) * squeeze;
  const y = plane.from[1] + (plane.to[1] - plane.from[1]) * ease;
  const opacity = e < 0.18 ? e / 0.18 : e > 0.82 ? (1 - e) / 0.18 : 1;
  return { x, y, depth: plane.depth, rotate: (plane.to[0] - plane.from[0]) * -0.25, opacity };
}

/** How much scrolling moves the credits: pixels of wheel delta to milliseconds, capped per event. */
export const wheelBoost = (deltaY) => Math.max(-300, Math.min(300, deltaY * 6));
