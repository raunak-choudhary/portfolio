/* eslint-disable testing-library/no-node-access, testing-library/render-result-naming-convention */
// The add-authenticator dialog: name, scan and confirm (checked on the sixth
// digit), done; the keyboard contract; and the clean-up of a half-made
// enrolment when the owner leaves before the code is confirmed.

import SecurityAddAppDialog, { CODE_MISMATCH, codeErrorText } from './SecurityAddAppDialog';
import { React, act, click, mount, setInputValue } from '../SkyBackground/testUtils';

jest.mock('../../../services/authService', () => ({
  ONE_TIME_CODE_LENGTH: 6,
  isValidOneTimeCode: (v) => /^[0-9]{6}$/.test(String(v ?? '')),
  sanitizeCodeInput: (v) => String(v ?? '').replace(/\D/g, '').slice(0, 6),
  removeUnverifiedFactors: jest.fn(),
  enrollTotp: jest.fn(),
  verifyTotpEnrollment: jest.fn(),
}));
const auth = jest.requireMock('../../../services/authService');

const flush = () => act(async () => { for (let i = 0; i < 4; i++) await new Promise((r) => setTimeout(r, 0)); });
const press = (key, extra = {}) => act(() => { document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, ...extra })); });
const dialog = () => document.querySelector('[data-testid="sec-add-dialog"]');
const buttonNamed = (text) => [...dialog().querySelectorAll('button')].find((b) => b.textContent.trim() === text);
const PENDING = { factorId: 'f3', friendlyName: 'iPad, Authy', qrCode: 'data:image/svg+xml;base64,AA==', secret: 'AAAABBBBCCCCDDDDEEEEFFFF' };

