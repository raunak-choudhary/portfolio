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

/** Shown when Google returns an account that is not linked to the admin user. */
export const GOOGLE_NOT_ADMIN_MESSAGE = 'That Google account is not the admin.';

/** Shown for any other failed or cancelled Google round trip. */
export const GOOGLE_FAILED_MESSAGE = 'Google sign-in did not finish. Try again, or use an email code.';

/** Shown when the Google redirect cannot even be prepared (offline, client error). */
export const GOOGLE_START_FAILED_MESSAGE = 'Google sign-in could not start. Check the connection and try again.';

/**
 * sessionStorage key set just before the browser leaves for Google. On the
 * way back it tells an error in the URL that came from Google apart from an
 * old email-link error, without adding anything to the redirect URL (which
 * must match the allow-list in the Supabase dashboard exactly).
 */
export const GOOGLE_PENDING_KEY = 'rc-admin-google-pending';

/**
 * Stand-in sent to the alert function for a refused Google account. The
 * address Google returned is never handed to the browser, so there is none
 * to report; the function masks anything without an "@" as "an unreadable
 * address", which keeps its contract unchanged.
 */
export const GOOGLE_ATTEMPT_LABEL = 'google-account';

/** Error codes Supabase puts on the redirect when an OAuth identity has no user and sign-ups are closed. */
const NOT_ADMIN_REDIRECT_CODES = new Set(['signup_disabled', 'user_not_found']);

const readPendingFlag = () => {
  try { return window.sessionStorage.getItem(GOOGLE_PENDING_KEY) === '1'; } catch { return false; }
};

/** True while a Google round trip started from this tab has not yet been handled. */
export const isGoogleReturnPending = () => readPendingFlag();

/** Forgets the Google round trip; called once its result has been shown. */
export const clearGoogleReturn = () => {
  try { window.sessionStorage.removeItem(GOOGLE_PENDING_KEY); } catch { /* storage blocked: nothing to clear */ }
};

/**
 * Builds the address Google sends the browser back to. Always the current
 * origin (localhost in development, the live domain in production), never a
 * hardcoded host, so the same build works wherever it is served.
 */
export const googleReturnUrl = () => {
  const origin = typeof window !== 'undefined' ? window.location?.origin : '';
  return origin ? `${origin}${ADMIN_DASHBOARD_PATH}` : '';
};

/**
 * Starts "Continue with Google". Redirect flow only: supabase-js sends the
 * browser to `<supabase>/auth/v1/authorize?provider=google...`, Supabase talks
 * to Google, and the browser comes back to the dashboard route, which then
 * asks for the authenticator code exactly as after the email code. No Google
 * script is loaded, so the page's `script-src 'self'` policy is unchanged.
 *
 * Supabase links the Google identity to the existing admin user when the
 * verified addresses match; sign-ups are closed, so any other account comes
 * back with an error in the URL (see readLoginReturn).
 *
 * @returns {Promise<{success: boolean, data?: object, error?: object}>}
 */
export const signInWithGoogle = async () => {
  const redirectTo = googleReturnUrl();
  if (!redirectTo) {
    return { success: false, error: authError('GOOGLE_START_FAILED', GOOGLE_START_FAILED_MESSAGE) };
  }
  try { window.sessionStorage.setItem(GOOGLE_PENDING_KEY, '1'); } catch { /* the return still works, only less precisely worded */ }
  try {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo,
        // Always show Google's account chooser, so a browser signed in to a
        // personal account does not silently try that one.
        queryParams: { prompt: 'select_account' }
      }
    });
    if (error) {
      clearGoogleReturn();
      return { success: false, error: authError('GOOGLE_START_FAILED', GOOGLE_START_FAILED_MESSAGE, error) };
    }
    return { success: true, data: { url: data?.url || '' } };
  } catch (error) {
    clearGoogleReturn();
    return { success: false, error: authError('GOOGLE_START_FAILED', GOOGLE_START_FAILED_MESSAGE, error.message) };
  }
};

/**
 * Classifies what a redirect back from Supabase carries, for the login page.
 * Errors arrive in the query (PKCE flow) or the fragment (older links); both
 * are read. Returns null when there is no error. Only fixed sentences come
 * out: the URL is attacker-controllable, so none of its text is ever shown.
 *
 *   kind 'google-not-admin'  the Google account has no admin user (alerts the owner)
 *   kind 'google-failed'     a Google round trip from this tab ended in any other error
 *   kind 'link-failed'       an email-link error, worded as before
 *
 * @param {{search?: string, hash?: string}} where  location parts to read.
 * @param {boolean} googlePending  whether this tab started a Google round trip.
 * @returns {{kind: string, message: string}|null}
 */
