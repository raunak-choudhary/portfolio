// src/utils/homeSection.js
//
// Moving to a section of the home page (hero, about, the Explore Portfolio
// grid, contact) from anywhere on the public site. The home page lives at
// /home; "/" only redirects there. The hero and the footer used to treat "/"
// as the home page, so from /home they navigated to "/", the redirect dropped
// the #section, the page reloaded, and a fixed 300 ms timer then tried to
// scroll before the section existed: nothing moved for seconds, or the page
// stopped short of the contact form. This waits for the section instead.

export const HOME_PATH = '/home';

/** True on the home page, under either of its addresses. */
export const isHomePath = (pathname = '') => ['/', '/home', '/home/'].includes(pathname);

/**
 * Calls `found(element)` once the element with `id` exists, checking each
 * frame for up to `timeoutMs`. With `stableFrames`, it also waits until the
 * element's place on the page has not moved for that many frames in a row
 * (sections above it still loading push it down). On timeout it calls
 * `found` with whatever it has, so a slow page still ends at the section.
 * Returns a function that stops waiting.
 */
export function whenElementExists(id, found, { timeoutMs = 4000, stableFrames = 0, doc = document, raf = window.requestAnimationFrame.bind(window), now = () => Date.now() } = {}) {
  const started = now();
  let stopped = false;
  let lastTop = null;
  let still = 0;
  const check = () => {
    if (stopped) return;
    const element = doc.getElementById(id);
    const timedOut = now() - started >= timeoutMs;
    if (element) {
      const top = element.getBoundingClientRect().top + (doc.defaultView?.scrollY || 0);
      still = top === lastTop ? still + 1 : 0;
      lastTop = top;
      if (still >= stableFrames || timedOut) { found(element); return; }
    }
    if (!timedOut) raf(check);
  };
  check();
  return () => { stopped = true; };
}

/**
 * Scrolls to a home-page section, navigating to /home first when needed, and
 * leaves the address as /home#section (or /home for the hero) so it can be
 * shared and the header shows the right item as active.
 *
 * @param {string} sectionId 'hero' for the top of the page, otherwise an element id
 * @param {{ pathname: string, navigate: Function }} router
 */
export function goToHomeSection(sectionId, { pathname, navigate }) {
  const target = sectionId === 'hero' ? HOME_PATH : `${HOME_PATH}#${sectionId}`;
  const fromAnotherPage = !isHomePath(pathname);
  if (fromAnotherPage || `${window.location.pathname}${window.location.hash}` !== target) navigate(target);
  if (sectionId === 'hero') {
    // From another page, a smooth scroll starts on the old page and stops
    // partway when the home page replaces it (seen at 768px: 304px short of
    // the top), so jump there instead. On the home page, glide.
    const behavior = fromAnotherPage ? 'auto' : 'smooth';
    window.requestAnimationFrame(() => window.scrollTo({ top: 0, behavior }));
    return () => {};
  }
  // On the home page the section is already laid out: glide to it. From
  // another page the sections above it are still loading and push it down
  // while a smooth scroll runs, which then stops short (Contact ended 735 px
  // down the screen at 375 px). So wait until it stops moving, then jump.
  if (!fromAnotherPage) {
    return whenElementExists(sectionId, (element) => element.scrollIntoView({ behavior: 'smooth' }));
  }
  return whenElementExists(sectionId, (element) => element.scrollIntoView({ behavior: 'auto' }), { stableFrames: 12 });
}
