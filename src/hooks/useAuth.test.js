/* eslint-disable testing-library/no-container, testing-library/render-result-naming-convention */
// The admin auth state. Covers the sign-out race: the sign-out page loads,
// starts a session check while still signed in, then signs out. The check
// resolves after the sign-out and must not put the session back.

import { RECHECK_DELAYS_MS, useAuth } from './useAuth';
import { React, act, mount } from '../components/admin/SkyBackground/testUtils';

jest.mock('../services/authService', () => ({
  getAssuranceState: jest.fn(),
  requestAdminLoginOtp: jest.fn(),
  signOutAdmin: jest.fn(),
  verifyAdminSession: jest.fn()
}));

let mockAuthListener;
jest.mock('../services/supabaseClient', () => ({
  supabase: {
    auth: {
      onAuthStateChange: (listener) => {
        mockAuthListener = listener;
        return { data: { subscription: { unsubscribe: () => {} } } };
      }
    }
  }
}));

// The sign-in entry is the activity service's job; here only the call is checked.
jest.mock('../services/activityService', () => ({ noteSecondFactorSignIn: jest.fn() }));

const authService = require('../services/authService');
const activityService = require('../services/activityService');

const flush = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });

/** Renders the hook and exposes its latest value. */
function harness() {
  const latest = { current: null };
  const Probe = () => { latest.current = useAuth(); return null; };
  const view = mount(<Probe />);
  return { latest, view };
}

const signedIn = { success: true, data: { user: { email: 'owner@example.test' } } };
const level2 = { currentLevel: 'aal2', checked: true, needsSecondFactor: false, needsEnrollment: false };