export const readLoginReturn = ({ search = '', hash = '' } = {}, googlePending = false) => {
  const params = new URLSearchParams(String(search).replace(/^\?/, ''));
  new URLSearchParams(String(hash).replace(/^#/, '')).forEach((value, key) => params.set(key, value));
  if (!params.get('error') && !params.get('error_code') && !params.get('error_description')) {
    // A code still in the address means the exchange did not produce a
    // session (for example, the round trip finished in another browser).
    return googlePending && params.get('code') ? { kind: 'google-failed', message: GOOGLE_FAILED_MESSAGE } : null;
  }
  if (NOT_ADMIN_REDIRECT_CODES.has(params.get('error_code'))) {
    return { kind: 'google-not-admin', message: GOOGLE_NOT_ADMIN_MESSAGE };
  }
  if (googlePending) return { kind: 'google-failed', message: GOOGLE_FAILED_MESSAGE };
  params.set('error', params.get('error') || 'unspecified');
  return { kind: 'link-failed', message: readAuthErrorFromUrl(`?${params.toString()}`) };
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
 * Reserved start of the server-held TOTP factor's name (see
 * supabase/functions/admin-passkey, which adds a random suffix). Its code is
 * never shown to anyone, so it is kept out of every typed-code list and
 * managed from the Passkeys section. Authenticator apps may not use it.
 */
export const BRIDGE_FACTOR_PREFIX = 'Passkey bridge';

/** True for a name that starts with the reserved prefix, ignoring case and extra spaces. */
export const isReservedFactorName = (name) =>
  String(name ?? '').trim().replace(/\s+/g, ' ').toLowerCase().startsWith(BRIDGE_FACTOR_PREFIX.toLowerCase());

/**
 * Splits TOTP factors into typed authenticators and the passkey bridge.
 * The bridge is identified by the id the admin-passkey function reports.
 * Only when that id is unknown (the function did not answer) does the
 * reserved name prefix stand in; enrolTotp refuses the prefix, so no
 * authenticator app can carry it.
 *   bridgeFactorId  string: the bridge; null: there is no bridge;
 *                   undefined: unknown, fall back to the prefix
 */
export const partitionTotpFactors = (totp, bridgeFactorId) => {
  const isBridge = bridgeFactorId === undefined
    ? (factor) => isReservedFactorName(factor?.friendly_name)
    : (factor) => Boolean(bridgeFactorId) && factor?.id === bridgeFactorId;
  const list = Array.isArray(totp) ? totp : [];
  const verified = list.filter((factor) => factor.status === 'verified');
  return {
    verified: verified.filter((factor) => !isBridge(factor)),
    unverified: list.filter((factor) => factor.status !== 'verified' && !isBridge(factor)),
    bridge: verified.find(isBridge) || null
  };
};

/**
 * Lists the authenticator-app factors on the account, split by state.
 * Supabase keeps a factor as "unverified" until its first code is accepted.
 * `verified` holds only factors whose code a person can type; a verified
 * passkey bridge is reported separately as `bridge`. Pass the bridge factor
 * id from passkeyService.getPasskeyStatus when it is known.
 */
export const listTotpFactors = async ({ bridgeFactorId } = {}) => {
  try {
    const { data, error } = await supabase.auth.mfa.listFactors();
    if (error) return { success: false, error: describeMfaError(error, 'Could not read your authenticators.') };
    const all = Array.isArray(data?.totp) ? data.totp : [];
    // `all` lets a caller that learns the bridge id later split the list again.
    return { success: true, data: { ...partitionTotpFactors(all, bridgeFactorId), all } };
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
  // A bridge factor being set up by the function is unverified for a moment;
  // it carries the reserved name and is left to the function.
  const leftovers = listed.data.unverified.filter((factor) => !isReservedFactorName(factor.friendly_name));
  const results = await Promise.all(
    leftovers.map((factor) => supabase.auth.mfa.unenroll({ factorId: factor.id }))
  );
  const failed = results.find((result) => result.error);
  if (failed) return { success: false, error: describeMfaError(failed.error, 'Could not clean up an unfinished enrolment.') };
  return { success: true, data: { removed: leftovers.length } };
};

/**
 * Starts enrolling an authenticator app. Returns the QR code (an SVG data
 * URL built by Supabase), the setup key for manual entry and the factor id
 * that verifyTotpEnrollment needs. Nothing is active until the first code
 * is accepted.
 */
export const enrollTotp = async (friendlyName = PRIMARY_FACTOR_NAME) => {
  const name = String(friendlyName || '').trim().slice(0, 60) || PRIMARY_FACTOR_NAME;
  if (isReservedFactorName(name)) {
    return {
      success: false,
      error: authError('MFA_NAME_RESERVED', `Names starting with "${BRIDGE_FACTOR_PREFIX}" are reserved for passkey sign-in. Choose another name.`)
    };
  }
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
    // A passkey bridge is a real second factor too: Auth asks for level 2.
    const hasVerifiedFactor = factors.data.verified.length > 0 || Boolean(factors.data.bridge);
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

/**
 * Ends the session in this browser only. Other browsers and devices signed in
 * as the admin stay signed in; signOutEverywhere below ends those too. The
 * scope is stated explicitly because supabase-js defaults to 'global'.
 */
export const signOutAdmin = async () => {
  try {
    const { error } = await supabase.auth.signOut({ scope: 'local' });

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

/** The fixed sentence shown when ending every session did not reach the server. */
export const SIGN_OUT_EVERYWHERE_FAILED_MESSAGE =
  'Could not sign out everywhere. Nothing was changed. Check the connection and try again.';

/**
 * Ends every session of the admin account on every device, this one included
 * (Supabase revokes all refresh tokens of the user). The scope is stated
 * explicitly so the intent survives any change of the library's default.
 * supabase-js keeps the local session when the server call fails for any
 * reason other than an already-dead session, so a failure here means nothing
 * changed and the caller can stay where it is.
 */
export const signOutEverywhere = async () => {
  try {
    const { error } = await supabase.auth.signOut({ scope: 'global' });
    if (error) {
      return { success: false, error: authError('SIGN_OUT_EVERYWHERE_FAILED', SIGN_OUT_EVERYWHERE_FAILED_MESSAGE, error.message) };
    }
    if (typeof window !== 'undefined') {
      try { localStorage.removeItem('admin_analytics_session'); } catch { /* storage unavailable */ }
    }
    return { success: true, data: { scope: 'global' } };
  } catch (error) {
    return { success: false, error: authError('SIGN_OUT_EVERYWHERE_FAILED', SIGN_OUT_EVERYWHERE_FAILED_MESSAGE, error?.message) };
  }
};

/**
 * What can truthfully be said about the current session, for the Security
 * chapter: the assurance level, the authentication methods with the times
 * they were used (from the access token's amr claim, decoded locally by
 * supabase-js), and the access token's lifetime in seconds. Methods that
 * arrive in the plain string form carry no time; their timestamp is null.
 * Never throws; a failure reports { success: false }.
 */
export const getSessionFacts = async () => {
  try {
    const [levels, session] = await Promise.all([
      supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
      supabase.auth.getSession()
    ]);
    if (levels.error || !levels.data) {
      return { success: false, error: authError('SESSION_FACTS_ERROR', 'Could not read this session.') };
    }
    const raw = Array.isArray(levels.data.currentAuthenticationMethods) ? levels.data.currentAuthenticationMethods : [];
    const methods = raw
      .map((entry) => (typeof entry === 'string'
        ? { method: entry, timestamp: null }
        : { method: String(entry?.method || ''), timestamp: Number.isFinite(entry?.timestamp) ? entry.timestamp : null }))
      .filter((entry) => entry.method);
    const expiresIn = Number(session?.data?.session?.expires_in);
    return {
      success: true,
      data: {
        level: levels.data.currentLevel || 'aal1',
        methods,
        expiresIn: Number.isFinite(expiresIn) && expiresIn > 0 ? expiresIn : null
      }
    };
  } catch (error) {
    return { success: false, error: authError('SESSION_FACTS_ERROR', 'Could not read this session.', error?.message) };
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
  readLoginReturn,
  signInWithGoogle,
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
  signOutEverywhere,
  getSessionFacts,
  getCurrentAdmin,
  getCurrentSession,
  verifyAdminSession,
  requireAdminAuth,
  isAuthenticated,
  isAdmin,
  initializeAuth
};

export default authService;
