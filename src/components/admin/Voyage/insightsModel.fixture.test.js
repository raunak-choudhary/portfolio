// Cross-check against the quarterly report.
//
// The report function (TypeScript) and this chapter's model (JavaScript)
// compute the same numbers from analytics_events. Both read one hand-built
// fixture and must reach the hand-worked answer in expected-summary.json.
// A difference here means one side is wrong; fix the side that breaks the
// contract, never this test.

import fixture from '../../../../supabase/functions/quarterly-report/fixtures/events.json';
import expected from '../../../../supabase/functions/quarterly-report/fixtures/expected-summary.json';
import { summarizeWindow, summarizeWindowSliced } from './insightsModel';
import { nyDate } from './insightsTime';

const start = Date.parse(fixture.window.start);
const days = Math.round((Date.parse(fixture.window.end) - start) / 86400000);
// the model takes projects in the projects table's shape: a demo exists when live_url is set
const projects = fixture.projects.map((p) => ({ id: p.id, title: p.title, live_url: p.hasDemo ? 'https://example.com' : null }));

const summary = summarizeWindow(fixture.events, {
  start: nyDate(start),
  days,
  projects,
  quickFrom: Date.parse(fixture.engagementStart),
});

describe('the Analytics model agrees with the report fixture', () => {
  it('counts the funnel', () => {
    expect({ visits: summary.visits, deeper: summary.deeper, work: summary.work, reached: summary.reached })
      .toEqual({ visits: expected.visits, deeper: expected.deeper, work: expected.work, reached: expected.reached });
  });

  it('ranks the sources', () => {
    expect(summary.sources.map(({ name, visits, reached }) => ({ name, visits, reached }))).toEqual(expected.sources);
  });

  it('splits devices, with the unknown row and quick leaves', () => {
    expect(summary.devices.map((d) => ({
      key: d.id, name: d.name, visits: d.visits, share: d.share, measured: d.measured, quickLeaves: d.quickLeaves, quick: d.quick,
    }))).toEqual(expected.devices);
  });

  it('measures quick leaves overall', () => {
    const quickLeaves = summary.devices.reduce((sum, d) => sum + d.quickLeaves, 0);
    expect({ measured: summary.measured, quickLeaves, rate: summary.quick }).toEqual(expected.quickLeave);
  });

  it('counts the ways in, with legacy rows deduplicated', () => {
    expect(summary.channels.map(({ id, name, count }) => ({ key: id, name, count }))).toEqual(expected.channels);
  });

  it('measures home page reach', () => {
    expect({
      homeVisits: summary.home.visits,
      sections: summary.home.sections.map(({ id, name, count, share }) => ({ key: id, name, visits: count, share })),
    }).toEqual(expected.homeReach);
  });

  it('counts project opens and links, ordered by opens then title', () => {
    expect(summary.projects.map(({ id, title, hasDemo, opens, repo, demo }) => ({ id, title, hasDemo, opens, repo, demo })))
      .toEqual(expected.projects);
  });
});

describe('the sliced build used by the chapter', () => {
  const options = { start: nyDate(start), days, projects, quickFrom: Date.parse(fixture.engagementStart) };

  it('reaches the same summary as the synchronous build, however finely it is sliced', async () => {
    let t = 0;
    const pause = jest.fn(async () => {});
    // every clock read advances 9 ms and the clock is read after each row: one row per slice, a yield after each
    const sliced = await summarizeWindowSliced(fixture.events, options, { budgetMs: 8, stride: 1, pause, now: () => (t += 9) });
    expect(sliced).toEqual(summary);
    expect(pause).toHaveBeenCalledTimes(fixture.events.length - 1);
  });

  it('matches on a long row list repeated across many slices', async () => {
    const rows = Array.from({ length: 12 }, (_, k) => fixture.events.map((e) => ({ ...e, id: `${e.id}-${k}`, session_id: e.session_id && `${e.session_id}-${k}` }))).flat();
    let t = 0;
    const pause = jest.fn(async () => {});
    const sliced = await summarizeWindowSliced(rows, options, { budgetMs: 8, stride: 5, pause, now: () => (t += 3) });
    expect(pause.mock.calls.length).toBeGreaterThan(10);
    expect(sliced).toEqual(summarizeWindow(rows, options));
  });

  it('gives up without a result once cancelled', async () => {
    let stop = false;
    const result = await summarizeWindowSliced(fixture.events.concat(fixture.events, fixture.events), options, {
      budgetMs: 8, stride: 1, now: (() => { let t = 0; return () => (t += 9); })(), pause: async () => { stop = true; }, cancelled: () => stop,
    });
    expect(result).toBeNull();
  });
});
