// The About section follows the admin's "Show the about section to visitors"
// switch: with it off, the database returns no row to visitors and the
// section is hidden. Before, the page fell back to old built-in text, so the
// switch did the opposite of what it says.

import About from './About';
import { useSupabase } from '../../../hooks/useSupabase';
import { mount } from '../../admin/SkyBackground/testUtils';

jest.mock('../../../hooks/useSupabase', () => ({ useSupabase: jest.fn() }));
jest.mock('../../../services/visitorTrackingService', () => {
  const tracking = { startTracking: () => {}, stopTracking: () => {} };
  return { __esModule: true, default: { useTimeTracking: () => tracking, trackSectionView: () => {}, trackClick: () => {} } };
});

let view;
afterEach(() => { view?.unmount(); useSupabase.mockReset(); });

it('is hidden when the database returns no row (turned off in the admin)', () => {
  useSupabase.mockReturnValue({ data: null, loading: false, error: null });
  view = mount(<About />);
  expect(view.container.querySelector('#about')).toBeNull();
});

it('falls back to the built-in text when the read failed', () => {
  useSupabase.mockReturnValue({ data: null, loading: false, error: 'Network error' });
  view = mount(<About />);
  expect(view.container.querySelector('#about')).not.toBeNull();
});

it('shows the saved row', () => {
  useSupabase.mockReturnValue({ data: { about_me_title: 'TEST- About me', about_me_content: 'TEST- Content', basic_info: [] }, loading: false, error: null });
  view = mount(<About />);
  expect(view.container.textContent).toContain('TEST- About me');
});
