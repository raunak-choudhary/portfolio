import { assert, assertEquals, assertFalse, assertStringIncludes } from 'jsr:@std/assert@1';
import { manualPeriod, type ReportPeriod, scheduledPeriod } from './period.ts';
import type { EventRow, ProjectRef, SectionEdit, WindowSummary } from './rules.ts';
import { buildSummary, type ReportSummary } from './summary.ts';
import { bestSource, buildReport, change, chooseTries, fallingStep } from './report.ts';
import fixtureJson from './fixtures/events.json' with { type: 'json' };

const fixture = fixtureJson as unknown as { events: EventRow[]; projects: ProjectRef[]; engagementStart: string };
const SEND_TIME = new Date('2026-10-01T13:00:00Z');
const DAY = 24 * 60 * 60 * 1000;

const edits = (asOf: Date, ages: Array<[string, number]>): SectionEdit[] =>
  ages.map(([name, days]) => ({ name, updatedAt: new Date(asOf.getTime() - days * DAY) }));

const FRESH = edits(SEND_TIME, [['Hero', 5], ['About', 20], ['Projects', 30]]);
const SOME_STALE = edits(SEND_TIME, [['Hero', 5], ['Certifications', 142], ['Leadership', 118], ['Projects', 30]]);

/** A visit that reaches out through LinkedIn, so a comparison window can differ from the fixture. */
const reachingVisit = (id: string): EventRow[] => [
  {
    session_id: id,
    event_type: 'page_view',
    event_action: 'view_page',
    event_label: 'home',
    created_at: '2026-05-01T12:00:00',
    metadata: { visitor_info: { referrer: 'www.linkedin.com', deviceClass: 'desktop' } },
  },
  {
    session_id: id,
    event_type: 'click',
    event_action: 'click_social_media',
    event_label: 'linkedin',
    created_at: '2026-05-01T12:01:00',
    metadata: {},
  },
];

function summary(overrides: {
  period?: ReportPeriod;
  generatedAt?: Date;
  current?: EventRow[];
  previous?: EventRow[];
  lastYear?: EventRow[];
  projects?: ProjectRef[];
  engagementStart?: Date | null;
  projectTrackingStart?: Date | null;
  edits?: SectionEdit[];
} = {}): ReportSummary {
  return buildSummary({
    period: overrides.period ?? scheduledPeriod(SEND_TIME),
    generatedAt: overrides.generatedAt ?? SEND_TIME,
    events: {
      current: overrides.current ?? fixture.events,
      previous: overrides.previous ?? fixture.events,
      lastYear: overrides.lastYear ?? [],
    },
    projects: overrides.projects ?? fixture.projects,
    engagementStart: overrides.engagementStart === undefined
      ? new Date(fixture.engagementStart)
      : overrides.engagementStart,
    projectTrackingStart: overrides.projectTrackingStart === undefined
      ? new Date('2026-08-10T18:01:00Z')
      : overrides.projectTrackingStart,
    edits: overrides.edits ?? SOME_STALE,
  });
}

const withoutReach = fixture.events.filter((row) =>
  row.event_action !== 'reach_out' && row.event_type !== 'form_submission' &&
  row.event_action !== 'click_contact_email' &&
  !(row.event_action === 'click_social_media' && row.event_label === 'linkedin')
);

const SCENARIOS: Record<string, () => ReportSummary> = {
  full: () => summary(),
  growing: () => summary({ previous: [...reachingVisit('p1'), ...reachingVisit('p2')], lastYear: fixture.events }),
  empty: () =>
    summary({
      current: [],
      previous: [],
      lastYear: [],
      engagementStart: null,
      projectTrackingStart: null,
      edits: FRESH,
    }),
  noReach: () => summary({ current: withoutReach }),
  noEngagementYet: () => summary({ engagementStart: null, projectTrackingStart: null }),
  partial: () =>
    summary({ period: manualPeriod(new Date('2026-11-19T20:12:00Z')), generatedAt: new Date('2026-11-19T20:12:00Z') }),
  oddTitles: () =>
    summary({
      projects: [
        { id: '11111111-1111-4111-8111-111111111111', title: '<script>alert(1)</script> **x**', hasDemo: true },
        ...fixture.projects.slice(1),
      ],
    }),
};

const EMOJI = /\p{Extended_Pictographic}/u;

/** The text version wraps lines; sentences are matched with whitespace collapsed. */
const flat = (value: string) => value.replace(/\s+/g, ' ');
const render = (s: ReportSummary) => {
  const built = buildReport(s);
  return { ...built, text: flat(built.text) };
};

