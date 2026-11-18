// Tests for "Continue with Google": starting the redirect and reading what
// comes back. The Supabase client is mocked; CRA's Jest resets mocks before
// every test, so behaviour is given in beforeEach.

import {
  GOOGLE_ATTEMPT_LABEL,
  GOOGLE_FAILED_MESSAGE,
  GOOGLE_NOT_ADMIN_MESSAGE,
  GOOGLE_PENDING_KEY,
  GOOGLE_START_FAILED_MESSAGE,
  clearGoogleReturn,
  googleReturnUrl,
  isGoogleReturnPending,
  readLoginReturn,
  reportUnknownLoginAttempt,
  signInWithGoogle
} from './authService';
import { supabase } from './supabaseClient';

jest.mock('./supabaseClient', () => ({
  supabase: {
    auth: { signInWithOAuth: jest.fn() },
    functions: { invoke: jest.fn() }
  }
}));

const ORIGIN = 'http://localhost:4192';

describe('signInWithGoogle', () => {
  let originalLocation;

  beforeEach(() => {
    originalLocation = window.location;
    delete window.location;
    window.location = { origin: ORIGIN };
    window.sessionStorage.clear();
    supabase.auth.signInWithOAuth.mockResolvedValue({ data: { provider: 'google', url: 'https://x.supabase.co/auth/v1/authorize?provider=google' }, error: null });
  });

  afterEach(() => {
    window.location = originalLocation;
  });

  it('asks Supabase for the Google redirect back to the dashboard on the current origin', async () => {
    const result = await signInWithGoogle();

    expect(result.success).toBe(true);
    expect(supabase.auth.signInWithOAuth).toHaveBeenCalledWith({
      provider: 'google',
      options: {
        redirectTo: `${ORIGIN}/admindashboard`,
        queryParams: { prompt: 'select_account' }
      }
    });
  });

  it('builds the return address from whatever origin serves the page', () => {
    window.location = { origin: 'https://www.example.test' };
    expect(googleReturnUrl()).toBe('https://www.example.test/admindashboard');
  });

  it('marks the round trip as pending so the return can be read precisely', async () => {
    await signInWithGoogle();
    expect(window.sessionStorage.getItem(GOOGLE_PENDING_KEY)).toBe('1');
    expect(isGoogleReturnPending()).toBe(true);
    clearGoogleReturn();
    expect(isGoogleReturnPending()).toBe(false);
  });

  it('returns a fixed sentence and clears the mark when Supabase refuses to start', async () => {
    supabase.auth.signInWithOAuth.mockResolvedValue({ data: null, error: { message: 'provider is not enabled', status: 400 } });

    const result = await signInWithGoogle();

    expect(result).toEqual(expect.objectContaining({ success: false }));
    expect(result.error.message).toBe(GOOGLE_START_FAILED_MESSAGE);
    expect(isGoogleReturnPending()).toBe(false);
  });

  it('survives a thrown client error the same way', async () => {
    supabase.auth.signInWithOAuth.mockRejectedValue(new Error('offline'));

    const result = await signInWithGoogle();

    expect(result.error.code).toBe('GOOGLE_START_FAILED');
    expect(isGoogleReturnPending()).toBe(false);
  });

  it('refuses to start without an origin rather than guessing a host', async () => {
    window.location = {};

    const result = await signInWithGoogle();

    expect(result.success).toBe(false);
    expect(supabase.auth.signInWithOAuth).not.toHaveBeenCalled();
  });
});

describe('readLoginReturn', () => {
  it('returns null when the address carries no error', () => {
    expect(readLoginReturn({ search: '', hash: '' }, true)).toBeNull();
    expect(readLoginReturn({ search: '?code=abc' }, false)).toBeNull();
    expect(readLoginReturn()).toBeNull();
  });

  it('names a Google account that is not the admin (PKCE errors arrive in the query)', () => {
    const where = { search: '?error=access_denied&error_code=signup_disabled&error_description=Signups+not+allowed+for+this+instance' };
    expect(readLoginReturn(where, true)).toEqual({ kind: 'google-not-admin', message: GOOGLE_NOT_ADMIN_MESSAGE });
  });

  it('reads the fragment too, for the implicit flow', () => {
    expect(readLoginReturn({ hash: '#error=server_error&error_code=signup_disabled' }, false).kind).toBe('google-not-admin');
  });

  it('treats a Google code that did not become a session as a failed round trip', () => {
    expect(readLoginReturn({ search: '?code=abc' }, true)).toEqual({ kind: 'google-failed', message: GOOGLE_FAILED_MESSAGE });
  });

  it('gives any other failed Google round trip one fixed sentence', () => {
    const result = readLoginReturn({ search: '?error=access_denied&error_description=The+user+cancelled' }, true);
    expect(result).toEqual({ kind: 'google-failed', message: GOOGLE_FAILED_MESSAGE });
  });

  it('never echoes text from the URL', () => {
    const hostile = '?error=x&error_code=signup_disabled&error_description=Call+%2B1+555+now';
    const pendingResult = readLoginReturn({ search: '?error=x&error_description=Visit+evil.example' }, true);
    expect(JSON.stringify(readLoginReturn({ search: hostile }, true))).not.toMatch(/555|Call/);
    expect(pendingResult.message).not.toMatch(/evil/);
  });

  it('keeps the old email-link wording when no Google round trip is pending', () => {
    expect(readLoginReturn({ hash: '#error=access_denied&error_code=otp_expired' }, false)).toEqual({
      kind: 'link-failed',
      message: 'This login link has expired or was already used. Request a new one below.'
    });
    expect(readLoginReturn({ search: '?error_description=odd' }, false).message)
      .toBe('The login link could not be used. Request a new one below.');
  });
});

describe('reportUnknownLoginAttempt for Google', () => {
  beforeEach(() => {
    supabase.functions.invoke.mockResolvedValue({ data: null, error: null });
  });

  it('reuses the alert function with a label instead of an address', async () => {
    await reportUnknownLoginAttempt(GOOGLE_ATTEMPT_LABEL);
    expect(supabase.functions.invoke).toHaveBeenCalledWith('admin-login-alert', { body: { attemptedEmail: 'google-account' } });
  });
});