describe('SecurityAddAppDialog', () => {
  let onClose, onActivated, view, opener;

  beforeEach(() => {
    onClose = jest.fn(); onActivated = jest.fn().mockResolvedValue(undefined);
    auth.removeUnverifiedFactors.mockResolvedValue({ success: true, data: { removed: 0 } });
    auth.enrollTotp.mockResolvedValue({ success: true, data: PENDING });
    auth.verifyTotpEnrollment.mockResolvedValue({ success: true, data: { factorId: 'f3' } });
    opener = document.createElement('button');
    document.body.appendChild(opener);
    opener.focus();
  });

  afterEach(() => { view?.unmount(); view = null; opener.remove(); document.body.style.overflow = ''; });

  const open = (props = {}) => { view = mount(<SecurityAddAppDialog open appCount={2} onClose={onClose} onActivated={onActivated} {...props} />); };
  const toScan = async (name = 'iPad, Authy') => {
    setInputValue(dialog().querySelector('#sec-app-name'), name);
    await act(async () => { buttonNamed('Continue').click(); });
    await flush();
  };

  it('opens on the name step as a modal dialog in <body>, with the name field focused', () => {
    open();
    const d = dialog();
    expect(d.getAttribute('role')).toBe('dialog');
    expect(d.getAttribute('aria-modal')).toBe('true');
    expect(d.closest('.record-backdrop').parentElement).toBe(document.body);
    expect(document.getElementById(d.getAttribute('aria-labelledby')).textContent).toBe('Add an authenticator app');
    expect(document.activeElement.id).toBe('sec-app-name');
    expect(d.querySelector('[aria-current="step"]').textContent).toBe('Name');
    expect(d.querySelector('.field__count').textContent).toBe('0 / 60');
    expect(document.body.style.overflow).toBe('hidden');
  });

  it('counts the name and enrols under it, or under the classic default when it is left empty', async () => {
    open({ appCount: 2 });
    setInputValue(dialog().querySelector('#sec-app-name'), 'iPad');
    expect(dialog().querySelector('.field__count').textContent).toBe('4 / 60');
    setInputValue(dialog().querySelector('#sec-app-name'), '   ');
    await act(async () => { buttonNamed('Continue').click(); });
    await flush();
    expect(auth.removeUnverifiedFactors).toHaveBeenCalled();
    expect(auth.enrollTotp).toHaveBeenCalledWith('Backup authenticator 2');
  });

  it('shows the QR code, the grouped setup key and the code field, with Activate held until six digits', async () => {
    open();
    await toScan();
    const d = dialog();
    expect(d.dataset.step).toBe('scan');
    expect(d.querySelector('.sec-qr img').getAttribute('src')).toBe(PENDING.qrCode);
    expect(d.querySelector('#sec-key').textContent).toBe('AAAA BBBB CCCC DDDD EEEE FFFF');
    const code = d.querySelector('#sec-first');
    expect(code.getAttribute('inputmode')).toBe('numeric');
    expect(code.getAttribute('autocomplete')).toBe('one-time-code');
    expect(document.activeElement).toBe(code);
    expect(d.querySelector('#sec-first-help').textContent).toBe('Checked as soon as the sixth digit is in.');
    expect(d.querySelector('.record-dialog__status').textContent).toBe('Nothing changes until the code is confirmed.');
    setInputValue(code, '48a21');
    expect(code.value).toBe('4821');   // digits only
    expect(buttonNamed('Activate').disabled).toBe(true);
    expect(auth.verifyTotpEnrollment).not.toHaveBeenCalled();
  });

  it('copies the setup key and says so', async () => {
    const writeText = jest.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    open();
    await toScan();
    await act(async () => { buttonNamed('Copy key').click(); });
    expect(writeText).toHaveBeenCalledWith(PENDING.secret);
    expect(buttonNamed('Copied')).toBeDefined();
    expect(dialog().querySelector('.sec-sr[role="status"]').textContent).toBe('Setup key copied.');
    writeText.mockRejectedValue(new Error('denied'));
    await act(async () => { buttonNamed('Copied').click(); });
    expect(dialog().querySelector('[role="alert"]').textContent).toContain('Copy did not work here.');
  });

  it('checks the code on the sixth digit and says plainly when it did not match', async () => {
    auth.verifyTotpEnrollment.mockResolvedValueOnce({ success: false, error: { code: 'MFA_CODE_REJECTED', message: 'server words' } });
    open();
    await toScan();
    setInputValue(dialog().querySelector('#sec-first'), '123456');
    await flush();
    expect(auth.verifyTotpEnrollment).toHaveBeenCalledWith('f3', '123456', 'iPad, Authy');
    const err = dialog().querySelector('#sec-first-err');
    expect(err.getAttribute('role')).toBe('alert');
    expect(err.textContent).toBe(CODE_MISMATCH);
    const code = dialog().querySelector('#sec-first');
    expect(code.getAttribute('aria-invalid')).toBe('true');
    expect(code.getAttribute('aria-describedby')).toBe('sec-first-err');
    expect(code.value).toBe('');
    expect(onActivated).not.toHaveBeenCalled();
    // the next digit clears the error
    setInputValue(code, '6');
    expect(dialog().querySelector('#sec-first-err')).toBeNull();
  });

  it('activates on a matching code and ends on Done', async () => {
    open({ appCount: 2 });
    await toScan();
    setInputValue(dialog().querySelector('#sec-first'), '654321');
    await flush();
    expect(onActivated).toHaveBeenCalledWith({ factorId: 'f3', friendlyName: 'iPad, Authy' });
    const d = dialog();
    expect(d.dataset.step).toBe('done');
    expect(d.querySelector('.sec-done h4').textContent).toBe('Authenticator active');
    expect(d.querySelector('.sec-done p').textContent).toMatch(/^"iPad, Authy" now works at sign-in alongside your other apps\./);
    expect(d.querySelectorAll('.sec-steps li.is-done')).toHaveLength(2);
    expect(document.activeElement.textContent).toBe('Close');
    click(buttonNamed('Close'));
    expect(onClose).toHaveBeenCalled();
    expect(auth.removeUnverifiedFactors).toHaveBeenCalledTimes(1);   // only the clean start, nothing after Done
  });

  it('removes the half-made factor when the owner cancels or presses Escape on the scan step', async () => {
    open();
    await toScan();
    auth.removeUnverifiedFactors.mockClear();
    press('Escape');
    await flush();
    expect(auth.removeUnverifiedFactors).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes from the name step without touching the account, and gives focus back', async () => {
    open();
    auth.removeUnverifiedFactors.mockClear();
    await act(async () => { buttonNamed('Cancel').click(); });
    expect(auth.removeUnverifiedFactors).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
    view.rerender(<SecurityAddAppDialog open={false} appCount={2} onClose={onClose} onActivated={onActivated} />);
    expect(document.activeElement).toBe(opener);
    expect(document.body.style.overflow).toBe('');
  });

  it('keeps Tab inside the dialog', () => {
    open();
    const buttons = [...dialog().querySelectorAll('button')];
    const last = buttons[buttons.length - 1];
    last.focus();
    press('Tab');
    expect(dialog().contains(document.activeElement)).toBe(true);
    expect(document.activeElement).not.toBe(last);
  });

  it('shows a refused start as an alert on the name step', async () => {
    auth.enrollTotp.mockResolvedValue({ success: false, error: { message: 'Could not start the enrolment.' } });
    open();
    await act(async () => { buttonNamed('Continue').click(); });
    await flush();
    expect(dialog().dataset.step).toBe('name');
    expect(dialog().querySelector('.sec-banner--bad[role="alert"]').textContent).toBe('Could not start the enrolment.');
  });

  it('falls back to the setup key when Supabase sends no QR code', async () => {
    auth.enrollTotp.mockResolvedValue({ success: true, data: { ...PENDING, qrCode: '' } });
    open();
    await toScan();
    expect(dialog().querySelector('.sec-qr img')).toBeNull();
    expect(dialog().querySelector('.sec-qr__missing').textContent).toContain('Type the setup key instead.');
  });

  it('words a failed check by its code', () => {
    expect(codeErrorText({ code: 'MFA_CODE_REJECTED' })).toBe(CODE_MISMATCH);
    expect(codeErrorText({ code: 'MFA_VERIFY_ERROR', message: 'Could not verify the code.' })).toBe('Could not verify the code.');
    expect(codeErrorText(null)).toBe('The code could not be checked. Try again.');
  });
});
