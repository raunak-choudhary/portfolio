// supabase/functions/quarterly-report/report.ts
//
// Builds the quarterly report email from a stored summary, by fixed rules.
// Ported from the owner-approved mockup (design/mockups/voyage-v4b/report.js):
// same section order, same sentences where the numbers allow them, and an
// honest sentence wherever they do not (no visits, no engaged events yet, no
// project events yet, zero reach-outs, nothing to divide by). Nothing here is
// written by a language model.
//
// House rules for the text: plain words, no em dashes, no emoji, every claim
// carries its number, and each section ends with what to learn or do.
//
// The report is first built as a small block model, then rendered twice:
// email-safe HTML (inline styles, tables, the mockup's light paper look) and
// plain text. Inline emphasis is written as **bold** in block text.

import { dayWords, instantWords } from './period.ts';
import type { DeviceRow, SourceRow, WindowSummary } from './rules.ts';
import { type ReportSummary, startedInsidePeriod } from './summary.ts';

// ---------------------------------------------------------------------------
// Block model

interface Cell {
  text: string;
  small?: string;
}

type Block =
  | { kind: 'p'; text: string; note?: boolean }
  | { kind: 'ul'; items: string[] }
  | { kind: 'table'; head: string[]; rows: Cell[][] }
  | { kind: 'learn'; title: string; text: string }
  | { kind: 'tries'; items: Try[] }
  | { kind: 'defs'; items: Array<[string, string]> };

interface Section {
  title: string;
  blocks: Block[];
  concept?: boolean;
}

export interface Try {
  what: string;
  why: string;
  know: string;
}

export interface BuiltReport {
  subject: string;
  html: string;
  text: string;
}

export interface ReportOptions {
  /** Where "Open the archive in your admin" points. */
  adminUrl: string;
}

export const DEFAULT_ADMIN_URL = 'https://www.raunakchoudhary.com/admindashboard';

// ---------------------------------------------------------------------------
// Number words

const n = (value: number) => Math.round(value).toLocaleString('en-US');
const pct = (value: number) => `${Math.round(value * 100)}%`;
const plural = (count: number, one: string, many: string) => (count === 1 ? one : many);

/** Keeps database text from closing a **bold** run. */
const clean = (value: string) => value.replace(/\*+/g, '*').replace(/\s+/g, ' ').trim();

/** "rose 12%", "fell 8%", "held steady"; callers handle a zero baseline first. */
export function change(current: number, before: number): string {
  if (!before) return 'had nothing to compare with';
  const delta = (current - before) / before;
  if (Math.abs(delta) < 0.03) return 'held steady';
  return delta > 0 ? `rose ${pct(delta)}` : `fell ${pct(-delta)}`;
}

const NAMES = ['Visits', 'Went deeper', 'Looked at your work', 'Reached out'];

const steps = (w: WindowSummary) => [w.visits, w.deeper, w.work, w.reached];

/** Share kept from the step before; null when the step before is empty. */
const stepRate = (
  list: number[],
  i: number,
): number | null => (i === 0 ? 1 : list[i - 1] ? list[i] / list[i - 1] : null);

const FIX: Record<number, [string, string]> = {
  1: ['Fewer visitors got past the first screen', 'the top of the home page'],
  2: ['Fewer visitors who went deeper opened your work', 'the order and first lines of your project cards'],
  3: ['Fewer visitors who looked at your work reached out', 'how easy the next step is'],
};

/** The step whose kept share fell most against the quarter before (more than two points), or -1. */
export function fallingStep(now: WindowSummary, before: WindowSummary): number {
  const a = steps(now);
  const b = steps(before);
  let fall = -1;
  let drop = 0.02;
  for (let i = 1; i < 4; i += 1) {
    const ra = stepRate(a, i);
    const rb = stepRate(b, i);
    if (ra === null || rb === null) continue;
    if (rb - ra > drop) {
      drop = rb - ra;
      fall = i;
    }
  }
  return fall;
}

