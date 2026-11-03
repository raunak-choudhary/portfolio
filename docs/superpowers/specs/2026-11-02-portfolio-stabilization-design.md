# Portfolio stabilization: design

Date: 2026-11-02. Owner: Raunak Choudhary. Site: https://www.raunakchoudhary.com. Repository: github.com/raunak-choudhary/portfolio (private). Local copy: `~/Data/Projects/Portfolio/portfolio-dynamic`, the only copy.

This document describes what gets built in Phases 0 to 6 and why. Phase 7, the new portfolio, is deliberately out of scope and gets its own design later.

## 1. Intent

The site that has been live on Hostinger since 2025-06-09 is a React single-page app reading from a Supabase project. In June 2026 the database was locked down and the admin was rewritten to use Supabase Auth, but that work was never deployed. Today the live site runs the 2025 build: its admin login no longer works against the locked-down database, it calls a revoked database function on every page, and its JavaScript bundle embeds the Supabase service-role key, which bypasses every Row Level Security rule.

The intent is to replace the live site with the hardened build without changing anything a visitor sees, close the security exposure, bring the project data up to date from the audited project catalogue, make the admin dashboard fully usable, confirm the site works on phones and tablets, and tell visitors that a new portfolio is coming. Everything here is fixing and updating; nothing here is redesign.

## 2. Goals

1. The live site serves the hardened build and a visitor cannot tell the difference, except for the data updates and the banner.
2. No secret of any kind is in the browser bundle or the repository. The leaked service-role key is dead. The Supabase security advisor is clean apart from items the owner has explicitly deferred.
3. Project data reflects the audited catalogue, with the scope decided together at the start of the data phase.
4. Every admin manager works end to end with a real admin session, protected by an email link plus an authenticator-app second factor enforced in the database.
5. Every public page renders without horizontal scroll or overlap at 375, 768, 1280 and 1440 pixels wide, in both themes, verified by an automated contract test that also serves as the regression guard for every later change.
6. A dismissible under-construction banner tells visitors a new portfolio is coming and can be switched on and off from the admin dashboard.
7. Nothing reaches Hostinger until the owner has reviewed the new build locally against the baseline screenshots of the live site. There are two deploys, both behind that review: a security deploy after Phase 2, so the leaked key dies early, and the final deploy after Phase 6.

## 3. Non-goals

- The new 3D single-page portfolio (Phase 7).
- Migrating away from Create React App, adding TypeScript, or rewriting the stylesheets. These happen in the new portfolio, not here.
- A new admin theme, login or logout redesign.
- GitHub or LinkedIn analytics integrations, resume or cover letter generation.
- Search engine work beyond fixing wrong links already present in the page metadata.

## 4. Anti-goals

Any of these makes the work a failure even if everything else passes:

- A visual regression on a public page that the owner did not approve.
- Deploying to Hostinger before the owner's local review.
- A secret committed to the repository, or a rewrite of git history to hide one.
- Admin writes possible without both authentication factors.
- A data change that the owner did not decide on at the data-phase checkpoint.

## 5. Constraints

- Supabase stays on the free plan. Authenticator-app MFA is free; phone MFA is not and is excluded.
- Hostinger serves static files only. There is no server-side code except Supabase Edge Functions. Deploys are an upload of the `build/` folder; the owner performs the upload or supplies the credentials in `.env`, never in the repository.
- Workflow: one issue per task, one branch per task, one pull request per branch, rebase merge, Conventional Commits, no AI co-author trailers, no em dashes in any public text. Pull requests, CI waits and merges go to a background helper agent; design and build stay in the main session.
- `CLAUDE.md` in the repository root is the agent's source of truth, updated as decisions happen, and gitignored. Public documentation is written for people.
- Laptop: 8 GB MacBook Air. Browser test runs are sequential.
- The owner approves, in person, four things: the key rotation moment, the Postgres upgrade window, the data scope, and the deploy.

## 6. Current state the builder can rely on

