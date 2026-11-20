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
jest.mock('../../../services/visitorTrackingService', () => {
  const tracking = { startTracking: () => {}, stopTracking: () => {} };
  return { __esModule: true, default: { useTimeTracking: () => tracking, trackSectionView: () => {} } };
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
