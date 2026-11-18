/* eslint-disable testing-library/no-container, testing-library/render-result-naming-convention */
// Step 01 of the login: Continue with Google, the return from Google, and the
// quiet email-code fallback. Rendered into jsdom with the shared sky helpers;
// the router hooks and the auth context are mocked.

import { ThemeProvider } from '../../../contexts/ThemeContext';
import {
  GOOGLE_FAILED_MESSAGE,
  GOOGLE_NOT_ADMIN_MESSAGE,
  GOOGLE_PENDING_KEY,
  GOOGLE_START_FAILED_MESSAGE,
  LOGIN_LINK_SENT_MESSAGE,
  NOT_ADMIN_EMAIL_MESSAGE
} from '../../../services/authService';
import AdminLogin from './AdminLogin';
import { React, act, click, mount, setInputValue, stubCanvas } from '../SkyBackground/testUtils';

const mockNavigate = jest.fn();
let mockLocation;
// react-router 7 ships package exports that this Jest cannot resolve; the page only needs two hooks.
jest.mock('react-router-dom', () => ({ useNavigate: () => mockNavigate, useLocation: () => mockLocation }));

let mockAuth;
jest.mock('../../../contexts/AuthContext', () => ({ useAuthContext: () => mockAuth }));

jest.mock('../../../services/supabaseClient', () => ({ supabase: {} }));
jest.mock('../../../services/authService', () => ({
  ...jest.requireActual('../../../services/authService'),
  signInWithGoogle: jest.fn(),
  verifyEmailCode: jest.fn(),
  reportUnknownLoginAttempt: jest.fn()
}));
const { signInWithGoogle, verifyEmailCode, reportUnknownLoginAttempt } = jest.requireMock('../../../services/authService');

const NOW = new Date('2026-11-18T02:14:00Z');
const flush = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });

const render = () => mount(
  <ThemeProvider>
    <AdminLogin now={NOW} />
  </ThemeProvider>
);

const stepStates = (container) => Array.from(container.querySelectorAll('.preflight-step'))
  .map((step) => `${step.dataset.step}:${step.className.replace(/.*preflight-step--/, '')}`);
const buttonByText = (container, text) => Array.from(container.querySelectorAll('button')).find((b) => b.textContent.includes(text));

