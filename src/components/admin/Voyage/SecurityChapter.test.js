/* eslint-disable testing-library/no-container, testing-library/no-node-access, testing-library/render-result-naming-convention */
// The voyage's Security chapter (Cassiopeia) in every state of the approved
// mockup: loading, error, first-time enrolment, the overview, the guard on
// the last app, the three confirmations, adding this device as a passkey,
// and Sign out everywhere. authService and passkeyService are faked; nothing
// leaves the test. The add-authenticator dialog has its own test file.

import SecurityChapter, { READ_FAILED } from './SecurityChapter';
import { HELD_REASON } from '../Security/securityModel';
import { isFilmHandoff, cancelFilmHandoff } from '../../../services/signOutHandoff';
import { React, act, click, mount, setInputValue } from '../SkyBackground/testUtils';

let mockAuth;
jest.mock('../../../contexts/AuthContext', () => ({ useAuthContext: () => mockAuth }));
jest.mock('../../../services/authService', () => ({
  ONE_TIME_CODE_LENGTH: 6,
  isValidOneTimeCode: (v) => /^[0-9]{6}$/.test(String(v ?? '')),
  sanitizeCodeInput: (v) => String(v ?? '').replace(/\D/g, '').slice(0, 6),
  removeUnverifiedFactors: jest.fn(),
  listTotpFactors: jest.fn(),
  getSessionFacts: jest.fn(),
  signOutEverywhere: jest.fn(),
  unenrollFactor: jest.fn(),
  enrollTotp: jest.fn(),
  verifyTotpEnrollment: jest.fn(),
}));
jest.mock('../../../services/passkeyService', () => ({
  DEVICE_NAME_MAX: 60,
  getPasskeyStatus: jest.fn(),
  isSupported: jest.fn(),
  listPasskeys: jest.fn(),
  registerPasskey: jest.fn(),
  removePasskey: jest.fn(),
  suggestDeviceName: jest.fn(),
}));
const auth = jest.requireMock('../../../services/authService');
const keys = jest.requireMock('../../../services/passkeyService');

const flush = () => act(async () => { for (let i = 0; i < 4; i++) await new Promise((r) => setTimeout(r, 0)); });
const submit = (form) => act(async () => { form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
const press = (key) => act(() => { document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true })); });
const buttonNamed = (root, text) => [...root.querySelectorAll('button')].find((b) => b.textContent.trim() === text);

const IPHONE = { id: 'f1', friendly_name: 'iPhone 16 Pro, Google Authenticator', created_at: '2026-11-09T19:12:00Z' };
const BACKUP = { id: 'f2', friendly_name: 'Backup: 1Password', created_at: '2026-11-10T02:40:00Z' };
const MAC = { id: 'p1', device_name: 'MacBook Air (Touch ID)', rp_id: 'localhost', created_at: '2026-11-18T15:20:00Z', last_used_at: '2026-11-18T19:08:00Z' };
const PIXEL = { id: 'p2', device_name: 'Pixel 9 (fingerprint)', rp_id: 'www.raunakchoudhary.com', created_at: '2026-11-18T16:02:00Z', last_used_at: null };

/** Sets what the services report: apps, passkeys and the session's amr. */
function given({ apps = [IPHONE, BACKUP], passkeys = [MAC, PIXEL], level = 'aal2', methods } = {}) {
  const now = Math.floor(Date.now() / 1000);
  auth.removeUnverifiedFactors.mockResolvedValue({ success: true, data: { removed: 0 } });
  keys.getPasskeyStatus.mockResolvedValue({ known: true, available: passkeys.length > 0, bridgeFactorId: passkeys.length ? 'bridge' : null, passkeyCount: passkeys.length });
  auth.listTotpFactors.mockResolvedValue({ success: true, data: { verified: apps, unverified: [], bridge: passkeys.length ? { id: 'bridge' } : null, all: apps } });
  keys.listPasskeys.mockResolvedValue({ success: true, data: passkeys });
  auth.getSessionFacts.mockResolvedValue({
    success: true,
    data: { level, methods: methods || (level === 'aal2' ? [{ method: 'oauth', timestamp: now - 600 }, { method: 'totp', timestamp: now - 590 }] : [{ method: 'oauth', timestamp: now - 600 }]), expiresIn: 3600 },
  });
}

