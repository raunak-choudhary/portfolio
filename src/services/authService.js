// src/services/authService.js - Supabase Auth based admin security

import { supabase } from './supabaseClient';

const ADMIN_DASHBOARD_PATH = '/admindashboard';

const normalizeEmail = (email) => String(email || '').trim().toLowerCase();

const getRedirectUrl = () => {
  const origin = typeof window !== 'undefined' && window.location?.origin
    ? window.location.origin
    : 'https://www.raunakchoudhary.com';

  return `${origin}${ADMIN_DASHBOARD_PATH}`;
};

const authError = (code, message, details = null) => ({
  code,
  message,
  details
});

/** Message shown once the code email has been sent to the admin address. */
export const LOGIN_LINK_SENT_MESSAGE = 'A six-digit code is on its way to your inbox.';

/**
 * Message shown for any other address. Owner decision 2026-11-09: the admin
 * address is already published on the site's Contact section, so naming it
 * here reveals nothing, and a clear message is more useful to the owner.
 */
export const NOT_ADMIN_EMAIL_MESSAGE = 'That is not the admin email address.';

/** Edge Function that emails the owner when another address is tried. */
export const LOGIN_ALERT_FUNCTION = 'admin-login-alert';

/** Length of every one-time code the login accepts (email code and authenticator code). */
export const ONE_TIME_CODE_LENGTH = 6;

/** Seconds the login page waits before offering to resend the email code. */
export const RESEND_COOLDOWN_SECONDS = 60;

/** Friendly name used for the owner's first authenticator; a backup gets its own name. */
export const PRIMARY_FACTOR_NAME = 'Primary authenticator';

/** True for exactly six ASCII digits, the only shape a code can have. */
export const isValidOneTimeCode = (value) => /^[0-9]{6}$/.test(String(value ?? ''));

/** Keeps only the digits of what was typed or pasted, capped at the code length. */
export const sanitizeCodeInput = (value) => String(value ?? '').replace(/\D/g, '').slice(0, ONE_TIME_CODE_LENGTH);

/**
 * Hides most of an address for display on the code step
 * ("raunakchoudhary17@gmail.com" becomes "rau•••••@gmail.com"). The page
 * shows only what the visitor typed themselves, but masking keeps the
 * address off a shoulder-surfer's screen.
 */
export const maskEmail = (email) => {
  const normalized = normalizeEmail(email);
  const at = normalized.indexOf('@');
  if (at <= 0) return '';
  const local = normalized.slice(0, at);
  const visible = local.slice(0, Math.min(3, Math.max(1, local.length - 1)));
  return `${visible}•••••${normalized.slice(at)}`;
};

/** Message shown when Supabase refuses to send another email yet. */
export const LOGIN_RATE_LIMITED_MESSAGE =
  'Too many login emails were requested recently. Wait a minute and try again.';

/**
 * Supabase Auth error codes returned when the address has no account and
 * account creation is off. They must look like success to the caller.
 */
const UNKNOWN_ACCOUNT_ERROR_CODES = new Set(['otp_disabled', 'signup_disabled']);

/** Error codes and statuses that mean the email sender is throttled. */
const RATE_LIMIT_ERROR_CODES = new Set(['over_email_send_rate_limit', 'over_request_rate_limit']);

/** True when a Supabase Auth error means "no such account" rather than a failure. */
export const isUnknownAccountError = (error) =>
  Boolean(error) && (UNKNOWN_ACCOUNT_ERROR_CODES.has(error.code) || error.status === 422);

/** True when a Supabase Auth error means the request was rate limited. */
export const isRateLimitError = (error) =>
  Boolean(error) && (RATE_LIMIT_ERROR_CODES.has(error.code) || error.status === 429);

/**
 * Reports an attempt with a non-admin address so the owner gets an alert
 * email (throttled server-side). Best effort: a failure here never changes
 * what the login page shows, and the function stores nothing personal.
 */
export const reportUnknownLoginAttempt = async (email) => {
  try {
    await supabase.functions.invoke(LOGIN_ALERT_FUNCTION, { body: { attemptedEmail: normalizeEmail(email) } });
  } catch (error) {
    // Deliberately ignored: alerting must never block or expose the login.
  }
};

/**
 * Requests the six-digit login code for the admin.
 *
 * Account creation is off: only the address that already has a Supabase Auth
 * account receives a code. Project sign-ups are disabled in the dashboard as
 * well, so this is defence in depth rather than the only barrier. Any other
 * address is told so and reported to the owner.
 *
 * @param {string} email address typed into the login form.
 * @returns {Promise<{success: boolean, data?: object, error?: object}>}
 */
