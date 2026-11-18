// Unit tests for the passkey service: the call order of a sign-in and a
// registration, session adoption, and the mapping of every failure to a
// fixed sentence. Supabase and @simplewebauthn/browser are faked; no request
// leaves the test.

import {
  PASSKEY_FUNCTION,
  PASSKEY_MESSAGES,
  getPasskeyStatus,
  hasPasskey,
  isSupported,
  listPasskeys,
  registerPasskey,
  removePasskey,
  signInWithPasskey,
  suggestDeviceName
} from './passkeyService';
import { supabase } from './supabaseClient';

jest.mock('./supabaseClient', () => ({
  supabase: { functions: { invoke: jest.fn() }, auth: { setSession: jest.fn() }, from: jest.fn() }
}));
jest.mock('@simplewebauthn/browser', () => ({ startAuthentication: jest.fn(), startRegistration: jest.fn() }));
const browser = jest.requireMock('@simplewebauthn/browser');

/** What supabase-js returns for a non-2xx answer: a FunctionsHttpError whose context is the response. */
const httpError = (status, body) => ({
  name: 'FunctionsHttpError',
  context: { status, clone: () => ({ json: () => (body === undefined ? Promise.reject(new Error('not json')) : Promise.resolve(body)) }) }
});
const ok = (data) => ({ data: { success: true, data }, error: null });
const domError = (name) => Object.assign(new Error('browser text that must not be shown'), { name });

/** Answers invoke calls by action name. */
const answer = (byAction) => {
  supabase.functions.invoke.mockImplementation((_name, { body }) => Promise.resolve(byAction[body.action]));
};
const actions = () => supabase.functions.invoke.mock.calls.map(([, { body }]) => body.action);

beforeEach(() => {
  window.PublicKeyCredential = function PublicKeyCredential() {};
  Object.defineProperty(window.navigator, 'credentials', { value: { get: () => {}, create: () => {} }, configurable: true });
  supabase.auth.setSession.mockResolvedValue({ data: {}, error: null });
  browser.startAuthentication.mockResolvedValue({ id: 'cred-1', type: 'public-key' });
  browser.startRegistration.mockResolvedValue({ id: 'cred-new', type: 'public-key' });
});

afterEach(() => { delete window.PublicKeyCredential; });

describe('support and availability', () => {
  it('reports support from the WebAuthn API without loading the library', () => {
    expect(isSupported()).toBe(true);
    delete window.PublicKeyCredential;
    expect(isSupported()).toBe(false);
  });

  it('is available only when the function says so; any failure reads as false', async () => {
    answer({ status: ok({ available: true }) });
    await expect(hasPasskey()).resolves.toBe(true);
    expect(supabase.functions.invoke).toHaveBeenCalledWith(PASSKEY_FUNCTION, { body: { action: 'status' } });
    answer({ status: { data: null, error: httpError(404) } });
    await expect(hasPasskey()).resolves.toBe(false);
    supabase.functions.invoke.mockRejectedValue(new Error('offline'));
    await expect(hasPasskey()).resolves.toBe(false);
  });

  it('reports the bridge factor id and passkey count, and unknown on any failure', async () => {
    answer({ status: ok({ available: true, bridgeFactorId: 'bridge-1', passkeyCount: 2 }) });
    await expect(getPasskeyStatus()).resolves.toEqual({ known: true, available: true, bridgeFactorId: 'bridge-1', passkeyCount: 2 });
    answer({ status: ok({ available: false, bridgeFactorId: null, passkeyCount: 0 }) });
    await expect(getPasskeyStatus()).resolves.toEqual({ known: true, available: false, bridgeFactorId: null, passkeyCount: 0 });
    // An older function without the fields: the id stays unknown.
    answer({ status: ok({ available: false }) });
    expect((await getPasskeyStatus()).bridgeFactorId).toBeUndefined();
    answer({ status: { data: null, error: httpError(403, { code: 'origin_not_allowed' }) } });
    await expect(getPasskeyStatus()).resolves.toEqual({ known: false, available: false, bridgeFactorId: undefined, passkeyCount: 0 });
  });

  it('still reads the status without WebAuthn, but never offers a passkey there', async () => {
    delete window.PublicKeyCredential;
    answer({ status: ok({ available: true, bridgeFactorId: 'bridge-1', passkeyCount: 1 }) });
    await expect(getPasskeyStatus()).resolves.toMatchObject({ known: true, available: false, bridgeFactorId: 'bridge-1' });
  });

  it('does not call the function when the browser has no WebAuthn', async () => {
    delete window.PublicKeyCredential;
    await expect(hasPasskey()).resolves.toBe(false);
    expect(supabase.functions.invoke).not.toHaveBeenCalled();
  });
});

