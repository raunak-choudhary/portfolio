import {
  LOGIN_LINK_SENT_MESSAGE,
  LOGIN_RATE_LIMITED_MESSAGE,
  getCurrentAdmin,
  hasSecondFactorSession,
  isRateLimitError,
  isUnknownAccountError,
  requireAdminAuth,
  requestAdminLoginOtp,
  signOutAdmin
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
    ])('answers an unknown address (%s) exactly like a real send', async (_label, error) => {
      supabase.auth.signInWithOtp.mockResolvedValue({ error });

      const result = await requestAdminLoginOtp('stranger@example.com');

      expect(result.success).toBe(true);
      expect(result.data.message).toBe(LOGIN_LINK_SENT_MESSAGE);
      expect(JSON.stringify(result)).not.toContain('Signups');
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
      expect(result.error.message).toBe('SMTP down');
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

    it('clears the Supabase Auth session on sign out', async () => {
      supabase.auth.signOut.mockResolvedValue({ error: null });

      const result = await signOutAdmin();

      expect(result.success).toBe(true);
      expect(supabase.auth.signOut).toHaveBeenCalledTimes(1);
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