Deno.test('no report text ever contains an em dash, an emoji or a broken number', () => {
  for (const [name, make] of Object.entries(SCENARIOS)) {
    const { subject, html, text } = buildReport(make());
    for (const [part, value] of Object.entries({ subject, html, text })) {
      assertFalse(value.includes('\u2014'), `${name} ${part} contains an em dash`);
      assertFalse(EMOJI.test(value), `${name} ${part} contains an emoji`);
      for (const bad of ['NaN', 'undefined', 'Infinity', '[object Object]']) {
        assertFalse(value.includes(bad), `${name} ${part} contains ${bad}`);
      }
    }
    assertFalse(/\bnull\b/.test(text), `${name} text contains null`);
  }
});

Deno.test('sections come in the approved order in both versions', () => {
  const { html, text } = buildReport(SCENARIOS.full());
  const titles = [
    'In short',
    '1. Is it working?',
    '2. Where your best visitors came from',
    '3. Your work',
    '4. Anything broken or stale',
    '5. Three things to try this quarter',
    'Idea of the quarter: small numbers swing',
    'How these numbers are counted',
  ];
  for (const body of [html, text]) {
    let last = -1;
    for (const title of titles) {
      const at = body.indexOf(title);
      assert(at > last, `${title} out of order`);
      last = at;
    }
  }
});

Deno.test('a full quarter states its numbers like the mockup', () => {
  const { subject, html, text } = render(SCENARIOS.full());
  assertEquals(subject, 'Quarterly report: July to September 2026');
  assertStringIncludes(html, '<h1 style="margin:6px 0 4px;font-size:28px;line-height:1.2">July to September 2026</h1>');
  assertStringIncludes(
    text,
    'Sent 1 October 2026 at 9:00 AM New York time · 92 days · compared with April to June 2026 and with July to',
  );
  assertStringIncludes(
    html,
    'You had <b style="font-weight:650">10 visits</b> and <b style="font-weight:650">3 reach-outs</b>.',
  );
  assertStringIncludes(text, 'Visits held steady on the quarter before, and reach-outs went from 3 to 3.');
  assertStringIncludes(text, 'LinkedIn sent your most willing visitors: 30% of visits, 100% of reach-outs.');
  assertStringIncludes(text, 'Every step of the path held its rate');
  assertStringIncludes(text, 'about 50 looked at your work and 30 reached out. No step lost more than two points.');
  assertStringIncludes(
    text,
    'Direct or unknown sent the most visitors, but LinkedIn turned them into messages best: 1 in 1',
  );
  assertStringIncludes(text, 'Recorded from 10 August 2026, when project tracking started.');
  assertStringIncludes(text, '1 of your 3 projects was not opened at all: Gamma.');
  assertStringIncludes(text, 'Phones. 40% of phone visits ended on the first screen within ten seconds, against 0%');
  assertStringIncludes(text, 'Quick leaves measured from 1 August 2026 when engagement tracking started.');
  assertStringIncludes(
    text,
    'Certifications (142 days), Leadership (118 days) have not been edited for more than 90 days.',
  );
  assertStringIncludes(text, '2 other sections are current.');
  assertStringIncludes(text, '3 reach-outs is a small number.');
  assertStringIncludes(text, 'anything from about 0 to 7');
  assertStringIncludes(text, 'The next one arrives on 1 January 2027.');
  assertStringIncludes(
    html,
    '<small style="font-size:12px;color:#6b625b;font-weight:400;margin-left:4px">no demo</small>',
  );
});

Deno.test('the three things to try follow the rule order and stop at three', () => {
  const tries = chooseTries(SCENARIOS.full());
  assertEquals(tries.map((t) => t.what), [
    'Fix the first screen on phones.',
    'Put a contact link next to your projects.',
    'Post once on LinkedIn about one project.',
  ]);
  assertStringIncludes(tries[0].why, '40% of phone visits ended on the first screen, against 0% on laptops.');
  assertStringIncludes(tries[1].why, 'Only 25% of visitors scrolled as far as the Contact section.');
  assertStringIncludes(tries[1].know, 'rises above 31% (it was 30%)');
  assertStringIncludes(tries[2].know, 'Reach-outs from LinkedIn go above 5.');
});

Deno.test('a quarter with no data says so plainly instead of dividing by zero', () => {
  const { text } = render(SCENARIOS.empty());
  assertStringIncludes(text, 'No visits were recorded this quarter. The quarter before had 0.');
  assertStringIncludes(text, 'With no visits there is no path to read yet.');
  assertStringIncludes(text, 'No visits were recorded, so no source sent anyone yet.');
  assertStringIncludes(text, 'Project opens are not recorded yet.');
  assertStringIncludes(text, 'Quick leaves are measured once the new tracking is live');
  assertStringIncludes(text, 'Stale sections. None. All 3 sections were edited in the last 90 days.');
  assertStringIncludes(text, '5. What to try this quarter');
  assertStringIncludes(text, 'Send the link to five people who hire.');
  assertStringIncludes(text, 'You had no reach-outs, and zero is a small number too.');
  assertStringIncludes(text, 'July to September 2025 recorded no visits, so that comparison starts next year.');
});