describe('signInWithPasskey', () => {
  it('asks for options, runs the prompt, verifies, then adopts the returned session', async () => {
    answer({
      'auth-options': ok({ challengeId: 'c1', options: { challenge: 'abc', rpId: 'localhost' } }),
      'auth-verify': ok({ access_token: 'a2', refresh_token: 'r2' })
    });
    const result = await signInWithPasskey();
    expect(result).toEqual({ success: true });
    expect(actions()).toEqual(['auth-options', 'auth-verify']);
    expect(browser.startAuthentication).toHaveBeenCalledWith({ optionsJSON: { challenge: 'abc', rpId: 'localhost' } });
    expect(supabase.functions.invoke.mock.calls[1][1].body).toEqual({ action: 'auth-verify', challengeId: 'c1', response: { id: 'cred-1', type: 'public-key' } });
    expect(supabase.auth.setSession).toHaveBeenCalledWith({ access_token: 'a2', refresh_token: 'r2' });
  });

  it('turns a closed prompt into the cancelled sentence and never verifies', async () => {
    answer({ 'auth-options': ok({ challengeId: 'c1', options: {} }) });
    browser.startAuthentication.mockRejectedValue(Object.assign(new Error('x'), { name: 'NotAllowedError', cause: domError('NotAllowedError') }));
    const result = await signInWithPasskey();
    expect(result.error).toEqual({ code: 'cancelled', message: PASSKEY_MESSAGES.cancelled });
    expect(actions()).toEqual(['auth-options']);
    expect(supabase.auth.setSession).not.toHaveBeenCalled();
  });

  it.each([
    [httpError(404), 'not_deployed', PASSKEY_MESSAGES.notSwitchedOn],
    [httpError(503, { code: 'not_configured', error: 'server text' }), 'not_configured', PASSKEY_MESSAGES.notSwitchedOn],
    [httpError(429, { code: 'rate_limited' }), 'rate_limited', PASSKEY_MESSAGES.rateLimited],
    [httpError(403, { code: 'origin_not_allowed' }), 'origin_not_allowed', PASSKEY_MESSAGES.notSwitchedOn],
    [httpError(401, { code: 'unauthorized' }), 'unauthorized', PASSKEY_MESSAGES.sessionExpired],
    [httpError(404, { code: 'no_passkey' }), 'no_passkey', PASSKEY_MESSAGES.noPasskey],
    [httpError(502, { code: 'bridge_mfa_ip_address_mismatch' }), 'bridge_mfa_ip_address_mismatch', PASSKEY_MESSAGES.tryAgain],
    [httpError(500, { code: 'server_error', error: 'server text' }), 'server_error', PASSKEY_MESSAGES.unknown],
    [{ name: 'FunctionsFetchError', context: {} }, 'network', PASSKEY_MESSAGES.network]
  ])('maps a server refusal to a fixed sentence (%#)', async (error, code, message) => {
    answer({ 'auth-options': { data: null, error } });
    const result = await signInWithPasskey();
    expect(result).toEqual({ success: false, error: { code, message } });
    expect(browser.startAuthentication).not.toHaveBeenCalled();
  });

  it('points to the typed code when passkey attempts are rate limited', () => {
    expect(PASSKEY_MESSAGES.rateLimited).toMatch(/enter a code/i);
  });

  it('reports a session that could not be adopted as expired', async () => {
    answer({
      'auth-options': ok({ challengeId: 'c1', options: {} }),
      'auth-verify': ok({ access_token: 'a2', refresh_token: 'r2' })
    });
    supabase.auth.setSession.mockResolvedValue({ data: {}, error: { message: 'invalid' } });
    expect((await signInWithPasskey()).error.code).toBe('sessionExpired');
  });
});

