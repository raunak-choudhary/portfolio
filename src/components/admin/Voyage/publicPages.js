// src/components/admin/Voyage/publicPages.js
//
// Where each admin chapter can be seen on the public site. A chapter's
// "View on site" link opens this path in a new tab so the owner can check an
// edit live. Paths are relative to the current origin, never a fixed host, so
// the same link works on the deployed site, a preview deploy and localhost.
//
// Every chapter in the registry appears in exactly one of the two lists below.
// The unit test holds that rule, and it checks each path against the routes in
// src/Router.js, so a renamed route or a new chapter cannot slip past quietly.

/**
 * Public path per chapter id. The hero and about sections share the landing
 * page; about is reached through its section anchor, the same one the site
 * header links to.
 * @type {Readonly<Record<string, string>>}
 */
export const PUBLIC_PATHS = Object.freeze({
  hero: '/home',
  about: '/home#about',
  projects: '/projects',
  internships: '/internships',
  education: '/education',
  work: '/work-experience',
  skills: '/skills',
  certifications: '/certifications',
  recommendations: '/recommendations',
  achievements: '/achievements',
  leadership: '/leadership',
});

/**
 * Chapters that only exist inside the admin: the prologue, mission control,
 * the media library, analytics, the inbox and security. They get no link.
 * @type {ReadonlySet<string>}
 */
export const NO_PUBLIC_PAGE = Object.freeze(new Set(['earth', 'overview', 'media', 'analytics', 'inbox', 'security']));

/** The public path for a chapter id, or null when the chapter has no public page. */
export const publicPathFor = (id) => (Object.prototype.hasOwnProperty.call(PUBLIC_PATHS, id) ? PUBLIC_PATHS[id] : null);