/** Best source by reach-out rate among those with any reach-out; ties go to more reach-outs, then visits. */
export function bestSource(sources: SourceRow[]): SourceRow | null {
  const ranked = sources.filter((s) => s.reached > 0).sort((s, t) =>
    t.reached / t.visits - s.reached / s.visits || t.reached - s.reached || t.visits - s.visits
  );
  return ranked[0] ?? null;
}

/** Source with the most visits, or null when there were none. */
export function busiestSource(sources: SourceRow[]): SourceRow | null {
  const ranked = sources.filter((s) => s.visits > 0).sort((s, t) => t.visits - s.visits || t.reached - s.reached);
  return ranked[0] ?? null;
}

const oneIn = (s: SourceRow) => `1 in ${Math.round(s.visits / s.reached)}`;

const device = (w: WindowSummary, key: string) => w.devices.find((d) => d.key === key) as DeviceRow;

/** Phones are a problem when their quick-leave rate is over one and a half times the laptops'. */
export function phonesLeaveEarly(w: WindowSummary): boolean {
  const laptop = device(w, 'desktop');
  const phone = device(w, 'phone');
  if (laptop.quick === null || phone.quick === null) return false;
  return phone.quick > laptop.quick * 1.5;
}

// ---------------------------------------------------------------------------
// Rules

/** "Three things to try", chosen by fixed rule in a fixed order of priority. */
export function chooseTries(s: ReportSummary): Try[] {
  const q = s.windows.current;
  const prev = s.windows.previous;
  const tries: Try[] = [];
  const laptop = device(q, 'desktop');
  const phone = device(q, 'phone');
  const best = bestSource(q.sources);
  const most = busiestSource(q.sources);
  const contact = q.homeReach.sections.find((section) => section.key === 'contact');
  const fall = fallingStep(q, prev);

  if (phonesLeaveEarly(q)) {
    const target = Math.max((laptop.quick as number) * 1.3, (phone.quick as number) - 0.1);
    tries.push({
      what: 'Fix the first screen on phones.',
      why: `${pct(phone.quick as number)} of phone visits ended on the first screen, against ${
        pct(laptop.quick as number)
      } on laptops. Open the site on your phone: your name and one line on what you want should be readable before anything else loads.`,
      know: `Next quarter, phone quick leaves fall below ${pct(target)}.`,
    });
  }

  if (q.visits > 0 && contact && contact.share !== null && contact.share < 0.3) {
    const rate = q.reached / q.visits;
    tries.push({
      what: 'Put a contact link next to your projects.',
      why: `Only ${
        pct(contact.share)
      } of visitors scrolled as far as the Contact section. The people reading your projects are the ones most likely to write, and most of them never reach the bottom.`,
      know: `The share of visitors who reach out rises above ${pct(rate + 0.01)} (it was ${pct(rate)}).`,
    });
  }

  if (best) {
    const noise = Math.round(Math.sqrt(best.reached));
    tries.push({
      what: `Post once on ${best.name} about one project.`,
      why: `${best.name} turned ${
        oneIn(best)
      } visits into a message, the best rate of any source. One post that links straight to a project page is the cheapest way to send more of those visitors.`,
      know: `Reach-outs from ${best.name} go above ${n(best.reached + noise)}. Fewer than that is within normal swing.`,
    });
  } else if (most) {
    tries.push({
      what: 'Share one project where recruiters already look.',
      why: `None of the ${
        n(q.visits)
      } visits ended in a reach-out, so there is no source to build on yet. ${most.name} sent the most visits (${
        n(most.visits)
      }); one post there that links straight to a project page is the cheapest test.`,
      know: 'At least one reach-out arrives next quarter.',
    });
  }

  if (s.stale.length) {
    tries.push({
      what: `Update ${s.stale[0].name}.`,
      why: `It has gone ${
        s.stale[0].days
      } days without an edit. Visitors cannot see the date, but a list that stops early reads as a person who stopped.`,
      know: 'It leaves the stale list in the next report.',
    });
  }

  if (fall > 0) {
    const before = stepRate(steps(prev), fall) as number;
    tries.push({
      what: `Look first at ${FIX[fall][1]}.`,
      why: `The step to "${NAMES[fall].toLowerCase()}" kept ${
        pct(stepRate(steps(q), fall) as number)
      } of people, down from ${pct(before)} the quarter before. It is the step that lost the most.`,
      know: `That step keeps more than ${pct(before)} again.`,
    });
  }

  const opens = q.projects.reduce((sum, p) => sum + p.opens, 0);
  const unopened = q.projects.filter((p) => p.opens === 0);
  if (s.projectTrackingStartedOn && opens > 0 && unopened.length) {
    tries.push({
      what: 'Move one unopened project up, or retire it.',
      why: `${unopened.length} of your ${s.projectCount} projects ${
        plural(unopened.length, 'was', 'were')
      } not opened at all. A card nobody opens still costs scrolling for everyone looking for the good ones.`,
      know: 'It gets at least one open next quarter, or it is gone.',
    });
  }

  if (q.visits === 0) {
    tries.push({
      what: 'Send the link to five people who hire.',
      why:
        'No visits were recorded in this period, so every rule in this report is waiting for data. Five real visits are enough to see the path work from first screen to reach-out.',
      know: 'The next report shows at least five visits.',
    });
  }

  return tries.slice(0, 3);
}

