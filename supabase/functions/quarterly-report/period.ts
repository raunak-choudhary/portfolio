// supabase/functions/quarterly-report/period.ts
//
// Calendar maths for the quarterly report, always in New York time
// (America/New_York), whatever the server's own zone. Pure: every function
// takes the instant it works from, so tests pin the clock.
//
// A quarter is a calendar quarter: January to March, April to June, July to
// September, October to December. A window is a half-open range of instants
// [start, end) in UTC, which is what the events query needs.

export const TIME_ZONE = 'America/New_York';

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

const DAY_MS = 24 * 60 * 60 * 1000;

/** Wall-clock parts of an instant in New York. */
export interface WallClock {
  year: number;
  month: number; // 1 to 12
  day: number;
  hour: number; // 0 to 23
  minute: number;
}

const partsFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: TIME_ZONE,
  hourCycle: 'h23',
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
  hour: 'numeric',
  minute: 'numeric',
});

export function newYorkClock(instant: Date): WallClock {
  const parts: Record<string, number> = {};
  for (const part of partsFormatter.formatToParts(instant)) {
    if (part.type !== 'literal') parts[part.type] = Number(part.value);
  }
  return { year: parts.year, month: parts.month, day: parts.day, hour: parts.hour % 24, minute: parts.minute };
}

/** The UTC instant of midnight starting the given New York calendar day (DST safe). */
export function newYorkMidnight(year: number, month: number, day: number): Date {
  const target = Date.UTC(year, month - 1, day);
  // New York is 4 or 5 hours behind UTC; start from 5 and correct once.
  let guess = target + 5 * 60 * 60 * 1000;
  for (let i = 0; i < 2; i += 1) {
    const wall = newYorkClock(new Date(guess));
    const wallAsUtc = Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute);
    guess += target - wallAsUtc;
  }
  return new Date(guess);
}

/** A calendar quarter: q is 1 to 4. */
export interface Quarter {
  year: number;
  q: number;
}

export const quarterOf = (clock: Pick<WallClock, 'year' | 'month'>): Quarter => ({
  year: clock.year,
  q: Math.floor((clock.month - 1) / 3) + 1,
});

export const previousQuarter = (
  { year, q }: Quarter,
): Quarter => (q === 1 ? { year: year - 1, q: 4 } : { year, q: q - 1 });
export const nextQuarter = ({ year, q }: Quarter): Quarter => (q === 4 ? { year: year + 1, q: 1 } : { year, q: q + 1 });
export const sameQuarterLastYear = ({ year, q }: Quarter): Quarter => ({ year: year - 1, q });

/** "Q3 2026" */
export const quarterCode = ({ year, q }: Quarter) => `Q${q} ${year}`;

/** "July to September 2026" */
export const quarterLabel = ({ year, q }: Quarter) => `${MONTHS[(q - 1) * 3]} to ${MONTHS[(q - 1) * 3 + 2]} ${year}`;

/** First instant of the quarter in New York, as UTC. */
export const quarterStart = ({ year, q }: Quarter) => newYorkMidnight(year, (q - 1) * 3 + 1, 1);

/** Number of calendar days in the quarter (90, 91 or 92). */
export function quarterDays(quarter: Quarter): number {
  const start = Date.UTC(quarter.year, (quarter.q - 1) * 3, 1);
  const next = nextQuarter(quarter);
  const end = Date.UTC(next.year, (next.q - 1) * 3, 1);
  return Math.round((end - start) / DAY_MS);
}

/** Adds whole New York calendar days to a quarter's first day. */
export function quarterDayStart(quarter: Quarter, dayOffset: number): Date {
  const first = new Date(Date.UTC(quarter.year, (quarter.q - 1) * 3, 1 + dayOffset));
  return newYorkMidnight(first.getUTCFullYear(), first.getUTCMonth() + 1, first.getUTCDate());
}

/** YYYY-MM-DD of the New York calendar day `dayOffset` days into the quarter. */
export function quarterDayIso(quarter: Quarter, dayOffset: number): string {
  return new Date(Date.UTC(quarter.year, (quarter.q - 1) * 3, 1 + dayOffset)).toISOString().slice(0, 10);
}

/** Half-open window of instants. */
export interface Window {
  start: Date;
  end: Date;
}

/** Everything the report needs to know about its time span. */
export interface ReportPeriod {
  quarter: Quarter;
  code: string; // "Q3 2026"
  label: string; // "July to September 2026"
  partial: boolean;
  /** Days covered (the whole quarter, or day N of a partial one). */
  days: number;
  /** Length of the whole quarter in days. */
  quarterLength: number;
  periodStart: string; // YYYY-MM-DD, New York
  periodEnd: string; // YYYY-MM-DD inclusive, New York
  current: Window;
  previous: { quarter: Quarter; window: Window; days: number };
  lastYear: { quarter: Quarter; window: Window; days: number };
  /** Quarter whose first day brings the next scheduled report. */
  nextReportOn: Quarter;
}

