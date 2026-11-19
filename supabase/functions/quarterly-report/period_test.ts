import { assertEquals, assertFalse } from 'jsr:@std/assert@1';
import {
  instantWords,
  isScheduledMoment,
  manualPeriod,
  newYorkClock,
  newYorkDayIso,
  newYorkMidnight,
  parseDbInstant,
  quarterDays,
  quarterLabel,
  scheduledPeriod,
} from './period.ts';

Deno.test('New York midnight is 04:00 UTC in summer and 05:00 UTC in winter', () => {
  assertEquals(newYorkMidnight(2026, 7, 1).toISOString(), '2026-07-01T04:00:00.000Z');
  assertEquals(newYorkMidnight(2026, 1, 1).toISOString(), '2026-01-01T05:00:00.000Z');
  // Clocks change on 8 March 2026 at 2 AM: midnight that day is still winter time.
  assertEquals(newYorkMidnight(2026, 3, 8).toISOString(), '2026-03-08T05:00:00.000Z');
  assertEquals(newYorkMidnight(2026, 3, 9).toISOString(), '2026-03-09T04:00:00.000Z');
  assertEquals(newYorkMidnight(2026, 11, 2).toISOString(), '2026-11-02T05:00:00.000Z');
});

Deno.test('exactly one of the two cron times is 9 AM in New York on each quarter day', () => {
  const days = ['2026-01-01', '2026-04-01', '2026-07-01', '2026-10-01', '2027-01-01'];
  for (const day of days) {
    const at13 = isScheduledMoment(new Date(`${day}T13:00:00Z`));
    const at14 = isScheduledMoment(new Date(`${day}T14:00:00Z`));
    assertEquals(Number(at13) + Number(at14), 1, day);
  }
  assertEquals(isScheduledMoment(new Date('2026-10-01T13:00:00Z')), true);
  assertEquals(isScheduledMoment(new Date('2027-01-01T14:00:00Z')), true);
  assertFalse(isScheduledMoment(new Date('2026-10-02T13:00:00Z')));
  assertFalse(isScheduledMoment(new Date('2026-11-01T14:00:00Z')));
});

Deno.test('the scheduled run on 1 October reports July to September against April to June and last year', () => {
  const period = scheduledPeriod(new Date('2026-10-01T13:00:00Z'));
  assertEquals(period.code, 'Q3 2026');
  assertEquals(period.label, 'July to September 2026');
  assertEquals(period.partial, false);
  assertEquals([period.periodStart, period.periodEnd, period.days], ['2026-07-01', '2026-09-30', 92]);
  assertEquals(period.current.start.toISOString(), '2026-07-01T04:00:00.000Z');
  assertEquals(period.current.end.toISOString(), '2026-10-01T04:00:00.000Z');
  assertEquals(quarterLabel(period.previous.quarter), 'April to June 2026');
  assertEquals(period.previous.days, 91);
  assertEquals(period.previous.window.end.toISOString(), '2026-07-01T04:00:00.000Z');
  assertEquals(quarterLabel(period.lastYear.quarter), 'July to September 2025');
  assertEquals(period.nextReportOn, { year: 2027, q: 1 });
});

Deno.test('the 1 January run reports the last quarter of the year before', () => {
  const period = scheduledPeriod(new Date('2027-01-01T14:00:00Z'));
  assertEquals(period.code, 'Q4 2026');
  assertEquals(period.current.start.toISOString(), '2026-10-01T04:00:00.000Z');
  assertEquals(period.current.end.toISOString(), '2027-01-01T05:00:00.000Z');
  assertEquals(quarterLabel(period.previous.quarter), 'July to September 2026');
});

Deno.test('a manual run covers the quarter so far and compares the same number of days', () => {
  // 19 November 2026, 3:12 PM in New York: day 50 of 92.
  const period = manualPeriod(new Date('2026-11-19T20:12:00Z'));
  assertEquals(period.code, 'Q4 2026');
  assertEquals(period.partial, true);
  assertEquals([period.days, period.quarterLength], [50, 92]);
  assertEquals([period.periodStart, period.periodEnd], ['2026-10-01', '2026-11-19']);
  assertEquals(period.current.end.toISOString(), '2026-11-20T05:00:00.000Z');
  assertEquals(period.previous.days, 50);
  assertEquals(period.previous.window.start.toISOString(), '2026-07-01T04:00:00.000Z');
  assertEquals(period.previous.window.end.toISOString(), '2026-08-20T04:00:00.000Z');
  assertEquals(period.lastYear.window.end.toISOString(), '2025-11-20T05:00:00.000Z');
});

Deno.test('late evening UTC still belongs to the New York day', () => {
  // 1 January 2027, 02:00 UTC is still 31 December in New York.
  const period = manualPeriod(new Date('2027-01-01T02:00:00Z'));
  assertEquals([period.code, period.days], ['Q4 2026', 92]);
  assertEquals(newYorkDayIso(new Date('2027-01-01T02:00:00Z')), '2026-12-31');
});

Deno.test('a comparison quarter shorter than the partial span is capped at its own length', () => {
  // 30 September is day 92 of July to September; April to June has only 91.
  const period = manualPeriod(new Date('2026-09-30T16:00:00Z'));
  assertEquals(period.days, 92);
  assertEquals(period.previous.days, 91);
});

Deno.test('quarter lengths follow the calendar', () => {
  assertEquals(quarterDays({ year: 2026, q: 1 }), 90);
  assertEquals(quarterDays({ year: 2028, q: 1 }), 91);
  assertEquals(quarterDays({ year: 2026, q: 2 }), 91);
  assertEquals(quarterDays({ year: 2026, q: 3 }), 92);
  assertEquals(quarterDays({ year: 2026, q: 4 }), 92);
});

Deno.test('instant words read like the mockup', () => {
  assertEquals(instantWords(new Date('2026-10-01T13:00:00Z')), '1 October 2026 at 9:00 AM');
  assertEquals(instantWords(new Date('2026-11-19T17:05:00Z')), '19 November 2026 at 12:05 PM');
  assertEquals(newYorkClock(new Date('2026-11-19T05:30:00Z')).hour, 0);
});

Deno.test('database timestamps without a zone are read as UTC', () => {
  assertEquals(parseDbInstant('2026-08-01T12:00:00.123456')?.toISOString(), '2026-08-01T12:00:00.123Z');
  assertEquals(parseDbInstant('2026-08-01 12:00:00')?.toISOString(), '2026-08-01T12:00:00.000Z');
  assertEquals(parseDbInstant('2026-08-01T12:00:00+00:00')?.toISOString(), '2026-08-01T12:00:00.000Z');
  assertEquals(parseDbInstant('2026-08-01T12:00:00Z')?.toISOString(), '2026-08-01T12:00:00.000Z');
  assertEquals(parseDbInstant('nonsense'), null);
  assertEquals(parseDbInstant(null), null);
});