// ---------------------------------------------------------------------------
// Sections

function header(s: ReportSummary): { kicker: string; title: string; meta: string } {
  const when = instantWords(new Date(s.generatedAt));
  if (s.partial) {
    return {
      kicker: 'RC Portfolio · Quarter so far',
      title: `${s.label}, so far`,
      meta:
        `Made ${when} New York time · day ${s.days} of ${s.quarterLength} · compared with the first ${s.days} days of ${s.previous.label} and of ${s.lastYear.label}`,
    };
  }
  return {
    kicker: 'RC Portfolio · Quarterly report',
    title: s.label,
    meta:
      `Sent ${when} New York time · ${s.days} days · compared with ${s.previous.label} and with ${s.lastYear.label}`,
  };
}

function inShort(s: ReportSummary): Section {
  const q = s.windows.current;
  const prev = s.windows.previous;
  const items: string[] = [];
  const span = s.partial ? 'so far this quarter' : 'this quarter';

  if (q.visits === 0) {
    items.push(
      `No visits were recorded ${span}. The ${
        s.partial ? `same ${s.days} days of the quarter before` : 'quarter before'
      } had ${n(prev.visits)}.`,
    );
  } else {
    const visitsChange = prev.visits
      ? `Visits ${change(q.visits, prev.visits)} on the quarter before`
      : 'The quarter before recorded no visits to compare with';
    let first = `You had **${n(q.visits)} ${plural(q.visits, 'visit', 'visits')}** and **${n(q.reached)} ${
      plural(q.reached, 'reach-out', 'reach-outs')
    }**. ${visitsChange}, and reach-outs went from ${n(prev.reached)} to ${n(q.reached)}.`;
    if (s.pace) {
      first += ` At this pace the quarter ends near ${n(s.pace.visits)} visits and ${n(s.pace.reached)} reach-outs.`;
    }
    items.push(first);

    const best = bestSource(q.sources);
    const most = busiestSource(q.sources) as SourceRow;
    if (best) {
      items.push(
        `**${best.name}** sent your most willing visitors: ${pct(best.visits / q.visits)} of visits, ${
          pct(best.reached / q.reached)
        } of reach-outs.`,
      );
    } else {
      items.push(
        `Nobody reached out yet, so no source stands out. **${most.name}** sent the most visits: ${n(most.visits)} of ${
          n(q.visits)
        }.`,
      );
    }

    const fall = fallingStep(q, prev);
    if (fall > 0) {
      items.push(`${FIX[fall][0]} than the quarter before. That is the one place to look first: ${FIX[fall][1]}.`);
    } else if (prev.visits) {
      items.push(
        'Every step of the path held its rate, so the site is converting as well as before. More visitors is the lever now.',
      );
    } else {
      items.push('There is no earlier quarter to compare the path with, so this report sets the baseline.');
    }
  }
  return { title: 'In short', blocks: [{ kind: 'ul', items }] };
}