describe('useAuth', () => {
  beforeEach(() => {
    authService.getAssuranceState.mockResolvedValue(level2);
    authService.signOutAdmin.mockResolvedValue({ success: true });
    activityService.noteSecondFactorSignIn.mockReset().mockResolvedValue(true);
  });

  it('reads a stored session as signed in', async () => {
    authService.verifyAdminSession.mockResolvedValue(signedIn);
    const { latest, view } = harness();
    await flush();
    expect(latest.current.isAuthenticated).toBe(true);
    view.unmount();
  });

  it('a check that started before a sign-out cannot restore the session', async () => {
    let finishCheck;
    authService.verifyAdminSession.mockImplementation(() => new Promise((resolve) => { finishCheck = resolve; }));
    const { latest, view } = harness();

    // the sign-out lands while the first check is still waiting on the server
    act(() => mockAuthListener('SIGNED_OUT', null));
    await flush();
    expect(latest.current.isAuthenticated).toBe(false);

    // the old check now answers "signed in"; it must be ignored
    await act(async () => { finishCheck(signedIn); });
    await flush();
    expect(latest.current.isAuthenticated).toBe(false);
    expect(latest.current.sessionChecked).toBe(true);
    view.unmount();
  });

  it('signOut leaves the state signed out even if a check is in flight', async () => {
    let finishCheck;
    authService.verifyAdminSession.mockImplementation(() => new Promise((resolve) => { finishCheck = resolve; }));
    const { latest, view } = harness();

    await act(async () => { await latest.current.signOut(); });
    await act(async () => { finishCheck(signedIn); });
    await flush();
    expect(authService.signOutAdmin).toHaveBeenCalledTimes(1);
    expect(latest.current.isAuthenticated).toBe(false);
    view.unmount();
  });

  describe('sign-in activity entry', () => {
    it('asks for the sign-in entry when a check finds level 2', async () => {
      authService.verifyAdminSession.mockResolvedValue(signedIn);
      const { view } = harness();
      await flush();
      expect(activityService.noteSecondFactorSignIn).toHaveBeenCalled();
      view.unmount();
    });

    it('asks again after refreshAssurance reaches level 2 (code step, enrolment)', async () => {
      authService.verifyAdminSession.mockResolvedValue(signedIn);
      authService.getAssuranceState.mockResolvedValue({ ...level2, currentLevel: 'aal1', needsSecondFactor: true });
      const { latest, view } = harness();
      await flush();
      expect(activityService.noteSecondFactorSignIn).not.toHaveBeenCalled();
      authService.getAssuranceState.mockResolvedValue(level2);
      await act(async () => { await latest.current.refreshAssurance(); });
      expect(activityService.noteSecondFactorSignIn).toHaveBeenCalledTimes(1);
      view.unmount();
    });

    it('a failing log never changes the auth state', async () => {
      authService.verifyAdminSession.mockResolvedValue(signedIn);
      activityService.noteSecondFactorSignIn.mockReturnValue(new Promise(() => {}));
      const { latest, view } = harness();
      await flush();
      expect(latest.current.isAuthenticated).toBe(true);
      expect(latest.current.assurance.currentLevel).toBe('aal2');
      view.unmount();
    });
  });

  describe('a check that gets no answer', () => {
    const unavailable = { success: false, error: { code: 'SESSION_CHECK_UNAVAILABLE', message: 'no answer' } };

    it('keeps a signed-in admin signed in and asks again, instead of signing the screen out', async () => {
      jest.useFakeTimers();
      try {
        const tick = () => act(async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); });
        authService.verifyAdminSession.mockResolvedValue(signedIn);
        const { latest, view } = harness();
        await tick();
        expect(latest.current.isAuthenticated).toBe(true);

        // the tab comes back while the laptop is still offline: auth-js announces the session, the check fails
        authService.verifyAdminSession.mockResolvedValue(unavailable);
        act(() => { mockAuthListener('SIGNED_IN', {}); });
        await tick();
        expect(latest.current.isAuthenticated).toBe(true);
        expect(latest.current.assurance).toEqual(level2);
        expect(latest.current.error).toBeNull();

        // the re-check runs by itself once the wait is over, and succeeds
        const calls = authService.verifyAdminSession.mock.calls.length;
        authService.verifyAdminSession.mockResolvedValue(signedIn);
        await act(async () => { jest.advanceTimersByTime(RECHECK_DELAYS_MS[0] + 10); for (let i = 0; i < 10; i++) await Promise.resolve(); });
        expect(authService.verifyAdminSession.mock.calls.length).toBe(calls + 1);
        expect(latest.current.isAuthenticated).toBe(true);
        view.unmount();
      } finally { jest.useRealTimers(); }
    });

    it('re-checks at once when the connection comes back', async () => {
      authService.verifyAdminSession.mockResolvedValue(signedIn);
      const { latest, view } = harness();
      await flush();
      authService.verifyAdminSession.mockResolvedValue(unavailable);
      act(() => { mockAuthListener('TOKEN_REFRESHED', {}); });
      await flush();
      const calls = authService.verifyAdminSession.mock.calls.length;
      authService.verifyAdminSession.mockResolvedValue(signedIn);
      act(() => { window.dispatchEvent(new Event('online')); });
      await flush();
      expect(authService.verifyAdminSession.mock.calls.length).toBe(calls + 1);
      expect(latest.current.isAuthenticated).toBe(true);
      view.unmount();
    });

    it('starts no re-check timer when an unanswered check resolves after the hook is gone', async () => {
      jest.useFakeTimers();
      try {
        const tick = () => act(async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); });
        authService.verifyAdminSession.mockResolvedValue(signedIn);
        const { view } = harness();
        await tick();
        // a check is in flight when the hook unmounts, and comes back unanswered afterwards
        let answer;
        authService.verifyAdminSession.mockReturnValue(new Promise((resolve) => { answer = resolve; }));
        act(() => { mockAuthListener('SIGNED_IN', {}); });
        view.unmount();
        const calls = authService.verifyAdminSession.mock.calls.length;
        answer(unavailable);
        await tick();
        await act(async () => { jest.advanceTimersByTime(RECHECK_DELAYS_MS[RECHECK_DELAYS_MS.length - 1] * 10); for (let i = 0; i < 10; i++) await Promise.resolve(); });
        expect(authService.verifyAdminSession.mock.calls.length).toBe(calls);
      } finally { jest.useRealTimers(); }
    });

    it('still signs out on a real refusal', async () => {
      authService.verifyAdminSession.mockResolvedValue(signedIn);
      const { latest, view } = harness();
      await flush();
      authService.verifyAdminSession.mockResolvedValue({ success: false, error: { code: 'NOT_ADMIN', message: 'no' } });
      act(() => { mockAuthListener('SIGNED_IN', {}); });
      await flush();
      expect(latest.current.isAuthenticated).toBe(false);
      expect(latest.current.error.code).toBe('NOT_ADMIN');
      view.unmount();
    });

    it('keeps the held factor state when the level cannot be read', async () => {
      authService.verifyAdminSession.mockResolvedValue(signedIn);
      const { latest, view } = harness();
      await flush();
      authService.getAssuranceState.mockResolvedValue({ currentLevel: 'aal1', needsEnrollment: true, needsSecondFactor: false, checked: true, unknown: true, levelUnknown: true });
      act(() => { mockAuthListener('SIGNED_IN', {}); });
      await flush();
      expect(latest.current.assurance).toEqual(level2);       // not locked to "set up an authenticator"
      await act(async () => { await latest.current.refreshAssurance(); });
      expect(latest.current.assurance).toEqual(level2);
      view.unmount();
    });
  });

  it('a sign-out that could not clear the session does not claim to be signed out', async () => {
    authService.verifyAdminSession.mockResolvedValue(signedIn);
    const { latest, view } = harness();
    await flush();
    authService.signOutAdmin.mockResolvedValue({ success: false, error: { code: 'SIGN_OUT_FAILED', message: 'x' } });
    await act(async () => { await latest.current.signOut(); });
    expect(latest.current.isAuthenticated).toBe(true);
    expect(latest.current.error.code).toBe('SIGN_OUT_FAILED');
    view.unmount();
  });
});