- Repository history: CRA init, a baseline commit that is exactly the source of the live build (stylesheet byte-identical, every public component identical), then the June 2026 work in six grouped commits. gitleaks on the history: clean.
- Database (project ref `emaaaeooafqawdvdreaz`, Postgres 15.8): all eleven migrations under `supabase/migrations/` are applied remotely. Policies: anonymous visitors may read active content rows and insert contact messages and analytics events; authenticated sessions matching an active `admin_users` row via `app_private.is_admin()` may manage everything; storage buckets are public-read except `contact-attachments`, which is private. Edge functions: `send-contact-email` (current) and `send-otp-email` (retired 2025 custom login, to be deleted).
- Content rows: 20 projects, 110 skills, 13 certifications, 13 recommendations, 17 achievements, 5 internships, 5 leadership entries, 4 education rows, 1 work experience row. 15 of the 31 catalogued projects are absent; no project has an order index; CareVault links point at repository names that no longer exist.
- Baseline: 20 full-page screenshots of the live site at 1440, 768 and 375 wide, dark and light, plus the admin login page, the capture log and console errors, in `~/Data/Projects/Archieve Portfolio Documents/live-baseline-2026-11-02/`. The capture script that produced them is in the session scratchpad and must be moved into the repository in Phase 0.
- Catalogue: `~/Data/Projects/project-audit/PROJECT_CATALOG.md`, 31 entries over 34 repositories, each with a display name, one-liner, timeline, solo or team disclosure, stack, domain tags, metrics, quality rating, architecture summary and interview notes.
- Known differences between the hardened build and live, all admin-side or deliberate: the admin welcome animation is no longer routed after login; three inner-cube photos and two About fallback photos were re-encoded upright; seven unreferenced public images were removed. Phase 2 adds one visitor-facing difference, approved by the owner: the phone link in the Contact section is removed.
- All changes go to the one production Supabase project. There is no staging project. Schema additions are nullable, and every row change is decided at the Phase 3 checkpoint, so nothing unapproved reaches visitors through the database.
- The Hostinger `.htaccess` is not in the repository yet. Owner task before Phase 2: download the current one from the Hostinger file manager into `~/Data/Projects/Archieve Portfolio Documents/`. The live response headers already show the security policy it sets.

## 7. Phases, each with its exit condition

### Phase 0: Foundation and guard rails

Build the safety net before touching anything.

- `CLAUDE.md` created (gitignored) with the state above, the rules in section 5, and a decisions log.
- The baseline capture script moves into the repository as a Playwright suite that can run against the live site or a local build at the same four widths and both themes, and writes screenshots plus a JSON log. A second script compares two capture folders page by page and reports layout differences (document height, overflow, missing headings, console errors), not pixels, because animated backgrounds make pixel diffs noisy.
- Continuous integration on GitHub Actions on every pull request: install, unit tests, production build, gitleaks, and the responsive suite against the built output. One job gates merging. The suite in CI never talks to the live database: a script records the public tables once into committed JSON fixtures, the browser tests answer Supabase requests from those fixtures, and the existing analytics flag is off in CI so no test traffic lands in `analytics_events`. Local runs may use the live project for the baseline comparison.
- Branch protection on `main`: pull request required, CI required, no force push.
- `.env.example` complete; `.env` files confirmed ignored; `CLAUDE.md` ignored.

Exit: CI green on `main`; a capture of the hardened build compared against the live baseline shows only the differences listed in section 6, and the owner has looked at that comparison and said so.

### Phase 1: Plan

This document and the implementation plan derived from it, reviewed and approved. Exit: owner approval of the plan.

### Phase 2: Security

Order matters here. Supabase cannot disable the leaked service-role key on its own: disabling legacy keys disables the anon key with it, which would blank the live 2025 build. So the cutover is: create the new publishable key, build and review the bundle with it, deploy, verify the live site, then disable the legacy keys, then migrate to signing keys and revoke the old secret. Zero visitor downtime. The builder prepares everything else first, and the misuse audit of the API logs is the first task of the whole plan because free-plan logs are kept for one day.