function isItWorking(s: ReportSummary): Section {
  const q = s.windows.current;
  const prev = s.windows.previous;
  const ly = s.windows.lastYear;
  const a = steps(q);
  const b = steps(prev);
  const y = steps(ly);
  const cell = (list: number[], i: number): Cell => {
    const rate = stepRate(list, i);
    return i && rate !== null ? { text: n(list[i]), small: pct(rate) } : { text: n(list[i]) };
  };
  const blocks: Block[] = [
    {
      kind: 'p',
      text:
        'Think of a visit as a path with four steps. Each step keeps a share of the people from the step before. The **share** tells you whether the site works; the **count** mostly tells you how many people found it.',
    },
    {
      kind: 'table',
      head: ['', s.partial ? 'So far' : 'This quarter', s.previous.quarter, s.lastYear.quarter],
      rows: NAMES.map((name, i) => [{ text: name }, cell(a, i), cell(b, i), cell(y, i)]),
    },
    { kind: 'p', note: true, text: 'Small figures are the share kept from the step before.' },
  ];

  if (q.visits === 0) {
    blocks.push({ kind: 'p', text: 'With no visits there is no path to read yet.' });
  } else {
    const fall = fallingStep(q, prev);
    let tail = '';
    if (fall > 0) {
      tail = ` The step to "${NAMES[fall].toLowerCase()}" kept ${
        pct(stepRate(a, fall) as number)
      } of people, down from ${pct(stepRate(b, fall) as number)}.`;
    } else if (prev.visits) {
      tail = ' No step lost more than two points.';
    }
    blocks.push({
      kind: 'p',
      text: `Out of every 100 visitors ${s.partial ? 'so far' : 'this quarter'}, about **${
        Math.round((a[2] / a[0]) * 100)
      }** looked at your work and **${Math.round((a[3] / a[0]) * 100)}** reached out.${tail}`,
    });
  }

  const against = s.partial ? `the first ${s.days} days of ${s.lastYear.label}` : s.lastYear.label;
  const lastYearLine = ly.visits
    ? `Against ${against}, visits ${change(q.visits, ly.visits)} and reach-outs ${
      ly.reached ? change(q.reached, ly.reached) : `went from none to ${n(q.reached)}`
    }.`
    : `${s.lastYear.label} recorded no visits, so that comparison starts next year.`;
  blocks.push({
    kind: 'learn',
    title: 'Why the same quarter last year is in the table.',
    text:
      `Hiring has seasons: fall recruiting starts in September and slows in December. A quarter is fairest when compared with the same quarter a year earlier. ${lastYearLine}`,
  });
  return { title: '1. Is it working?', blocks };
}

function sources(s: ReportSummary): Section {
  const q = s.windows.current;
  const blocks: Block[] = [];
  const shown = q.sources.filter((source) => source.visits > 0);
  if (!shown.length) {
    blocks.push({ kind: 'p', text: 'No visits were recorded, so no source sent anyone yet.' });
  } else {
    blocks.push({
      kind: 'table',
      head: ['Source', 'Visits', 'Reach-outs', 'Rate'],
      rows: shown.map((source) => [
        { text: source.name },
        { text: n(source.visits) },
        { text: n(source.reached) },
        { text: source.reached ? oneIn(source) : 'none' },
      ]),
    });
    const best = bestSource(q.sources);
    const most = busiestSource(q.sources) as SourceRow;
    let line: string;
    if (!best) {
      line = `${most.name} sent the most visitors (${n(most.visits)}). None of the ${
        n(q.visits)
      } visits reached out, so no source has a rate yet.`;
    } else if (best.name === most.name) {
      line = `${most.name} sent both the most visitors and the most willing ones.`;
    } else {
      line = `${most.name} sent the most visitors, but ${best.name} turned them into messages best: ${
        oneIn(best)
      } against ${most.reached ? oneIn(most) : 'none at all'} from ${most.name}.`;
    }
    blocks.push({ kind: 'p', text: line });
  }
  blocks.push({
    kind: 'learn',
    title: 'Rank sources by reach-outs, not visits.',
    text:
      'A source that sends a few people who write to you is worth more than one that sends many who leave. "Direct or unknown" means the browser did not say: a typed address, a bookmark, or a link in an email, a chat or your resume PDF.',
  });
  return { title: '2. Where your best visitors came from', blocks };
}

