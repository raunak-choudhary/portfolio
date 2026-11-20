import {
  LOGIN_LINK_SENT_MESSAGE,
  LOGIN_RATE_LIMITED_MESSAGE,
  NOT_ADMIN_EMAIL_MESSAGE,
  getCurrentAdmin,
  hasSecondFactorSession,
  isRateLimitError,
  readAuthErrorFromUrl,
  isUnknownAccountError,
  requireAdminAuth,
  requestAdminLoginOtp,
  signOutAdmin,
  forgetLocalSession,
  navigation,
  SESSION_CHECK_UNAVAILABLE
} from './authService';
import { supabase } from './supabaseClient';

jest.mock('./supabaseClient', () => ({
  supabase: {
    auth: {
      getSession: jest.fn(),
      signInWithOtp: jest.fn(),
      signOut: jest.fn(),
      mfa: {
        getAuthenticatorAssuranceLevel: jest.fn()
      }
    },
    functions: { invoke: jest.fn().mockResolvedValue({ data: null, error: null }) },
    from: jest.fn()
  }
}));

/** Shapes a Supabase AuthApiError the way supabase-js returns it. */
const authApiError = (status, code, message = 'error') => ({ status, code, message, name: 'AuthApiError' });

describe('authService secure admin auth', () => {
  let adminQuery;

  beforeEach(() => {
    jest.clearAllMocks();
    delete window.location;
    window.location = { origin: 'https://www.raunakchoudhary.com' };

    adminQuery = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn()
    };
    supabase.from.mockReturnValue(adminQuery);
    supabase.auth.mfa.getAuthenticatorAssuranceLevel.mockResolvedValue({
      data: { currentLevel: 'aal1', nextLevel: 'aal1' },
      error: null
    });
  });

  describe('requestAdminLoginOtp', () => {
    it('requests a magic link without creating an account and normalises the address', async () => {
      supabase.auth.signInWithOtp.mockResolvedValue({ error: null });

      const result = await requestAdminLoginOtp('Admin@Example.com ');

      expect(result).toEqual({
        success: true,
        data: { email: 'admin@example.com', message: LOGIN_LINK_SENT_MESSAGE }
      });
      expect(supabase.auth.signInWithOtp).toHaveBeenCalledWith({
        email: 'admin@example.com',
        options: {
          shouldCreateUser: false,
          emailRedirectTo: 'https://www.raunakchoudhary.com/admindashboard'
        }
      });
    });

    it.each([
      ['HTTP 422 with otp_disabled', authApiError(422, 'otp_disabled', 'Signups not allowed for otp')],
      ['HTTP 422 with signup_disabled', authApiError(422, 'signup_disabled', 'Signups not allowed')],
      ['HTTP 422 with no code', authApiError(422, undefined, 'Unprocessable')]
    ])('refuses a non-admin address (%s) with a fixed sentence and alerts the owner', async (_label, error) => {
      supabase.auth.signInWithOtp.mockResolvedValue({ error });

      const result = await requestAdminLoginOtp('Stranger@Example.com');

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('NOT_ADMIN_EMAIL');
      expect(result.error.message).toBe(NOT_ADMIN_EMAIL_MESSAGE);
      expect(supabase.functions.invoke).toHaveBeenCalledWith('admin-login-alert', {
        body: { attemptedEmail: 'stranger@example.com' }
      });
    });

    it('never alerts for the admin address or for a server failure', async () => {
      supabase.auth.signInWithOtp.mockResolvedValueOnce({ error: null });
      await requestAdminLoginOtp('admin@example.com');
      supabase.auth.signInWithOtp.mockResolvedValueOnce({ error: authApiError(500, 'unexpected_failure', 'SMTP down') });
      await requestAdminLoginOtp('admin@example.com');
      expect(supabase.functions.invoke).not.toHaveBeenCalled();
    });

    it('keeps the login usable when the alert call itself fails', async () => {
      supabase.auth.signInWithOtp.mockResolvedValue({ error: authApiError(422, 'signup_disabled') });
      supabase.functions.invoke.mockRejectedValueOnce(new Error('function offline'));

      const result = await requestAdminLoginOtp('stranger@example.com');

      expect(result.error.code).toBe('NOT_ADMIN_EMAIL');
    });

    it.each([
      ['over_email_send_rate_limit', authApiError(429, 'over_email_send_rate_limit')],
      ['HTTP 429 with no code', authApiError(429, undefined)]
    ])('reports a rate limit (%s) with a friendly wait message', async (_label, error) => {
      supabase.auth.signInWithOtp.mockResolvedValue({ error });

      const result = await requestAdminLoginOtp('admin@example.com');

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('OTP_RATE_LIMITED');
      expect(result.error.message).toBe(LOGIN_RATE_LIMITED_MESSAGE);
    });

    it('surfaces other Supabase errors as a failed request', async () => {
      supabase.auth.signInWithOtp.mockResolvedValue({ error: authApiError(500, 'unexpected_failure', 'SMTP down') });

      const result = await requestAdminLoginOtp('admin@example.com');

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('OTP_REQUEST_FAILED');
      // Server text is never shown; the page gets a fixed sentence.
      expect(result.error.message).toBe('The code could not be sent. Try again in a moment.');
      expect(result.error.details.message).toBe('SMTP down');
    });

    it('returns a generic error when the request throws', async () => {
      supabase.auth.signInWithOtp.mockRejectedValue(new Error('network unreachable'));

      const result = await requestAdminLoginOtp('admin@example.com');

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('OTP_REQUEST_ERROR');
    });

    it.each(['', '   ', 'not-an-email'])('rejects %p before any network call', async (email) => {
      const result = await requestAdminLoginOtp(email);

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('INVALID_EMAIL');
      expect(supabase.auth.signInWithOtp).not.toHaveBeenCalled();
    });
  });

  describe('error classification', () => {
    it('recognises unknown-account and rate-limit errors and nothing else', () => {
      expect(isUnknownAccountError(authApiError(422, 'otp_disabled'))).toBe(true);
      expect(isUnknownAccountError(authApiError(400, 'validation_failed'))).toBe(false);
      expect(isUnknownAccountError(null)).toBe(false);
      expect(isRateLimitError(authApiError(429, 'over_email_send_rate_limit'))).toBe(true);
      expect(isRateLimitError(authApiError(500, 'unexpected_failure'))).toBe(false);
      expect(isRateLimitError(undefined)).toBe(false);
    });
  });

  describe('readAuthErrorFromUrl', () => {
    it('explains a used or expired magic link', () => {
      expect(readAuthErrorFromUrl('#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired'))
        .toBe('This login link has expired or was already used. Request a new one below.');
    });

    it('never shows the free-text description from the URL, only fixed sentences', () => {
      expect(readAuthErrorFromUrl('?error_code=server_error&error_description=Sign+in+at+evil.example'))
        .toBe('The login link could not be used. Request a new one below.');
      expect(readAuthErrorFromUrl('#error=access_denied')).toBe('The login link could not be used. Request a new one below.');
    });

    it('returns null when the URL carries no auth error', () => {
      expect(readAuthErrorFromUrl('')).toBeNull();
      expect(readAuthErrorFromUrl('#access_token=abc&type=magiclink')).toBeNull();
      expect(readAuthErrorFromUrl(undefined)).toBeNull();
    });
  });

  describe('hasSecondFactorSession', () => {
    it('is true only at assurance level 2', async () => {
      supabase.auth.mfa.getAuthenticatorAssuranceLevel.mockResolvedValue({ data: { currentLevel: 'aal2' }, error: null });
      expect(await hasSecondFactorSession()).toBe(true);

      supabase.auth.mfa.getAuthenticatorAssuranceLevel.mockResolvedValue({ data: { currentLevel: 'aal1' }, error: null });
      expect(await hasSecondFactorSession()).toBe(false);
    });

    it('is false when the check errors or throws', async () => {
      supabase.auth.mfa.getAuthenticatorAssuranceLevel.mockResolvedValue({ data: null, error: { message: 'no session' } });
      expect(await hasSecondFactorSession()).toBe(false);

      supabase.auth.mfa.getAuthenticatorAssuranceLevel.mockRejectedValue(new Error('boom'));
      expect(await hasSecondFactorSession()).toBe(false);
    });
  });

  describe('session checks', () => {
    it('rejects protected access when there is no Supabase Auth session', async () => {
      supabase.auth.getSession.mockResolvedValue({ data: { session: null }, error: null });

      const result = await requireAdminAuth();

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('NO_SESSION');
    });

    it('reads a token refresh that never reached the server as unavailable, not as signed out', async () => {
      // auth-js near expiry, offline: getSession tries a refresh, fails, keeps the stored session
      supabase.auth.getSession.mockResolvedValue({ data: { session: null }, error: { name: 'AuthRetryableFetchError', message: 'Failed to fetch', status: 0 } });

      const result = await requireAdminAuth();

      expect(result.success).toBe(false);
      expect(result.error.code).toBe(SESSION_CHECK_UNAVAILABLE);
      expect(supabase.from).not.toHaveBeenCalled();
    });

    it('reads a gateway failure during the refresh as unavailable too', async () => {
      supabase.auth.getSession.mockResolvedValue({ data: { session: null }, error: { name: 'AuthRetryableFetchError', message: 'Bad Gateway', status: 502 } });
      expect((await requireAdminAuth()).error.code).toBe(SESSION_CHECK_UNAVAILABLE);
    });

    it('still reads a refused refresh (a revoked or expired refresh token) as no session', async () => {
      supabase.auth.getSession.mockResolvedValue({ data: { session: null }, error: authApiError(400, 'refresh_token_not_found', 'Invalid Refresh Token') });

      const result = await requireAdminAuth();

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('NO_SESSION');
    });

    it('rejects protected access when the signed-in user is not an active admin', async () => {
      const user = { id: 'user-2', email: 'visitor@example.com' };
      supabase.auth.getSession.mockResolvedValue({ data: { session: { user, access_token: 'token' } }, error: null });
      adminQuery.maybeSingle.mockResolvedValue({ data: null, error: null });

      const result = await requireAdminAuth();

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('NOT_ADMIN');
      expect(supabase.from).toHaveBeenCalledWith('admin_users');
    });

    it('allows protected access when the signed-in email is an active admin', async () => {
      const user = { id: 'user-1', email: 'Admin@Example.com' };
      supabase.auth.getSession.mockResolvedValue({ data: { session: { user, access_token: 'token' } }, error: null });
      adminQuery.maybeSingle.mockResolvedValue({ data: { id: 'admin-1', email: 'admin@example.com', is_active: true }, error: null });

      const result = await requireAdminAuth();

      expect(result.success).toBe(true);
      expect(result.data.user).toEqual({ id: 'user-1', email: 'admin@example.com', role: 'admin' });
      expect(adminQuery.eq).toHaveBeenCalledWith('email', 'admin@example.com');
      expect(adminQuery.eq).toHaveBeenCalledWith('is_active', true);
    });

    it('clears the Supabase Auth session in this browser only on sign out', async () => {
      supabase.auth.signOut.mockResolvedValue({ error: null });
      localStorage.setItem('admin_analytics_session', 'x');

      const result = await signOutAdmin();

      expect(result.success).toBe(true);
      expect(supabase.auth.signOut).toHaveBeenCalledTimes(1);
      expect(supabase.auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
      expect(localStorage.getItem('admin_analytics_session')).toBeNull();
    });

    it('tries a failed sign out once more, then forgets the session on this device', async () => {
      supabase.auth.signOut.mockResolvedValue({ error: { message: 'Failed to fetch' } });
      supabase.auth._removeSession = jest.fn().mockResolvedValue(undefined);
      localStorage.setItem('admin_analytics_session', 'x');
      try {
        const result = await signOutAdmin();
        expect(supabase.auth.signOut).toHaveBeenCalledTimes(2);
        expect(supabase.auth._removeSession).toHaveBeenCalledTimes(1);
        expect(result).toEqual({ success: true, data: expect.objectContaining({ localOnly: true }) });
        expect(localStorage.getItem('admin_analytics_session')).toBeNull();
      } finally { delete supabase.auth._removeSession; }
    });

    it('a second try that works needs no local clean-up', async () => {
      supabase.auth.signOut.mockResolvedValueOnce({ error: { message: 'Failed to fetch' } }).mockResolvedValueOnce({ error: null });
      supabase.auth._removeSession = jest.fn();
      try {
        const result = await signOutAdmin();
        expect(result.success).toBe(true);
        expect(result.data.localOnly).toBeUndefined();
        expect(supabase.auth._removeSession).not.toHaveBeenCalled();
      } finally { delete supabase.auth._removeSession; }
    });

    it('forgetLocalSession removes the stored keys itself when the client has no routine for it, then loads the login afresh', async () => {
      supabase.auth.storageKey = 'sb-test-auth-token';
      localStorage.setItem('sb-test-auth-token', '{}');
      localStorage.setItem('sb-test-auth-token-code-verifier', 'v');
      const toLogin = jest.spyOn(navigation, 'toLogin').mockImplementation(() => {});
      try {
        expect(await forgetLocalSession()).toBe(true);
        expect(localStorage.getItem('sb-test-auth-token')).toBeNull();
        expect(localStorage.getItem('sb-test-auth-token-code-verifier')).toBeNull();
        // no listener heard SIGNED_OUT on this path, so the running page is replaced
        expect(toLogin).toHaveBeenCalledTimes(1);
      } finally { delete supabase.auth.storageKey; toLogin.mockRestore(); }
    });

    it('forgetLocalSession does not reload when the client announces the sign-out itself', async () => {
      supabase.auth._removeSession = jest.fn().mockResolvedValue(undefined);
      const toLogin = jest.spyOn(navigation, 'toLogin').mockImplementation(() => {});
      try {
        expect(await forgetLocalSession()).toBe(true);
        expect(supabase.auth._removeSession).toHaveBeenCalledTimes(1);
        expect(toLogin).not.toHaveBeenCalled();
      } finally { delete supabase.auth._removeSession; toLogin.mockRestore(); }
    });

    it('reads an unanswered admin lookup as unavailable, not as "not the admin"', async () => {
      const user = { id: 'user-1', email: 'admin@example.com' };
      supabase.auth.getSession.mockResolvedValue({ data: { session: { user, access_token: 'token' } }, error: null });
      adminQuery.maybeSingle.mockResolvedValue({ data: null, error: { message: 'TypeError: Failed to fetch' }, status: 0 });
      expect((await requireAdminAuth()).error.code).toBe(SESSION_CHECK_UNAVAILABLE);
      adminQuery.maybeSingle.mockResolvedValue({ data: null, error: { message: 'upstream' }, status: 503 });
      expect((await requireAdminAuth()).error.code).toBe(SESSION_CHECK_UNAVAILABLE);
      // a real answer from the server stays a refusal
      adminQuery.maybeSingle.mockResolvedValue({ data: null, error: { message: 'permission denied' }, status: 403 });
      expect((await requireAdminAuth()).error.code).toBe('NOT_ADMIN');
    });

    it('reports a refused sign out and keeps the caller informed', async () => {
      supabase.auth.signOut.mockResolvedValue({ error: { message: 'network' } });

      const result = await signOutAdmin();

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('SIGN_OUT_FAILED');
      expect(supabase.auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
    });

    it('returns the current admin with the real second-factor state', async () => {
      const user = { id: 'user-1', email: 'admin@example.com' };
      supabase.auth.getSession.mockResolvedValue({ data: { session: { user, access_token: 'token' } }, error: null });
      supabase.auth.mfa.getAuthenticatorAssuranceLevel.mockResolvedValue({ data: { currentLevel: 'aal2' }, error: null });

      const admin = await getCurrentAdmin();

      expect(admin.user).toEqual({ id: 'user-1', email: 'admin@example.com', role: 'admin' });
      expect(admin.isAuthenticated).toBe(true);
      expect(admin.twoFactorVerified).toBe(true);
    });
  });
});
