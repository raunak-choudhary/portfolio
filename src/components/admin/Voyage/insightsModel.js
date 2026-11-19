// src/components/admin/Voyage/insightsModel.js
//
// The Analytics chapter's numbers, computed from raw analytics_events rows
// exactly as the V4b contract (section 2) defines them; the quarterly report
// function computes the same numbers in TypeScript, so a change here is a
// change to the contract. Pure: rows in, plain objects out.
//
// A visit is one distinct session_id. Each visit is reduced once to a few
// flags (reached, work, deeper, engaged), its source and device (from the
// earliest event that carries visitor_info), the pages it saw and the
// projects it opened; every panel is then a count over those visits, except
// the channels and the project link counts, which count events.
//
// Rows may come straight from the table (with `metadata`) or from the
// service's narrow select, which lifts the three metadata fields used here
// to `visitor`, `kind` and `section`; both shapes are read.

import { dayIndex, shortDate, nyDate } from './insightsTime';

/* ---------- reading one event ---------- */

const PAGE_SUFFIXES = ['-no-storage', '-disabled', '-enabled', '-dedup'];

/**
 * A page_view label as one page name: lower case, no leading slash, without
 * the suffixes the old tracker appended ("home-no-storage" is "home").
 * @returns {string|null}
 */
export function foldPage(label) {
  if (label === null || label === undefined) return null;
  let page = String(label).trim().toLowerCase().replace(/^\/+/, '');
  for (let changed = true; changed;) {
    changed = false;
    for (const suffix of PAGE_SUFFIXES) {
      if (page.endsWith(suffix)) { page = page.slice(0, -suffix.length); changed = true; }
    }
  }
  return page || null;
}

const visitorOf = (row) => row.visitor ?? row.metadata?.visitor_info ?? null;
const kindOf = (row) => row.kind ?? row.metadata?.kind ?? null;
const labelOf = (row) => String(row.event_label ?? '').trim().toLowerCase();

/** The section a section_view row names: metadata.section_type, else the action's "view_<section>". */
export function sectionOf(row) {
  const named = row.section ?? row.metadata?.section_type;
  if (named) return String(named).trim().toLowerCase();
  const action = String(row.event_action ?? '');
  return action.startsWith('view_') ? action.slice(5).toLowerCase() : null;
}

/** Rows that never count: admin activity and the old admin section_visit events. */
export const isCounted = (row) => (row.user_type === undefined || row.user_type === 'visitor') && row.event_type !== 'section_visit';

/** The four ways in, in screen order. Counted per event. */
export const CHANNELS = Object.freeze([
  { id: 'linkedin', name: 'LinkedIn profile' },
  { id: 'email', name: 'Email link' },
  { id: 'contact_form', name: 'Contact form' },
  { id: 'resume', name: 'Resume download' },
]);

/**
 * Which way in a reach-out row is, or null when the row is not a reach-out.
 * New rows say so in event_action; legacy rows keep counting (contract 1).
 */
export function channelOf(row) {
  const action = row.event_action;
  if (action === 'reach_out') { const label = labelOf(row); return CHANNELS.some((c) => c.id === label) ? label : null; }
  if (row.event_type === 'form_submission') return 'contact_form';
  if (action === 'click_contact_email') return 'email';
  if (action === 'click_social_media' && labelOf(row) === 'linkedin') return 'linkedin';
  return null;
}

/** Pages and sections that count as looking at the work. */
const WORK_PLACES = new Set(['projects', 'work-experience', 'internships']);
/** Sections whose view alone does not count as going deeper. */
const SHALLOW_SECTIONS = new Set(['hero', 'navigation']);

/** The source group of a referrer host (contract 2). */
export const SOURCE_GROUPS = Object.freeze(['LinkedIn', 'Google', 'GitHub', 'Direct or unknown', 'Other sites']);
export function sourceGroup(host) {
  const h = String(host ?? '').trim().toLowerCase();
  if (!h || h === 'direct') return 'Direct or unknown';
  if (h.includes('linkedin.') || h === 'lnkd.in' || h === 'com.linkedin.android') return 'LinkedIn';
  if (h.includes('google.')) return 'Google';
  if (h === 'github.com') return 'GitHub';
  return 'Other sites';
}

/** The three device classes, in screen order, with the copy the Health tab shows. */
export const DEVICES = Object.freeze([
  { id: 'desktop', name: 'Laptop or desktop', note: '1280 px and wider' },
  { id: 'phone', name: 'Phone', note: 'Under 768 px' },
  { id: 'tablet', name: 'Tablet', note: '768 to 1279 px' },
]);

