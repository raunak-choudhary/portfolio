/* eslint-disable testing-library/no-container, testing-library/render-result-naming-convention */
// The Security screen's rules around passkeys: the bridge factor is hidden by
// the id the function reports, the reserved bridge name cannot be given to an
// authenticator app, the last authenticator app stays while passkeys exist,
// and the Passkeys card shows whenever passkeys or the bridge exist.
// Supabase and the passkey service are faked; nothing leaves the test.

import MfaEnrollment from './MfaEnrollment';
import { React, act, click, mount, setInputValue } from '../SkyBackground/testUtils';

let mockAuth;
jest.mock('../../../contexts/AuthContext', () => ({ useAuthContext: () => mockAuth }));
jest.mock('../../../services/supabaseClient', () => ({ supabase: { auth: { mfa: { enroll: jest.fn() } } } }));
jest.mock('../../../services/authService', () => ({
  ...jest.requireActual('../../../services/authService'),
  listTotpFactors: jest.fn(),
  removeUnverifiedFactors: jest.fn(),
  unenrollFactor: jest.fn()
}));
const auth = jest.requireMock('../../../services/authService');
jest.mock('../../../services/passkeyService', () => ({ getPasskeyStatus: jest.fn() }));
const passkeys = jest.requireMock('../../../services/passkeyService');
jest.mock('./PasskeyManager', () => function PasskeyManagerStub() { return <section data-testid="passkey-manager" />; });
const { supabase } = jest.requireMock('../../../services/supabaseClient');

const flush = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
const buttonNamed = (container, text) => Array.from(container.querySelectorAll('button')).find((b) => b.textContent.trim() === text);

const PHONE = { id: 'f1', friendly_name: 'Primary authenticator', status: 'verified', created_at: '2026-11-01T00:00:00Z' };
const BACKUP = { id: 'f2', friendly_name: 'Backup phone', status: 'verified', created_at: '2026-11-02T00:00:00Z' };
const BRIDGE = { id: 'bridge-1', friendly_name: 'Passkey bridge 1a2b3c4d', status: 'verified', created_at: '2026-11-18T00:00:00Z' };

const status = (overrides = {}) => ({ known: true, available: false, bridgeFactorId: null, passkeyCount: 0, ...overrides });
const listed = (verified, bridge = null) => ({ success: true, data: { verified, unverified: [], bridge, all: bridge ? [...verified, bridge] : verified } });

describe('MfaEnrollment with passkeys', () => {
  let confirmSpy;

  beforeEach(() => {
    mockAuth = { refreshAssurance: jest.fn().mockResolvedValue({}), user: { email: 'owner@example.com' } };
    auth.removeUnverifiedFactors.mockResolvedValue({ success: true, data: { removed: 0 } });
    auth.unenrollFactor.mockResolvedValue({ success: true, data: { factorId: 'f1' } });
    passkeys.getPasskeyStatus.mockResolvedValue(status());
    auth.listTotpFactors.mockResolvedValue(listed([PHONE]));
    confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(true);
  });

  afterEach(() => confirmSpy.mockRestore());

  it('asks for the factor list with the bridge id the function reports', async () => {
    passkeys.getPasskeyStatus.mockResolvedValue(status({ bridgeFactorId: 'bridge-1', passkeyCount: 1 }));
    auth.listTotpFactors.mockResolvedValue(listed([PHONE], BRIDGE));
    const view = mount(<MfaEnrollment />);
    await flush();
    expect(auth.listTotpFactors).toHaveBeenCalledWith({ bridgeFactorId: 'bridge-1' });
    const names = Array.from(view.container.querySelectorAll('.mfa-device-name')).map((n) => n.textContent);
    expect(names).toEqual(['Primary authenticator']);
    view.unmount();
  });

  it('keeps the last authenticator app while passkeys exist, and says why', async () => {
    passkeys.getPasskeyStatus.mockResolvedValue(status({ bridgeFactorId: 'bridge-1', passkeyCount: 2 }));
    auth.listTotpFactors.mockResolvedValue(listed([PHONE], BRIDGE));
    const view = mount(<MfaEnrollment />);
    await flush();
    const remove = buttonNamed(view.container, 'Remove');
    expect(remove.disabled).toBe(true);
    expect(remove.getAttribute('aria-describedby')).toBe('mfa-keep-last');
    expect(view.container.querySelector('#mfa-keep-last').textContent).toMatch(/only authenticator app, so it stays while you have passkeys/);
    click(remove);
    await flush();
    expect(auth.unenrollFactor).not.toHaveBeenCalled();
    view.unmount();
  });

  it('also keeps it when only a bridge is left behind with no passkeys', async () => {
    passkeys.getPasskeyStatus.mockResolvedValue(status({ bridgeFactorId: 'bridge-1', passkeyCount: 0 }));
    auth.listTotpFactors.mockResolvedValue(listed([PHONE], BRIDGE));
    const view = mount(<MfaEnrollment />);
    await flush();
    expect(buttonNamed(view.container, 'Remove').disabled).toBe(true);
    view.unmount();
  });

  it('lets either authenticator go when there are two, even with passkeys', async () => {
    passkeys.getPasskeyStatus.mockResolvedValue(status({ bridgeFactorId: 'bridge-1', passkeyCount: 1 }));
    auth.listTotpFactors.mockResolvedValue(listed([PHONE, BACKUP], BRIDGE));
    const view = mount(<MfaEnrollment />);
    await flush();
    const removes = Array.from(view.container.querySelectorAll('.mfa-device button'));
    expect(removes.map((b) => b.disabled)).toEqual([false, false]);
    expect(view.container.querySelector('#mfa-keep-last')).toBeNull();
    click(removes[0]);
    await flush();
    expect(auth.unenrollFactor).toHaveBeenCalledWith('f1');
    view.unmount();
  });

  it('allows removing the only authenticator when no passkey or bridge exists', async () => {
    const view = mount(<MfaEnrollment />);
    await flush();
    expect(buttonNamed(view.container, 'Remove').disabled).toBe(false);
    expect(view.container.querySelector('#mfa-keep-last')).toBeNull();
    view.unmount();
  });

  it('shows the Passkeys card whenever passkeys or the bridge exist, even with no authenticator listed', async () => {
    passkeys.getPasskeyStatus.mockResolvedValue(status({ bridgeFactorId: 'bridge-1', passkeyCount: 1 }));
    auth.listTotpFactors.mockResolvedValue(listed([], BRIDGE));
    let view = mount(<MfaEnrollment />);
    await flush();
    expect(view.container.querySelector('[data-testid="passkey-manager"]')).not.toBeNull();
    view.unmount();

    passkeys.getPasskeyStatus.mockResolvedValue(status());
    auth.listTotpFactors.mockResolvedValue(listed([]));
    view = mount(<MfaEnrollment />);
    await flush();
    expect(view.container.querySelector('[data-testid="passkey-manager"]')).toBeNull();
    view.unmount();
  });

  it('refuses the reserved bridge name for a new authenticator app', async () => {
    const view = mount(<MfaEnrollment />);
    await flush();
    setInputValue(view.container.querySelector('#mfa-device-name'), '  passkey BRIDGE ');
    click(buttonNamed(view.container, 'Add device'));
    await flush();
    expect(view.container.querySelector('[role="alert"]').textContent).toMatch(/reserved for passkey sign-in/);
    expect(supabase.auth.mfa.enroll).not.toHaveBeenCalled();
    view.unmount();
  });
});
