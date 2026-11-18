// src/services/passkeyService.js
//
// Passkey sign-in for the admin's second step, through the admin-passkey Edge
// Function (the "passkey bridge"; see supabase/functions/admin-passkey). The
// browser runs the WebAuthn ceremony; the function checks it and returns an
// upgraded session, which is adopted here with setSession. No code is typed
// and none reaches the browser.
//
// @simplewebauthn/browser is loaded only when a ceremony starts, so the public
// site's main bundle does not carry it. Every failure becomes one of the
// fixed sentences below; text from the server or the browser is never shown.

import { supabase } from './supabaseClient';

export const PASSKEY_FUNCTION = 'admin-passkey';

/** Longest device label the server accepts. */
export const DEVICE_NAME_MAX = 60;

export const PASSKEY_MESSAGES = {
  cancelled: 'The passkey prompt was closed, or this device has no passkey for the admin. Try again, or enter a code.',
  unsupported: 'This browser cannot use passkeys. Enter a code instead.',
  noPasskey: 'No passkey is registered for this site yet. Enter a code, then add this device on the Security screen.',
  alreadyRegistered: 'This device already has a passkey for the admin.',
  rateLimited: 'Too many passkey attempts. Enter a code instead, or wait a few minutes and try again.',
  sessionExpired: 'Your session has expired. Sign in again.',
  notSwitchedOn: "Passkey sign-in isn't switched on yet.",
  network: 'Could not reach the passkey service. Check the connection, or enter a code.',
  challenge: 'That passkey request expired. Try again.',
  verification: 'The passkey could not be verified. Try again, or enter a code.',
  bridgeMissing: 'Passkey sign-in needs setting up again. Enter a code, then add this device on the Security screen.',
  tryAgain: 'The passkey worked but the sign-in did not finish. Try again in a few seconds.',
  needsSecondFactor: 'Confirm your second factor first.',
  deviceName: `Give the device a name of 1 to ${DEVICE_NAME_MAX} characters.`,
  notFound: 'That passkey no longer exists.',
  listFailed: 'Could not read your passkeys.',
  unknown: 'Something went wrong with the passkey. Try again, or enter a code.'
};

/** Server error codes (handler.ts) to the sentences above. */
const SERVER_CODES = {
  rate_limited: 'rateLimited',
  unauthorized: 'sessionExpired',
  not_configured: 'notSwitchedOn',
  origin_not_allowed: 'notSwitchedOn',
  no_passkey: 'noPasskey',
  challenge_invalid: 'challenge',
  verification_failed: 'verification',
  already_registered: 'alreadyRegistered',
  bridge_missing: 'bridgeMissing',
  try_again: 'tryAgain',
  insufficient_aal: 'needsSecondFactor',
  bad_device_name: 'deviceName',
  not_found: 'notFound'
};

const failure = (key, code = key) => ({ success: false, error: { code, message: PASSKEY_MESSAGES[key] || PASSKEY_MESSAGES.unknown } });

/** Turns a functions.invoke error into a failure result. */
const describeInvokeError = async (error) => {
  const response = error?.context;
  const status = typeof response?.status === 'number' ? response.status : 0;
  if (error?.name === 'FunctionsFetchError' || (!status && error?.name !== 'FunctionsHttpError')) return failure('network');
  let code = '';
  try {
    const body = await response.clone().json();
    code = typeof body?.code === 'string' ? body.code : '';
  } catch {
    // Not JSON: the gateway answered, not the function.
  }
  if (SERVER_CODES[code]) return failure(SERVER_CODES[code], code);
  if (code.startsWith('bridge_')) return failure('tryAgain', code);
  if (status === 404) return failure('notSwitchedOn', 'not_deployed');
  if (status === 401) return failure('sessionExpired', 'unauthorized');
  if (status === 429) return failure('rateLimited', 'rate_limited');
  return failure('unknown', code || `status_${status}`);
};

/** Calls one action of the function; supabase-js attaches the session's access token. */
const callFunction = async (action, payload = {}) => {
  try {
    const { data, error } = await supabase.functions.invoke(PASSKEY_FUNCTION, { body: { action, ...payload } });
    if (error) return describeInvokeError(error);
    if (!data?.success) return failure('unknown', 'bad_response');
    return { success: true, data: data.data };
  } catch {
    return failure('network');
  }
};

/** Turns a WebAuthn ceremony error into a failure result. */
const describeCeremonyError = (error) => {
  const name = error?.cause?.name || error?.name;
  if (name === 'NotAllowedError' || name === 'AbortError' || error?.code === 'ERROR_CEREMONY_ABORTED') return failure('cancelled');
  if (name === 'InvalidStateError' || error?.code === 'ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED') return failure('alreadyRegistered');
  if (name === 'NotSupportedError') return failure('unsupported');
  return failure('unknown', 'ceremony_failed');
};

const loadBrowserLibrary = () => import('@simplewebauthn/browser');

/** True when the browser has the WebAuthn API. Cheap: does not load the library. */
export const isSupported = () =>
  typeof window !== 'undefined' &&
  typeof window.PublicKeyCredential === 'function' &&
  typeof window.navigator?.credentials?.get === 'function';

