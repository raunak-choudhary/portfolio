// e2e/support/site-map.mjs
//
// The pages, widths and themes the browser suite covers, plus the public
// tables the site reads. Shared by the contract tests, the capture run and
// the fixture recorder so all three agree on scope.

/** Public routes, keyed by the short name used in capture file names. */
export const PUBLIC_ROUTES = Object.freeze([
  { name: 'home', path: '/home' },
  { name: 'projects', path: '/projects' },
  { name: 'skills', path: '/skills' },
  { name: 'certifications', path: '/certifications' },
  { name: 'work-experience', path: '/work-experience' },
  { name: 'education', path: '/education' },
  { name: 'internships', path: '/internships' },
  { name: 'achievements', path: '/achievements' },
  { name: 'leadership', path: '/leadership' },
  { name: 'recommendations', path: '/recommendations' },
]);

/** The admin login page, rendered without a session. */
export const ADMIN_LOGIN_ROUTE = Object.freeze({ name: 'adminlogin', path: '/adminlogin' });

/** Viewport widths from the responsive contract (375 phone, 768 tablet, 1280 laptop, 1440 desktop). */
export const VIEWPORTS = Object.freeze([
  { width: 375, height: 812, isMobile: true },
  { width: 768, height: 1024, isMobile: false },
  { width: 1280, height: 800, isMobile: false },
  { width: 1440, height: 900, isMobile: false },
]);

/** Theme values stored by ThemeContext under the `portfolio-theme` key. */
export const THEMES = Object.freeze(['dark', 'light']);

/**
 * Tables the public site reads with the anonymous key. The fixture recorder
 * snapshots exactly these; any other table a page requests in fixture mode
 * fails the test as unexpected.
 */
export const PUBLIC_TABLES = Object.freeze([
  'hero_content',
  'about_content',
  'projects',
  'internships',
  'education',
  'work_experience',
  'skills',
  'certifications',
  'recommendations',
  'achievements',
  'leadership',
]);

/**
 * Screenshots taken by a capture run. Names match the 2026-11-02 live
 * baseline so the two folders can be compared file for file.
 */
export const CAPTURE_SHOTS = Object.freeze([
  ...PUBLIC_ROUTES.map((route) => ({ name: `${route.name}-dark-1440`, path: route.path, width: 1440, theme: 'dark' })),
  { name: 'home-cube-expanded-1440', path: '/home', width: 1440, theme: 'dark', expandCube: true },
  { name: 'home-light-1440', path: '/home', width: 1440, theme: 'light' },
  { name: 'projects-light-1440', path: '/projects', width: 1440, theme: 'light' },
  { name: 'home-dark-375', path: '/home', width: 375, theme: 'dark' },
  { name: 'projects-dark-375', path: '/projects', width: 375, theme: 'dark' },
  { name: 'skills-dark-375', path: '/skills', width: 375, theme: 'dark' },
  { name: 'home-dark-768', path: '/home', width: 768, theme: 'dark' },
  { name: 'projects-dark-768', path: '/projects', width: 768, theme: 'dark' },
  { name: 'adminlogin-1440', path: '/adminlogin', width: 1440, theme: 'dark' },
]);

/** Height used for a viewport width when a shot does not specify one. */
export const heightForWidth = (width) => VIEWPORTS.find((v) => v.width === width)?.height ?? 900;
