import {
  CHANNELS, DEVICES, MIN_LEVEL, bestRateSource, biggestFall, bucketSeries, channelOf, comparisonLabel, foldPage, funnelCards, isCounted, levelFor,
  mostVisitsSource, paceOf, phonesLeaveMore, projectLists, rankSources, sectionOf, sourceGroup, staleSections, starredLeast, startedOn,
  summarizeWindow, visitsOf, whatChanged,
} from './insightsModel';
import { windowsFor } from './insightsTime';

// ---- hand-made rows, shaped like the service's narrow select ----
let seq = 0;
const ev = (session, at, type, action, label, extra = {}) => ({ id: `e${seq++}`, session_id: session, created_at: at, event_type: type, event_action: action, event_label: label, user_type: 'visitor', ...extra });
const view = (s, at, page, info) => ev(s, at, 'page_view', 'view_page', page, info ? { visitor: info } : {});
const section = (s, at, name) => ev(s, at, 'section_view', `view_${name}`, 'main', { section: name });
const click = (s, at, action, label, extra) => ev(s, at, 'click', action, label, extra);
const info = (referrer, deviceClass = 'desktop') => ({ referrer, deviceClass, isReturningVisitor: false });
const T = (day, time = '15:00:00') => `2026-11-${String(day).padStart(2, '0')}T${time}Z`;
const START = { y: 2026, m: 11, d: 10 };

describe('reading events', () => {
  it('folds page labels the old tracker suffixed', () => {
    expect(foldPage('home-no-storage')).toBe('home');
    expect(foldPage('/Projects-dedup')).toBe('projects');
    expect(foldPage('home-enabled-dedup')).toBe('home');
    expect(foldPage(' work-experience-disabled ')).toBe('work-experience');
    expect(foldPage('')).toBeNull();
    expect(foldPage(null)).toBeNull();
  });

  it('reads the section from metadata or from the action', () => {
    expect(sectionOf({ section: 'About' })).toBe('about');
    expect(sectionOf({ metadata: { section_type: 'contact' } })).toBe('contact');
    expect(sectionOf({ event_action: 'view_navigation' })).toBe('navigation');
    expect(sectionOf({ event_action: 'click_x' })).toBeNull();
  });

  it('ignores admin activity and section_visit rows', () => {
    expect(isCounted({ user_type: 'admin', event_type: 'page_view' })).toBe(false);
    expect(isCounted({ user_type: 'visitor', event_type: 'section_visit' })).toBe(false);
    expect(isCounted({ user_type: 'visitor', event_type: 'click' })).toBe(true);
  });

  it('maps new and legacy reach-outs to the four channels', () => {
    expect(channelOf({ event_action: 'reach_out', event_label: 'resume' })).toBe('resume');
    expect(channelOf({ event_action: 'reach_out', event_label: 'LinkedIn' })).toBe('linkedin');
    expect(channelOf({ event_action: 'reach_out', event_label: 'fax' })).toBeNull();
    expect(channelOf({ event_type: 'form_submission', event_action: 'submit_contact_form' })).toBe('contact_form');
    expect(channelOf({ event_action: 'click_contact_email', event_label: 'footer_email' })).toBe('email');
    expect(channelOf({ event_action: 'click_social_media', event_label: 'linkedin' })).toBe('linkedin');
    expect(channelOf({ event_action: 'click_social_media', event_label: 'github' })).toBeNull();
    expect(channelOf({ event_action: 'click_navigation', event_label: 'projects' })).toBeNull();
  });

  it('groups referrer hosts into the five sources', () => {
    expect(sourceGroup('www.linkedin.com')).toBe('LinkedIn');
    expect(sourceGroup('lnkd.in')).toBe('LinkedIn');
    expect(sourceGroup('com.linkedin.android')).toBe('LinkedIn');
    expect(sourceGroup('www.google.co.in')).toBe('Google');
    expect(sourceGroup('github.com')).toBe('GitHub');
    expect(sourceGroup('direct')).toBe('Direct or unknown');
    expect(sourceGroup('')).toBe('Direct or unknown');
    expect(sourceGroup(undefined)).toBe('Direct or unknown');
    expect(sourceGroup('news.ycombinator.com')).toBe('Other sites');
  });
});

