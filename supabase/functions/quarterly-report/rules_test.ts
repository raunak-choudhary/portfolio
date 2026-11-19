import { assert, assertAlmostEquals, assertEquals } from 'jsr:@std/assert@1';
import {
  buildVisits,
  deviceOf,
  type EventRow,
  foldPage,
  pace,
  type ProjectRef,
  reachChannel,
  referrerHost,
  sectionOf,
  sourceOf,
  staleSections,
  summarizeWindow,
} from './rules.ts';
import fixtureJson from './fixtures/events.json' with { type: 'json' };
import expected from './fixtures/expected-summary.json' with { type: 'json' };

interface Fixture {
  engagementStart: string;
  projects: ProjectRef[];
  events: EventRow[];
}

const fixture = fixtureJson as unknown as Fixture;
const options = { projects: fixture.projects, engagementStart: new Date(fixture.engagementStart) };

/** A minimal row for focused tests. */
const row = (session: string, at: string, fields: Partial<EventRow>): EventRow => ({
  session_id: session,
  event_type: 'click',
  event_action: null,
  event_label: null,
  created_at: at,
  metadata: {},
  ...fields,
});

Deno.test('the shared fixture produces exactly the expected summary', () => {
  assertEquals(summarizeWindow(fixture.events, options) as unknown, expected as unknown);
});

Deno.test('the funnel is nested: reached within work within deeper within visits', () => {
  for (const visit of buildVisits(fixture.events)) {
    if (visit.reached) assert(visit.work, `${visit.id} reached but not work`);
    if (visit.work) assert(visit.deeper, `${visit.id} work but not deeper`);
  }
  const s = summarizeWindow(fixture.events, options);
  assert(s.reached <= s.work && s.work <= s.deeper && s.deeper <= s.visits);
});

Deno.test('admin rows, section_visit rows and rows without a session are ignored', () => {
  const ids = buildVisits(fixture.events).map((visit) => visit.id);
  assertEquals(ids.includes('s09'), false);
  assertEquals(ids.length, 10);
  const onlyAdmin = summarizeWindow([
    row('a', '2026-08-01T00:00:00', { event_type: 'page_view', event_label: 'home', user_type: 'admin' }),
    row('b', '2026-08-01T00:00:00', { event_type: 'section_visit', event_label: 'projects' }),
    row('', '2026-08-01T00:00:00', { event_type: 'page_view', event_label: 'home' }),
  ], options);
  assertEquals(onlyAdmin.visits, 0);
});

Deno.test('foldPage strips the old tracker suffixes, slashes and case', () => {
  assertEquals(foldPage('home-no-storage'), 'home');
  assertEquals(foldPage('/Home'), 'home');
  assertEquals(foldPage('projects-enabled-dedup'), 'projects');
  assertEquals(foldPage('work-experience-disabled'), 'work-experience');
  assertEquals(foldPage('  '), null);
  assertEquals(foldPage(null), null);
});

Deno.test('sectionOf reads metadata first, then the action', () => {
  assertEquals(sectionOf(row('x', '2026-08-01T00:00:00', { event_action: 'view_about', metadata: {} })), 'about');
  assertEquals(
    sectionOf(row('x', '2026-08-01T00:00:00', { event_action: 'view_x', metadata: { section_type: 'Contact' } })),
    'contact',
  );
  assertEquals(sectionOf(row('x', '2026-08-01T00:00:00', { event_action: 'click_menu' })), null);
});