export const requestAdminLoginOtp = async (email) => {
  const normalizedEmail = normalizeEmail(email);

  if (!normalizedEmail || !normalizedEmail.includes('@')) {
    return {
      success: false,
      error: authError('INVALID_EMAIL', 'Enter a valid admin email address')
    };
  }

  try {
    const { error } = await supabase.auth.signInWithOtp({
      email: normalizedEmail,
      options: {
        shouldCreateUser: false,
        emailRedirectTo: getRedirectUrl()
      }
    });

    if (error && isRateLimitError(error)) {
      return {
        success: false,
        error: authError('OTP_RATE_LIMITED', LOGIN_RATE_LIMITED_MESSAGE, error)
      };
    }

    if (error && isUnknownAccountError(error)) {
      reportUnknownLoginAttempt(normalizedEmail);
      return {
        success: false,
        error: authError('NOT_ADMIN_EMAIL', NOT_ADMIN_EMAIL_MESSAGE, error)
      };
    }

    if (error) {
      return {
        success: false,
        error: authError('OTP_REQUEST_FAILED', 'The code could not be sent. Try again in a moment.', error)
      };
    }

    return {
      success: true,
      data: {
        email: normalizedEmail,
        message: LOGIN_LINK_SENT_MESSAGE
      }
    };
  } catch (error) {
    return {
      success: false,
      error: authError('OTP_REQUEST_ERROR', 'Failed to request admin login link', error.message)
    };
  }
};

/**
 * Turns the error Supabase appends to the redirect URL after a failed magic
 * link (for example `#error=access_denied&error_code=otp_expired`) into a
 * sentence for the login page. Returns null when the URL carries no error.
 *
 * @param {string} fragment `window.location.hash` or `.search`.
 * @returns {string|null}
 */
export const readAuthErrorFromUrl = (fragment) => {
  const params = new URLSearchParams(String(fragment || '').replace(/^[#?]/, ''));
  if (!params.get('error') && !params.get('error_code')) return null;
  // Only fixed sentences: the URL is attacker-controllable, so its free-text
  // description is never shown on the login page.
  if (params.get('error_code') === 'otp_expired') {
    return 'This login link has expired or was already used. Request a new one below.';
  }
  return 'The login link could not be used. Request a new one below.';
};

/**
 * Exchanges the six-digit code from the login email for a session.
 *
 * The code is single use and expires on the server (Supabase Auth setting,
 * kept at 10 minutes). A wrong or stale code gets one fixed sentence; the
 * server's own rate limit decides how many attempts are allowed.
 *
 * @param {string} email the address the code was sent to.
 * @param {string} code  the six digits from the email.
 * @returns {Promise<{success: boolean, data?: object, error?: object}>}
 */
export const verifyEmailCode = async (email, code) => {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail || !isValidOneTimeCode(code)) {
    return { success: false, error: authError('INVALID_CODE', 'Enter the six-digit code from the email.') };
  }
  try {
    const { data, error } = await supabase.auth.verifyOtp({
      email: normalizedEmail,
      token: String(code),
      type: 'email'
    });
    if (error) {
      if (isRateLimitError(error)) {
        return { success: false, error: authError('CODE_RATE_LIMITED', 'Too many attempts. Wait a minute and try again.', error) };
      }
      return {
        success: false,
        error: authError('CODE_REJECTED', 'That code is wrong or has expired. Check the email or request a new code.', error)
      };
    }
    if (!data?.session) {
      return { success: false, error: authError('NO_SESSION_AFTER_CODE', 'The code was accepted but no session was created. Try again.') };
    }
    return { success: true, data: { session: data.session } };
  } catch (error) {
    return { success: false, error: authError('CODE_VERIFY_ERROR', 'Could not verify the code. Try again.', error.message) };
  }
};

/** Shapes a Supabase MFA error into the fixed sentences the screens show. */
const describeMfaError = (error, fallback) => {
  if (isRateLimitError(error)) {
    return authError('MFA_RATE_LIMITED', 'Too many attempts. Wait a minute and try again.', error);
  }
  if (error?.code === 'mfa_factor_name_conflict') {
    return authError('MFA_NAME_CONFLICT', 'An authenticator with that name already exists. Choose another name.', error);
  }
  if (error?.code === 'mfa_verification_failed' || error?.status === 422 || error?.status === 400) {
    return authError('MFA_CODE_REJECTED', 'That code is wrong or has expired. Enter the current code from your app.', error);
  }
  return authError('MFA_ERROR', fallback, error);
};

/**
 * Lists the authenticator-app factors on the account, split by state.
 * Supabase keeps a factor as "unverified" until its first code is accepted.
 */
export const listTotpFactors = async () => {
  try {
    const { data, error } = await supabase.auth.mfa.listFactors();
    if (error) return { success: false, error: describeMfaError(error, 'Could not read your authenticators.') };
    const totp = Array.isArray(data?.totp) ? data.totp : [];
    return {
      success: true,
      data: {
        verified: totp.filter((factor) => factor.status === 'verified'),
        unverified: totp.filter((factor) => factor.status !== 'verified')
      }
    };
  } catch (error) {
    return { success: false, error: authError('MFA_LIST_ERROR', 'Could not read your authenticators.', error.message) };
  }
};

/**
 * Removes factors left behind by an abandoned enrolment, so a new enrolment
 * with the same friendly name does not collide. Only unverified factors are
 * touched; verified ones are removed solely through unenrollFactor.
 */
export const removeUnverifiedFactors = async () => {
  const listed = await listTotpFactors();
  if (!listed.success) return listed;
  const results = await Promise.all(
    listed.data.unverified.map((factor) => supabase.auth.mfa.unenroll({ factorId: factor.id }))
  );
  const failed = results.find((result) => result.error);
  if (failed) return { success: false, error: describeMfaError(failed.error, 'Could not clean up an unfinished enrolment.') };
  return { success: true, data: { removed: listed.data.unverified.length } };
};

/**
 * Starts enrolling an authenticator app. Returns the QR code (an SVG data
 * URL built by Supabase), the setup key for manual entry and the factor id
 * that verifyTotpEnrollment needs. Nothing is active until the first code
 * is accepted.
 */
export const enrollTotp = async (friendlyName = PRIMARY_FACTOR_NAME) => {
  const name = String(friendlyName || '').trim().slice(0, 60) || PRIMARY_FACTOR_NAME;
  try {
    const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: name });
    if (error) return { success: false, error: describeMfaError(error, 'Could not start the enrolment.') };
    return {
      success: true,
      data: {
        factorId: data.id,
        friendlyName: name,
        qrCode: data.totp?.qr_code || '',
        secret: data.totp?.secret || '',
        uri: data.totp?.uri || ''
      }
    };
  } catch (error) {
    return { success: false, error: authError('MFA_ENROLL_ERROR', 'Could not start the enrolment.', error.message) };
  }
};

