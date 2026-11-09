// Unit tests for the two-step login helpers: email code exchange, authenticator
// enrolment and verification, and the assurance state used for routing.

import {
  enrollTotp,
  getAssuranceState,
  isValidOneTimeCode,
  listTotpFactors,
  maskEmail,
  removeUnverifiedFactors,
  sanitizeCodeInput,
  unenrollFactor,
  verifyEmailCode,
  verifyTotpChallenge,
  verifyTotpEnrollment
} from './authService';
import { supabase } from './supabaseClient';

jest.mock('./supabaseClient', () => ({
  supabase: {
    auth: {
      verifyOtp: jest.fn(),
      mfa: {
        listFactors: jest.fn(),
        enroll: jest.fn(),
        challenge: jest.fn(),
        verify: jest.fn(),
        challengeAndVerify: jest.fn(),
        unenroll: jest.fn(),
        getAuthenticatorAssuranceLevel: jest.fn()
      }
    },
    from: jest.fn()
  }
}));

const apiError = (status, code, message = 'error') => ({ status, code, message, name: 'AuthApiError' });
const factor = (id, status, friendly_name = 'Primary authenticator') => ({ id, status, friendly_name, factor_type: 'totp' });

beforeEach(() => jest.clearAllMocks());

describe('code helpers', () => {
  it('accepts exactly six digits', () => {
    expect(isValidOneTimeCode('123456')).toBe(true);
    expect(isValidOneTimeCode('12345')).toBe(false);
    expect(isValidOneTimeCode('1234567')).toBe(false);
    expect(isValidOneTimeCode('12345a')).toBe(false);
    expect(isValidOneTimeCode(null)).toBe(false);
  });

  it('keeps only digits from pasted input, capped at six', () => {
    expect(sanitizeCodeInput('12 34-56 78')).toBe('123456');
    expect(sanitizeCodeInput('abc')).toBe('');
  });

  it('masks the address but keeps the domain', () => {
    expect(maskEmail('raunakchoudhary17@gmail.com')).toBe('rau•••••@gmail.com');
    expect(maskEmail('ab@x.io')).toBe('a•••••@x.io');
    expect(maskEmail('not an email')).toBe('');
  });
});

describe('verifyEmailCode', () => {
  it('exchanges a valid code for a session with the normalised address', async () => {
    supabase.auth.verifyOtp.mockResolvedValue({ data: { session: { access_token: 't' } }, error: null });
    const result = await verifyEmailCode(' Admin@Example.com', '123456');
    expect(supabase.auth.verifyOtp).toHaveBeenCalledWith({ email: 'admin@example.com', token: '123456', type: 'email' });
    expect(result.success).toBe(true);
  });

  it('refuses malformed codes without calling the server', async () => {
    const result = await verifyEmailCode('admin@example.com', '12ab');
    expect(result).toMatchObject({ success: false, error: { code: 'INVALID_CODE' } });
    expect(supabase.auth.verifyOtp).not.toHaveBeenCalled();
  });

  it('gives one fixed sentence for a wrong or expired code and another when rate limited', async () => {
    supabase.auth.verifyOtp.mockResolvedValueOnce({ data: {}, error: apiError(403, 'otp_expired', 'Token has expired or is invalid') });
    expect((await verifyEmailCode('a@b.co', '000000')).error.code).toBe('CODE_REJECTED');
    supabase.auth.verifyOtp.mockResolvedValueOnce({ data: {}, error: apiError(429, 'over_request_rate_limit') });
    expect((await verifyEmailCode('a@b.co', '000000')).error.code).toBe('CODE_RATE_LIMITED');
  });

  it('treats an accepted code with no session as a failure', async () => {
    supabase.auth.verifyOtp.mockResolvedValue({ data: { session: null }, error: null });
    expect((await verifyEmailCode('a@b.co', '123456')).error.code).toBe('NO_SESSION_AFTER_CODE');
  });
});