function work(s: ReportSummary): Section {
  const q = s.windows.current;
  const blocks: Block[] = [];
  if (!s.projectTrackingStartedOn) {
    blocks.push({
      kind: 'p',
      text:
        'Project opens are not recorded yet. They start once the new tracking is live, so this section stays empty rather than guess.',
    });
  } else {
    if (startedInsidePeriod(s.projectTrackingStartedOn, s.periodStart)) {
      blocks.push({
        kind: 'p',
        note: true,
        text: `Recorded from ${dayWords(s.projectTrackingStartedOn)}, when project tracking started.`,
      });
    }
    const opens = q.projects.reduce((sum, p) => sum + p.opens, 0);
    if (!opens) {
      blocks.push({
        kind: 'p',
        text: `None of your ${s.projectCount} projects was opened in this period.`,
      });
    } else {
      blocks.push({
        kind: 'table',
        head: ['Project', 'Opens', 'GitHub', 'Demo'],
        rows: q.projects.slice(0, 5).map((p) => [
          { text: clean(p.title) },
          { text: n(p.opens) },
          { text: n(p.repo) },
          p.hasDemo ? { text: n(p.demo) } : { text: '', small: 'no demo' },
        ]),
      });
      const unopened = q.projects.filter((p) => p.opens === 0);
      const follow = q.projects.filter((p) => p.opens >= 8).sort((a, b) => b.repo / b.opens - a.repo / a.opens);
      const parts = [
        unopened.length
          ? `${unopened.length} of your ${s.projectCount} projects ${
            plural(unopened.length, 'was', 'were')
          } not opened at all: ${unopened.map((p) => clean(p.title)).join(', ')}.`
          : 'Every project was opened at least once.',
      ];
      if (follow.length && follow[0].repo > 0) {
        parts.push(
          `${clean(follow[0].title)} had the best follow-through: ${
            pct(Math.min(1, follow[0].repo / follow[0].opens))
          } of the people who opened it went on to GitHub.`,
        );
      }
      blocks.push({ kind: 'p', text: parts.join(' ') });
    }
  }
  blocks.push({
    kind: 'learn',
    title: 'Follow-through says more than opens.',
    text:
      'Opens mostly reflect where a card sits on the page; the top cards always win. The share who then click through to GitHub or the demo tells you whether the card made them curious. A starred project with low follow-through needs a sharper first line, not a better position.',
  });
  return { title: '3. Your work', blocks };
}

function brokenOrStale(s: ReportSummary): Section {
  const q = s.windows.current;
  const laptop = device(q, 'desktop');
  const phone = device(q, 'phone');
  const blocks: Block[] = [];

  let devices: string;
  if (!s.engagementStartedOn) {
    devices =
      '**Devices.** Quick leaves are measured once the new tracking is live, so this report cannot yet say whether phones leave sooner than laptops.';
    if (phone.share !== null) devices += ` Phones were ${pct(phone.share)} of all visits.`;
  } else if (laptop.quick === null || phone.quick === null) {
    devices =
      '**Devices.** Phones and laptops cannot be compared yet: one of them had no visits since engagement tracking started.';
  } else if (phonesLeaveEarly(q)) {
    devices = `**Phones.** ${pct(phone.quick)} of phone visits ended on the first screen within ten seconds, against ${
      pct(laptop.quick)
    } on laptops. Phones were ${pct(phone.share as number)} of all visits${
      (phone.share as number) >= 0.2 ? ', so this is not a corner case' : ''
    }.`;
  } else {
    devices = `**Devices.** ${pct(phone.quick)} of phone visits and ${
      pct(laptop.quick)
    } of laptop visits were quick leaves. Nothing points at a broken layout on phones.`;
  }
  blocks.push({ kind: 'p', text: devices });
  if (s.engagementStartedOn && startedInsidePeriod(s.engagementStartedOn, s.periodStart)) {
    blocks.push({
      kind: 'p',
      note: true,
      text: `Quick leaves measured from ${dayWords(s.engagementStartedOn)} when engagement tracking started.`,
    });
  }

  if (s.stale.length) {
    const list = s.stale.map((item) => `${item.name} (${item.days} days)`).join(', ');
    blocks.push({
      kind: 'p',
      text: `**Stale sections.** ${list} ${
        plural(s.stale.length, 'has', 'have')
      } not been edited for more than 90 days. ${s.freshSections} other ${
        plural(s.freshSections, 'section is', 'sections are')
      } current.`,
    });
  } else {
    blocks.push({
      kind: 'p',
      text: `**Stale sections.** None. All ${s.freshSections} sections were edited in the last 90 days.`,
    });
  }
  blocks.push({
    kind: 'p',
    note: true,
    text:
      'Script errors and slow loads are not recorded yet, so a broken page would only show up here as quick leaves.',
  });
  return { title: '4. Anything broken or stale', blocks };
}