- Content Security Policy: remove `unsafe-eval`; keep `unsafe-inline` only where Create React App's output requires it; drop the stale emailjs origin. The policy lives in both `public/index.html` and `public/.htaccess` (added to the repository from the owner's download, so the build carries it), and a CI check asserts the two policies match.
- Remove the phone link from the Contact section and the number from the bundle; the contact form, the email address and the LinkedIn link remain.
- Login hardening: the login call no longer creates users; project sign-ups are disabled once the owner's admin user exists; the retired `send-otp-email` function is deleted; legacy columns on `admin_users` (`password_hash`, `otp_code`, `otp_expires_at`, `otp_attempts`, `otp_last_sent`, `login_attempts`, `locked_until`) are dropped by migration after confirming nothing reads them.
- Production build strips console output; the development debug helpers on `window` are confirmed absent from production.
- `npm audit` findings resolved or documented with a reason, as in tallyproof.
- Postgres platform upgrade, in a window the owner approves, with the pre-check and post-check list from the June notes: public read, contact insert, signed attachment link, admin login, admin update, storage upload.
- Edge Function: it does not pick up a new key automatically. It must read the new secret-key variable, validate attachment paths against the upload prefix, shorten emailed signed links, and be redeployed before the legacy keys are disabled.
- Key cutover, in this order: the owner creates the publishable key; the build is made with it and the bundle scan confirms it carries only that key; the security deploy goes to Hostinger behind the local review; the live site is verified; the owner disables the legacy keys; the old service-role key is confirmed rejected; the owner migrates to signing keys and, after the token expiry window, revokes the legacy secret. Never re-enable legacy keys after a leak.
- Security deploy: fix-forward only, since the only earlier build is the leaky one. From this point the live site is the hardened build and the old admin is gone.

Exit: security advisor clean except deferred items recorded in `CLAUDE.md`; a bundle scan finds only the public key; the old service-role key is confirmed rejected by the API; the live site passes the capture suite, admin login, a contact form submission and a console check; all unit tests and CI pass.

### Phase 3: Data

Starts with a conversation. The owner and the agent go through the catalogue together and decide, entry by entry or by rule, what the projects section should contain, which entries are featured, in what order, and what happens to the three hardware projects that have no repository. That decision is written into `CLAUDE.md` before any row changes.

Then, as the builder's work:

- A migration adds the columns the catalogue needs and the table lacks. Likely: a repository URL key for idempotent updates, a solo or team disclosure, the owner's role, a timeline range, defensible metrics, domain tags, and the quality tier. Exact names are the builder's call; every column is nullable so existing rows stay valid.
- A seed script, run locally with the owner's authenticated session or through the Supabase connector, reads the catalogue and upserts projects keyed by repository URL. It is idempotent: running it twice changes nothing the second time. It never deletes a row; rows the decision retires are set inactive.
- Broken links such as the CareVault repository names are corrected by the same script.
- The public projects page and the admin projects manager display any new field that the decision says a visitor should see.

Exit: the owner reviews the projects page locally against the decision record and confirms it; the seed script is idempotent; the catalogue is referenced from `CLAUDE.md` as the source.

### Phase 4: Admin

