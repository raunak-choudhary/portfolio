# Shared analytics fixture

The quarterly report (TypeScript, `../rules.ts`) and the admin Analytics chapter (JavaScript) compute the same numbers
from `analytics_events`, as defined in section 2 of the V4b contract. This folder pins both to one answer.

- `events.json`: hand-built `analytics_events` rows for one window (July to September 2026), plus the two inputs the
  definitions need besides the rows: `engagementStart` (the first `engaged` row ever stored) and `projects` (active rows
  of the `projects` table: id, title, whether a demo link exists).
- `expected-summary.json`: the numbers those rows must produce, worked out by hand. `rules_test.ts` checks
  `summarizeWindow(events, { projects,
  engagementStart })` against it field by field. The Analytics model can load the
  same two files in a Jest test and compare its own output.

Timestamps are written the way PostgREST returns `timestamp without time
zone` columns: UTC without an offset.

## What each session tests

| Session | Covers                                                                                                                                                                    |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| s01     | LinkedIn; new `reach_out` plus the legacy LinkedIn click in the same visit (counted once); started before engagement tracking, so not measured for quick leaves           |
| s02     | Google with a full URL referrer; phone; quick leave                                                                                                                       |
| s03     | Direct; `engaged`; Contact section makes it "deeper"                                                                                                                      |
| s04     | GitHub; Projects page; two `project_open` of one project (one open); repo and demo links                                                                                  |
| s05     | Own-site referrer counts as Direct or unknown; `home-no-storage` and `/Home` fold to one page; hero and navigation alone are not "deeper"; tablet quick leave             |
| s06     | `lnkd.in`; the first row is an old `section_view` without `visitor_info`, so source and device come from the next row; legacy `form_submission` and `click_contact_email` |
| s07     | Instagram (Other sites); About section; legacy GitHub click counts as work, not as a reach-out                                                                            |
| s08     | LinkedIn app; Internships page; `reach_out` resume and contact form, with the old `form_submission` of the same send dropped; opens a project without a demo              |
| s09     | Admin rows and `section_visit`: ignored                                                                                                                                   |
| s10     | 2025 `visitor_info` with only `screenWidth` (500 px, so a phone)                                                                                                          |
| s11     | No `visitor_info` at all: unknown device, Direct or unknown                                                                                                               |
| (none)  | A row without `session_id`: ignored                                                                                                                                       |

## Rules the fixture makes explicit

These follow the contract; where the contract is silent, the report chose as below, and the Analytics model should
match.

1. A visit's source and device come from its earliest event that carries `metadata.visitor_info`, not merely its
   earliest event.
2. A referrer of the site itself (`raunakchoudhary.com`, `www.raunakchoudhary.com`, `localhost`, `127.0.0.1`) is "Direct
   or unknown". Referrers stored as full URLs are reduced to their host first.
3. A `visitor_info` without `deviceClass` falls back to `screenWidth` (under 768 phone, under 1280 tablet, else laptop);
   with neither, the device is "Unknown device", listed only when such visits exist.
4. Channels count events, but a legacy row (`form_submission`, `click_contact_email`, LinkedIn `click_social_media`) is
   dropped when the same visit also has the new `reach_out` of that channel.
5. Source rows are ordered by reach-outs, then visits, then the fixed order LinkedIn, Google, GitHub, Direct or unknown,
   Other sites.
6. Projects are ordered by opens, then title. Shares with nothing to divide by are `null`, never 0.