/** The home page's tracked sections in page order; navigation is shown as "Explore". */
export const HOME_SECTIONS = Object.freeze([
  { id: 'hero', name: 'Hero' },
  { id: 'about', name: 'About' },
  { id: 'navigation', name: 'Explore' },
  { id: 'contact', name: 'Contact' },
]);
const HOME_PAGE = 'home';

/* ---------- visits ---------- */

const timeOf = (row) => { const t = Date.parse(row.created_at); return Number.isFinite(t) ? t : null; };

/**
 * Reduces rows to one record per visit (session_id).
 * @returns {Map<string, {first: number, info: object|null, infoAt: number, reached: boolean, work: boolean, deeper: boolean, engaged: boolean, pages: Set<string>, sections: Set<string>, opened: Set<string>}>}
 */
export function visitsOf(rows) {
  const visits = new Map();
  for (const row of rows) {
    if (!isCounted(row) || !row.session_id) continue;
    const at = timeOf(row);
    if (at === null) continue;
    let v = visits.get(row.session_id);
    if (!v) { v = { first: at, info: null, infoAt: Infinity, reached: false, work: false, deeper: false, engaged: false, pages: new Set(), sections: new Set(), opened: new Set() }; visits.set(row.session_id, v); }
    if (at < v.first) v.first = at;
    // source and device come from the earliest event that carries them (the earliest event, once tracking A ships)
    const info = visitorOf(row);
    if (info && at < v.infoAt) { v.info = info; v.infoAt = at; }

    if (channelOf(row)) v.reached = true;
    const action = row.event_action;
    if (action === 'engaged') v.engaged = true;
    if (action === 'project_open') { v.work = true; if (row.event_label) v.opened.add(String(row.event_label)); }
    if (action === 'project_link') v.work = true;
    if (action === 'click_social_media' && labelOf(row) === 'github') v.work = true;
    if (row.event_type === 'page_view') {
      const page = foldPage(row.event_label);
      if (page) { v.pages.add(page); if (WORK_PLACES.has(page)) v.work = true; }
    }
    if (row.event_type === 'section_view') {
      const section = sectionOf(row);
      if (section) {
        v.sections.add(section);
        if (WORK_PLACES.has(section)) v.work = true;
        if (!SHALLOW_SECTIONS.has(section)) v.deeper = true;
      }
    }
  }
  // the funnel nests: reached implies work, work implies deeper
  for (const v of visits.values()) {
    if (v.reached) v.work = true;
    if (v.work || v.pages.size >= 2) v.deeper = true;
  }
  return visits;
}

/**
 * Every number one window needs.
 *
 * @param {object[]} rows events inside the window.
 * @param {object} options
 * @param {{y,m,d}} options.start the window's first New York day (for the series).
 * @param {number} options.days the series length in days.
 * @param {Array<{id: string, title: string, featured?: boolean, live_url?: string}>} [options.projects] active projects.
 * @param {number|null} [options.quickFrom] ms of the first `engaged` row ever stored; quick leaves are counted only
 *   over visits that began on or after it, and not at all when it is null.
 */
