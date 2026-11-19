import {
  addDays, chartDay, civil, dayIndex, isoDay, longDay, nextReportAt, nyDate, nyInstant, nyParts, previousQuarter, quarterOf, shortDate, windowsFor,
} from './insightsTime';

const utc = (s) => Date.parse(s);

describe('New York wall clock', () => {
  it('reads wall-clock parts in New York whatever the machine zone', () => {
    expect(nyParts(utc('2026-11-18T21:00:00Z'))).toEqual({ y: 2026, m: 11, d: 18, h: 16, mi: 0, s: 0 });
    // 03:30 UTC on 1 Jan is still New Year's Eve in New York
    expect(nyDate(utc('2027-01-01T03:30:00Z'))).toEqual({ y: 2026, m: 12, d: 31 });
  });

  it('finds the instant of New York midnight in winter and in summer', () => {
    expect(nyInstant(2026, 11, 19)).toBe(utc('2026-11-19T05:00:00Z'));
    expect(nyInstant(2026, 7, 1)).toBe(utc('2026-07-01T04:00:00Z'));
    expect(nyInstant(2027, 1, 1, 9)).toBe(utc('2027-01-01T14:00:00Z'));
  });

  it('keeps day counts exact across both daylight-saving changes (8 Mar and 1 Nov 2026)', () => {
    expect(nyInstant(2026, 3, 8)).toBe(utc('2026-03-08T05:00:00Z'));
    expect(nyInstant(2026, 3, 9)).toBe(utc('2026-03-09T04:00:00Z'));   // a 23-hour day
    expect(nyInstant(2026, 11, 1)).toBe(utc('2026-11-01T04:00:00Z'));
    expect(nyInstant(2026, 11, 2)).toBe(utc('2026-11-02T05:00:00Z'));  // a 25-hour day
    // 23:30 on 8 Mar in New York is 03:30 UTC on 9 Mar, still day 7 from 1 Mar
    expect(dayIndex(utc('2026-03-09T03:30:00Z'), { y: 2026, m: 3, d: 1 })).toBe(7);
    // 23:30 on 1 Nov (EST) is 04:30 UTC on 2 Nov, still day 0 from 1 Nov
    expect(dayIndex(utc('2026-11-02T04:30:00Z'), { y: 2026, m: 11, d: 1 })).toBe(0);
  });

  it('does civil date arithmetic and formats dates', () => {
    expect(civil(2026, 13, 1)).toEqual({ y: 2027, m: 1, d: 1 });
    expect(addDays({ y: 2026, m: 3, d: 1 }, -1)).toEqual({ y: 2026, m: 2, d: 28 });
    expect(addDays({ y: 2028, m: 3, d: 1 }, -1)).toEqual({ y: 2028, m: 2, d: 29 });
    expect(isoDay({ y: 2026, m: 1, d: 5 })).toBe('2026-01-05');
    expect(shortDate({ y: 2027, m: 1, d: 1 })).toBe('1 Jan 2027');
    expect(longDay({ y: 2026, m: 10, d: 1 })).toBe('1 October');
    expect(chartDay({ y: 2026, m: 11, d: 9 })).toBe('9 Nov');
  });
});

describe('quarters', () => {
  it('names the quarter and counts Day N of M (the mockup moment: 18 Nov 2026 is day 49 of 92)', () => {
    const q = quarterOf(utc('2026-11-18T21:00:00Z'));
    expect(q).toMatchObject({ short: 'Q4 2026', label: 'October to December 2026', day: 49, length: 92, start: { y: 2026, m: 10, d: 1 } });
    expect(previousQuarter(q)).toMatchObject({ short: 'Q3 2026', label: 'July to September 2026', length: 92 });
  });

  it('turns over at New York midnight, not UTC midnight', () => {
    expect(quarterOf(utc('2026-10-01T03:59:59Z'))).toMatchObject({ short: 'Q3 2026', day: 92, length: 92 });
    expect(quarterOf(utc('2026-10-01T04:00:00Z'))).toMatchObject({ short: 'Q4 2026', day: 1 });
    expect(quarterOf(utc('2027-01-01T04:59:00Z'))).toMatchObject({ short: 'Q4 2026', day: 92 });
    expect(quarterOf(utc('2027-01-01T05:00:00Z'))).toMatchObject({ short: 'Q1 2027', day: 1, length: 90 });
  });

  it('knows quarter lengths, leap years included', () => {
    expect(quarterOf(utc('2028-02-15T12:00:00Z')).length).toBe(91);
    expect(quarterOf(utc('2026-05-15T12:00:00Z')).length).toBe(91);
    expect(previousQuarter(quarterOf(utc('2027-01-05T12:00:00Z'))).short).toBe('Q4 2026');
  });
});

describe('windowsFor', () => {
  const now = utc('2026-11-18T21:00:00Z');

  it('runs This quarter from its first day to now against the whole previous quarter', () => {
    const w = windowsFor('quarter', now);
    expect(w.current).toEqual({ from: utc('2026-10-01T04:00:00Z'), to: now, start: { y: 2026, m: 10, d: 1 }, days: 49 });
    expect(w.before).toEqual({ from: utc('2026-07-01T04:00:00Z'), to: utc('2026-10-01T04:00:00Z'), start: { y: 2026, m: 7, d: 1 }, days: 92 });
    expect(w).toMatchObject({ versus: 'last quarter', bucket: 1, span: 92 });
  });

  it('runs rolling ranges over whole New York days ending today, compared with the days just before', () => {
    const w = windowsFor('7d', now);
    expect(w.current.start).toEqual({ y: 2026, m: 11, d: 12 });
    expect(w.current.from).toBe(utc('2026-11-12T05:00:00Z'));
    expect(w.before.start).toEqual({ y: 2026, m: 11, d: 5 });
    expect(w.before.to).toBe(w.current.from);
    expect(w).toMatchObject({ label: 'last 7 days', versus: 'the 7 days before', bucket: 1 });
  });

  it('crosses the 1 Nov clock change without losing an hour', () => {
    const w = windowsFor('30d', now);
    expect(w.current.start).toEqual({ y: 2026, m: 10, d: 20 });
    expect(w.current.from).toBe(utc('2026-10-20T04:00:00Z'));   // EDT midnight
  });

  it('shows weeks for twelve months and falls back to 90 days for an unknown range', () => {
    expect(windowsFor('12m', now)).toMatchObject({ bucket: 7, span: 365, versus: 'the 12 months before' });
    expect(windowsFor('nonsense', now).range.id).toBe('90d');
  });
});

describe('nextReportAt', () => {
  it('is the next 1 Jan, 1 Apr, 1 Jul or 1 Oct at 9 AM New York, covering the quarter before it', () => {
    const r = nextReportAt(utc('2026-11-18T21:00:00Z'));
    expect(r.at).toBe(utc('2027-01-01T14:00:00Z'));
    expect(r.date).toEqual({ y: 2027, m: 1, d: 1 });
    expect(r.covers.label).toBe('October to December 2026');
  });

  it('is the same morning on a quarter day before 9 AM (EDT) and the next quarter after', () => {
    expect(nextReportAt(utc('2026-10-01T12:59:00Z')).at).toBe(utc('2026-10-01T13:00:00Z'));
    expect(nextReportAt(utc('2026-10-01T12:59:00Z')).covers.short).toBe('Q3 2026');
    expect(nextReportAt(utc('2026-10-01T13:00:00Z')).at).toBe(utc('2027-01-01T14:00:00Z'));
  });
});
