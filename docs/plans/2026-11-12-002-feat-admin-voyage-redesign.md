---
title: "feat: The admin as one sky (voyage redesign)"
type: feat
status: active
date: 2026-11-12
origin: docs/plans/2026-11-02-001-feat-portfolio-stabilization-plan.md (Phase 4, Unit 4.5)
---

# feat: The admin as one sky (voyage redesign)

## Overview

The admin dashboard becomes a single scroll-driven page. The zodiac sky the owner locked on 2026-11-11 stops being wallpaper and becomes the structure: sixteen chapters wait along a route through a three-dimensional star field, one constellation each, and the camera flies from chapter to chapter as the page scrolls. The constellation of a chapter draws itself as the camera arrives, scrubbed by scroll position. Each chapter holds one job: mission control, one of the twelve content managers, analytics, the inbox, security. Editing never happens on the scrolling page itself; it happens in a sheet that slides over the stage and owns its own scroll.

The draft the owner approved on 2026-11-12 is `captures/voyage-preview-2026-11-12/index.html` (local, not committed). This plan turns it into the product and replaces the remaining Phase 4 interface work: the shell pass, the cricket scorecards (withdrawn) and the inbox styling. Units 4.3 and 4.4 of the stabilisation plan stay as they are and close the phase.

## Problem Frame

The current dashboard is a 2025 sidebar-and-cards layout with about 500 emoji icons, a rotating background that has already been replaced by the sky, twelve managers each with its own 1,500 to 2,000 line form, and an overview built from random stat tiles. It works, but it does not look like the person who owns it, and every manager is a separate world. The owner wants an admin that feels like 2026: one page, motion in step with scroll, the sky doing structural work, and a clear way to grow into the Phase 5 "arrange the public site" tool.

## Requirements Trace

Owner decisions, in the owner's words where possible:

