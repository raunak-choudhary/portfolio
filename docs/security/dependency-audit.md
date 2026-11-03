# Dependency audit

Last run: 2026-11-03 (`npm audit`, npm 10, lockfile v3).

## Policy

- Fix direct dependencies by upgrading within their current major.
- Never run `npm audit fix --force`: for this project it proposes `react-scripts@0.0.0`, which removes the build toolchain.
- Transitive findings are fixed with `overrides` only when a patched version exists that react-scripts 5 still works with. Otherwise they are recorded here with the reason, and re-checked at every phase.

## Result

| Scope | Findings | Action |
|---|---|---|
| Runtime bundle (react, react-dom, react-router, supabase-js) | react-router < 7.18 (high) | fixed: react-router-dom upgraded to 7.18.5 |
| react-scripts 5.0.1 toolchain (webpack 5 dev server, jest 27, eslint 8, workbox 6, svgo 1, postcss 7 via resolve-url-loader) | 97 findings: 4 critical, 28 high, 53 moderate, 12 low | recorded, not fixed |

## Why the toolchain findings are accepted

- None of the affected packages ship in the production bundle. The deployed site is static HTML, CSS and one JavaScript bundle; `npm ls --omit=dev --depth=0` lists only the five runtime packages, and `scripts/scan-bundle.mjs` runs on every build.
- The findings are reachable only on a developer machine during `npm start`, `npm test` or `npm run build`, with input the developer controls.
- react-scripts 5.0.1 is the last release of Create React App and pins these majors. The patched majors (svgo 2, postcss 8 for every loader, webpack-dev-server 5, jest 29) are not compatible with it, so an override would break the build or the tests.
- The real fix is leaving Create React App, which is Phase 7 (the new portfolio build).

## Re-check

Run `npm audit` and compare against the table above at the start of each phase. A new finding in the runtime scope is fixed before the phase continues; a new toolchain finding is added to this file.
