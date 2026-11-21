// Hero loading to content: the spinner's wrapper must not be reused as the
// light-rays layer. When React reused that div, Chrome saw one element jump
// from the centred spinner to the full-width rays: a 0.41 layout shift on the
// home page whenever the hero row arrived after first paint (4x CPU, slow
// networks).

import Hero from './Hero';
import { useSupabase } from '../../../hooks/useSupabase';
import { React, mount } from '../../admin/SkyBackground/testUtils';

// react-router 7 ships package exports this Jest cannot resolve; Hero only needs these two hooks.
jest.mock('react-router-dom', () => ({ useNavigate: () => () => {}, useLocation: () => ({ pathname: '/home' }) }));
jest.mock('../../../hooks/useSupabase', () => ({ useSupabase: jest.fn() }));
jest.mock('./Cube3D', () => function Cube3DStub() { return null; });
const mockReachOut = jest.fn();
jest.mock('../../../services/visitorTrackingService', () => {
  const tracking = { startTracking: () => {}, stopTracking: () => {} };
  return { __esModule: true, default: { useTimeTracking: () => tracking, trackSectionView: () => {}, trackReachOut: (...args) => mockReachOut(...args) } };
});

const HERO_ROW = { title: 'Title', subtitle: 'Subtitle', description: 'Description', highlights: ['One'] };
const page = () => <Hero />;

let view;

afterEach(() => {
  view?.unmount();
  useSupabase.mockReset();
});

it('mounts the light rays as a new element instead of reusing the spinner wrapper', () => {
  useSupabase.mockReturnValue({ data: null, loading: true });
  view = mount(page());
  const loadingWrapper = view.container.querySelector('.hero-section').firstElementChild;
  expect(view.container.textContent).toContain('Loading hero content...');

  useSupabase.mockReturnValue({ data: HERO_ROW, loading: false });
  view.rerender(page());
  const rays = view.container.querySelector('.hero-light-rays');

  expect(rays).not.toBeNull();
  expect(rays).not.toBe(loadingWrapper);
  expect(loadingWrapper.isConnected).toBe(false);
  expect(view.container.querySelector('.hero-title').textContent).toBe('Title');
});

describe('the second hero button', () => {
  const PROJECT = 'https://abcproject.supabase.co';
  const RESUME = `${PROJECT}/storage/v1/object/public/documents/resume/raunak-choudhary-resume-1.pdf`;
  const saved = process.env.REACT_APP_SUPABASE_URL;
  beforeEach(() => { process.env.REACT_APP_SUPABASE_URL = PROJECT; mockReachOut.mockClear(); });
  afterAll(() => { if (saved === undefined) delete process.env.REACT_APP_SUPABASE_URL; else process.env.REACT_APP_SUPABASE_URL = saved; });

  const secondButton = () => view.container.querySelector('.hero-actions').children[1];

  it('is Resume, opening the uploaded PDF in a new tab, when there is one', () => {
    useSupabase.mockReturnValue({ data: { ...HERO_ROW, resume_url: RESUME }, loading: false });
    view = mount(page());
    const link = secondButton();
    expect(link.tagName).toBe('A');
    expect(link.textContent).toBe('Resume');
    expect(link.getAttribute('href')).toBe(RESUME);
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toBe('noopener noreferrer');
  });

  it('counts a resume open as a reach-out from the hero', () => {
    useSupabase.mockReturnValue({ data: { ...HERO_ROW, resume_url: RESUME }, loading: false });
    view = mount(page());
    secondButton().addEventListener('click', (e) => e.preventDefault());   // jsdom cannot open tabs
    secondButton().click();
    expect(mockReachOut).toHaveBeenCalledWith('resume', 'hero');
  });

  it.each([
    ['no resume uploaded', null],
    ['a link that is not the portfolio\'s own PDF', 'https://example.com/cv.pdf'],
  ])('stays Contact Me with %s', (_label, resumeUrl) => {
    useSupabase.mockReturnValue({ data: { ...HERO_ROW, resume_url: resumeUrl }, loading: false });
    view = mount(page());
    expect(secondButton().tagName).toBe('BUTTON');
    expect(secondButton().textContent).toBe('Contact Me');
  });
});

describe('when the hero is turned off in the admin', () => {
  it('shows nothing: the database returned no row and no error', () => {
    useSupabase.mockReturnValue({ data: null, loading: false, error: null });
    view = mount(page());
    expect(view.container.querySelector('.hero-section')).toBeNull();
    expect(view.container.textContent).toBe('');
  });

  it('still shows the built-in hero when the read failed, so a network problem never blanks the page', () => {
    useSupabase.mockReturnValue({ data: null, loading: false, error: 'Network error' });
    view = mount(page());
    expect(view.container.querySelector('.hero-title')).not.toBeNull();
  });
});