Deno.test('sources group by referrer host as the contract says', () => {
  assertEquals(sourceOf('www.linkedin.com'), 'LinkedIn');
  assertEquals(sourceOf('lnkd.in'), 'LinkedIn');
  assertEquals(sourceOf('com.linkedin.android'), 'LinkedIn');
  assertEquals(sourceOf('https://www.google.com/'), 'Google');
  assertEquals(sourceOf('gemini.google.com'), 'Google');
  assertEquals(sourceOf('www.google.co.in'), 'Google');
  assertEquals(sourceOf('github.com'), 'GitHub');
  assertEquals(sourceOf('https://github.com/'), 'GitHub');
  assertEquals(sourceOf('direct'), 'Direct or unknown');
  assertEquals(sourceOf(''), 'Direct or unknown');
  assertEquals(sourceOf(undefined), 'Direct or unknown');
  assertEquals(sourceOf('www.raunakchoudhary.com'), 'Direct or unknown');
  assertEquals(sourceOf('localhost'), 'Direct or unknown');
  assertEquals(sourceOf('l.instagram.com'), 'Other sites');
  assertEquals(sourceOf('notgoogle.com'), 'Other sites');
  assertEquals(sourceOf('evilgithub.com'), 'Other sites');
  assertEquals(referrerHost('https://Www.Facebook.com/path'), 'www.facebook.com');
});

Deno.test('the source comes from the earliest event that carries visitor_info', () => {
  const s06 = buildVisits(fixture.events).find((visit) => visit.id === 's06');
  assertEquals(s06?.source, 'LinkedIn');
  assertEquals(s06?.device, 'phone');
});

Deno.test('devices read deviceClass, then the old screen width, else unknown', () => {
  assertEquals(deviceOf({ deviceClass: 'tablet' }), 'tablet');
  assertEquals(deviceOf({ screenWidth: 500 }), 'phone');
  assertEquals(deviceOf({ screenWidth: 768 }), 'tablet');
  assertEquals(deviceOf({ screenWidth: 1279 }), 'tablet');
  assertEquals(deviceOf({ screenWidth: 1280 }), 'desktop');
  assertEquals(deviceOf({ deviceClass: 'watch' }), 'unknown');
  assertEquals(deviceOf(null), 'unknown');
});

Deno.test('legacy rows map to reach-outs and to work', () => {
  const at = '2026-08-01T00:00:00';
  assertEquals(reachChannel(row('x', at, { event_action: 'reach_out', event_label: 'resume' })), {
    channel: 'resume',
    legacy: false,
  });
  assertEquals(reachChannel(row('x', at, { event_action: 'reach_out', event_label: 'fax' })), null);
  assertEquals(reachChannel(row('x', at, { event_type: 'form_submission' })), {
    channel: 'contact_form',
    legacy: true,
  });
  assertEquals(reachChannel(row('x', at, { event_action: 'click_social_media', event_label: 'LinkedIn' })), {
    channel: 'linkedin',
    legacy: true,
  });
  assertEquals(reachChannel(row('x', at, { event_action: 'click_contact_email' })), { channel: 'email', legacy: true });
  assertEquals(reachChannel(row('x', at, { event_action: 'click_social_media', event_label: 'github' })), null);

  const github = summarizeWindow(
    [row('g', at, { event_action: 'click_social_media', event_label: 'github' })],
    options,
  );
  assertEquals([github.visits, github.deeper, github.work, github.reached], [1, 1, 1, 0]);
});

Deno.test('a legacy row is dropped when the same visit has the new reach_out of that channel', () => {
  const at = '2026-08-01T00:00:0';
  const both = summarizeWindow([
    row('v', `${at}1`, { event_action: 'reach_out', event_label: 'linkedin' }),
    row('v', `${at}2`, { event_action: 'click_social_media', event_label: 'linkedin' }),
    row('v', `${at}3`, { event_action: 'click_contact_email' }),
  ], options);
  assertEquals(both.channels.map((c) => c.count), [1, 1, 0, 0]);
  // Channels count events: two new-style LinkedIn clicks in one visit are two.
  const twice = summarizeWindow([
    row('v', `${at}1`, { event_action: 'reach_out', event_label: 'linkedin' }),
    row('v', `${at}2`, { event_action: 'reach_out', event_label: 'linkedin' }),
  ], options);
  assertEquals(twice.channels[0].count, 2);
  assertEquals(twice.reached, 1);
});

