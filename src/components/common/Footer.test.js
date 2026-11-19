// Footer engagement tracking: the LinkedIn icon and the email link record a
// reach_out from the footer, next to the legacy click rows older reports read.
// The tracking service is mocked; its own tests cover the row shapes.

import Footer from './Footer';
import visitorTracking from '../../services/visitorTrackingService';
import { React, click, mount } from '../admin/SkyBackground/testUtils';

// react-router 7 ships package exports this Jest cannot resolve; the footer needs only these.
jest.mock('react-router-dom', () => ({
  Link: ({ to, children, ...rest }) => <a href={to} {...rest}>{children}</a>,
  useLocation: () => ({ pathname: '/' }),
  useNavigate: () => jest.fn()
}));

jest.mock('../../services/visitorTrackingService', () => ({
  __esModule: true,
  default: {
    trackClick: jest.fn(),
    trackReachOut: jest.fn()
  }
}));

let view;

beforeEach(() => {
  jest.clearAllMocks();
  view = mount(<Footer />);
});

afterEach(() => {
  view.unmount();
});

/** Clicks without letting jsdom attempt the navigation. */
const follow = (link) => {
  link.addEventListener('click', (e) => e.preventDefault(), { once: true });
  click(link);
};

describe('Footer tracking', () => {
  it('records a LinkedIn reach_out from the footer and keeps the legacy social click', () => {
    follow(view.container.querySelector('a[aria-label="LinkedIn"]'));

    expect(visitorTracking.trackReachOut).toHaveBeenCalledWith('linkedin', 'footer');
    expect(visitorTracking.trackClick).toHaveBeenCalledWith(
      'social_media', 'linkedin', 'https://www.linkedin.com/in/raunak-choudhary/'
    );
  });

  it('records an email reach_out from the footer and keeps the legacy email click', () => {
    follow(view.container.querySelector('a[href^="mailto:"]'));

    expect(visitorTracking.trackReachOut).toHaveBeenCalledWith('email', 'footer');
    expect(visitorTracking.trackClick).toHaveBeenCalledWith(
      'contact_email', 'footer_email', 'mailto:raunakchoudhary17@gmail.com'
    );
  });

  it.each(['GitHub', 'Instagram'])('does not count the %s icon as a reach-out', (name) => {
    follow(view.container.querySelector(`a[aria-label="${name}"]`));

    expect(visitorTracking.trackClick).toHaveBeenCalledWith('social_media', name.toLowerCase(), expect.any(String));
    expect(visitorTracking.trackReachOut).not.toHaveBeenCalled();
  });
});