function toTry(s: ReportSummary): Section {
  const tries = chooseTries(s);
  return {
    title: tries.length === 3 ? '5. Three things to try this quarter' : '5. What to try this quarter',
    blocks: [{ kind: 'tries', items: tries }],
  };
}

function idea(s: ReportSummary): Section {
  const reached = s.windows.current.reached;
  if (!reached) {
    return {
      title: 'Idea of the quarter: small numbers swing',
      concept: true,
      blocks: [
        {
          kind: 'p',
          text:
            'You had no reach-outs, and zero is a small number too. With counts this low, one message more or less is the whole difference between a good quarter and a bad one, and chance decides much of it.',
        },
        {
          kind: 'p',
          text:
            'A useful rule of thumb: a count of N wobbles by about the square root of N. Once reach-outs start, call a change real only when it is bigger than that wobble, or when it holds for two quarters in a row.',
        },
      ],
    };
  }
  const noise = Math.round(Math.sqrt(reached));
  return {
    title: 'Idea of the quarter: small numbers swing',
    concept: true,
    blocks: [
      {
        kind: 'p',
        text: `${n(reached)} ${
          plural(reached, 'reach-out', 'reach-outs')
        } is a small number. If the same site had run the same quarter again, chance alone could have given you anything from about ${
          n(Math.max(0, reached - 2 * noise))
        } to ${
          n(reached + 2 * noise)
        }. A useful rule of thumb: a count of N wobbles by about the square root of N, so ${
          n(reached)
        } wobbles by about ${noise}.`,
      },
      {
        kind: 'p',
        text:
          'That is why this report calls a change real only when it is bigger than that wobble, or when it holds for two quarters in a row. When you try something from section 5, judge it the same way.',
      },
    ],
  };
}

const DEFINITIONS: Section = {
  title: 'How these numbers are counted',
  blocks: [{
    kind: 'defs',
    items: [
      [
        'Visit',
        'One browser session on the public site. The same person on a phone and a laptop counts twice. No names, addresses or IPs are stored.',
      ],
      ['Went deeper', 'Opened a second page, or scrolled down to the About section or further.'],
      [
        'Looked at your work',
        'Opened a project, the Projects page, Work experience or Internships, or followed a GitHub or demo link.',
      ],
      ['Reached out', 'Followed your LinkedIn or email link, downloaded the resume, or sent the contact form.'],
      ['Quick leave', 'A visit that ended on the first screen within ten seconds.'],
    ],
  }],
};

function footer(s: ReportSummary): string {
  return s.partial
    ? `Written by fixed rules from your analytics events. This is a snapshot of the quarter so far; the full report arrives on ${s.nextReportOn}.`
    : `Written by fixed rules from your analytics events. The visits stay in the database; this report is a snapshot of them. The next one arrives on ${s.nextReportOn}.`;
}

// ---------------------------------------------------------------------------
// HTML (email-safe: inline styles, tables for layout and numbers)