Deno.test('deeper needs two distinct folded pages or a section past hero and navigation', () => {
  const at = '2026-08-01T00:00:0';
  const samePage = summarizeWindow([
    row('a', `${at}1`, { event_type: 'page_view', event_label: 'home' }),
    row('a', `${at}2`, { event_type: 'page_view', event_label: 'home-dedup' }),
    row('a', `${at}3`, { event_type: 'section_view', event_action: 'view_navigation' }),
  ], options);
  assertEquals(samePage.deeper, 0);
  const twoPages = summarizeWindow([
    row('b', `${at}1`, { event_type: 'page_view', event_label: 'home' }),
    row('b', `${at}2`, { event_type: 'page_view', event_label: 'skills' }),
  ], options);
  assertEquals([twoPages.deeper, twoPages.work], [1, 0]);
  const workSection = summarizeWindow([
    row('c', `${at}1`, { event_type: 'section_view', event_action: 'view_work-experience' }),
  ], options);
  assertEquals([workSection.deeper, workSection.work], [1, 1]);
});

Deno.test('quick leaves count only visits from the first engaged row on', () => {
  const s = summarizeWindow(fixture.events, options);
  // s01 started before engagement tracking, so 9 of 10 visits are measured.
  assertEquals(s.quickLeave.measured, 9);
  assertEquals(s.quickLeave.quickLeaves, 4);
  const none = summarizeWindow(fixture.events, { ...options, engagementStart: null });
  assertEquals(none.quickLeave, { measured: 0, quickLeaves: 0, rate: null });
  assertEquals(none.devices.map((d) => d.quick), [null, null, null, null]);
});

Deno.test('projects: opens are distinct visits, links count per event by kind, unopened stay listed', () => {
  const s = summarizeWindow(fixture.events, options);
  assertEquals(s.projects.map((p) => [p.title, p.opens, p.repo, p.demo]), [
    ['Alpha', 1, 1, 1],
    ['Beta', 1, 0, 0],
    ['Gamma', 0, 0, 0],
  ]);
  const noneYet = summarizeWindow([], options);
  assertEquals(noneYet.projects.every((p) => p.opens === 0), true);
});

Deno.test('home reach divides by visits that saw the home page', () => {
  const s = summarizeWindow(fixture.events, options);
  assertEquals(s.homeReach.homeVisits, 8);
  assertAlmostEquals(s.homeReach.sections[0].share as number, 0.625);
  const empty = summarizeWindow([], options);
  assertEquals(empty.homeReach.sections.map((section) => section.share), [null, null, null, null]);
});

Deno.test('an empty window has zeros and nulls, never NaN', () => {
  const s = summarizeWindow([], options);
  assertEquals([s.visits, s.deeper, s.work, s.reached], [0, 0, 0, 0]);
  assertEquals(s.devices.map((d) => d.share), [null, null, null]);
  assertEquals(JSON.stringify(s).includes('NaN'), false);
});

Deno.test('staleSections lists sections older than 90 days, oldest first, and skips empty tables', () => {
  const asOf = new Date('2026-10-01T13:00:00Z');
  const day = 24 * 60 * 60 * 1000;
  const result = staleSections([
    { name: 'Hero', updatedAt: new Date(asOf.getTime() - 10 * day) },
    { name: 'Leadership', updatedAt: new Date(asOf.getTime() - 118 * day) },
    { name: 'Certifications', updatedAt: new Date(asOf.getTime() - 142 * day) },
    { name: 'Skills', updatedAt: new Date(asOf.getTime() - 90 * day) },
    { name: 'Empty', updatedAt: null },
  ], asOf);
  assertEquals(result.stale, [{ name: 'Certifications', days: 142 }, { name: 'Leadership', days: 118 }]);
  assertEquals(result.fresh, 2);
});

Deno.test('pace scales a partial count to the whole quarter', () => {
  assertEquals(pace(49, 92, 49), 92);
  assertEquals(pace(10, 92, 46), 20);
  assertEquals(pace(5, 92, 0), 0);
});