describe('AdminLogin (pre-flight step 01)', () => {
  let canvas;

  beforeEach(() => {
    canvas = stubCanvas();
    window.matchMedia = () => ({ matches: false });
    window.sessionStorage.clear();
    mockNavigate.mockClear();
    mockLocation = { pathname: '/adminlogin', search: '', hash: '', state: null };
    mockAuth = {
      clearError: jest.fn(),
      isAuthenticated: false,
      isSigningIn: false,
      sessionChecked: true,
      signIn: jest.fn().mockResolvedValue({ success: true, data: { message: LOGIN_LINK_SENT_MESSAGE } })
    };
    signInWithGoogle.mockResolvedValue({ success: true, data: { url: 'https://project.supabase.test/auth/v1/authorize?provider=google' } });
    verifyEmailCode.mockResolvedValue({ success: true, data: { session: {} } });
    reportUnknownLoginAttempt.mockResolvedValue(undefined);
  });

  afterEach(() => { canvas.restore(); });

  it('opens on 01 Identity with Continue with Google as the main action', () => {
    const view = render();
    expect(stepStates(view.container)).toEqual(['identity:current', 'second:pending', 'launch:pending']);
    expect(view.container.querySelector('[aria-current="step"]').dataset.step).toBe('identity');
    const google = view.container.querySelector('.preflight-google');
    expect(google.textContent).toBe('Continue with Google');
    expect(google.querySelector('svg path[fill="#4285F4"]')).not.toBeNull();
    expect(view.container.querySelector('.preflight-wordmark').textContent).toContain('RC');
    expect(view.container.querySelector('.preflight-readout').textContent).toContain('NEW YORK 21:14 EST');
    expect(view.container.querySelector('[role="alert"]')).toBeNull();
    view.unmount();
  });

  it('starts the Google redirect and keeps the button busy while the browser leaves', async () => {
    const view = render();
    click(view.container.querySelector('.preflight-google'));
    await flush();
    expect(signInWithGoogle).toHaveBeenCalledTimes(1);
    const google = view.container.querySelector('.preflight-google');
    expect(google.disabled).toBe(true);
    expect(google.textContent).toContain('Opening Google...');
    view.unmount();
  });

  it('shows a fixed sentence when the redirect cannot start, and lets the owner try again', async () => {
    signInWithGoogle.mockResolvedValue({ success: false, error: { code: 'GOOGLE_START_FAILED', message: GOOGLE_START_FAILED_MESSAGE } });
    const view = render();
    click(view.container.querySelector('.preflight-google'));
    await flush();
    expect(view.container.querySelector('[role="alert"]').textContent).toBe(GOOGLE_START_FAILED_MESSAGE);
    expect(view.container.querySelector('.preflight-google').disabled).toBe(false);
    view.unmount();
  });

  it('names a refused Google account once, alerts the owner and cleans the address', async () => {
    window.sessionStorage.setItem(GOOGLE_PENDING_KEY, '1');
    mockLocation = {
      pathname: '/adminlogin',
      search: '',
      hash: '',
      state: { returnUrl: { search: '?error=access_denied&error_code=signup_disabled&error_description=Visit+evil.example', hash: '' } }
    };
    const view = render();
    await flush();
    const alert = view.container.querySelector('[role="alert"]');
    expect(alert.textContent).toBe(GOOGLE_NOT_ADMIN_MESSAGE);
    expect(alert.querySelector('svg')).not.toBeNull(); // icon and words, never colour alone
    expect(view.container.textContent).not.toContain('evil');
    expect(reportUnknownLoginAttempt).toHaveBeenCalledTimes(1);
    expect(reportUnknownLoginAttempt).toHaveBeenCalledWith('google-account');
    expect(mockNavigate).toHaveBeenCalledWith('/adminlogin', { replace: true, state: null });
    expect(window.sessionStorage.getItem(GOOGLE_PENDING_KEY)).toBeNull();
    view.unmount();
  });

  it('reads an error left directly on the login address and gives other Google failures one sentence without an alert', async () => {
    window.sessionStorage.setItem(GOOGLE_PENDING_KEY, '1');
    mockLocation = { pathname: '/adminlogin', search: '?error=access_denied', hash: '', state: null };
    const view = render();
    await flush();
    expect(view.container.querySelector('[role="alert"]').textContent).toBe(GOOGLE_FAILED_MESSAGE);
    expect(reportUnknownLoginAttempt).not.toHaveBeenCalled();
    expect(mockNavigate).toHaveBeenCalledWith('/adminlogin', { replace: true, state: null });
    view.unmount();
  });

  it('leaves a clean address alone', async () => {
    const view = render();
    await flush();
    expect(mockNavigate).not.toHaveBeenCalled();
    view.unmount();
  });

  it('falls back to an email code: address, then a masked, autofill-ready code field', async () => {
    const view = render();
    click(buttonByText(view.container, 'Use an email code instead'));
    const emailInput = view.container.querySelector('#admin-email');
    expect(document.activeElement).toBe(emailInput);
    expect(view.container.querySelector('[aria-current="step"]').dataset.step).toBe('identity');

    setInputValue(emailInput, 'raunak@example.com');
    await act(async () => { emailInput.form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
    await flush();

    expect(mockAuth.signIn).toHaveBeenCalledWith('raunak@example.com');
    expect(view.container.querySelector('[role="status"]').textContent).toBe(LOGIN_LINK_SENT_MESSAGE);
    expect(view.container.querySelector('.preflight-hint').textContent).toContain('rau•••••@example.com');
    const code = view.container.querySelector('#admin-email-code');
    expect(code.getAttribute('autocomplete')).toBe('one-time-code');
    expect(code.getAttribute('inputmode')).toBe('numeric');
    expect(code.type).toBe('password');
    click(view.container.querySelector('.preflight-field__reveal'));
    expect(code.type).toBe('text');
    expect(buttonByText(view.container, 'Resend in').disabled).toBe(true);

    setInputValue(code, '12a3456');
    expect(code.value).toBe('123456');
    await act(async () => { code.form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
    await flush();
    expect(verifyEmailCode).toHaveBeenCalledWith('raunak@example.com', '123456');
    expect(view.container.querySelector('[role="status"]').textContent).toBe('Code accepted. Opening the admin area...');
    view.unmount();
  });

  it('keeps the email path messages: an empty address and a non-admin address', async () => {
    mockAuth.signIn.mockResolvedValue({ success: false, error: { code: 'NOT_ADMIN_EMAIL', message: NOT_ADMIN_EMAIL_MESSAGE } });
    const view = render();
    click(buttonByText(view.container, 'Use an email code instead'));
    const emailInput = view.container.querySelector('#admin-email');
    await act(async () => { emailInput.form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
    expect(view.container.querySelector('[role="alert"]').textContent).toBe('Enter your admin email address.');

    setInputValue(emailInput, 'someone@example.com');
    await act(async () => { emailInput.form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
    await flush();
    expect(view.container.querySelector('[role="alert"]').textContent).toBe(NOT_ADMIN_EMAIL_MESSAGE);
    expect(view.container.querySelector('#admin-email')).not.toBeNull();

    click(buttonByText(view.container, 'Back to Google sign-in'));
    expect(view.container.querySelector('.preflight-google')).not.toBeNull();
    expect(view.container.querySelector('[role="alert"]')).toBeNull();
    view.unmount();
  });

  it('moves straight on when a session already exists', () => {
    mockAuth.isAuthenticated = true;
    const view = render();
    expect(mockNavigate).toHaveBeenCalledWith('/admindashboard', { replace: true });
    view.unmount();
  });
});
