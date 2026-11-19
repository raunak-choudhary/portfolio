// src/components/admin/Voyage/insightsTime.js
//
// Calendar maths for the Analytics chapter, all in New York time (contract
// section 2: "All times are America/New_York"). The browser may sit in any
// zone, so nothing here uses the local Date getters: wall-clock parts come
// from Intl with an explicit time zone, and civil dates ({ y, m, d }) are
// counted as whole days through Date.UTC, which has no daylight saving.
//
// A window is a pair of instants [from, to) plus the civil day it starts on,
// so a visit can be put in its day bucket without another time-zone lookup
// per bucket. Pure functions only; `now` is always passed in.

export const NEW_YORK = 'America/New_York';
const DAY_MS = 86400000;

export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const MONTHS_SHORT = MONTHS.map((m) => m.slice(0, 3));

let partsFormat = null;
const formatter = () => {
  // created lazily: one formatter serves every call (constructing Intl objects is slow)
  if (!partsFormat) partsFormat = new Intl.DateTimeFormat('en-US', { timeZone: NEW_YORK, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
  return partsFormat;
};

/** Wall-clock parts of an instant in New York. */
export function nyParts(ms) {
  const out = {};
  for (const p of formatter().formatToParts(new Date(ms))) if (p.type !== 'literal') out[p.type] = Number(p.value);
  return { y: out.year, m: out.month, d: out.day, h: out.hour % 24, mi: out.minute, s: out.second };
}

/** New York's offset from UTC at an instant, in ms (negative: -5 h in winter, -4 h in summer). */
function offsetAt(ms) {
  const p = nyParts(ms);
  return Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi, p.s) - Math.floor(ms / 1000) * 1000;
}

/**
 * The instant of a New York wall-clock time. Days past the month's end roll
 * over (Date.UTC normalises them), which is how day arithmetic is done here.
 * Midnight and 9 AM are never inside a daylight-saving gap (those happen at
 * 2 AM), so the second correction below is all the adjustment ever needed.
 */
export function nyInstant(y, m, d, h = 0, mi = 0) {
  const wall = Date.UTC(y, m - 1, d, h, mi);
  let t = wall - offsetAt(wall);
  const second = wall - offsetAt(t);
  if (second !== t) t = second;
  return t;
}

/** The civil date { y, m, d } of an instant in New York. */
export function nyDate(ms) { const p = nyParts(ms); return { y: p.y, m: p.m, d: p.d }; }

/** A civil date normalised after arithmetic ({ y: 2026, m: 13, d: 1 } is 1 Jan 2027). */
export function civil(y, m, d) { const t = new Date(Date.UTC(y, m - 1, d)); return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() }; }

/** Whole days since the epoch for a civil date: differences give day counts with no DST error. */
export const dayNumber = ({ y, m, d }) => Math.round(Date.UTC(y, m - 1, d) / DAY_MS);

/** A civil date `n` days later (or earlier). */
export const addDays = (date, n) => civil(date.y, date.m, date.d + n);

/** Days between an instant's New York date and a civil start date (0 on the start date itself). */
export const dayIndex = (ms, start) => dayNumber(nyDate(ms)) - dayNumber(start);

/** "2026-11-19", for keys and machine-readable times. */
export const isoDay = ({ y, m, d }) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
/** "19 Nov 2026". */
export const shortDate = ({ y, m, d }) => `${d} ${MONTHS_SHORT[m - 1]} ${y}`;
/** "19 November", for sentences inside one year. */
export const longDay = ({ m, d }) => `${d} ${MONTHS[m - 1]}`;
/** "19 Nov", for chart labels. */
export const chartDay = ({ m, d }) => `${d} ${MONTHS_SHORT[m - 1]}`;

/**
 * The calendar quarter an instant falls in, in New York.
 * @returns {{start: {y,m,d}, next: {y,m,d}, length: number, day: number, label: string, short: string, index: number, year: number}}
 *   `day` is "Day N" (1 on the first day), `length` is "of M".
 */
export function quarterOf(ms) {
  const today = nyDate(ms);
  return quarterFrom(civil(today.y, Math.floor((today.m - 1) / 3) * 3 + 1, 1), today);
}