- Second factor: the owner enrols an authenticator app from the admin dashboard (an enrolment screen is built for this), with the setup key saved to a password manager as a recovery path. `app_private.is_admin()` additionally requires the session's assurance level to be the second level, so every admin table and bucket policy refuses writes from a session that has not passed both factors. The login screen gains the code step.
- Admin testing with a real session, every manager and every upload, following the inventory already encoded in `adminWorkflowAuditService.js`: 12 managers with create, read, update, delete and reorder; 9 upload-capable managers with 14 upload checks; contact inbox with a real private attachment opened through a signed link; media library read-only view. Each check is recorded as pass or fixed in `CLAUDE.md`.
- Fixes for what the testing finds, within the existing admin theme. The admin welcome screen stays retired (agent's call: the router already dropped it and the owner earlier wanted it short or gone).
- Admin smoke test in the browser suite: log in with a test factor in CI is not possible without secrets, so the suite covers the login screen rendering and the redirect of an unauthenticated visitor away from the dashboard.

Exit: every inventory item passes with a real admin session; writes fail without the second factor (verified with a session that has only the first factor); the owner has used the dashboard to make one real content change and seen it on the local site.

### Phase 5: Responsive

- The contract test from Phase 0 is extended to every public route at 375, 768, 1280 and 1440 wide, both themes, and asserts no horizontal overflow, every section heading present, and no console errors. An accessibility scan runs on each page and failures of the serious level block.
- Fix only what the test or the owner's own device check reports. No restyling.

Exit: the suite is green and in CI; the owner has opened the local build on a real phone and a real tablet and found nothing broken.

### Phase 6: Banner

- A `site_settings` key-value table (agent's call) with anonymous read and admin write, holding the banner's enabled flag, text and link. A dismissible top banner, not a modal, reads it; dismissal persists per browser; the admin dashboard gets a switch for it. Default text, editable by the owner: "A new portfolio is on the way. Everything here is current in the meantime."

Exit: banner visible in the local build, dismiss persists across reloads, the admin switch turns it off and on without a rebuild, and the responsive suite still passes.

### Review gate and deploy steps

Used twice: after Phase 2 for the security deploy, and after Phase 6 for the final deploy.

1. Capture the local build with the Phase 0 suite and compare it against the live baseline (after the security deploy, the baseline becomes a fresh capture of the live hardened site). Present the comparison and the screenshots to the owner.
2. Owner reviews and says yes or lists changes. Nothing proceeds on anything less than a yes.
3. Only then: upload the reviewed `build/` including `.htaccess` to Hostinger (into a sibling folder, then swap), purge the cache, confirm the new page and headers are served, and run the live capture again plus the admin login, a contact form submission with an attachment, and a console check. For the security deploy, the key cutover steps in Phase 2 follow this verification.
4. Record the deployed bundle hash in `CLAUDE.md`. The security deploy is fix-forward only; for the final deploy, the security build is the rollback.

### Phase 7: New portfolio

Out of scope here. It will get its own brainstorming conversation and design document once Phases 0 to 6 are closed.

## 8. Decisions already made

By the owner:

- Local review before any Hostinger upload.
- Data scope decided together at the start of Phase 3, not before.
- Email link plus authenticator-app second factor, enforced in the database.
- Key rotation happens in the security phase, not immediately.
- Old repositories are not deleted until the work is finished.
- Both skill sets are used: superpowers for the design and plan discipline, compound engineering for the plan and its review.
- A security deploy after Phase 2, behind the same local review, so the leaked key dies early rather than after Phase 6.
- The phone link is removed from the Contact section.

By the agent, open to override:

- GitHub Actions as the CI runner, Playwright for browser tests, one gating job.
- One production Supabase project, no staging project.
- Key rotation through the newer publishable and secret keys with legacy keys disabled, falling back to a JWT secret rotation.
- CI browser tests run on recorded fixtures with analytics off; only local runs touch the live project.
- `.htaccess` lives in the repository under `public/` with a CI check that its policy matches the page's.
- Layout comparison rather than pixel comparison for screenshots.
- Admin welcome screen stays retired.
- Banner state lives in a `site_settings` table rather than an environment variable, so the owner can switch it without a rebuild.
- Legacy `admin_users` columns are dropped rather than left in place.
- Postgres upgrade belongs to Phase 2 rather than a later phase.

## 9. Left to the builder

- File layout for scripts and tests, as long as names are descriptive and public-facing names follow the naming rule.
- Exact new column names for projects and the seed script's parsing approach for the catalogue.
- How the MFA enrolment screen looks within the current admin theme.
- Which accessibility checker to use and the exact list of blocking rule levels.
- Order of tasks inside each phase, provided the exit condition holds and the key rotation stays last in Phase 2.