export function summarizeWindow(rows, { start, days, projects = [], quickFrom = null }) {
  const visits = visitsOf(rows);
  const all = [...visits.values()];
  const count = (pick) => all.filter(pick).length;

  // sources: visits and visits that reached out, per group
  const sources = SOURCE_GROUPS.map((name) => ({ name, visits: 0, reached: 0 }));
  const sourceBy = Object.fromEntries(sources.map((s) => [s.name, s]));
  // devices: share of all visits, quick leaves among the measured ones
  const devices = DEVICES.map((d) => ({ ...d, visits: 0, measured: 0, quickLeaves: 0 }));
  const deviceBy = Object.fromEntries(devices.map((d) => [d.id, d]));
  const series = new Array(Math.max(0, days)).fill(0);
  let measured = 0, quickLeaves = 0;

  for (const v of all) {
    const source = sourceBy[sourceGroup(v.info?.referrer)];
    source.visits += 1;
    if (v.reached) source.reached += 1;
    const device = deviceBy[v.info?.deviceClass];
    if (device) device.visits += 1;
    if (quickFrom !== null && v.first >= quickFrom) {
      const quick = !v.deeper && !v.engaged;
      measured += 1; if (quick) quickLeaves += 1;
      if (device) { device.measured += 1; if (quick) device.quickLeaves += 1; }
    }
    const i = dayIndex(v.first, start);
    if (i >= 0 && i < series.length) series[i] += 1;
  }

  // channels and project links count events, not visits
  const channels = CHANNELS.map((c) => ({ ...c, count: 0 }));
  const channelBy = Object.fromEntries(channels.map((c) => [c.id, c]));
  const links = new Map();   // project id -> { repo, demo }
  for (const row of rows) {
    if (!isCounted(row)) continue;
    const channel = channelOf(row);
    if (channel) channelBy[channel].count += 1;
    if (row.event_action === 'project_link' && row.event_label) {
      const id = String(row.event_label);
      const entry = links.get(id) || { repo: 0, demo: 0 };
      const kind = kindOf(row);
      if (kind === 'repo') entry.repo += 1; else if (kind === 'demo') entry.demo += 1;
      links.set(id, entry);
    }
  }

  const opens = new Map();
  for (const v of all) for (const id of v.opened) opens.set(id, (opens.get(id) || 0) + 1);
  const projectRows = projects.map((p) => {
    const l = links.get(String(p.id)) || { repo: 0, demo: 0 };
    return { id: String(p.id), title: p.title || 'Untitled project', starred: Boolean(p.featured), hasDemo: Boolean(p.live_url), opens: opens.get(String(p.id)) || 0, repo: l.repo, demo: l.demo };
  });

  // home page reach: of visits that viewed the home page, the share that viewed each section
  const home = all.filter((v) => v.pages.has(HOME_PAGE));
  const sections = HOME_SECTIONS.map((s) => {
    const reached = home.filter((v) => v.sections.has(s.id)).length;
    return { ...s, count: reached, share: home.length ? reached / home.length : 0 };
  });

  return {
    visits: all.length,
    deeper: count((v) => v.deeper),
    work: count((v) => v.work),
    reached: count((v) => v.reached),
    sources,
    channels,
    projects: projectRows,
    home: { visits: home.length, sections },
    devices: devices.map((d) => ({
      ...d,
      share: all.length ? d.visits / all.length : 0,
      quick: d.measured ? d.quickLeaves / d.measured : null,
    })),
    measured,
    quick: measured ? quickLeaves / measured : null,
    series,
  };
}

/** Sums a daily series into weeks (the last week may be short). */
export function bucketSeries(series, size) {
  if (size <= 1) return [...series];
  const out = [];
  for (let i = 0; i < series.length; i += size) out.push(series.slice(i, i + size).reduce((a, b) => a + b, 0));
  return out;
}

/* ---------- comparison ---------- */

/** Where last quarter's total sits on a card in quarter mode. */
export const MARK = 0.75;
/** The lowest a nonzero level is drawn, so a small count still shows water. */
export const MIN_LEVEL = 0.04;

/**
 * A card's water level (contract 2). Quarter mode: progress toward last
 * quarter's count, which sits at MARK; rolling ranges: the value against the
 * best in its group. Nonzero levels show at least MIN_LEVEL.
 */
export function levelFor({ quarter, cur, prev = 0, max = 0 }) {
  let level;
  if (quarter) level = prev ? Math.min(1, (MARK * cur) / prev) : (cur ? 1 : 0);
  else level = max ? cur / max : 0;
  return shownLevel(level);
}
export const shownLevel = (level) => (level > 0 ? Math.max(MIN_LEVEL, Math.min(1, level)) : 0);

/** Pace: where a count is heading by the quarter's end. */
export const paceOf = (count, quarter) => Math.round((count * quarter.length) / Math.max(1, quarter.day));

export const STEP_NAMES = Object.freeze(['Visits', 'Went deeper', 'Looked at your work', 'Reached out']);
export const stepsOf = (w) => [w.visits, w.deeper, w.work, w.reached];
/** The share of the step before (the first step is everyone). */
export const rateOf = (steps, i) => (i === 0 ? 1 : steps[i - 1] ? steps[i] / steps[i - 1] : 0);

/**
 * The step whose rate fell most against the comparison, when it fell by more
 * than two points. Step 0 (visits) has no rate. Needs comparison visits.
 * @returns {{step: number, drop: number}} step -1 when nothing fell.
 */
export function biggestFall(now, before) {
  if (!before.visits) return { step: -1, drop: 0 };
  const a = stepsOf(now), b = stepsOf(before);
  let step = -1, drop = 0.02;
  for (let i = 1; i < 4; i += 1) { const d = rateOf(b, i) - rateOf(a, i); if (d > drop) { drop = d; step = i; } }
  return { step, drop: step < 0 ? 0 : drop };
}