/**
 * Confirms a new authenticator with its first code. On success Supabase marks
 * the factor verified and upgrades the current session to level 2.
 */
export const verifyTotpEnrollment = async (factorId, code) => {
  if (!factorId || !isValidOneTimeCode(code)) {
    return { success: false, error: authError('INVALID_CODE', 'Enter the six-digit code from your authenticator app.') };
  }
  try {
    const challenge = await supabase.auth.mfa.challenge({ factorId });
    if (challenge.error) return { success: false, error: describeMfaError(challenge.error, 'Could not start the check.') };
    const verified = await supabase.auth.mfa.verify({ factorId, challengeId: challenge.data.id, code: String(code) });
    if (verified.error) return { success: false, error: describeMfaError(verified.error, 'Could not verify the code.') };
    return { success: true, data: { factorId } };
  } catch (error) {
    return { success: false, error: authError('MFA_VERIFY_ERROR', 'Could not verify the code.', error.message) };
  }
};

/**
 * Login step 3: checks an authenticator code against a verified factor and
 * upgrades the session to level 2. Tries the given factor only; the caller
 * picks it from listTotpFactors.
 */
export const verifyTotpChallenge = async (factorId, code) => {
  if (!factorId || !isValidOneTimeCode(code)) {
    return { success: false, error: authError('INVALID_CODE', 'Enter the six-digit code from your authenticator app.') };
  }
  try {
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code: String(code) });
    if (error) return { success: false, error: describeMfaError(error, 'Could not verify the code.') };
    return { success: true, data: { factorId } };
  } catch (error) {
    return { success: false, error: authError('MFA_VERIFY_ERROR', 'Could not verify the code.', error.message) };
  }
};

/** Removes an authenticator. The screen confirms first and warns when it is the last one. */
export const unenrollFactor = async (factorId) => {
  if (!factorId) return { success: false, error: authError('INVALID_FACTOR', 'No authenticator selected.') };
  try {
    const { error } = await supabase.auth.mfa.unenroll({ factorId });
    if (error) return { success: false, error: describeMfaError(error, 'Could not remove the authenticator.') };
    return { success: true, data: { factorId } };
  } catch (error) {
    return { success: false, error: authError('MFA_UNENROLL_ERROR', 'Could not remove the authenticator.', error.message) };
  }
};

/**
 * The session's position in the two-step login, for routing:
 *   currentLevel      'aal1' after the email code, 'aal2' after the authenticator code
 *   hasVerifiedFactor whether an authenticator is enrolled and confirmed
 *   needsSecondFactor an authenticator exists but this session has not used it yet
 *   needsEnrollment   no authenticator exists yet, so the dashboard shows only the setup screen
 * Any failure reads as the most restrictive state.
 */