describe('registerPasskey', () => {
  it('checks the name before any call', async () => {
    expect((await registerPasskey('   ')).error.message).toBe(PASSKEY_MESSAGES.deviceName);
    expect((await registerPasskey('x'.repeat(61))).error.code).toBe('deviceName');
    expect(supabase.functions.invoke).not.toHaveBeenCalled();
  });

  it('registers, sends the trimmed name and adopts the session the first passkey brings', async () => {
    answer({
      'register-options': ok({ challengeId: 'r1', options: { challenge: 'xyz' } }),
      'register-verify': ok({ id: 'pk-1', session: { access_token: 'a3', refresh_token: 'r3' } })
    });
    const result = await registerPasskey('  Galaxy   S25 Ultra ');
    expect(result).toEqual({ success: true, data: { id: 'pk-1' } });
    expect(browser.startRegistration).toHaveBeenCalledWith({ optionsJSON: { challenge: 'xyz' } });
    expect(supabase.functions.invoke.mock.calls[1][1].body.device_name).toBe('Galaxy S25 Ultra');
    expect(supabase.auth.setSession).toHaveBeenCalledWith({ access_token: 'a3', refresh_token: 'r3' });
  });

  it('leaves the session alone when no new one comes back, and maps a second registration', async () => {
    answer({
      'register-options': ok({ challengeId: 'r1', options: {} }),
      'register-verify': ok({ id: 'pk-2', session: null })
    });
    expect((await registerPasskey('Mac')).success).toBe(true);
    expect(supabase.auth.setSession).not.toHaveBeenCalled();
    browser.startRegistration.mockRejectedValue(Object.assign(new Error('x'), { name: 'InvalidStateError' }));
    expect((await registerPasskey('Mac')).error.message).toBe(PASSKEY_MESSAGES.alreadyRegistered);
  });
});

describe('listPasskeys and removePasskey', () => {
  it('selects the safe columns, oldest first', async () => {
    const order = jest.fn().mockResolvedValue({ data: [{ id: 'p1', device_name: 'Mac' }], error: null });
    const select = jest.fn(() => ({ order }));
    supabase.from.mockReturnValue({ select });
    const result = await listPasskeys();
    expect(supabase.from).toHaveBeenCalledWith('admin_passkeys');
    expect(select).toHaveBeenCalledWith('id, device_name, created_at, last_used_at, rp_id');
    expect(order).toHaveBeenCalledWith('created_at', { ascending: true });
    expect(result).toEqual({ success: true, data: [{ id: 'p1', device_name: 'Mac' }] });
    order.mockResolvedValue({ data: null, error: { message: 'permission denied' } });
    expect((await listPasskeys()).error.message).toBe(PASSKEY_MESSAGES.listFailed);
  });

  it('removes through the function and reports whether the bridge went too', async () => {
    answer({ remove: ok({ removed: 'p1', bridgeRemoved: true }) });
    expect(await removePasskey('p1')).toEqual({ success: true, data: { bridgeRemoved: true } });
    expect(supabase.functions.invoke).toHaveBeenCalledWith(PASSKEY_FUNCTION, { body: { action: 'remove', id: 'p1' } });
  });
});

describe('suggestDeviceName', () => {
  it('names the common platforms', () => {
    expect(suggestDeviceName({ userAgent: 'Mozilla/5.0 (Linux; Android 15; SM-S938U)' })).toBe('Android phone');
    expect(suggestDeviceName({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 19_0 like Mac OS X)' })).toBe('iPhone');
    expect(suggestDeviceName({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', maxTouchPoints: 5 })).toBe('iPad');
    expect(suggestDeviceName({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', platform: 'MacIntel', maxTouchPoints: 0 })).toBe('Mac');
    expect(suggestDeviceName({ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' })).toBe('Windows PC');
    expect(suggestDeviceName({})).toBe('This device');
  });
});