describe('visitsOf: the per-visit flags nest', () => {
  it('counts a reach-out as having looked at the work and gone deeper', () => {
    const v = visitsOf([view('a', T(10), 'home', info('direct')), click('a', T(10, '15:01:00'), 'reach_out', 'email')]).get('a');
    expect(v).toMatchObject({ reached: true, work: true, deeper: true });
  });

  it('marks work from project events, the legacy GitHub click and work pages or sections', () => {
    const rows = [
      view('p', T(10), 'home'), click('p', T(10), 'project_open', 'proj-1'),
      view('l', T(10), 'home'), click('l', T(10), 'project_link', 'proj-1', { kind: 'repo' }),
      view('g', T(10), 'home'), click('g', T(10), 'click_social_media', 'github'),
      view('w', T(10), 'work-experience-no-storage'),
      view('s', T(10), 'home'), section('s', T(10), 'internships'),
    ];
    const visits = visitsOf(rows);
    for (const id of ['p', 'l', 'g', 'w', 's']) expect(visits.get(id)).toMatchObject({ work: true, deeper: true, reached: false });
  });

  it('marks deeper for two distinct pages or a section past the first screen, but not for hero or navigation alone', () => {
    const visits = visitsOf([
      view('two', T(10), 'home'), view('two', T(10), 'skills'),
      view('same', T(10), 'home'), view('same', T(10), 'home-no-storage'),
      view('nav', T(10), 'home'), section('nav', T(10), 'hero'), section('nav', T(10), 'navigation'),
      view('about', T(10), 'home'), section('about', T(10), 'about'),
    ]);
    expect(visits.get('two').deeper).toBe(true);
    expect(visits.get('same').deeper).toBe(false);   // the suffix folds into the same page
    expect(visits.get('nav').deeper).toBe(false);
    expect(visits.get('about')).toMatchObject({ deeper: true, work: false });
  });

  it('takes source and device from the earliest event that carries them, and skips rows without a session', () => {
    const visits = visitsOf([
      section('x', T(10, '15:00:01'), 'hero'),
      view('x', T(10, '15:00:05'), 'skills', info('github.com', 'tablet')),
      view('x', T(10, '15:00:03'), 'home', info('www.linkedin.com', 'phone')),
      ev(null, T(10), 'page_view', 'view_page', 'home'),
    ]);
    expect(visits.size).toBe(1);
    expect(visits.get('x').info).toMatchObject({ referrer: 'www.linkedin.com', deviceClass: 'phone' });
    expect(visits.get('x').first).toBe(Date.parse(T(10, '15:00:01')));
  });
});