describe('SecurityChapter', () => {
  let notify, onLeave, view;

  beforeEach(() => {
    mockAuth = { refreshAssurance: jest.fn().mockResolvedValue({}) };
    notify = jest.fn(); onLeave = jest.fn();
    keys.isSupported.mockReturnValue(true);
    keys.suggestDeviceName.mockReturnValue('Mac');
    keys.registerPasskey.mockResolvedValue({ success: true, data: { id: 'p3' } });
    keys.removePasskey.mockResolvedValue({ success: true, data: { bridgeRemoved: false } });
    auth.unenrollFactor.mockResolvedValue({ success: true, data: {} });
    auth.signOutEverywhere.mockResolvedValue({ success: true, data: { scope: 'global' } });
    given();
  });

  afterEach(() => { view?.unmount(); view = null; cancelFilmHandoff(); });

  const render = async () => { view = mount(<SecurityChapter notify={notify} onLeave={onLeave} />); await flush(); return view.container; };
  const chapter = () => view.container.querySelector('[data-testid="security-chapter"]');

  it('shows skeleton panes and a status line while the first read is in flight', () => {
    auth.removeUnverifiedFactors.mockReturnValue(new Promise(() => {}));
    view = mount(<SecurityChapter notify={notify} onLeave={onLeave} />);
    expect(chapter().dataset.state).toBe('loading');
    expect(chapter().getAttribute('aria-busy')).toBe('true');
    expect(view.container.querySelectorAll('.sec-skel').length).toBeGreaterThan(2);
    expect(view.container.querySelector('[role="status"]').textContent).toBe('Reading your authenticators.');
  });

  it('leaves the loading state under StrictMode, whose double mount runs the cleanup once', async () => {
    view = mount(<React.StrictMode><SecurityChapter notify={notify} onLeave={onLeave} /></React.StrictMode>);
    await flush();
    expect(chapter().dataset.state).toBe('overview');
    expect(chapter().getAttribute('aria-busy')).toBeNull();
  });

  it('says nothing was changed when the authenticators cannot be read, and tries again', async () => {
    auth.listTotpFactors.mockResolvedValueOnce({ success: false, error: { message: 'raw server text' } });
    const root = await render();
    expect(chapter().dataset.state).toBe('error');
    const alert = root.querySelector('.deck__error[role="alert"]');
    expect(alert.textContent).toContain(READ_FAILED);
    expect(root.textContent).not.toContain('raw server text');
    await act(async () => { buttonNamed(root, 'Try again').click(); });
    await flush();
    expect(chapter().dataset.state).toBe('overview');
  });

  it('cleans up a half-made enrolment before reading, and lays out the overview', async () => {
    const root = await render();
    expect(auth.removeUnverifiedFactors).toHaveBeenCalledTimes(1);
    expect(auth.listTotpFactors).toHaveBeenCalledWith({ bridgeFactorId: 'bridge' });
    expect(chapter().dataset.state).toBe('overview');
    const [left, right] = root.querySelectorAll('.sec-col');
    expect([...left.querySelectorAll('h3')].map((h) => h.textContent)).toEqual(['Authenticator apps', 'Passkeys']);
    expect([...right.querySelectorAll('h3')].map((h) => h.textContent)).toEqual(['This session', 'Wrong-address alerts', 'If you lose your phone']);
    expect(root.querySelectorAll('[data-testid="sec-app"]')).toHaveLength(2);
    expect(root.textContent).toContain('Any one of these apps works.');
    expect(root.textContent).toContain('Added Nov 9, 2026');
    // passkeys: the localhost tag only on the dev-server passkey, and the last use when there is one
    const [mac, pixel] = root.querySelectorAll('[data-testid="sec-passkey"]');
    expect(mac.querySelector('.sec-tag').textContent).toBe('localhost');
    expect(mac.textContent).toContain('Last used Nov 18, 2026');
    expect(pixel.querySelector('.sec-tag')).toBeNull();
    expect(pixel.textContent).toContain('Not used yet');
    expect(root.querySelectorAll('.sec-steps-list li')).toHaveLength(3);
  });

  it('tells only true facts about this session', async () => {
    const root = await render();
    const facts = root.querySelector('.sec-facts');
    expect([...facts.querySelectorAll('dt')].map((d) => d.textContent)).toEqual(['Second step', 'Signed in', 'Stays signed in', 'This device']);
    expect(facts.textContent).toContain('Both steps passed');
    expect(facts.textContent).toContain('Google sign-in, then a six-digit code');
    expect(facts.textContent).toContain('Assurance level 2. Content changes are accepted.');
    expect(facts.textContent).toContain('10 min ago');
    expect(facts.textContent).toContain('In this browser until you sign out; the session renews itself every hour');
    expect(facts.textContent).toContain('Desktop browser');
    const out = buttonNamed(root, 'Sign out everywhere');
    expect(out.getAttribute('aria-describedby')).toBe('sec-everywhere');
    expect(root.querySelector('#sec-everywhere').textContent).toBe('Ends this session and every other browser or device signed in as you.');
  });

  it('says the level could not be read, never "one step", when the session facts fail', async () => {
    auth.getSessionFacts.mockResolvedValueOnce({ success: false, error: 'offline' });
    const root = await render();
    const unknown = root.querySelector('[data-testid="sec-session-unknown"]');
    expect(unknown.textContent).toContain('Could not be read');
    expect(root.querySelector('.sec-facts').textContent).not.toContain('One step only');
    expect(root.querySelector('.sec-facts').textContent).not.toContain('Content changes are refused');
    // "Check again" re-reads; the session answers this time
    await act(async () => { click(buttonNamed(unknown, 'Check again')); });
    await flush();
    expect(root.querySelector('[data-testid="sec-session-unknown"]')).toBeNull();
    expect(root.querySelector('.sec-facts').textContent).toContain('Both steps passed');
  });

  it('leaves the sign-in time out when the session does not carry one', async () => {
    given({ methods: [{ method: 'oauth', timestamp: null }, { method: 'totp', timestamp: null }] });
    const root = await render();
    expect([...root.querySelectorAll('.sec-facts dt')].map((d) => d.textContent)).toEqual(['Second step', 'Stays signed in', 'This device']);
  });

  it('holds the last app while passkeys exist, with the reason linked to the button', async () => {
    given({ apps: [IPHONE] });
    const root = await render();
    const remove = root.querySelector('[data-testid="sec-app"] button');
    expect(remove.disabled).toBe(true);
    expect(remove.getAttribute('aria-describedby')).toBe('sec-held');
    expect(root.querySelector('#sec-held').textContent).toContain(HELD_REASON);
    expect(root.textContent).toContain('One app enrolled.');
  });

  it('removes one of two apps after an alertdialog that names what still works', async () => {
    const root = await render();
    const opener = root.querySelectorAll('[data-testid="sec-app"] button')[1];
    opener.focus();
    click(opener);
    const dialog = root.querySelector('[role="alertdialog"]');
    expect(dialog.classList.contains('sec-confirm')).toBe(true);
    expect(dialog.querySelector('h4').textContent).toBe('Remove Backup: 1Password?');
    expect(dialog.textContent).toContain('"iPhone 16 Pro, Google Authenticator" and both passkeys still work.');
    expect(document.activeElement.textContent).toBe('Cancel');   // the safe choice has focus
    await act(async () => { buttonNamed(dialog, 'Remove app').click(); });
    await flush();
    expect(auth.unenrollFactor).toHaveBeenCalledWith('f2', 'Backup: 1Password');
    expect(mockAuth.refreshAssurance).toHaveBeenCalled();
    expect(notify).toHaveBeenCalledWith('Removed "Backup: 1Password".');
    expect(root.querySelector('[role="alertdialog"]')).toBeNull();
    expect(auth.listTotpFactors).toHaveBeenCalledTimes(2);   // re-read after the change
  });

  it('closes a confirmation on Escape without removing anything, and gives focus back', async () => {
    const root = await render();
    const opener = root.querySelectorAll('[data-testid="sec-app"] button')[0];
    opener.focus();
    click(opener);
    expect(root.querySelector('[role="alertdialog"]')).not.toBeNull();
    press('Escape');
    expect(root.querySelector('[role="alertdialog"]')).toBeNull();
    expect(auth.unenrollFactor).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(opener);
  });

  it('spells out what removing the only app does', async () => {
    given({ apps: [IPHONE], passkeys: [] });
    const root = await render();
    click(root.querySelector('[data-testid="sec-app"] button'));
    const dialog = root.querySelector('[role="alertdialog"]');
    expect(dialog.querySelector('h4').textContent).toBe('Remove your only authenticator?');
    expect(dialog.querySelector('.dialog__more').textContent).toBe('Add the replacement first if you are moving to a new phone.');
    expect(buttonNamed(dialog, 'Remove anyway')).toBeDefined();
  });

  it('removes the last passkey and re-reads the level when the bridge is retired', async () => {
    given({ passkeys: [MAC] });
    keys.removePasskey.mockResolvedValue({ success: true, data: { bridgeRemoved: true } });
    const root = await render();
    click(root.querySelector('[data-testid="sec-passkey"] button'));
    const dialog = root.querySelector('[role="alertdialog"]');
    expect(dialog.querySelector('h4').textContent).toBe('Remove your last passkey?');
    await act(async () => { buttonNamed(dialog, 'Remove passkey').click(); });
    await flush();
    expect(keys.removePasskey).toHaveBeenCalledWith('p1', 'MacBook Air (Touch ID)');
    expect(mockAuth.refreshAssurance).toHaveBeenCalled();
  });

  it('reports a refused removal by toast and keeps the row', async () => {
    auth.unenrollFactor.mockResolvedValue({ success: false, error: { message: 'Could not remove the authenticator.' } });
    const root = await render();
    click(root.querySelectorAll('[data-testid="sec-app"] button')[1]);
    await act(async () => { buttonNamed(root.querySelector('[role="alertdialog"]'), 'Remove app').click(); });
    await flush();
    expect(notify).toHaveBeenCalledWith('Could not remove the authenticator.', 'bad');
    expect(root.querySelectorAll('[data-testid="sec-app"]')).toHaveLength(2);
  });

  it('adds this device as a passkey: wait state, then the saved banner', async () => {
    let finish;
    keys.registerPasskey.mockReturnValue(new Promise((r) => { finish = r; }));
    const root = await render();
    const input = root.querySelector('#sec-device');
    expect(input.value).toBe('Mac');
    setInputValue(input, '  Studio   iMac (Touch ID) ');
    await submit(root.querySelector('.sec-add'));
    const waiting = root.querySelector('.sec-wait');
    expect(waiting.getAttribute('role')).toBe('status');
    expect(waiting.getAttribute('aria-busy')).toBe('true');
    expect(waiting.textContent).toContain('Confirm in the browser\'s prompt to save "Studio iMac (Touch ID)". Cancel there to stop.');
    expect(keys.registerPasskey).toHaveBeenCalledWith('Studio iMac (Touch ID)');
    await act(async () => { finish({ success: true, data: { id: 'p3' } }); });
    await flush();
    expect(root.querySelector('.sec-banner--ok').textContent).toMatch(/^Passkey saved for "Studio iMac \(Touch ID\)"\. Next sign-in on this /);
    expect(mockAuth.refreshAssurance).toHaveBeenCalled();
  });

  it('shows a refused passkey as an alert by the field', async () => {
    keys.registerPasskey.mockResolvedValue({ success: false, error: { code: 'cancelled', message: 'The passkey prompt was closed.' } });
    const root = await render();
    await submit(root.querySelector('.sec-add'));
    await flush();
    const alert = root.querySelector('#sec-device-err');
    expect(alert.getAttribute('role')).toBe('alert');
    expect(alert.textContent).toBe('The passkey prompt was closed.');
    expect(root.querySelector('#sec-device').getAttribute('aria-invalid')).toBe('true');
  });

  it('asks for a device name before calling the browser', async () => {
    const root = await render();
    setInputValue(root.querySelector('#sec-device'), '   ');
    await submit(root.querySelector('.sec-add'));
    expect(keys.registerPasskey).not.toHaveBeenCalled();
    expect(root.querySelector('#sec-device-err').textContent).toBe('Give this device a name first.');
  });

  it('first-time enrolment: banner, short session pane, apps first and passkeys closed', async () => {
    given({ apps: [], passkeys: [], level: 'aal1' });
    const root = await render();
    expect(chapter().dataset.state).toBe('first');
    expect(keys.listPasskeys).not.toHaveBeenCalled();   // passkey rows are level 2 only
    const banner = root.querySelector('.sec-banner--warn');
    expect(banner.getAttribute('role')).toBe('status');
    expect(banner.textContent).toContain('Set up an authenticator app to open the rest of the admin.');
    const [left, right] = root.querySelectorAll('.sec-col');
    expect([...left.querySelectorAll('h3')].map((h) => h.textContent)).toEqual(['Authenticator apps', 'If you lose your phone']);
    expect([...right.querySelectorAll('h3')].map((h) => h.textContent)).toEqual(['This session', 'Passkeys']);
    expect(right.textContent).toContain('Not set up');
    expect(right.textContent).toContain('Assurance level 1: signed in with Google only.');
    expect(buttonNamed(root, 'Sign out everywhere')).toBeUndefined();
    expect(root.textContent).toContain('Passkeys open after the first authenticator app is confirmed.');
    expect(buttonNamed(root, 'Set up an authenticator app').className).toContain('voyage-bar__button--primary');
  });

  it('signs out everywhere, holding the router for the film, then hands over', async () => {
    const root = await render();
    let during;
    auth.signOutEverywhere.mockImplementation(async () => { during = isFilmHandoff(); return { success: true, data: { scope: 'global' } }; });
    await act(async () => { buttonNamed(root, 'Sign out everywhere').click(); });
    await flush();
    expect(during).toBe(true);
    expect(onLeave).toHaveBeenCalledTimes(1);
  });

  it('keeps the session and says so when signing out everywhere fails', async () => {
    auth.signOutEverywhere.mockResolvedValue({ success: false, error: { message: 'Could not sign out everywhere. Nothing was changed. Check the connection and try again.' } });
    const root = await render();
    await act(async () => { buttonNamed(root, 'Sign out everywhere').click(); });
    await flush();
    expect(onLeave).not.toHaveBeenCalled();
    expect(isFilmHandoff()).toBe(false);
    expect(root.querySelector('.sec-pane .deck__error[role="alert"]').textContent).toContain('Nothing was changed.');
    expect(buttonNamed(root, 'Sign out everywhere').disabled).toBe(false);
  });

  it('opens the add-authenticator dialog and shows the active banner after it is confirmed', async () => {
    auth.enrollTotp.mockResolvedValue({ success: true, data: { factorId: 'f3', friendlyName: 'iPad, Authy', qrCode: 'data:image/svg+xml;base64,AA==', secret: 'JBSWY3DPEHPK3PXP' } });
    auth.verifyTotpEnrollment.mockResolvedValue({ success: true, data: { factorId: 'f3' } });
    const root = await render();
    click(buttonNamed(root, 'Add an authenticator app'));
    const dialog = document.querySelector('[data-testid="sec-add-dialog"]');
    setInputValue(dialog.querySelector('#sec-app-name'), 'iPad, Authy');
    await act(async () => { buttonNamed(dialog, 'Continue').click(); });
    await flush();
    setInputValue(document.querySelector('#sec-first'), '123456');
    await flush();
    expect(document.querySelector('[data-testid="sec-add-dialog"]').dataset.step).toBe('done');
    expect(root.querySelector('.sec-banner--ok').textContent).toBe('"iPad, Authy" is active. Keep its setup key in your password manager.');
    expect(mockAuth.refreshAssurance).toHaveBeenCalled();
  });
});