/** What to do about a step that lost ground (approved copy). */
export const STEP_ACTIONS = Object.freeze({
  1: 'Fewer people got past the first screen. Read the top of the home page on a phone: it should say who you are and what you are looking for in one line.',
  2: 'People went deeper, but fewer opened your work. Move your two strongest projects up, and make each card\'s first line say what the project does.',
  3: 'People looked at your work, but fewer reached out. Make the next step obvious: a contact link beside the projects and a resume one click away.',
});

/**
 * Funnel cards: number, level, the comparison lines' numbers and the tag.
 * @returns {Array<{name: string, value: number, before: number, rate: number, pace: number|null, level: number, tag: null|'fall'|'beat'|'pace'}>}
 */
export function funnelCards(now, before, quarter) {
  const a = stepsOf(now), b = stepsOf(before);
  const fall = biggestFall(now, before);
  return a.map((value, i) => {
    let tag = null;
    const pace = quarter ? paceOf(value, quarter) : null;
    if (quarter && value > 0) {
      if (value >= b[i]) tag = 'beat';
      else if (pace >= b[i]) tag = 'pace';
    }
    if (i === fall.step) tag = 'fall';
    return { name: STEP_NAMES[i], value, before: b[i], rate: rateOf(a, i), pace, level: quarter ? levelFor({ quarter: true, cur: value, prev: b[i] }) : shownLevel(a[0] ? value / a[0] : 0), tag };
  });
}

/** Sources ranked for the screen: by reach-outs, then visits (contract 2). */
export const rankSources = (sources) => [...sources].sort((x, y) => y.reached - x.reached || y.visits - x.visits);

/** The source that turns visits into reach-outs best, or null when nobody reached out. Ties go to the bigger source. */
export function bestRateSource(sources) {
  const candidates = sources.filter((s) => s.reached > 0);
  if (!candidates.length) return null;
  return [...candidates].sort((x, y) => y.reached / y.visits - x.reached / x.visits || y.visits - x.visits)[0];
}

/** The source that sends the most visits, or null when there were none. */
export function mostVisitsSource(sources) {
  const withVisits = sources.filter((s) => s.visits > 0);
  return withVisits.length ? [...withVisits].sort((x, y) => y.visits - x.visits || y.reached - x.reached)[0] : null;
}

/** Projects split for the Your work tab: opened ones by opens (then title), and the ones nobody opened. */
export function projectLists(projects) {
  const byOpens = [...projects].sort((x, y) => y.opens - x.opens || x.title.localeCompare(y.title));
  return { opened: byOpens.filter((p) => p.opens > 0), quiet: byOpens.filter((p) => p.opens === 0).sort((x, y) => x.title.localeCompare(y.title)) };
}

/** The starred project opened least (the nudge in the projects lesson), or null without starred projects. */
export function starredLeast(projects) {
  const starred = projects.filter((p) => p.starred);
  return starred.length ? [...starred].sort((x, y) => x.opens - y.opens || x.title.localeCompare(y.title))[0] : null;
}

/** Phones count as leaving notably more often when their quick-leave share is over 1.5 times the laptops'. */
export const PHONE_WARN_RATIO = 1.5;
/** Fewer measured visits than this on either device and the comparison is not made (it would be noise). */
export const DEVICE_MIN_VISITS = 5;
export function phonesLeaveMore(devices) {
  const laptop = devices.find((d) => d.id === 'desktop'), phone = devices.find((d) => d.id === 'phone');
  if (!laptop || !phone || phone.quick === null || laptop.quick === null) return false;
  if (laptop.measured < DEVICE_MIN_VISITS || phone.measured < DEVICE_MIN_VISITS) return false;
  return phone.quick > laptop.quick * PHONE_WARN_RATIO;
}

/* ---------- "What changed" ---------- */

const n = (v) => Math.round(v).toLocaleString('en-US');
const pct = (v) => `${Math.round(v * 100)}%`;
const capital = (s) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * Up to five plain sentences on what moved, each chosen by a fixed rule from
 * the numbers (no language model). A sentence is a list of parts: strings,
 * and `{ b: text }` for the figure the eye should land on.
 *
 * @param {object} c
 * @param {object} c.now summarizeWindow of the current window
 * @param {object} c.before summarizeWindow of the comparison window
 * @param {object} c.windows windowsFor(...)
 * @returns {Array<{dir: 'up'|'down'|'info', parts: Array<string|{b: string}>, note?: string}>}
 */
