// src/components/admin/AdminWelcome/entryModel.js
//
// Pure parts of the admin entry screen (the Matrix rain), kept free of React
// and the canvas so they can be unit tested: the pacing, the glyph set, the
// greeting choice, the status lines and the small remembered flags.
// (Named entryModel rather than matrixEntry: macOS folders are case-insensitive
// and a file differing from MatrixEntry.js only by case would collide.)

/** Pacing in milliseconds from the moment the screen appears. */
export const TIMELINE = Object.freeze({
  decodeStart: 1500,   // the greeting begins to resolve
  decodeMs: 1100,
  linesStart: 2600,    // status lines follow, one after another
  lineGap: 320,
  lineMs: 520,
  rabbitStart: 2900,   // the rabbit crosses the bottom edge
  rabbitMs: 2600,
  drainStart: 5500,    // the rain accelerates out of the frame
  liftAfterDrain: 700, // the black lifts off the dashboard
  doneAfterLift: 600,
  caughtPauseMs: 900,  // extra time when the rabbit is caught
  readyCapMs: 8000,    // never hold the owner longer than this for data
  reducedMotionMs: 2000,
});

export const GREETING = 'WELCOME, RAUNAK';
export const RARE_OPENINGS = Object.freeze(['WAKE UP, RAUNAK...', 'KNOCK, KNOCK, RAUNAK.']);
export const RARE_CHANCE = 1 / 20;
export const CAUGHT_LINE = 'LOOKS LIKE I HAVE YOUR ATTENTION.';

/** Voice clip for each line that can appear as the title. */
export const VOICE_LINES = Object.freeze({
  [GREETING]: 'welcome',
  [RARE_OPENINGS[0]]: 'wake',
  [RARE_OPENINGS[1]]: 'knock',
  [CAUGHT_LINE]: 'rabbit',
});

/** Half-width katakana, digits and a few Latin capitals, as in the film. */
export const GLYPHS = Object.freeze([
  ...Array.from({ length: 0xff9d - 0xff66 + 1 }, (_, i) => String.fromCharCode(0xff66 + i)),
  ...'0123456789',
  ...'AEKMNRSTXZ',
]);

export const INITIALS = Object.freeze(['R', 'C']);

/** Every fortieth column, starting at the eighth, spells R C top to bottom. */
export const isInitialsColumn = (index) => index % 40 === 7;

/**
 * Picks the greeting for this login. About one login in twenty opens with a
 * film line instead; that line is the greeting, it is not corrected later.
 * @param {() => number} random a function returning [0, 1), injectable for tests.
 */
export const pickGreeting = (random = Math.random) => {
  if (random() >= RARE_CHANCE) return GREETING;
  return RARE_OPENINGS[Math.floor(random() * RARE_OPENINGS.length) % RARE_OPENINGS.length];
};

/** `10 NOV 2026 · 14:08:22 EST`, the owner's time zone. */
export const formatNewYork = (date) => {
  const day = date.toLocaleDateString('en-GB', { timeZone: 'America/New_York', day: '2-digit', month: 'short', year: 'numeric' }).toUpperCase();
  const time = date.toLocaleTimeString('en-GB', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const zone = date.toLocaleTimeString('en-US', { timeZone: 'America/New_York', timeZoneName: 'short' }).split(' ').pop();
  return `${day} · ${time} ${zone}`;
};

/**
 * The status lines under the greeting. Every line states something true
 * about this session; anything unknown is left out rather than guessed.
 * @param {object} facts
 * @param {Date} facts.now
 * @param {boolean} facts.secondFactorPassed  session is at assurance level 2
 * @param {boolean} facts.enrollmentPending   no authenticator exists yet
 * @param {number|null} facts.projects        active projects, or null when unknown
 * @param {number|null} facts.unread          unread messages, or null when unknown
 * @param {number} facts.rabbits              times the rabbit was caught in this browser
 */
export const buildStatusLines = ({ now, secondFactorPassed, enrollmentPending, projects, unread, rabbits }) => {
  const lines = [`TRACE PROGRAM · ${formatNewYork(now)} · SESSION VERIFIED`];
  if (secondFactorPassed) lines.push('IDENTITY VERIFIED · 2 FACTORS');
  else if (enrollmentPending) lines.push('IDENTITY VERIFIED · AUTHENTICATOR SETUP PENDING');
  else lines.push('IDENTITY VERIFIED');
  const counts = [];
  if (Number.isInteger(projects)) counts.push(`${projects} PROJECT${projects === 1 ? '' : 'S'} LIVE`);
  if (Number.isInteger(unread)) counts.push(`${unread} UNREAD MESSAGE${unread === 1 ? '' : 'S'}`);
  if (counts.length) lines.push(counts.join(' · '));
  if (rabbits > 0) lines.push(`WHITE RABBITS FOLLOWED · ${rabbits}`);
  return lines;
};

/** Remembered flags live in this browser only and carry no personal data. */
export const STORAGE_KEYS = Object.freeze({ muted: 'rc-admin-voice-muted', rabbits: 'rc-admin-white-rabbits' });

function safeStorage() {
  try { return typeof window !== 'undefined' ? window.localStorage : null; } catch { return null; }
}

export const readMuted = (storage = safeStorage()) => { try { return storage?.getItem(STORAGE_KEYS.muted) === '1'; } catch { return false; } };
export const writeMuted = (muted, storage = safeStorage()) => { try { storage?.setItem(STORAGE_KEYS.muted, muted ? '1' : '0'); } catch { /* cosmetic */ } };
export const readRabbitTally = (storage = safeStorage()) => { try { const n = Number(storage?.getItem(STORAGE_KEYS.rabbits)); return Number.isInteger(n) && n > 0 ? n : 0; } catch { return 0; } };
export const bumpRabbitTally = (storage = safeStorage()) => { const n = readRabbitTally(storage) + 1; try { storage?.setItem(STORAGE_KEYS.rabbits, String(n)); } catch { /* cosmetic */ } return n; };

/** The resolve effect: characters left of `locked` are final, the rest flicker. */
export const decodeFrame = (target, progress, random = Math.random) => {
  const chars = [...target];
  const locked = Math.floor(Math.min(1, Math.max(0, progress)) * chars.length);
  return chars.map((ch, i) => (i < locked || ch === ' ' ? { ch, pending: false } : { ch: GLYPHS[Math.floor(random() * GLYPHS.length)], pending: true }));
};
