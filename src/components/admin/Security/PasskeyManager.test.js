/* eslint-disable testing-library/no-container, testing-library/render-result-naming-convention */
// The Passkeys card of the Security screen: the list, adding this device,
// and removal behind a confirmation. passkeyService is faked; nothing leaves
// the test.

import PasskeyManager from './PasskeyManager';
import { React, act, click, mount, setInputValue } from '../SkyBackground/testUtils';

let mockAuth;
jest.mock('../../../contexts/AuthContext', () => ({ useAuthContext: () => mockAuth }));
jest.mock('../../../services/passkeyService', () => ({
  DEVICE_NAME_MAX: 60,
  isSupported: jest.fn(),
  listPasskeys: jest.fn(),
  registerPasskey: jest.fn(),
  removePasskey: jest.fn(),
  suggestDeviceName: jest.fn()
}));
const passkeys = jest.requireMock('../../../services/passkeyService');

const flush = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
const submit = (form) => act(async () => { form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
const buttonNamed = (container, text) => Array.from(container.querySelectorAll('button')).find((b) => b.textContent === text);

const PHONE = { id: 'p1', device_name: 'Galaxy S25 Ultra', created_at: '2026-11-18T10:00:00Z', last_used_at: '2026-11-18T12:00:00Z' };
const MAC = { id: 'p2', device_name: 'Mac', created_at: '2026-11-18T11:00:00Z', last_used_at: null };

describe('PasskeyManager', () => {
  let confirmSpy;

  beforeEach(() => {
    mockAuth = { refreshAssurance: jest.fn().mockResolvedValue({}) };
    passkeys.isSupported.mockReturnValue(true);
    passkeys.suggestDeviceName.mockReturnValue('Mac');
    passkeys.listPasskeys.mockResolvedValue({ success: true, data: [PHONE, MAC] });
    passkeys.registerPasskey.mockResolvedValue({ success: true, data: { id: 'p3' } });
    passkeys.removePasskey.mockResolvedValue({ success: true, data: { bridgeRemoved: false } });
    confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(true);
  });

  afterEach(() => confirmSpy.mockRestore());

  it('explains the passkey and lists each one with when it was added and last used', async () => {
    const view = mount(<PasskeyManager />);
    await flush();
    expect(view.container.querySelector('.passkey-explainer').textContent).toMatch(/replaces typing the authenticator code/);
    const rows = Array.from(view.container.querySelectorAll('.mfa-device'));
    expect(rows.map((row) => row.querySelector('.mfa-device-name').textContent)).toEqual(['Galaxy S25 Ultra', 'Mac']);
    expect(rows[0].querySelector('.mfa-muted').textContent).toBe('Added Nov 18, 2026 · Last used Nov 18, 2026');
    expect(rows[1].querySelector('.mfa-muted').textContent).toBe('Added Nov 18, 2026 · Not used yet');
    expect(view.container.querySelector('#passkey-device-name').value).toBe('Mac');
    view.unmount();
  });

  it('adds this device under the chosen name, then reloads and re-reads the assurance level', async () => {
    const view = mount(<PasskeyManager />);
    await flush();
    const name = view.container.querySelector('#passkey-device-name');
    setInputValue(name, 'Work Mac');
    await submit(name.form);
    await flush();
    expect(passkeys.registerPasskey).toHaveBeenCalledWith('Work Mac');
    expect(passkeys.listPasskeys).toHaveBeenCalledTimes(2);
    expect(mockAuth.refreshAssurance).toHaveBeenCalledTimes(1);
    expect(view.container.querySelector('[role="status"]').textContent).toMatch(/Passkey added for "Work Mac"/);
    view.unmount();
  });

  it('shows the fixed sentence when adding fails and keeps the list as it was', async () => {
    passkeys.registerPasskey.mockResolvedValue({ success: false, error: { code: 'alreadyRegistered', message: 'This device already has a passkey for the admin.' } });
    const view = mount(<PasskeyManager />);
    await flush();
    await submit(view.container.querySelector('.passkey-add'));
    await flush();
    expect(view.container.querySelector('[role="alert"]').textContent).toBe('This device already has a passkey for the admin.');
    expect(mockAuth.refreshAssurance).not.toHaveBeenCalled();
    view.unmount();
  });

  it('removes only after a confirmation', async () => {
    confirmSpy.mockReturnValue(false);
    const view = mount(<PasskeyManager />);
    await flush();
    click(buttonNamed(view.container, 'Remove'));
    await flush();
    expect(passkeys.removePasskey).not.toHaveBeenCalled();
    confirmSpy.mockReturnValue(true);
    click(buttonNamed(view.container, 'Remove'));
    await flush();
    expect(passkeys.removePasskey).toHaveBeenCalledWith('p1');
    expect(confirmSpy.mock.calls[1][0]).toMatch(/That device will need an authenticator code/);
    expect(mockAuth.refreshAssurance).not.toHaveBeenCalled();
    view.unmount();
  });

  it('warns before removing the last passkey and re-reads the level when the bridge goes', async () => {
    passkeys.listPasskeys.mockResolvedValue({ success: true, data: [PHONE] });
    passkeys.removePasskey.mockResolvedValue({ success: true, data: { bridgeRemoved: true } });
    const view = mount(<PasskeyManager />);
    await flush();
    passkeys.listPasskeys.mockResolvedValue({ success: true, data: [] });
    click(buttonNamed(view.container, 'Remove'));
    await flush();
    expect(confirmSpy.mock.calls[0][0]).toMatch(/only passkey.*asked for an authenticator code again/);
    expect(mockAuth.refreshAssurance).toHaveBeenCalledTimes(1);
    expect(view.container.querySelector('.mfa-muted:not(.passkey-explainer)').textContent).toBe('No passkey is registered yet.');
    view.unmount();
  });

  it('says so when this browser cannot create passkeys', async () => {
    passkeys.isSupported.mockReturnValue(false);
    const view = mount(<PasskeyManager />);
    await flush();
    expect(view.container.querySelector('.passkey-add')).toBeNull();
    expect(view.container.textContent).toMatch(/This browser cannot create passkeys/);
    view.unmount();
  });

  it('marks a passkey made on the dev server as localhost', async () => {
    passkeys.listPasskeys.mockResolvedValue({ success: true, data: [{ ...MAC, rp_id: 'localhost' }, { ...PHONE, rp_id: 'raunakchoudhary.com' }] });
    const view = mount(<PasskeyManager />);
    await flush();
    const tags = Array.from(view.container.querySelectorAll('.mfa-device')).map((row) => row.querySelector('.passkey-site-tag')?.textContent || '');
    expect(tags).toEqual(['localhost', '']);
    view.unmount();
  });

  it('tells the Security screen after a passkey is added or removed', async () => {
    const onChange = jest.fn();
    const view = mount(<PasskeyManager onChange={onChange} />);
    await flush();
    await submit(view.container.querySelector('.passkey-add'));
    await flush();
    expect(onChange).toHaveBeenCalledTimes(1);
    click(buttonNamed(view.container, 'Remove'));
    await flush();
    expect(onChange).toHaveBeenCalledTimes(2);
    view.unmount();
  });
});