const C = {
  ink: '#1f1a17',
  muted: '#6b625b',
  line: '#e4ddd5',
  paper: '#fffdfa',
  bg: '#f3eee8',
  accent: '#b4532a',
  soft: '#f7efe7',
};
const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

export function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Escapes, then turns **x** into bold. */
const rich = (text: string) => escapeHtml(text).replace(/\*\*(.+?)\*\*/g, '<b style="font-weight:650">$1</b>');

const SMALL = `font-size:12px;color:${C.muted};font-weight:400;margin-left:4px`;
const P = 'margin:0 0 12px';
const NOTE = `margin:0 0 12px;font-size:13px;color:${C.muted}`;
const CELL = `padding:8px 8px 8px 0;border-bottom:1px solid ${C.line};text-align:left;vertical-align:top`;
const NUM =
  `padding:8px 0 8px 8px;border-bottom:1px solid ${C.line};text-align:right;vertical-align:top;white-space:nowrap`;

function htmlCell(cell: Cell, numeric: boolean, tag: 'td' | 'th'): string {
  const small = cell.small ? `${cell.text ? ' ' : ''}<small style="${SMALL}">${escapeHtml(cell.small)}</small>` : '';
  const style = numeric ? NUM : `${CELL};font-weight:500`;
  return `<${tag}${tag === 'th' ? ' scope="row"' : ''} style="${style}">${escapeHtml(cell.text)}${small}</${tag}>`;
}

