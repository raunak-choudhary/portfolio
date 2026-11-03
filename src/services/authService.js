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

/**
 * Message shown after every login request, whether or not the address is an
 * admin. The login screen must not confirm which addresses are admins, so an
 * unknown address gets the same reply as a real send.
 */
export const LOGIN_LINK_SENT_MESSAGE =
  'If this address belongs to the portfolio admin, a login link is on its way. Check your email.';

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
 * Requests a magic-link email for the admin.
 *
 * Account creation is off: only an address that already has a Supabase Auth
 * account receives a link. Project sign-ups are disabled in the dashboard as
 * well, so this is defence in depth rather than the only barrier.
 *
 * Note that the raw auth endpoint still answers differently for unknown
 * addresses (HTTP 422) and anyone calling it directly can tell them apart.
 * That is accepted: sign-ups are closed and admin writes require a second
 * factor, so knowing the admin's address gains an attacker nothing.
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

    if (error && !isUnknownAccountError(error)) {
      return {
        success: false,
        error: authError('OTP_REQUEST_FAILED', error.message, error)
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
  const code = params.get('error_code');
  const description = params.get('error_description');
  if (!code && !description && !params.get('error')) return null;
  if (code === 'otp_expired') {
    return 'This login link has expired or was already used. Request a new one below.';
  }
  return description ? description.replace(/\+/g, ' ') : 'The login link could not be used. Request a new one below.';
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
  readAuthErrorFromUrl,
  hasSecondFactorSession,
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
