import fs from 'fs';
import path from 'path';
import { CHAPTER_IDS } from './chapters';
import { NO_PUBLIC_PAGE, PUBLIC_PATHS, publicPathFor } from './publicPages';

// The routes and the landing page's section ids are read from the source, so
// the mapping is checked against what the router really serves.
const SRC = path.resolve(__dirname, '../../..');
const read = (file) => fs.readFileSync(path.join(SRC, file), 'utf8');
const routePaths = () => [...read('Router.js').matchAll(/<Route\s+path="([^"]+)"/g)].map((m) => m[1]);
const landingIds = () => [...read('pages/LandingPage.js').matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]);

describe('publicPages', () => {
  it('places every chapter in exactly one list: a public path or no public page', () => {
    CHAPTER_IDS.forEach((id) => {
      const mapped = Object.prototype.hasOwnProperty.call(PUBLIC_PATHS, id);
      expect([id, mapped !== NO_PUBLIC_PAGE.has(id)]).toEqual([id, true]);
    });
  });

  it('names no chapter that the registry does not hold', () => {
    [...Object.keys(PUBLIC_PATHS), ...NO_PUBLIC_PAGE].forEach((id) => expect(CHAPTER_IDS).toContain(id));
  });

  it('maps each chapter to a route the router serves, and each anchor to a section on that page', () => {
    const routes = routePaths();
    expect(routes).toContain('/home');   // guards the parser itself
    const ids = landingIds();
    const entries = Object.entries(PUBLIC_PATHS).map(([id, href]) => [id, ...href.split('#')]);
    entries.forEach(([id, pathname]) => expect([id, routes.includes(pathname)]).toEqual([id, true]));
    // only the landing page has section anchors today, so an anchor must name one of its sections
    const anchored = entries.filter(([, , hash]) => hash);
    expect(anchored.length).toBeGreaterThan(0);
    anchored.forEach(([id, pathname, hash]) => expect([id, pathname, ids.includes(hash)]).toEqual([id, '/home', true]));
  });

  it('keeps every path on the same origin and off the admin routes', () => {
    Object.values(PUBLIC_PATHS).forEach((href) => {
      expect(href.startsWith('/')).toBe(true);
      expect(href.startsWith('//')).toBe(false);
      expect(href).not.toMatch(/^\/admin/);
    });
  });

  it('maps the chapters the owner edits to their pages', () => {
    expect(publicPathFor('hero')).toBe('/home');
    expect(publicPathFor('about')).toBe('/home#about');
    expect(publicPathFor('projects')).toBe('/projects');
    expect(publicPathFor('work')).toBe('/work-experience');
    expect(publicPathFor('skills')).toBe('/skills');
  });

  it('gives no path for admin-only chapters or unknown ids', () => {
    ['earth', 'overview', 'media', 'analytics', 'inbox', 'security', 'nope', 'toString', ''].forEach((id) => expect(publicPathFor(id)).toBeNull());
  });
});