/**
 * What the function reports for this site:
 *   known           the function answered (false when it is not deployed,
 *                   not switched on for this origin, or unreachable)
 *   available       a passkey for this site and a working bridge exist, and
 *                   this browser can use passkeys
 *   bridgeFactorId  the id of the server-held bridge factor, null when there
 *                   is none, undefined when unknown; screens hide exactly this
 *                   factor from the typed-code lists
 *   passkeyCount    passkeys on every site, so the Security screen can keep a
 *                   typed authenticator while any exist
 * Never throws; any failure reads as unknown.
 */
export const getPasskeyStatus = async () => {
  const unknown = { known: false, available: false, bridgeFactorId: undefined, passkeyCount: 0 };
  const result = await callFunction('status');
  if (!result.success || !result.data || typeof result.data !== 'object') return unknown;
  const { available, bridgeFactorId, passkeyCount } = result.data;
  return {
    known: true,
    available: Boolean(available) && isSupported(),
    // An older function without the field leaves the id unknown, not "none".
    bridgeFactorId: typeof bridgeFactorId === 'string' && bridgeFactorId
      ? bridgeFactorId
      : bridgeFactorId === null ? null : undefined,
    passkeyCount: Number.isInteger(passkeyCount) && passkeyCount > 0 ? passkeyCount : 0
  };
};

/**
 * Whether passkey sign-in can be offered on this site: the owner has a
 * passkey registered for it and the bridge is in place. Any failure,
 * including a function that is not deployed yet, reads as false so the code
 * field stays the only option.
 */
export const hasPasskey = async () => {
  if (!isSupported()) return false;
  return (await getPasskeyStatus()).available;
};

/** Adopts a session the function returned. */
const adoptSession = async (session) => {
  try {
    const { error } = await supabase.auth.setSession({
      access_token: session.access_token,
      refresh_token: session.refresh_token
    });
    return error ? failure('sessionExpired') : { success: true };
  } catch {
    return failure('sessionExpired');
  }
};

/**
 * Login step 02 with a passkey: request options, run the platform prompt,
 * let the function verify it and complete the second factor, then adopt the
 * level-2 session. Resolves to { success } or { success: false, error }.
 */
export const signInWithPasskey = async () => {
  if (!isSupported()) return failure('unsupported');
  const options = await callFunction('auth-options');
  if (!options.success) return options;
  let response;
  try {
    const { startAuthentication } = await loadBrowserLibrary();
    response = await startAuthentication({ optionsJSON: options.data.options });
  } catch (error) {
    return describeCeremonyError(error);
  }
  const verified = await callFunction('auth-verify', { challengeId: options.data.challengeId, response });
  if (!verified.success) return verified;
  if (!verified.data?.access_token || !verified.data?.refresh_token) return failure('unknown', 'bad_response');
  return adoptSession(verified.data);
};

/**
 * Registers this device's passkey (Security screen, level 2 only). The first
 * passkey also creates the bridge factor, which upgrades the session in Auth;
 * that session is adopted so the screen stays at level 2.
 */
export const registerPasskey = async (deviceName) => {
  const name = String(deviceName ?? '').trim().replace(/\s+/g, ' ');
  if (!name || name.length > DEVICE_NAME_MAX) return failure('deviceName');
  if (!isSupported()) return failure('unsupported');
  const options = await callFunction('register-options');
  if (!options.success) return options;
  let response;
  try {
    const { startRegistration } = await loadBrowserLibrary();
    response = await startRegistration({ optionsJSON: options.data.options });
  } catch (error) {
    return describeCeremonyError(error);
  }
  const saved = await callFunction('register-verify', { challengeId: options.data.challengeId, response, device_name: name });
  if (!saved.success) return saved;
  if (saved.data?.session) {
    const adopted = await adoptSession(saved.data.session);
    if (!adopted.success) return adopted;
  }
  return { success: true, data: { id: saved.data?.id } };
};

/** The owner's passkeys, read directly (row level security: own rows, level 2 only). */
export const listPasskeys = async () => {
  try {
    const { data, error } = await supabase
      .from('admin_passkeys')
      .select('id, device_name, created_at, last_used_at, rp_id')
      .order('created_at', { ascending: true });
    if (error) return failure('listFailed', 'list_failed');
    return { success: true, data: Array.isArray(data) ? data : [] };
  } catch {
    return failure('listFailed', 'list_failed');
  }
};

/**
 * Removes a passkey through the function, which also retires the bridge
 * factor when the last passkey goes (`bridgeRemoved`).
 */
export const removePasskey = async (id) => {
  if (!id) return failure('notFound');
  const result = await callFunction('remove', { id });
  if (!result.success) return result;
  return { success: true, data: { bridgeRemoved: Boolean(result.data?.bridgeRemoved) } };
};

/** A starting label for "Add this device", from the platform. The owner can change it. */
export const suggestDeviceName = (nav = typeof navigator !== 'undefined' ? navigator : {}) => {
  const ua = String(nav.userAgent || '');
  const platform = String(nav.userAgentData?.platform || nav.platform || '');
  if (/iPad/.test(ua) || (/Macintosh/.test(ua) && nav.maxTouchPoints > 1)) return 'iPad';
  if (/iPhone/.test(ua)) return 'iPhone';
  if (/Android/.test(ua)) return 'Android phone';
  if (/Mac/.test(platform) || /Macintosh/.test(ua)) return 'Mac';
  if (/Win/.test(platform) || /Windows/.test(ua)) return 'Windows PC';
  return 'This device';
};

const passkeyService = { isSupported, getPasskeyStatus, hasPasskey, signInWithPasskey, registerPasskey, listPasskeys, removePasskey, suggestDeviceName };

export default passkeyService;