Deno.test('zero reach-outs: no best source, an honest swing note, a sharing idea', () => {
  const s = SCENARIOS.noReach();
  assertEquals(s.windows.current.reached, 0);
  assertEquals(bestSource(s.windows.current.sources), null);
  const { text } = render(s);
  assertStringIncludes(
    text,
    'Nobody reached out yet, so no source stands out. Direct or unknown sent the most visits: 4 of 10.',
  );
  assertStringIncludes(text, 'None of the 10 visits reached out, so no source has a rate yet.');
  assertStringIncludes(text, 'Share one project where recruiters already look.');
  assertStringIncludes(text, 'You had no reach-outs, and zero is a small number too.');
});

Deno.test('before engagement and project tracking exist, the report says when they will count', () => {
  const { text } = render(SCENARIOS.noEngagementYet());
  assertStringIncludes(text, 'Quick leaves are measured once the new tracking is live');
  assertStringIncludes(text, 'Phones were 50% of all visits.');
  assertStringIncludes(text, 'Project opens are not recorded yet.');
  assertFalse(text.includes('Fix the first screen on phones.'));
  assertFalse(text.includes('unopened project'));
});

Deno.test('a manual report is labelled as the quarter so far, with pace and like-for-like comparisons', () => {
  const s = SCENARIOS.partial();
  assertEquals(s.pace, { visits: 18, reached: 6 });
  const { subject, text } = render(s);
  assertEquals(subject, 'Quarter so far: October to December 2026 (day 50 of 92)');
  assertStringIncludes(text, 'RC PORTFOLIO · QUARTER SO FAR');
  assertStringIncludes(text, 'October to December 2026, so far');
  assertStringIncludes(text, 'day 50 of 92 · compared with the first 50 days of July to September 2026');
  assertStringIncludes(text, 'At this pace the quarter ends near 18 visits and 6 reach-outs.');
  assertStringIncludes(text, 'the full report arrives on 1 January 2027.');
});

Deno.test('a falling step is named, with both shares', () => {
  const s = SCENARIOS.growing();
  // The quarter before: 2 visits, both went all the way. Now 6 of 10 went
  // deeper (down 40 points) and 3 of 5 reached out (also down 40); the first
  // step with the largest drop is the one named.
  assertEquals(fallingStep(s.windows.current, s.windows.previous), 1);
  const { text } = render(s);
  assertStringIncludes(text, 'Fewer visitors got past the first screen than the quarter before.');
  assertStringIncludes(text, 'That is the one place to look first: the top of the home page.');
  assertStringIncludes(text, 'The step to "went deeper" kept 60% of people, down from 100%.');
  assertStringIncludes(text, 'Visits rose 400% on the quarter before, and reach-outs went from 2 to 3.');
  assertStringIncludes(text, 'Against July to September 2025, visits held steady and reach-outs held steady.');
});

Deno.test('fallingStep ignores drops of two points or less and empty steps', () => {
  const w = (visits: number, deeper: number, work: number, reached: number) =>
    ({ visits, deeper, work, reached }) as WindowSummary;
  assertEquals(fallingStep(w(100, 50, 25, 10), w(100, 51, 25, 10)), -1);
  assertEquals(fallingStep(w(100, 40, 25, 10), w(100, 50, 25, 10)), 1);
  assertEquals(fallingStep(w(0, 0, 0, 0), w(100, 50, 25, 10)), -1);
});

Deno.test('change words', () => {
  assertEquals(change(103, 100), 'rose 3%');
  assertEquals(change(102, 100), 'held steady');
  assertEquals(change(80, 100), 'fell 20%');
  assertEquals(change(5, 0), 'had nothing to compare with');
});

Deno.test('database text is escaped in the HTML and cannot open bold', () => {
  const { html, text } = render(SCENARIOS.oddTitles());
  assertFalse(html.includes('<script>'));
  assertStringIncludes(html, '&lt;script&gt;alert(1)&lt;/script&gt; *x*');
  assertStringIncludes(text, '<script>alert(1)</script> *x*');
});

Deno.test('the admin link accepts only https', () => {
  const s = SCENARIOS.full();
  assertStringIncludes(
    buildReport(s, { adminUrl: 'javascript:alert(1)' }).html,
    'https://www.raunakchoudhary.com/admindashboard',
  );
  assertStringIncludes(buildReport(s, { adminUrl: 'https://example.com/admin' }).text, 'https://example.com/admin');
});