describe('summarizeWindow', () => {
  const projects = [
    { id: 'proj-1', title: 'Tallyproof', featured: true, live_url: 'https://example.com' },
    { id: 'proj-2', title: 'Knaq', featured: true, live_url: null },
    { id: 'proj-3', title: 'CareVault', featured: false },
  ];
  const rows = [
    // a LinkedIn phone visit that opens two projects, follows GitHub twice and reaches out twice
    view('a', T(10), 'home', info('www.linkedin.com', 'phone')), section('a', T(10), 'hero'), section('a', T(10), 'about'),
    click('a', T(10), 'project_open', 'proj-1'), click('a', T(10), 'project_open', 'proj-2'),
    click('a', T(10), 'project_link', 'proj-1', { kind: 'repo' }), click('a', T(10), 'project_link', 'proj-1', { kind: 'repo' }),
    click('a', T(10), 'project_link', 'proj-1', { kind: 'demo' }),
    click('a', T(10), 'reach_out', 'linkedin'), click('a', T(10), 'reach_out', 'resume'),
    // a direct desktop visit that leaves at once
    view('b', T(11), 'home', info('direct', 'desktop')), section('b', T(11), 'hero'),
    // a Google desktop visit that stays (engaged) but never goes deeper
    view('c', T(11), 'home', info('www.google.com', 'desktop')), click('c', T(11), 'engaged', 'home'),
    // a legacy visit before engagement tracking started: an old form submission
    view('d', T(10, '01:00:00'), 'projects', info('news.example.org', 'tablet')), ev('d', T(10, '01:05:00'), 'form_submission', 'submit_contact_form', 'general'),
    click('a2', T(12), 'project_open', 'proj-1'), view('a2', T(12), 'projects', info('github.com', 'desktop')),
    // noise that must not count
    ev('z', T(12), 'page_view', 'view_page', 'home', { user_type: 'admin' }),
    ev('z2', T(12), 'section_visit', 'visit', 'projects'),
  ];
  const quickFrom = Date.parse(T(10, '12:00:00'));
  const w = summarizeWindow(rows, { start: START, days: 4, projects, quickFrom });

  it('counts the funnel as nested visit flags', () => {
    expect(w).toMatchObject({ visits: 5, deeper: 3, work: 3, reached: 2 });
  });

  it('puts each visit in one source, ranked later by reach-outs then visits', () => {
    const by = Object.fromEntries(w.sources.map((s) => [s.name, s]));
    expect(by.LinkedIn).toEqual({ name: 'LinkedIn', visits: 1, reached: 1 });
    expect(by['Other sites']).toEqual({ name: 'Other sites', visits: 1, reached: 1 });
    expect(by['Direct or unknown'].visits).toBe(1);
    expect(rankSources(w.sources).map((s) => s.name)).toEqual(['LinkedIn', 'Other sites', 'Google', 'GitHub', 'Direct or unknown']);
  });

  it('counts channels per event, legacy rows included', () => {
    expect(Object.fromEntries(w.channels.map((c) => [c.id, c.count]))).toEqual({ linkedin: 1, email: 0, contact_form: 1, resume: 1 });
    expect(w.channels.map((c) => c.name)).toEqual(CHANNELS.map((c) => c.name));
  });

  it('counts project opens as visits and links as events by kind, for active projects only', () => {
    const by = Object.fromEntries(w.projects.map((p) => [p.id, p]));
    expect(by['proj-1']).toMatchObject({ opens: 2, repo: 2, demo: 1, starred: true, hasDemo: true });
    expect(by['proj-2']).toMatchObject({ opens: 1, repo: 0, hasDemo: false });
    expect(by['proj-3'].opens).toBe(0);
    const lists = projectLists(w.projects);
    expect(lists.opened.map((p) => p.title)).toEqual(['Tallyproof', 'Knaq']);
    expect(lists.quiet.map((p) => p.title)).toEqual(['CareVault']);
    expect(starredLeast(w.projects).title).toBe('Knaq');
  });

  it('measures quick leaves only from the first engaged row on, per device', () => {
    // visit d began before quickFrom and is left out; a2 is on GitHub desktop and opened a project
    expect(w.measured).toBe(4);
    const by = Object.fromEntries(w.devices.map((d) => [d.id, d]));
    expect(by.desktop).toMatchObject({ visits: 3, measured: 3, quickLeaves: 1 });
    expect(by.desktop.quick).toBeCloseTo(1 / 3);
    expect(by.phone).toMatchObject({ visits: 1, quick: 0 });
    expect(by.tablet).toMatchObject({ visits: 1, measured: 0, quick: null });
    expect(by.tablet.share).toBeCloseTo(0.2);
    expect(w.devices.map((d) => d.name)).toEqual(DEVICES.map((d) => d.name));
  });

  it('says nothing about quick leaves before engagement tracking exists', () => {
    const none = summarizeWindow(rows, { start: START, days: 4, projects, quickFrom: null });
    expect(none.quick).toBeNull();
    expect(none.devices.every((d) => d.quick === null)).toBe(true);
  });

  it('measures home page reach over visits that saw the home page', () => {
    expect(w.home.visits).toBe(3);
    const by = Object.fromEntries(w.home.sections.map((s) => [s.id, s]));
    expect(by.hero).toMatchObject({ name: 'Hero', count: 2 });
    expect(by.hero.share).toBeCloseTo(2 / 3);
    expect(by.about.count).toBe(1);
    expect(by.navigation.name).toBe('Explore');
    expect(by.contact.share).toBe(0);
  });

  it('puts each visit on the New York day it started', () => {
    // d started at 01:00 UTC on 10 Nov, which is 9 Nov in New York, before the window's first day
    expect(w.series).toEqual([1, 2, 1, 0]);
    expect(bucketSeries([1, 2, 3, 4, 5, 6, 7, 8, 9], 7)).toEqual([28, 17]);
    expect(bucketSeries([1, 2], 1)).toEqual([1, 2]);
  });
});

