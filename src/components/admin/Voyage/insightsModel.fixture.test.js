// Cross-check against the quarterly report.
//
// The report function (TypeScript) and this chapter's model (JavaScript)
// compute the same numbers from analytics_events. Both read one hand-built
// fixture and must reach the hand-worked answer in expected-summary.json.
// A difference here means one side is wrong; fix the side that breaks the
// contract, never this test.

import fixture from '../../../../supabase/functions/quarterly-report/fixtures/events.json';
import expected from '../../../../supabase/functions/quarterly-report/fixtures/expected-summary.json';
import { summarizeWindow } from './insightsModel';
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
