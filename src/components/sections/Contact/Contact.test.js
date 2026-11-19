// Contact section engagement tracking: the "Prefer Other Channels?" links
// and the contact form record reach_out events. The tracking service and
// the email service are mocked; nothing leaves the test.

import Contact from './Contact';
import ContactForm from './ContactForm';
import visitorTracking from '../../../services/visitorTrackingService';
import { sendContactEmail } from '../../../services/emailService';
import { React, act, click, mount, setInputValue } from '../../admin/SkyBackground/testUtils';

jest.mock('../../../services/visitorTrackingService', () => ({
  __esModule: true,
  default: {
    useTimeTracking: () => ({ startTracking: () => {}, stopTracking: () => {} }),
    trackSectionView: jest.fn(),
    trackContactSubmission: jest.fn().mockResolvedValue(undefined),
    trackReachOut: jest.fn().mockResolvedValue(undefined)
  }
}));

jest.mock('../../../services/emailService', () => ({
  sendContactEmail: jest.fn()
}));

let view;
const originalScrollIntoView = Element.prototype.scrollIntoView;

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
  // jsdom has no layout; the form scrolls to messages after submit.
  Element.prototype.scrollIntoView = jest.fn();
});

afterEach(() => {
  view.unmount();
  Element.prototype.scrollIntoView = originalScrollIntoView;
  jest.restoreAllMocks();
});

/** Clicks without letting jsdom attempt the navigation. */
const follow = (link) => {
  link.addEventListener('click', (e) => e.preventDefault(), { once: true });
  click(link);
};

describe('Contact section links', () => {
  beforeEach(() => {
    view = mount(<Contact />);
  });

  it('records a LinkedIn reach_out from the contact section', () => {
    follow(view.container.querySelector('.contact-links a.linkedin'));
    expect(visitorTracking.trackReachOut).toHaveBeenCalledWith('linkedin', 'contact');
  });

  it('records an email reach_out from the contact section', () => {
    follow(view.container.querySelector('.contact-links a.email'));
    expect(visitorTracking.trackReachOut).toHaveBeenCalledWith('email', 'contact');
  });
});

describe('ContactForm', () => {
  beforeEach(() => {
    view = mount(<ContactForm />);
  });

  const field = (id) => view.container.querySelector(`#${id}`);

  const fillValidForm = () => {
    setInputValue(field('name'), 'Test Visitor');
    setInputValue(field('email'), 'visitor@example.com');
    setInputValue(field('organization'), 'Example Labs');
    click(view.container.querySelector('input[name="role"][value="recruiter"]'));
    const select = field('inquiryType');
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(select, 'full-time-opportunity');
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    setInputValue(field('subject'), 'A role on our team');
    setInputValue(field('message'), 'We would like to talk about a backend role next month.');
  };

  const submit = async () => {
    await act(async () => {
      view.container.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
  };

  it('records the legacy form_submission and a contact_form reach_out after a successful send', async () => {
    sendContactEmail.mockResolvedValue({ success: true, data: {} });
    fillValidForm();

    await submit();

    expect(sendContactEmail).toHaveBeenCalledTimes(1);
    expect(visitorTracking.trackContactSubmission).toHaveBeenCalledWith('full-time-opportunity', 'A role on our team');
    expect(visitorTracking.trackReachOut).toHaveBeenCalledTimes(1);
    expect(visitorTracking.trackReachOut).toHaveBeenCalledWith('contact_form', 'contact');
    expect(view.container.querySelector('.success-message')).not.toBeNull();
  });

  it('records nothing when the send fails', async () => {
    sendContactEmail.mockResolvedValue({ success: false, error: 'Failed' });
    fillValidForm();

    await submit();

    expect(visitorTracking.trackContactSubmission).not.toHaveBeenCalled();
    expect(visitorTracking.trackReachOut).not.toHaveBeenCalled();
  });

  it('records nothing when the form does not validate', async () => {
    await submit();

    expect(sendContactEmail).not.toHaveBeenCalled();
    expect(visitorTracking.trackReachOut).not.toHaveBeenCalled();
  });

  it('records a LinkedIn reach_out from the note under the form', () => {
    follow(view.container.querySelector('.form-footer-note a'));
    expect(visitorTracking.trackReachOut).toHaveBeenCalledWith('linkedin', 'contact_form');
  });
});