describe('levels and pace', () => {
  it('fills toward the dashed mark in quarter mode and against the best in rolling ranges', () => {
    expect(levelFor({ quarter: true, cur: 50, prev: 100 })).toBeCloseTo(0.375);
    expect(levelFor({ quarter: true, cur: 200, prev: 100 })).toBe(1);
    expect(levelFor({ quarter: true, cur: 3, prev: 0 })).toBe(1);
    expect(levelFor({ quarter: true, cur: 0, prev: 0 })).toBe(0);
    expect(levelFor({ quarter: false, cur: 5, max: 10 })).toBe(0.5);
    expect(levelFor({ quarter: false, cur: 1, max: 1000 })).toBe(MIN_LEVEL);
    expect(levelFor({ quarter: false, cur: 0, max: 0 })).toBe(0);
  });

  it('projects pace to the quarter end', () => {
    expect(paceOf(490, { day: 49, length: 92 })).toBe(920);
    expect(paceOf(0, { day: 1, length: 92 })).toBe(0);
  });
});

describe('funnel comparison', () => {
  const w = (visits, deeper, work, reached) => ({ visits, deeper, work, reached });

  it('finds the step whose rate fell most, by more than two points', () => {
    expect(biggestFall(w(100, 50, 25, 5), w(100, 50, 25, 10))).toEqual({ step: 3, drop: expect.closeTo(0.2) });
    expect(biggestFall(w(100, 50, 25, 10), w(100, 51, 25, 10)).step).toBe(-1);
    expect(biggestFall(w(100, 50, 25, 10), w(0, 0, 0, 0)).step).toBe(-1);
  });

  it('tags funnel cards in quarter mode: beat, on pace, or the biggest fall', () => {
    const q = { day: 46, length: 92 };
    const cards = funnelCards(w(60, 30, 10, 2), w(100, 25, 20, 5), q);
    expect(cards.map((c) => c.tag)).toEqual(['pace', 'beat', 'fall', null]);
    expect(cards[0]).toMatchObject({ name: 'Visits', value: 60, before: 100, pace: 120 });
    expect(cards[0].level).toBeCloseTo(0.45);
    expect(cards[2].rate).toBeCloseTo(1 / 3);
  });

  it('fills rolling funnel cards as the share of all visits, visits always full', () => {
    const cards = funnelCards(w(200, 100, 50, 0), w(180, 90, 45, 5), null);
    expect(cards.map((c) => c.level)).toEqual([1, 0.5, 0.25, 0]);
    expect(cards.every((c) => c.pace === null)).toBe(true);
    expect(cards[3].tag).toBe('fall');
  });
});

describe('sources and devices', () => {
  const sources = [
    { name: 'LinkedIn', visits: 100, reached: 8 }, { name: 'Direct or unknown', visits: 300, reached: 9 },
    { name: 'Google', visits: 40, reached: 0 }, { name: 'GitHub', visits: 10, reached: 1 }, { name: 'Other sites', visits: 0, reached: 0 },
  ];

  it('picks the best rate and the biggest sender', () => {
    expect(bestRateSource(sources).name).toBe('GitHub');   // 1 in 10
    expect(mostVisitsSource(sources).name).toBe('Direct or unknown');
    expect(bestRateSource(sources.map((s) => ({ ...s, reached: 0 })))).toBeNull();
    expect(mostVisitsSource([])).toBeNull();
  });

  it('flags phones only with enough measured visits on both devices', () => {
    const d = (id, quick, measured) => ({ id, quick, measured });
    expect(phonesLeaveMore([d('desktop', 0.2, 20), d('phone', 0.4, 20)])).toBe(true);
    expect(phonesLeaveMore([d('desktop', 0.2, 20), d('phone', 0.29, 20)])).toBe(false);
    expect(phonesLeaveMore([d('desktop', 0.2, 4), d('phone', 0.9, 20)])).toBe(false);
    expect(phonesLeaveMore([d('desktop', null, 0), d('phone', 0.9, 20)])).toBe(false);
  });
});

