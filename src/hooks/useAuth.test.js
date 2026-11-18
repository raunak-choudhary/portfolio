/* eslint-disable testing-library/no-container, testing-library/render-result-naming-convention */
// The admin auth state. Covers the sign-out race: the sign-out page loads,
// starts a session check while still signed in, then signs out. The check
// resolves after the sign-out and must not put the session back.

import { useAuth } from './useAuth';
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

const authService = require('../services/authService');

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
});