export const getAssuranceState = async () => {
  const restrictive = {
    currentLevel: 'aal1',
    nextLevel: 'aal1',
    hasVerifiedFactor: false,
    needsSecondFactor: false,
    needsEnrollment: true,
    checked: true
  };
  try {
    const [levels, factors] = await Promise.all([
      supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
      listTotpFactors()
    ]);
    if (levels.error || !factors.success) return restrictive;
    const currentLevel = levels.data?.currentLevel || 'aal1';
    const hasVerifiedFactor = factors.data.verified.length > 0;
    return {
      currentLevel,
      nextLevel: levels.data?.nextLevel || currentLevel,
      hasVerifiedFactor,
      needsSecondFactor: hasVerifiedFactor && currentLevel !== 'aal2',
      needsEnrollment: !hasVerifiedFactor,
      checked: true
    };
  } catch (error) {
    return restrictive;
  }
};

/**
 * Reads whether the current session has passed the second factor.
 *
 * The assurance level lives in the access token, not on the user object;
 * supabase-js decodes it locally without a network call. Any failure counts
 * as "not verified", which is the safe direction.
 *
 * @returns {Promise<boolean>} true only at assurance level 2.
 */
export const hasSecondFactorSession = async () => {
  try {
    const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    return !error && data?.currentLevel === 'aal2';
  } catch (error) {
    return false;
  }
};

export const signInAdmin = async (email) => {
  return requestAdminLoginOtp(email);
};

export const signOutAdmin = async () => {
  try {
    const { error } = await supabase.auth.signOut();

    if (error) {
      return {
        success: false,
        error: authError('SIGN_OUT_FAILED', error.message, error)
      };
    }

    if (typeof window !== 'undefined') {
      localStorage.removeItem('admin_analytics_session');
    }

    return {
      success: true,
      data: {
        message: 'Logged out successfully'
      }
    };
  } catch (error) {
    return {
      success: false,
      error: authError('SIGN_OUT_ERROR', 'Sign out failed', error.message)
    };
  }
};

export const getCurrentAdmin = async () => {
  try {
    const { data, error } = await supabase.auth.getSession();

    if (error || !data?.session?.user) {
      return null;
    }

    const { user, access_token: token, expires_at: expiresAt } = data.session;

    return {
      user: {
        id: user.id,
        email: user.email,
        role: 'admin'
      },
      token,
      expiresAt,
      isAuthenticated: true,
      twoFactorVerified: await hasSecondFactorSession()
    };
  } catch (error) {
    return null;
  }
};

export const getCurrentSession = async () => {
  const { data, error } = await supabase.auth.getSession();

  if (error) {
    return null;
  }

  return data?.session || null;
};

export const verifyAdminSession = async () => {
  try {
    const session = await getCurrentSession();

    if (!session?.user) {
      return {
        success: false,
        error: authError('NO_SESSION', 'No active admin session found')
      };
    }

    const email = normalizeEmail(session.user.email);

    if (!email) {
      return {
        success: false,
        error: authError('NO_ADMIN_EMAIL', 'Admin session is missing an email address')
      };
    }

    const { data: adminUser, error: adminError } = await supabase
      .from('admin_users')
      .select('id,email,is_active')
      .eq('email', email)
      .eq('is_active', true)
      .maybeSingle();

    if (adminError || !adminUser) {
      return {
        success: false,
        error: authError('NOT_ADMIN', 'This account is not authorized for admin access', adminError)
      };
    }

    return {
      success: true,
      data: {
        user: {
          id: session.user.id,
          email,
          role: 'admin'
        },
        adminUser,
        session,
        isValid: true
      }
    };
  } catch (error) {
    return {
      success: false,
      error: authError('SESSION_CHECK_FAILED', 'Failed to verify admin session', error.message)
    };
  }
};

export const requireAdminAuth = async () => {
  return verifyAdminSession();
};

export const isAuthenticated = async () => {
  const session = await getCurrentSession();
  return !!session?.user;
};

export const isAdmin = async () => {
  const result = await verifyAdminSession();
  return result.success;
};

export const initializeAuth = () => {};

const authService = {
  requestAdminLoginOtp,
  reportUnknownLoginAttempt,
  verifyEmailCode,
  readAuthErrorFromUrl,
  hasSecondFactorSession,
  getAssuranceState,
  listTotpFactors,
  enrollTotp,
  verifyTotpEnrollment,
  verifyTotpChallenge,
  unenrollFactor,
  removeUnverifiedFactors,
  signInAdmin,
  signOutAdmin,
  getCurrentAdmin,
  getCurrentSession,
  verifyAdminSession,
  requireAdminAuth,
  isAuthenticated,
  isAdmin,
  initializeAuth
};

export default authService;
