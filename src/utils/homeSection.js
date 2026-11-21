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
 * frame for up to `timeoutMs`. Returns a function that stops waiting.
 */
export function whenElementExists(id, found, { timeoutMs = 4000, doc = document, raf = window.requestAnimationFrame.bind(window), now = () => Date.now() } = {}) {
  const started = now();
  let stopped = false;
  const check = () => {
    if (stopped) return;
    const element = doc.getElementById(id);
    if (element) { found(element); return; }
    if (now() - started < timeoutMs) raf(check);
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
  if (!isHomePath(pathname) || `${window.location.pathname}${window.location.hash}` !== target) navigate(target);
  if (sectionId === 'hero') {
    window.requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
    return () => {};
  }
  // after a navigation the section may still be loading, so wait for it
  return whenElementExists(sectionId, (element) => element.scrollIntoView({ behavior: 'smooth' }));
}
