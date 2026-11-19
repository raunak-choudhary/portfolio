// Project card engagement tracking: flipping a card to its back records a
// project open, and its repository and live-demo links record project links.
// The tracking service is mocked; its own tests cover payloads and de-dup.

import ProjectCard from './ProjectCard';
import visitorTracking from '../../../services/visitorTrackingService';
import { React, act, click, mount } from '../../admin/SkyBackground/testUtils';

jest.mock('../../../services/visitorTrackingService', () => ({
  __esModule: true,
  default: {
    trackProjectOpen: jest.fn(),
    trackProjectLink: jest.fn()
  }
}));

const PROJECT = {
  id: '0526e081-45fe-497f-8c5a-bf063eda5cb6',
  title: 'Feature Flag and A/B Experimentation Platform',
  short_description: 'Flags and experiments.',
  github_urls: [
    'https://github.com/raunak-choudhary/one',
    'github.com/raunak-choudhary/two'
  ],
  live_url: 'https://rex-platform-iota.vercel.app',
  technologies: ['React'],
  key_features: [],
  image_urls: []
};

let view;

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'log').mockImplementation(() => {});
  view = mount(<ProjectCard project={PROJECT} />);
});

afterEach(() => {
  view.unmount();
  jest.restoreAllMocks();
});

const card = () => view.container.querySelector('.project-card-wrapper');

describe('ProjectCard tracking', () => {
  it('records a card open when the card turns to its back, not when it turns back', () => {
    click(card());
    expect(card().className).toContain('flipped');
    expect(visitorTracking.trackProjectOpen).toHaveBeenCalledTimes(1);
    expect(visitorTracking.trackProjectOpen).toHaveBeenCalledWith(PROJECT, 'card');

    click(card());
    expect(card().className).not.toContain('flipped');
    expect(visitorTracking.trackProjectOpen).toHaveBeenCalledTimes(1);
  });

  it('records a card open when the card is flipped from the keyboard', () => {
    act(() => {
      card().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });
    expect(visitorTracking.trackProjectOpen).toHaveBeenCalledWith(PROJECT, 'card');
  });

  it('records the live demo link with its address and does not flip the card', () => {
    const demo = view.container.querySelector('a.demo-btn');
    click(demo);

    expect(visitorTracking.trackProjectLink).toHaveBeenCalledWith(PROJECT, 'demo', 'https://rex-platform-iota.vercel.app');
    expect(visitorTracking.trackProjectOpen).not.toHaveBeenCalled();
    expect(card().className).not.toContain('flipped');
  });

  it('Enter on a focused repository link leaves the card alone so the link opens, and the click is tracked', () => {
    const repo = view.container.querySelector('a.github-url-btn');
    const keydown = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    act(() => {
      repo.dispatchEvent(keydown);
    });

    expect(keydown.defaultPrevented).toBe(false);
    expect(card().className).not.toContain('flipped');
    expect(visitorTracking.trackProjectOpen).not.toHaveBeenCalled();

    // The browser turns Enter on a link into a click; the click is what is tracked.
    click(repo);
    expect(visitorTracking.trackProjectLink).toHaveBeenCalledWith(PROJECT, 'repo', 'https://github.com/raunak-choudhary/one');
    expect(card().className).not.toContain('flipped');
  });

  it('Space on the focused card itself still flips it', () => {
    card().focus();
    act(() => {
      card().dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true }));
    });
    expect(card().className).toContain('flipped');
  });

  it('records each repository link with the full https address it opens', () => {
    const repos = view.container.querySelectorAll('a.github-url-btn');
    expect(repos).toHaveLength(2);

    click(repos[1]);

    expect(visitorTracking.trackProjectLink).toHaveBeenCalledWith(PROJECT, 'repo', 'https://github.com/raunak-choudhary/two');
    expect(repos[1].getAttribute('href')).toBe('https://github.com/raunak-choudhary/two');
  });
});