- "One single page, background, as in when we progress, new constellations keep on appearing, until we finish the page, scroll based."
- Constellation order is fixed, not shuffled (agent's amendment, accepted): twelve managers on the twelve zodiac signs in calendar order, Ursa Major for mission control, Orion for analytics, Cygnus for the inbox, Cassiopeia for security.
- Side panel removed; a star rail and the command palette carry navigation.
- Apple-style scroll-synced motion for travel between chapters; editing in sheets.
- Three-dimensional fly-through included ("Including optional").
- "Looks damn good", with the day theme flagged: "if it is problem we will skip day version and keep night version, or think how can we improve day version."
- Everything free, bundled, inside the current security policy; no automatic CI; each unit merged to main as it completes with nothing left open.
- Phase 5 will reuse the tile grid as a Layout manager for the single-scroll public site.

## Scope Boundaries

In scope: the admin route tree under `/admindashboard`, its data hooks, the sign-in and sign-out sequences already built, the sky renderer already built, and the twelve manager forms (migrated into the shared sheet). Out of scope: the public site, the login flow, the database schema beyond one small activity table, and any paid service.

## Key Technical Decisions

- **Rendering.** One Three.js scene for the field, the chapters' constellations and the drawings, mounted once behind the page. The existing 2D `SkyBackground` stays as the fallback when WebGL is unavailable or the visitor asks for reduced motion, and as the backdrop of the login and sign-out pages. Three.js is bundled (MIT, about 150 KB gzip); nothing loads from a CDN.
- **Scroll model.** The page scrolls natively; a single animation loop reads the scroll fraction and derives the chapter index and the fraction into it. Camera position and look-at ease toward the chapter anchor; constellation draw range, star alpha and drawing opacity are pure functions of that fraction. Native scroll keeps keyboard, trackpad, screen readers and the browser's own find-in-page working. No scroll hijacking.
- **Chapters are a registry,** not sixteen components: id, name, constellation id, kind, data hook, deck fields, sheet fields. The deck and the sheet are built once. Each manager contributes a field schema and a save function (already `saveAdminData`), not a layout.
- **Theme.** Space has no daytime. The light theme becomes "dawn": a deep indigo-to-rose field with the Sun's glare at one edge, stars faint, lines in rust, light glass panels with dark text for legibility. It is still driven by the New York clock and the Sky menu. If the dawn spike (Unit V1) does not convince the owner, the voyage ships night-only and the Sky menu's theme control is hidden on this page; the owner has approved that fallback in advance.
- **Libraries,** all MIT, all bundled: `three` for the field; `@dnd-kit/core` and `@dnd-kit/sortable` for tile and card reordering (one library for both); `recharts` for the analytics charts (about 90 KB gzip); `cmdk` for the command palette; `lucide-react` for icons, tree-shaken. Tailwind-based kits (Tremor, shadcn) are not adopted. Budget: the admin bundle may grow by at most 300 KB gzip; the public bundle must not grow, so the admin chapters load through a route-level dynamic import.
- **Data.** Health, sections and issues come from `getPortfolioHealth` as today. Section freshness reads `updated_at` on each content table. The activity feed and the "fix queue" state need a small table, `admin_activity` (id, at, kind, section, item, detail), RLS owner-only, written by `saveAdminData` and the delete and publish paths. No personal data beyond what the owner edits.
- **Security.** The policy does not change: scripts from self only, no inline scripts, images from self plus Supabase plus NASA's Sun server as already allowed. Writes go through the session with `is_admin()`; Unit 4.3 makes the second factor mandatory in SQL before this redesign is considered done. The sheet never renders server error text; it uses the typed errors already in `adminDataService`.
- **Verification in a real browser.** Unit tests cannot see WebGL, layout or the scroll loop. Before Unit V1, the owner performs one login in a Playwright-driven Chromium so its storage state is saved locally (gitignored, never committed). Every unit's exit condition includes a real-browser pass on localhost at 390, 768, 1024 and 1440 using that state, so the agent no longer hands over unverified screens.

## High-Level Technical Design

Files, all under `src/components/admin/Voyage/` unless noted:

- `chapters.js`: the registry (sixteen entries) and the constellation mapping.
- `voyageModel.js` (pure): scroll fraction to chapter index and fraction; camera anchor path; per-chapter draw, alpha and opacity curves; rail state; reduced-motion and no-WebGL decisions. Fully unit tested.
- `SkyField.js` and `skyField.js`: the Three.js scene (field, constellation groups from `figures.json`, drawing planes placed by the stored similarity), theme palettes (night, dawn), resize, pixel-ratio cap, a `still` mode. The scene module is tested with a fake renderer; the real scene is checked in Chromium.
- `VoyagePage.js`: the page shell: top bar (Sky menu, palette button, more menu on phones), progress line, chapters mounted from the registry, star rail, sheet host, palette host.
- `StarRail.js`, `CommandPalette.js` (cmdk), `Sheet.js` (focus trap, Escape, dirty-state guard, sticky save bar), `Deck.js` (cards, add, reorder with dnd-kit, "open the full list" for long sections with search and sort), `Bento.js` and `tiles/*` (health ring, visitors sparkline, inbox, fix queue, section bars, recent edits, top pages, tonight), `chapters/AnalyticsChapter.js`, `chapters/InboxChapter.js`, `chapters/SecurityChapter.js`.
- `src/services/adminActivity.js`: writes and reads `admin_activity`; `supabase/migrations/<date>_admin_activity.sql`.
- Manager field schemas: `managers/<section>.schema.js`, one per content table, each with its tests, feeding Deck and Sheet.
- Retired at the end: `AdminDashboard.js`, its 2,700-line stylesheet, the twelve `sections/*Manager.js` files and their stylesheets, `HeaderMenu.js`.

## Implementation Units

Each unit is one branch and one pull request, merged on local evidence (rule 10), with the owner's visual check on localhost before the merge.

- [ ] **Unit V0: Prerequisites** (owner plus agent, half a day). Owner performs the one-time test login that saves a Playwright storage state locally; agent adds the gitignore entry and a `npm run admin:open` script that launches Chromium on the dashboard with that state. Agent installs `three`, `@dnd-kit/*`, `recharts`, `cmdk`, `lucide-react`, records sizes, and adds a bundle budget check to `scan-bundle`.
  - Exit: the agent can open the real dashboard in Chromium without the owner; `npm run build:production` reports the admin chunk separately.

- [ ] **Unit V1: Voyage shell with mission control** (3 to 4 days). SkyField in Three.js with the night palette and the dawn spike; scroll engine; star rail; command palette; sixteen chapter stages with titles and placeholder decks; mission control bento with real health, section, inbox and Moon data (visitors and top pages from the existing analytics service); 2D fallback and reduced motion; phone layout. The old dashboard remains reachable at `/admindashboard/classic` until Unit V6.
  - Exit: owner approves the feel at 390 and 1440 in night, and decides dawn versus night-only; 60 fps on the owner's laptop; the Playwright pass is green; unit tests for `voyageModel` and the registry.

- [ ] **Unit V2: Deck and sheet, Projects migrated** (3 days). The shared deck and sheet; the Projects schema (the richest form: images, awards, links, order, featured); save through `saveAdminData`; delete with confirmation; reorder with dnd-kit writing `order_index`; dirty-state guard on close.
  - Exit: the owner edits, adds, reorders and deletes a `TEST-` project through the editor on localhost; schema and editor tests green. The classic Projects manager stays linked until Unit V6 (the classic dashboard remains whole as the default, per the rollback strategy).
  - Amendment 2026-11-13 (owner review): the editor becomes a wide centred glass dialog (two columns of fields from 1024 px, full screen on phones) instead of a side sheet; a card opens in a rendered read view with an Edit button and returns to it after Save; error handling is layered (inline after a field is first left, everything on Save with the first error focused, typed session and permission errors in the dialog's own banner, offline detection, upload errors, an `updated_at` conflict check, list-load retry, typed text never lost); blur only on large surfaces, translucent fills on cards. Built as **Unit V2b** on the same branch before the pull request.

- [ ] **Unit V3: Remaining managers** (5 to 8 days, four pull requests of about three managers each: hero and about and skills; education, work, internships; certifications, achievements, leadership; recommendations and media). Each manager becomes a schema file and loses its old component.
  - Exit per pull request: every field of the old form is present in the new schema (a checklist in the pull request body), a `TEST-` row round-trips, tests green, owner check.

- [ ] **Unit V4: Analytics, inbox, security chapters** (3 days). Analytics with Recharts: visitors by day, sources, devices, top pages, the three tabs agreed earlier (Visitors, Content, Contact), and the removal of the six legacy tabs; inbox as telegram cards with read, replied and archived stamps and attachments as enclosures; security chapter reusing `MfaEnrollment` inside the stage.
  - Exit: the analytics numbers match the current page for the same range; owner check.

- [ ] **Unit V5: Activity and the fix queue** (2 days). `admin_activity` migration (owner runs it), writes from save, delete and publish paths, the recent-edits tile and the fix queue tile become live, the sign-out credits read their facts from it.
  - Exit: an edit on localhost appears in the feed and in the credits; RLS verified with a rolled-back anon query.

- [ ] **Unit V6: Polish and retirement** (3 to 5 days). Fly-through tuning (easing, parallax turn, pixel-ratio cap, star count by device), dawn palette final or night-only, phone performance pass, the classic dashboard and its stylesheets deleted, emoji replaced by Lucide icons throughout the admin, toasts for save results, the e2e suite extended with the admin pass.
  - Exit: owner approves on a phone through a tunnel they open; Lighthouse performance on the admin above 80 on the laptop; no console errors in a full scroll.

- [ ] **Unit V7: Day mode** (2 to 3 days, added 2026-11-13). The light theme as a day scene: a large Sun sphere with granulation, flares and prominences turning on its axis (from the live SDO image and the procedural layer of the 2D sky), the Earth circling it, light glass panels. Replaces the dawn placeholder. Night stays the default.
  - Exit: owner approves the day scene at 390 and 1440; the Sky menu switches cleanly; no console errors.

- [ ] **Unit 4.3 and Unit 4.4** as written in the stabilisation plan (second factor enforced in SQL with a recovery drill; end-to-end manager tests including the production-build write proof). They run after Unit V3, so the proof covers the new sheet.

- [ ] **Phase 5 hook: Layout manager.** Designed in Unit V1's bento as a future chapter ("Layout", on Ursa Minor): the public sections as draggable tiles in order, show or hide, hero style. Built in Phase 5; the data model (a `site_layout` row) is specified then.

## Rollback strategy

The owner asked for a way back at any moment. Three layers:

1. **Tag.** `admin-classic-2026-11-12` marks the last main before any voyage code (the classic dashboard, the zodiac sky and the sign-out film). `git checkout admin-classic-2026-11-12` gives that exact state; a build from it is the emergency deploy.
2. **Flag, not replacement.** Until Unit V6, the classic dashboard stays the default at `/admindashboard` and the voyage lives at `/admindashboard/voyage` behind a route flag. Switching the default is one commit in Unit V6; reverting that one commit brings the classic dashboard back with every voyage unit still merged and harmless.
3. **One branch per unit, merged to main only when green** (owner's rule: nothing left open). Each unit's pull request lists the exact commits, so `git revert` of a unit is a mechanical step; the units are ordered so that reverting the latest never breaks an earlier one.

Data: no unit changes existing tables. The only addition is `admin_activity` (Unit V5), owner-only and droppable without touching content.

## Risks

- Twelve manager migrations are the real cost and the most likely place to lose a field. The per-manager checklist and `TEST-` round-trips are the guard.
- WebGL on older phones: the 2D fallback is the existing renderer, so the worst case is today's sky with straight cuts.
- The dawn theme may fail to convince; the owner accepted night-only as the fallback.
- Bundle growth: capped at 300 KB gzip for the admin chunk, checked by the bundle scan; the public bundle stays unchanged by the dynamic import.
- Scroll feel differs between trackpads, mice and touch; Unit V1 is judged on the owner's own devices, not the agent's captures.

## Sources

- Draft: `captures/voyage-preview-2026-11-12/index.html` (local).
- Sky renderer and data: `src/components/admin/SkyBackground/`, `public/admin/sky/`.
- Three.js, dnd-kit, Recharts, cmdk, Lucide: MIT licences recorded in `public/admin/LICENSES.md` when added.