describe('authenticator factors', () => {
  it('lists verified and unverified factors separately', async () => {
    supabase.auth.mfa.listFactors.mockResolvedValue({
      data: { totp: [factor('f1', 'verified'), factor('f2', 'unverified', 'Backup')], all: [] },
      error: null
    });
    const result = await listTotpFactors();
    expect(result.data.verified.map((f) => f.id)).toEqual(['f1']);
    expect(result.data.unverified.map((f) => f.id)).toEqual(['f2']);
  });

  it('removes only unverified factors during cleanup', async () => {
    supabase.auth.mfa.listFactors.mockResolvedValue({
      data: { totp: [factor('keep', 'verified'), factor('drop', 'unverified')] },
      error: null
    });
    supabase.auth.mfa.unenroll.mockResolvedValue({ data: {}, error: null });
    const result = await removeUnverifiedFactors();
    expect(supabase.auth.mfa.unenroll).toHaveBeenCalledTimes(1);
    expect(supabase.auth.mfa.unenroll).toHaveBeenCalledWith({ factorId: 'drop' });
    expect(result.data.removed).toBe(1);
  });

  it('starts an enrolment and returns the QR, secret and factor id', async () => {
    supabase.auth.mfa.enroll.mockResolvedValue({
      data: { id: 'f9', totp: { qr_code: 'data:image/svg+xml;utf-8,<svg/>', secret: 'JBSWY3DP', uri: 'otpauth://x' } },
      error: null
    });
    const result = await enrollTotp('  Backup phone  ');
    expect(supabase.auth.mfa.enroll).toHaveBeenCalledWith({ factorType: 'totp', friendlyName: 'Backup phone' });
    expect(result.data).toEqual({ factorId: 'f9', friendlyName: 'Backup phone', qrCode: 'data:image/svg+xml;utf-8,<svg/>', secret: 'JBSWY3DP', uri: 'otpauth://x' });
  });

  it('explains a friendly-name conflict in plain words', async () => {
    supabase.auth.mfa.enroll.mockResolvedValue({ data: null, error: apiError(422, 'mfa_factor_name_conflict') });
    expect((await enrollTotp('Primary authenticator')).error.code).toBe('MFA_NAME_CONFLICT');
  });

  it('confirms an enrolment with a challenge then a verify', async () => {
    supabase.auth.mfa.challenge.mockResolvedValue({ data: { id: 'c1' }, error: null });
    supabase.auth.mfa.verify.mockResolvedValue({ data: {}, error: null });
    const result = await verifyTotpEnrollment('f9', '654321');
    expect(supabase.auth.mfa.verify).toHaveBeenCalledWith({ factorId: 'f9', challengeId: 'c1', code: '654321' });
    expect(result.success).toBe(true);
  });

  it('maps a wrong authenticator code and a rate limit to fixed sentences', async () => {
    supabase.auth.mfa.challengeAndVerify.mockResolvedValueOnce({ data: null, error: apiError(422, 'mfa_verification_failed') });
    expect((await verifyTotpChallenge('f1', '111111')).error.code).toBe('MFA_CODE_REJECTED');
    supabase.auth.mfa.challengeAndVerify.mockResolvedValueOnce({ data: null, error: apiError(429, 'over_request_rate_limit') });
    expect((await verifyTotpChallenge('f1', '111111')).error.code).toBe('MFA_RATE_LIMITED');
  });

  it('refuses to verify or remove without a factor id or a valid code', async () => {
    expect((await verifyTotpChallenge('', '123456')).error.code).toBe('INVALID_CODE');
    expect((await verifyTotpEnrollment('f1', '12')).error.code).toBe('INVALID_CODE');
    expect((await unenrollFactor('')).error.code).toBe('INVALID_FACTOR');
    expect(supabase.auth.mfa.challengeAndVerify).not.toHaveBeenCalled();
  });
});

describe('getAssuranceState', () => {
  const levels = (currentLevel, nextLevel = currentLevel) => ({ data: { currentLevel, nextLevel }, error: null });
  const factors = (list) => ({ data: { totp: list }, error: null });

  it('asks for enrolment when no verified factor exists', async () => {
    supabase.auth.mfa.getAuthenticatorAssuranceLevel.mockResolvedValue(levels('aal1'));
    supabase.auth.mfa.listFactors.mockResolvedValue(factors([factor('f2', 'unverified')]));
    expect(await getAssuranceState()).toMatchObject({ hasVerifiedFactor: false, needsEnrollment: true, needsSecondFactor: false });
  });

  it('asks for the authenticator code when a factor exists and the session is at level 1', async () => {
    supabase.auth.mfa.getAuthenticatorAssuranceLevel.mockResolvedValue(levels('aal1', 'aal2'));
    supabase.auth.mfa.listFactors.mockResolvedValue(factors([factor('f1', 'verified')]));
    expect(await getAssuranceState()).toMatchObject({ hasVerifiedFactor: true, needsSecondFactor: true, needsEnrollment: false });
  });

  it('is satisfied at level 2 with a verified factor', async () => {
    supabase.auth.mfa.getAuthenticatorAssuranceLevel.mockResolvedValue(levels('aal2'));
    supabase.auth.mfa.listFactors.mockResolvedValue(factors([factor('f1', 'verified')]));
    expect(await getAssuranceState()).toMatchObject({ currentLevel: 'aal2', needsSecondFactor: false, needsEnrollment: false });
  });

  it('falls back to the most restrictive state when a check fails or throws', async () => {
    supabase.auth.mfa.getAuthenticatorAssuranceLevel.mockResolvedValue({ data: null, error: apiError(500, 'x') });
    supabase.auth.mfa.listFactors.mockResolvedValue(factors([factor('f1', 'verified')]));
    expect(await getAssuranceState()).toMatchObject({ needsEnrollment: true, hasVerifiedFactor: false });
    supabase.auth.mfa.getAuthenticatorAssuranceLevel.mockRejectedValue(new Error('offline'));
    expect(await getAssuranceState()).toMatchObject({ needsEnrollment: true });
  });
});