/** Window covering the first `days` days of a quarter, capped at the whole quarter. */
function leadingWindow(quarter: Quarter, days: number): { window: Window; days: number } {
  const span = Math.min(days, quarterDays(quarter));
  return { window: { start: quarterStart(quarter), end: quarterDayStart(quarter, span) }, days: span };
}

/**
 * Scheduled report: the previous full quarter, compared with the whole
 * quarter before it and the same quarter a year earlier.
 */
export function scheduledPeriod(now: Date): ReportPeriod {
  const quarter = previousQuarter(quarterOf(newYorkClock(now)));
  const length = quarterDays(quarter);
  return buildPeriod(quarter, length, false);
}

/**
 * Manual "Generate now": the current quarter from its first day up to and
 * including today. Counts over part of a quarter are compared with the same
 * number of days at the start of each comparison quarter, so "rose" and
 * "fell" compare like with like.
 */
export function manualPeriod(now: Date): ReportPeriod {
  const clock = newYorkClock(now);
  const quarter = quarterOf(clock);
  const dayIndex = Math.round(
    (Date.UTC(clock.year, clock.month - 1, clock.day) - Date.UTC(quarter.year, (quarter.q - 1) * 3, 1)) / DAY_MS,
  );
  return buildPeriod(quarter, dayIndex + 1, true);
}

function buildPeriod(quarter: Quarter, days: number, partial: boolean): ReportPeriod {
  const length = quarterDays(quarter);
  const previous = previousQuarter(quarter);
  const lastYear = sameQuarterLastYear(quarter);
  const compareDays = partial ? days : Number.POSITIVE_INFINITY;
  return {
    quarter,
    code: quarterCode(quarter),
    label: quarterLabel(quarter),
    partial,
    days,
    quarterLength: length,
    periodStart: quarterDayIso(quarter, 0),
    periodEnd: quarterDayIso(quarter, days - 1),
    current: { start: quarterStart(quarter), end: quarterDayStart(quarter, days) },
    previous: { quarter: previous, ...leadingWindow(previous, compareDays) },
    lastYear: { quarter: lastYear, ...leadingWindow(lastYear, compareDays) },
    // A full report goes out the quarter after the one it covers, so the next
    // one is two quarters on; a partial report's full version is one on.
    nextReportOn: partial ? nextQuarter(quarter) : nextQuarter(nextQuarter(quarter)),
  };
}

/**
 * True when the instant is the scheduled moment: 9 AM in New York on the
 * first day of January, April, July or October. The cron fires at 13:00 and
 * 14:00 UTC on those days; exactly one of the two is 9 AM in New York.
 */
export function isScheduledMoment(now: Date): boolean {
  const clock = newYorkClock(now);
  return clock.day === 1 && [1, 4, 7, 10].includes(clock.month) && clock.hour === 9;
}

/** "1 October 2026" for a quarter's first day. */
export const quarterFirstDayWords = ({ year, q }: Quarter) => `1 ${MONTHS[(q - 1) * 3]} ${year}`;

/** "19 November 2026" for a YYYY-MM-DD day. */
export function dayWords(isoDay: string): string {
  const [year, month, day] = isoDay.split('-').map(Number);
  return `${day} ${MONTHS[month - 1]} ${year}`;
}

/** "19 November 2026 at 3:12 PM" in New York time. */
export function instantWords(instant: Date): string {
  const clock = newYorkClock(instant);
  const hour12 = clock.hour % 12 === 0 ? 12 : clock.hour % 12;
  const minute = String(clock.minute).padStart(2, '0');
  return `${clock.day} ${MONTHS[clock.month - 1]} ${clock.year} at ${hour12}:${minute} ${
    clock.hour < 12 ? 'AM' : 'PM'
  }`;
}

/** YYYY-MM-DD of an instant's New York calendar day. */
export function newYorkDayIso(instant: Date): string {
  const clock = newYorkClock(instant);
  return `${clock.year}-${String(clock.month).padStart(2, '0')}-${String(clock.day).padStart(2, '0')}`;
}

/**
 * Database timestamps here are `timestamp without time zone` holding UTC.
 * PostgREST returns them without an offset; this reads them as UTC.
 */
export function parseDbInstant(value: unknown): Date | null {
  if (typeof value !== 'string' || !value) return null;
  const hasZone = /(?:[zZ]|[+-]\d{2}(?::?\d{2})?)$/.test(value);
  const parsed = new Date(hasZone ? value : `${value.replace(' ', 'T')}Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** Whole days between two instants, rounded down. */
export const daysBetween = (from: Date, to: Date) => Math.floor((to.getTime() - from.getTime()) / DAY_MS);