describe('whatChanged', () => {
  const now = Date.parse('2026-11-18T21:00:00Z');
  const base = (over = {}) => ({
    visits: 100, deeper: 50, work: 25, reached: 5,
    sources: [{ name: 'LinkedIn', visits: 40, reached: 4 }, { name: 'Direct or unknown', visits: 60, reached: 1 }],
    projects: [{ id: '1', title: 'Tallyproof', opens: 12, repo: 4, demo: 0 }, { id: '2', title: 'Knaq', opens: 3, repo: 1, demo: 0 }],
    devices: [{ id: 'desktop', quick: 0.2, measured: 40 }, { id: 'phone', quick: 0.45, measured: 40 }, { id: 'tablet', quick: null, measured: 0 }],
    ...over,
  });
  const text = (item) => item.parts.map((p) => (typeof p === 'string' ? p : p.b)).join('');

  it('writes the rolling sentences in the approved order, figures in bold', () => {
    const items = whatChanged({ now: base(), before: base({ visits: 80, reached: 8, work: 20, deeper: 40 }), windows: windowsFor('90d', now) });
    expect(items.map(text)).toEqual([
      'Visits rose 25% against the 90 days before: 100, up from 80.',
      'LinkedIn brought 40% of visits but 80% of reach-outs.',
      'The step to reached out lost 20 points against the 90 days before.',
      'Tallyproof was opened most, 12 times, and its GitHub link was followed 4 times.',
      'On phones 45% left from the first screen, against 20% on laptops.',
    ]);
    expect(items.map((i) => i.dir)).toEqual(['up', 'up', 'down', 'info', 'down']);
    expect(items[0].parts[1]).toEqual({ b: '100' });
    expect(items[2].note).toMatch(/^People looked at your work, but fewer reached out/);
  });

  it('says held steady for small changes and that every step held when none fell', () => {
    const items = whatChanged({ now: base(), before: base({ visits: 98, deeper: 49 }), windows: windowsFor('30d', now) });
    expect(text(items[0])).toBe('Visits held steady against the 30 days before: 100, up from 98.');
    expect(text(items[2])).toBe('Every step of the path held or improved its rate.');
  });

  it('speaks of pace in quarter mode', () => {
    const items = whatChanged({ now: base({ visits: 490 }), before: base({ visits: 1000 }), windows: windowsFor('quarter', now) });
    expect(text(items[0])).toBe('At this pace the quarter ends near 920 visits, against 1,000 last quarter.');
    expect(items[0]).toMatchObject({ dir: 'down', note: 'Day 49 of 92. 490 visits so far.' });
  });

  it('stays honest without a comparison, without reach-outs and without project rows', () => {
    const items = whatChanged({
      now: base({ reached: 0, sources: [{ name: 'Google', visits: 100, reached: 0 }], projects: [], devices: [] }),
      before: base({ visits: 0, deeper: 0, work: 0, reached: 0 }),
      windows: windowsFor('7d', now),
    });
    expect(items.map(text)).toEqual([
      'Visits in the last 7 days: 100. None were recorded in the 7 days before, so there is nothing to compare with.',
      'Nobody reached out in the last 7 days yet.',
    ]);
  });

  it('labels the comparison', () => {
    expect(comparisonLabel(windowsFor('quarter', now))).toBe('Q4 2026 so far against Q3 2026');
    expect(comparisonLabel(windowsFor('12m', now))).toBe('Last 12 months against the 12 months before');
  });
});

describe('dates and stale sections', () => {
  it('formats the day a kind of tracking started, in New York', () => {
    expect(startedOn(Date.parse('2026-11-20T03:00:00Z'))).toBe('19 Nov 2026');
    expect(startedOn(null)).toBeNull();
  });

  it('flags sections whose newest edit is over 90 days old, oldest first', () => {
    const now = Date.parse('2026-11-18T12:00:00Z');
    const day = (n) => new Date(now - n * 86400000).toISOString();
    const out = staleSections([{ section: 'Hero', at: day(3) }, { section: 'Leadership', at: day(118) }, { section: 'Certifications', at: day(142) }, { section: 'Skills', at: day(90) }, { section: 'Bad', at: 'nope' }], now);
    expect(out).toEqual({ stale: [{ section: 'Certifications', days: 142 }, { section: 'Leadership', days: 118 }], fresh: 2 });
    expect(staleSections(null, now)).toEqual({ stale: [], fresh: 0 });
  });
});
