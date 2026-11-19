// Unit tests for the session helpers behind the voyage's Security chapter:
// ending every session (global sign-out) and reading the facts the
// "This session" pane shows.

import { SIGN_OUT_EVERYWHERE_FAILED_MESSAGE, getSessionFacts, signOutEverywhere } from './authService';
import { supabase } from './supabaseClient';

jest.mock('./supabaseClient', () => ({
  supabase: {
    auth: {
      signOut: jest.fn(),
      getSession: jest.fn(),
      mfa: { getAuthenticatorAssuranceLevel: jest.fn() }
    },
    from: jest.fn()
  }
}));

beforeEach(() => {
  jest.clearAllMocks();
  localStorage.clear();
});

describe('signOutEverywhere', () => {
  it('asks Supabase for the global scope and clears the admin analytics marker', async () => {
    supabase.auth.signOut.mockResolvedValue({ error: null });
    localStorage.setItem('admin_analytics_session', 'x');
    const result = await signOutEverywhere();
    expect(supabase.auth.signOut).toHaveBeenCalledWith({ scope: 'global' });
    expect(result).toEqual({ success: true, data: { scope: 'global' } });
    expect(localStorage.getItem('admin_analytics_session')).toBeNull();
  });

  it('reports a refusal with the fixed sentence, never the server text', async () => {
    supabase.auth.signOut.mockResolvedValue({ error: { message: 'upstream exploded', status: 500 } });
    localStorage.setItem('admin_analytics_session', 'x');
    const result = await signOutEverywhere();
    expect(result.success).toBe(false);
    expect(result.error.code).toBe('SIGN_OUT_EVERYWHERE_FAILED');
    expect(result.error.message).toBe(SIGN_OUT_EVERYWHERE_FAILED_MESSAGE);
    // nothing changed, so the marker stays
    expect(localStorage.getItem('admin_analytics_session')).toBe('x');
  });

  it('turns a thrown network error into the same failure', async () => {
    supabase.auth.signOut.mockRejectedValue(new TypeError('Failed to fetch'));
    const result = await signOutEverywhere();
    expect(result.success).toBe(false);
    expect(result.error.message).toBe(SIGN_OUT_EVERYWHERE_FAILED_MESSAGE);
  });
});

describe('getSessionFacts', () => {
  const levels = (data, error = null) => supabase.auth.mfa.getAuthenticatorAssuranceLevel.mockResolvedValue({ data, error });

  it('returns the level, the methods with their times and the token lifetime', async () => {
    levels({ currentLevel: 'aal2', nextLevel: 'aal2', currentAuthenticationMethods: [{ method: 'totp', timestamp: 200 }, { method: 'oauth', timestamp: 100 }] });
    supabase.auth.getSession.mockResolvedValue({ data: { session: { expires_in: 3600 } }, error: null });
    const result = await getSessionFacts();
    expect(result).toEqual({ success: true, data: { level: 'aal2', methods: [{ method: 'totp', timestamp: 200 }, { method: 'oauth', timestamp: 100 }], expiresIn: 3600 } });
  });

  it('accepts the plain string form of amr without inventing times', async () => {
    levels({ currentLevel: 'aal1', currentAuthenticationMethods: ['otp', '', null] });
    supabase.auth.getSession.mockResolvedValue({ data: { session: null }, error: null });
    const result = await getSessionFacts();
    expect(result.data).toEqual({ level: 'aal1', methods: [{ method: 'otp', timestamp: null }], expiresIn: null });
  });

  it('fails when the level cannot be read, and when the library throws', async () => {
    levels(null, { message: 'no' });
    supabase.auth.getSession.mockResolvedValue({ data: { session: null } });
    expect((await getSessionFacts()).success).toBe(false);
    supabase.auth.mfa.getAuthenticatorAssuranceLevel.mockRejectedValue(new Error('boom'));
    expect((await getSessionFacts()).success).toBe(false);
  });
});