export function whatChanged({ now, before, windows }) {
  const out = [];
  const q = windows.quarter;
  const versus = windows.versus;

  // 1. the headline: pace in quarter mode, change in visits otherwise
  if (q) {
    const p = paceOf(now.visits, q);
    out.push({ dir: p >= before.visits ? 'up' : 'down', parts: ['At this pace the quarter ends near ', { b: `${n(p)} visits` }, `, against ${n(before.visits)} last quarter.`], note: `Day ${q.day} of ${q.length}. ${n(now.visits)} visits so far.` });
  } else if (!before.visits) {
    out.push({ dir: 'info', parts: ['Visits in the ', windows.label, ': ', { b: n(now.visits) }, `. None were recorded in ${versus}, so there is nothing to compare with.`] });
  } else {
    const ch = (now.visits - before.visits) / before.visits;
    const verb = Math.abs(ch) < 0.03 ? 'held steady' : ch > 0 ? `rose ${pct(ch)}` : `fell ${pct(-ch)}`;
    out.push({ dir: ch >= 0 ? 'up' : 'down', parts: [`Visits ${verb} against ${versus}: `, { b: n(now.visits) }, `, ${ch >= 0 ? 'up' : 'down'} from ${n(before.visits)}.`], note: 'A change under 10% on a few hundred visits is usually noise.' });
  }

  // 2. the source whose visitors write most often
  const best = bestRateSource(now.sources);
  if (best && now.visits) {
    const visitShare = best.visits / now.visits, reachShare = best.reached / (now.reached || 1);
    out.push({ dir: 'up', parts: [{ b: best.name }, ` brought ${pct(visitShare)} of visits ${reachShare > visitShare ? 'but' : 'and'} ${pct(reachShare)} of reach-outs.`], note: 'Visitors from there write to you most often, so that is where your effort pays most.' });
  } else if (now.visits) {
    out.push({ dir: 'info', parts: ['Nobody reached out in the ', windows.label, ' yet.'], note: 'A reach-out is a LinkedIn, email or resume click, or a sent contact form.' });
  }

  // 3. the step of the path that lost most (only with something to compare with)
  if (before.visits) {
    const fall = biggestFall(now, before);
    if (fall.step > 0) out.push({ dir: 'down', parts: ['The step to ', { b: STEP_NAMES[fall.step].toLowerCase() }, ` lost ${Math.round(fall.drop * 100)} points against ${versus}.`], note: STEP_ACTIONS[fall.step] });
    else out.push({ dir: 'up', parts: ['Every step of the path held or improved its rate.'], note: 'Nothing to fix in the path this time.' });
  }

  // 4. the project opened most
  const top = projectLists(now.projects).opened[0];
  if (top) out.push({ dir: 'info', parts: [{ b: top.title }, ` was opened most, ${n(top.opens)} ${top.opens === 1 ? 'time' : 'times'}, and its GitHub link was followed ${n(top.repo)} ${top.repo === 1 ? 'time' : 'times'}.`] });

  // 5. phones leaving from the first screen
  if (phonesLeaveMore(now.devices)) {
    const laptop = now.devices.find((d) => d.id === 'desktop'), phone = now.devices.find((d) => d.id === 'phone');
    out.push({ dir: 'down', parts: ['On phones ', { b: pct(phone.quick) }, ` left from the first screen, against ${pct(laptop.quick)} on laptops.`], note: 'See Health for what to check.' });
  }
  return out.slice(0, 5);
}

/** "Q4 2026 so far against Q3 2026" or "Last 90 days against the 90 days before". */
export function comparisonLabel(windows) {
  return windows.quarter ? `${windows.quarter.short} so far against ${windows.lastQuarter.short}` : `${capital(windows.label)} against ${windows.versus}`;
}

/** The date a kind of tracking started, for "Measured from" and "Recorded from" notes. */
export const startedOn = (ms) => (ms === null || ms === undefined ? null : shortDate(nyDate(ms)));

/* ---------- stale sections ---------- */

/** Ninety days without an edit is the flag. */
export const STALE_DAYS = 90;

/**
 * Splits content sections by the age of their newest edit.
 * @param {Array<{section: string, at: string}>} freshness newest updated_at per section.
 * @returns {{stale: Array<{section: string, days: number}>, fresh: number}}
 */
export function staleSections(freshness, now) {
  const rows = (freshness || []).map((f) => ({ section: f.section, days: Math.floor((now - Date.parse(f.at)) / 86400000) })).filter((f) => Number.isFinite(f.days));
  return { stale: rows.filter((f) => f.days > STALE_DAYS).sort((x, y) => y.days - x.days), fresh: rows.filter((f) => f.days <= STALE_DAYS).length };
}