/** The quarter that starts on `start` (a quarter's first day), with `today` used for "Day N". */
function quarterFrom(start, today = start) {
  const next = civil(start.y, start.m + 3, 1);
  const index = Math.floor((start.m - 1) / 3);
  return {
    start, next, index, year: start.y,
    length: dayNumber(next) - dayNumber(start),
    day: dayNumber(today) - dayNumber(start) + 1,
    label: `${MONTHS[index * 3]} to ${MONTHS[index * 3 + 2]} ${start.y}`,
    short: `Q${index + 1} ${start.y}`,
  };
}

/** The quarter before a quarter. */
export const previousQuarter = (q) => quarterFrom(civil(q.start.y, q.start.m - 3, 1));

/** The five ranges, in the order of the range control. `days` is the rolling length. */
export const RANGES = Object.freeze({
  quarter: { id: 'quarter', button: 'This quarter', calendar: true },
  '7d': { id: '7d', button: '7 days', days: 7, label: 'last 7 days', versus: 'the 7 days before' },
  '30d': { id: '30d', button: '30 days', days: 30, label: 'last 30 days', versus: 'the 30 days before' },
  '90d': { id: '90d', button: '90 days', days: 90, label: 'last 90 days', versus: 'the 90 days before' },
  '12m': { id: '12m', button: '12 months', days: 365, label: 'last 12 months', versus: 'the 12 months before' },
});
export const RANGE_ORDER = Object.freeze(['quarter', '7d', '30d', '90d', '12m']);
export const DEFAULT_RANGE = '90d';
/** Ranges longer than this show visits per week instead of per day. */
export const WEEKLY_AFTER_DAYS = 92;

/**
 * The current window and the comparison window for a range.
 * Rolling ranges are whole New York days ending today (today counts as day N,
 * so far), compared with the same number of days just before. "This quarter"
 * runs from the quarter's first day to now and is compared with the whole
 * previous quarter.
 *
 * @param {string} rangeId
 * @param {number} now ms
 */
export function windowsFor(rangeId, now) {
  const range = RANGES[rangeId] || RANGES[DEFAULT_RANGE];
  if (range.calendar) {
    const q = quarterOf(now);
    const last = previousQuarter(q);
    const from = nyInstant(q.start.y, q.start.m, q.start.d);
    return {
      range, quarter: q, lastQuarter: last, bucket: 1, span: q.length,
      label: 'this quarter', versus: 'last quarter',
      current: { from, to: now, start: q.start, days: q.day },
      before: { from: nyInstant(last.start.y, last.start.m, last.start.d), to: from, start: last.start, days: last.length },
    };
  }
  const today = nyDate(now);
  const start = addDays(today, -(range.days - 1));
  const beforeStart = addDays(start, -range.days);
  const from = nyInstant(start.y, start.m, start.d);
  return {
    range, quarter: null, lastQuarter: null, bucket: range.days > WEEKLY_AFTER_DAYS ? 7 : 1, span: range.days,
    label: range.label, versus: range.versus,
    current: { from, to: now, start, days: range.days },
    before: { from: nyInstant(beforeStart.y, beforeStart.m, beforeStart.d), to: from, start: beforeStart, days: range.days },
  };
}

/** The hour the scheduled report runs, New York time, on 1 Jan, 1 Apr, 1 Jul and 1 Oct. */
export const REPORT_HOUR = 9;

/**
 * When the next scheduled report runs and which quarter it covers.
 * On 1 Oct before 9 AM the next report is that same morning.
 * @returns {{at: number, date: {y,m,d}, covers: object}}
 */
export function nextReportAt(now) {
  let q = quarterOf(now);
  for (let k = 0; k < 2; k++) {
    const at = nyInstant(q.start.y, q.start.m, q.start.d, REPORT_HOUR);
    if (at > now) return { at, date: q.start, covers: previousQuarter(q) };
    q = quarterFrom(q.next);
  }
  return null;   // unreachable: the next quarter's start is always later than now
}

/**
 * An instant from the database in ms. PostgREST may return a timestamp
 * without a zone; the column is stored in UTC, so a missing zone means UTC
 * (Date.parse would read it as local time).
 * @returns {number|null}
 */
export function parseDbInstant(value) {
  if (typeof value !== 'string' || !value) return null;
  const hasZone = /(?:[zZ]|[+-]\d{2}(?::?\d{2})?)$/.test(value);
  const t = Date.parse(hasZone ? value : `${value.replace(' ', 'T')}Z`);
  return Number.isFinite(t) ? t : null;
}