function htmlBlock(block: Block): string {
  switch (block.kind) {
    case 'p':
      return `<p style="${block.note ? NOTE : P}">${rich(block.text)}</p>`;
    case 'ul':
      return `<ul style="margin:0;padding-left:20px">${
        block.items.map((item) => `<li style="margin:0 0 8px">${rich(item)}</li>`).join('')
      }</ul>`;
    case 'table': {
      const head = block.head.map((h, i) =>
        `<th style="${i ? NUM : CELL};font-size:12px;font-weight:600;color:${C.muted}">${escapeHtml(h)}</th>`
      ).join('');
      const rows = block.rows.map((row) =>
        `<tr>${row.map((cell, i) => (i ? htmlCell(cell, true, 'td') : htmlCell(cell, false, 'th'))).join('')}</tr>`
      ).join('');
      return `<table role="table" width="100%" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;margin:6px 0 10px;font-size:15px"><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table>`;
    }
    case 'learn':
      return `<div style="margin:14px 0 0;padding:14px 16px;background:${C.soft};border-left:3px solid ${C.accent};border-radius:0 8px 8px 0;font-size:15px"><b style="display:block;margin-bottom:2px;font-weight:650">${
        escapeHtml(block.title)
      }</b>${rich(block.text)}</div>`;
    case 'tries':
      return `<ol style="margin:0;padding-left:22px">${
        block.items.map((t) =>
          `<li style="margin:0 0 14px"><b style="font-weight:650">${escapeHtml(t.what)}</b><p style="margin:4px 0 0">${
            rich(t.why)
          }</p><p style="margin:4px 0 0;font-size:14px;color:${C.muted}">How you will know it worked: ${
            rich(t.know)
          }</p></li>`
        ).join('')
      }</ol>`;
    case 'defs':
      return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;font-size:14px">${
        block.items.map(([term, def]) =>
          `<tr><td style="padding:3px 16px 3px 0;font-weight:600;vertical-align:top;white-space:nowrap">${
            escapeHtml(term)
          }</td><td style="padding:3px 0;color:${C.muted};vertical-align:top">${escapeHtml(def)}</td></tr>`
        ).join('')
      }</table>`;
  }
}

function htmlSection(section: Section): string {
  const frame = section.concept
    ? `margin-top:30px;padding:22px 24px;background:${C.soft};border-radius:8px`
    : `margin-top:30px;padding-top:22px;border-top:1px solid ${C.line}`;
  return `<div style="${frame}"><h2 style="margin:0 0 12px;font-size:19px;line-height:1.3">${
    escapeHtml(section.title)
  }</h2>${section.blocks.map(htmlBlock).join('')}</div>`;
}

// ---------------------------------------------------------------------------
// Plain text

const plain = (text: string) => text.replace(/\*\*(.+?)\*\*/g, '$1');

function wrap(text: string, width = 76, indent = ''): string {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    if (line && (indent + line + ' ' + word).length > width) {
      lines.push(indent + line);
      line = word;
    } else {
      line = line ? `${line} ${word}` : word;
    }
  }
  if (line) lines.push(indent + line);
  return lines.join('\n');
}

function textTable(head: string[], rows: Cell[][]): string {
  const cells = [
    head,
    ...rows.map((row) => row.map((c) => [c.text, c.small ? `(${c.small})` : ''].filter(Boolean).join(' '))),
  ];
  const widths = head.map((_, i) => Math.max(...cells.map((row) => row[i].length)));
  return cells.map((row) =>
    row.map((value, i) => (i ? value.padStart(widths[i]) : value.padEnd(widths[i]))).join('  ').trimEnd()
  )
    .join('\n');
}

function textBlock(block: Block): string {
  switch (block.kind) {
    case 'p':
      return wrap(plain(block.text));
    case 'ul':
      return block.items.map((item) => wrap(`- ${plain(item)}`).replace(/\n/g, '\n  ')).join('\n');
    case 'table':
      return textTable(block.head, block.rows);
    case 'learn':
      return `${block.title}\n${wrap(plain(block.text))}`;
    case 'tries':
      return block.items.map((t, i) =>
        [
          `${i + 1}. ${t.what}`,
          wrap(plain(t.why), 76, '   '),
          wrap(`How you will know it worked: ${plain(t.know)}`, 76, '   '),
        ]
          .join('\n')
      ).join('\n\n');
    case 'defs':
      return block.items.map(([term, def]) => wrap(`${term}: ${def}`).replace(/\n/g, '\n  ')).join('\n');
  }
}

const textSection = (section: Section) =>
  `${section.title}\n${'-'.repeat(section.title.length)}\n${section.blocks.map(textBlock).join('\n\n')}`;

// ---------------------------------------------------------------------------
// Entry point

export function buildReport(s: ReportSummary, options: ReportOptions = { adminUrl: DEFAULT_ADMIN_URL }): BuiltReport {
  const head = header(s);
  const sections = [
    inShort(s),
    isItWorking(s),
    sources(s),
    work(s),
    brokenOrStale(s),
    toTry(s),
    idea(s),
    DEFINITIONS,
  ];
  const foot = footer(s);
  const adminUrl = /^https:\/\//.test(options.adminUrl) ? options.adminUrl : DEFAULT_ADMIN_URL;
  const subject = s.partial
    ? `Quarter so far: ${s.label} (day ${s.days} of ${s.quarterLength})`
    : `Quarterly report: ${s.label}`;

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background:${C.bg}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.bg}"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:680px;background:${C.paper};border:1px solid ${C.line};border-radius:10px"><tr><td style="padding:32px 28px;font-family:${FONT};font-size:16px;line-height:1.6;color:${C.ink}">
<div style="font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:${C.accent};font-weight:600">${
    escapeHtml(head.kicker)
  }</div>
<h1 style="margin:6px 0 4px;font-size:28px;line-height:1.2">${escapeHtml(head.title)}</h1>
<p style="margin:0;font-size:13px;color:${C.muted}">${escapeHtml(head.meta)}</p>
${sections.map(htmlSection).join('\n')}
<div style="margin-top:30px;padding-top:18px;border-top:1px solid ${C.line};font-size:13px;color:${C.muted}">
<p style="margin:0 0 8px">${escapeHtml(foot)}</p>
<p style="margin:0"><a href="${escapeHtml(adminUrl)}" style="color:${C.accent}">Open the archive in your admin</a></p>
</div>
</td></tr></table>
</td></tr></table>
</body>
</html>`;

  const text = [
    head.kicker.toUpperCase(),
    head.title,
    wrap(head.meta),
    ...sections.map(textSection),
    wrap(foot),
    `Open the archive in your admin: ${adminUrl}`,
  ].join('\n\n') + '\n';

  return { subject, html, text };
}
