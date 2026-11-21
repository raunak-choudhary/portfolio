/* eslint-disable testing-library/no-container, testing-library/render-result-naming-convention */
// Tests for the chapter heading's "View on site" link: where it points, that
// it opens a new tab without handing the admin window to the public page, and
// that admin-only chapters show nothing.

import ViewOnSiteLink from './ViewOnSiteLink';
import { chapterById } from './chapters';
import { React, mount } from '../SkyBackground/testUtils';

describe('ViewOnSiteLink', () => {
  it('opens the chapter\'s public page in a new tab on the same origin', () => {
    const view = mount(<ViewOnSiteLink chapter={chapterById('projects')} />);
    const link = view.container.querySelector('a');
    expect(link.getAttribute('href')).toBe('/projects');
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toBe('noopener noreferrer');
    expect(link.getAttribute('aria-label')).toBe('View Projects on the live site (opens in a new tab)');
    expect(link.textContent).toBe('View on site');
    expect(link.querySelector('svg').getAttribute('aria-hidden')).toBe('true');
    view.unmount();
  });

  it('links the about chapter to its section on the landing page', () => {
    const view = mount(<ViewOnSiteLink chapter={chapterById('about')} />);
    expect(view.container.querySelector('a').getAttribute('href')).toBe('/home#about');
    view.unmount();
  });

  it('renders nothing for a chapter with no public page', () => {
    const view = mount(<ViewOnSiteLink chapter={chapterById('analytics')} />);
    expect(view.container.innerHTML).toBe('');
    view.unmount();
  });
});
