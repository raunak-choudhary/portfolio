// Security events in the activity log (V5): which auth and passkey actions
// record an entry, with what label, at what moment, and that a logger that
// fails, throws or hangs never changes the action's result. The activity
// service is faked here; its own behaviour is covered in activityService.test.js.

import { signOutEverywhere, unenrollFactor, verifyTotpEnrollment } from './authService';
import { registerPasskey, removePasskey } from './passkeyService';
import { logSecurityEvent } from './activityService';
import { supabase } from './supabaseClient';

jest.mock('./activityService', () => ({ logSecurityEvent: jest.fn() }));
jest.mock('./supabaseClient', () => ({
  supabase: {
    auth: { signOut: jest.fn(), setSession: jest.fn(), mfa: { challenge: jest.fn(), verify: jest.fn(), unenroll: jest.fn() } },
    functions: { invoke: jest.fn() },
    from: jest.fn(),
  },
}));
jest.mock('@simplewebauthn/browser', () => ({ startRegistration: jest.fn(async () => ({ id: 'cred' })) }));

const ok = (data) => ({ data: { success: true, data }, error: null });
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

/** The logger misbehaving in each way it could. */
const BROKEN_LOGGERS = [
  ['resolves false', () => Promise.resolve(false)],
  ['rejects', () => Promise.reject(new Error('rpc failed'))],
  ['throws', () => { throw new Error('sync failure'); }],
  ['never answers', () => new Promise(() => {})],
];

beforeEach(() => {
  jest.clearAllMocks();
  logSecurityEvent.mockResolvedValue(true);
  supabase.auth.mfa.challenge.mockResolvedValue({ data: { id: 'ch1' }, error: null });
  supabase.auth.mfa.verify.mockResolvedValue({ data: {}, error: null });
  supabase.auth.mfa.unenroll.mockResolvedValue({ data: {}, error: null });
  supabase.auth.signOut.mockResolvedValue({ error: null });
  supabase.auth.setSession.mockResolvedValue({ error: null });
  Object.defineProperty(window, 'PublicKeyCredential', { value: function PublicKeyCredential() {}, configurable: true });
  Object.defineProperty(window.navigator, 'credentials', { value: { get: jest.fn(), create: jest.fn() }, configurable: true });
  supabase.functions.invoke.mockImplementation((_name, { body }) => Promise.resolve({
    'register-options': ok({ options: {}, challengeId: 'c1' }),
    'register-verify': ok({ id: 'pk1' }),
    remove: ok({ bridgeRemoved: false }),
  }[body.action]));
});

describe('authenticator apps', () => {
  it('logs factor-add with the app name after the first code is accepted', async () => {
    await expect(verifyTotpEnrollment('f1', '123456', '1Password')).resolves.toEqual({ success: true, data: { factorId: 'f1' } });
    await settle();
    expect(logSecurityEvent).toHaveBeenCalledWith('factor-add', '1Password');
  });

  it('logs nothing when the code is refused', async () => {
    supabase.auth.mfa.verify.mockResolvedValue({ data: null, error: { status: 422, code: 'mfa_verification_failed' } });
    expect((await verifyTotpEnrollment('f1', '123456', '1Password')).success).toBe(false);
    await settle();
    expect(logSecurityEvent).not.toHaveBeenCalled();
  });

  it('logs factor-remove with the app name after removal, nothing on failure', async () => {
    expect((await unenrollFactor('f1', 'Backup phone')).success).toBe(true);
    await settle();
    expect(logSecurityEvent).toHaveBeenCalledWith('factor-remove', 'Backup phone');
    logSecurityEvent.mockClear();
    supabase.auth.mfa.unenroll.mockResolvedValue({ data: null, error: { status: 500, message: 'x' } });
    expect((await unenrollFactor('f1', 'Backup phone')).success).toBe(false);
    await settle();
    expect(logSecurityEvent).not.toHaveBeenCalled();
  });

  it.each(BROKEN_LOGGERS)('a logger that %s never breaks enrolment or removal', async (_name, impl) => {
    logSecurityEvent.mockImplementation(impl);
    await expect(verifyTotpEnrollment('f1', '123456', 'App')).resolves.toMatchObject({ success: true });
    await expect(unenrollFactor('f1', 'App')).resolves.toMatchObject({ success: true });
    await settle();
  });
});

describe('sign out everywhere', () => {
  it('logs before the session ends', async () => {
    const order = [];
    logSecurityEvent.mockImplementation(async () => { order.push('log'); return true; });
    supabase.auth.signOut.mockImplementation(async () => { order.push('signOut'); return { error: null }; });
    await expect(signOutEverywhere()).resolves.toEqual({ success: true, data: { scope: 'global' } });
    expect(logSecurityEvent).toHaveBeenCalledWith('sign-out-all', null);
    expect(order).toEqual(['log', 'signOut']);
  });

  it.each(BROKEN_LOGGERS.filter(([name]) => name !== 'never answers'))('a logger that %s still signs out', async (_name, impl) => {
    logSecurityEvent.mockImplementation(impl);
    await expect(signOutEverywhere()).resolves.toMatchObject({ success: true });
    expect(supabase.auth.signOut).toHaveBeenCalledWith({ scope: 'global' });
  });

  it('a sign-out failure is still reported as before', async () => {
    supabase.auth.signOut.mockResolvedValue({ error: { message: 'network' } });
    await expect(signOutEverywhere()).resolves.toMatchObject({ success: false, error: { code: 'SIGN_OUT_EVERYWHERE_FAILED' } });
  });
});

describe('passkeys', () => {
  it('logs passkey-add with the tidied device name after it is saved', async () => {
    await expect(registerPasskey('  Pixel   9 ')).resolves.toEqual({ success: true, data: { id: 'pk1' } });
    await settle();
    expect(logSecurityEvent).toHaveBeenCalledTimes(1);
    expect(logSecurityEvent).toHaveBeenCalledWith('passkey-add', 'Pixel 9');
  });

  it('logs nothing when the registration is refused', async () => {
    supabase.functions.invoke.mockImplementation((_name, { body }) => Promise.resolve(
      body.action === 'register-options' ? ok({ options: {}, challengeId: 'c1' }) : { data: { success: false }, error: null },
    ));
    expect((await registerPasskey('Mac')).success).toBe(false);
    await settle();
    expect(logSecurityEvent).not.toHaveBeenCalled();
  });

  it('logs passkey-remove with the device name after removal, nothing on failure', async () => {
    expect((await removePasskey('pk1', 'Mac')).success).toBe(true);
    await settle();
    expect(logSecurityEvent).toHaveBeenCalledWith('passkey-remove', 'Mac');
    logSecurityEvent.mockClear();
    supabase.functions.invoke.mockResolvedValue({ data: { success: false }, error: null });
    expect((await removePasskey('pk1', 'Mac')).success).toBe(false);
    await settle();
    expect(logSecurityEvent).not.toHaveBeenCalled();
  });

  it.each(BROKEN_LOGGERS)('a logger that %s never breaks adding or removing', async (_name, impl) => {
    logSecurityEvent.mockImplementation(impl);
    await expect(registerPasskey('Mac')).resolves.toMatchObject({ success: true });
    await expect(removePasskey('pk1', 'Mac')).resolves.toMatchObject({ success: true });
    await settle();
  });
});
