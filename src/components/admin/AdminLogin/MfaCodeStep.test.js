/* eslint-disable testing-library/no-container, testing-library/render-result-naming-convention */
// Step 02 (second key) and step 03 (launch) of the login, plus the sky
// behind every step: drifting by default, one still frame under reduced
// motion. Step 02 states covered: loading, passkey ready, waiting, closed
// prompt, refused, code mode, wrong code, checking, accepted (code and
// passkey), no passkey, the automatic prompt (fires once, never re-fires,
// a browser refusing it without a tap, closing it by choosing the code),
// the flag switched off, and Sign out.

import { ThemeProvider } from '../../../contexts/ThemeContext';
import { GOOGLE_PENDING_KEY } from '../../../services/authService';
import MfaCodeStep, { AUTO_PROMPT_PASSKEY, LAUNCH_HOLD_MS } from './MfaCodeStep';
import PreflightSky from './PreflightSky';
import { React, act, click, mount, setInputValue, stubCanvas } from '../SkyBackground/testUtils';

let mockAuth;
jest.mock('../../../contexts/AuthContext', () => ({ useAuthContext: () => mockAuth }));
jest.mock('../../../services/supabaseClient', () => ({ supabase: {} }));
jest.mock('../../../services/authService', () => ({
  ...jest.requireActual('../../../services/authService'),
  listTotpFactors: jest.fn(),
  verifyTotpChallenge: jest.fn()
}));
const { listTotpFactors, verifyTotpChallenge } = jest.requireMock('../../../services/authService');
jest.mock('../../../services/passkeyService', () => ({
  PASSKEY_ABORTED: 'aborted',
  PASSKEY_PROMPT_BLOCKED: 'prompt_blocked',
  getPasskeyStatus: jest.fn(),
  signInWithPasskey: jest.fn()
}));
const passkeys = jest.requireMock('../../../services/passkeyService');

const NOW = new Date('2026-11-18T02:14:00Z');
const flush = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
const wait = (ms) => act(async () => { await new Promise((resolve) => setTimeout(resolve, ms)); });
const submit = (form) => act(async () => { form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
/** A promise the test settles by hand, to hold the passkey prompt or a code check open. */
const deferred = () => {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
};
const stepStates = (container) => Array.from(container.querySelectorAll('.preflight-step'))
  .map((step) => `${step.dataset.step}:${step.className.replace(/.*preflight-step--/, '')}`);

let onHoldChange;
const render = (props = {}) => mount(
  <ThemeProvider>
    <MfaCodeStep now={NOW} onHoldChange={onHoldChange} {...props} />
  </ThemeProvider>
);

const $ = (view, selector) => view.container.querySelector(selector);
const buttonByText = (view, pattern) => Array.from(view.container.querySelectorAll('button'))
  .find((b) => pattern.test(b.textContent));
const codeInput = (view) => $(view, '#admin-totp-code');
const unlock = (view) => $(view, '.preflight-unlock');
const signOutButton = (view) => $(view, '.preflight-panel__foot .preflight-signout');

describe('MfaCodeStep (pre-flight steps 02 and 03)', () => {
  let canvas;

  beforeEach(() => {
    canvas = stubCanvas();
    window.matchMedia = () => ({ matches: false });
    onHoldChange = jest.fn();
    mockAuth = { refreshAssurance: jest.fn().mockResolvedValue({}), signOut: jest.fn(), user: { email: 'raunak@example.com' } };
    listTotpFactors.mockResolvedValue({ success: true, data: { verified: [{ id: 'f1', friendly_name: 'Phone' }], unverified: [] } });
    verifyTotpChallenge.mockResolvedValue({ success: true, data: { factorId: 'f1' } });
    passkeys.getPasskeyStatus.mockResolvedValue({ known: false, available: false, bridgeFactorId: undefined, passkeyCount: 0 });
    passkeys.signInWithPasskey.mockResolvedValue({ success: true });
  });

  afterEach(() => { canvas.restore(); window.sessionStorage.clear(); });

  const offerPasskey = () => {
    passkeys.getPasskeyStatus.mockResolvedValue({ known: true, available: true, bridgeFactorId: 'bridge', passkeyCount: 1 });
  };

  describe('without a passkey on this device', () => {
    it('opens on the code: lights 02, checks 01 with the masked address, focuses one labelled input', async () => {
      window.sessionStorage.setItem(GOOGLE_PENDING_KEY, '1');
      const view = render();
      await flush();
      expect(stepStates(view.container)).toEqual(['identity:done', 'second:current', 'launch:pending']);
      const identity = $(view, '[data-step="identity"]');
      expect(identity.querySelector('.preflight-step__check svg')).not.toBeNull();
      expect(identity.querySelector('.preflight-step__summary').textContent).toBe('Signed in as rau•••••@example.com');
      expect(unlock(view)).toBeNull();
      const code = codeInput(view);
      expect(document.activeElement).toBe(code);
      expect(code.getAttribute('autocomplete')).toBe('one-time-code');
      expect(code.getAttribute('inputmode')).toBe('numeric');
      expect(code.getAttribute('maxlength')).toBe('6');
      expect(code.type).toBe('password');
      expect($(view, 'label[for="admin-totp-code"]').textContent).toBe('Authenticator code');
      expect(code.getAttribute('aria-describedby')).toBe('admin-totp-note');
      expect($(view, '#admin-totp-note').textContent).toMatch(/^Open your authenticator app/);
      // six drawn cells, hidden from assistive tech, and no Verify button
      expect(view.container.querySelectorAll('.preflight-cell').length).toBe(6);
      expect($(view, '.preflight-cells__row').getAttribute('aria-hidden')).toBe('true');
      expect($(view, 'button[type="submit"]')).toBeNull();
      // no way back to a passkey that does not exist
      expect(buttonByText(view, /instead/)).toBeUndefined();
      // a Google round trip that reached this step is finished
      expect(window.sessionStorage.getItem(GOOGLE_PENDING_KEY)).toBeNull();
      view.unmount();
    });

    it('also offers no passkey when the status says none is registered', async () => {
      passkeys.getPasskeyStatus.mockResolvedValue({ known: true, available: false, bridgeFactorId: null, passkeyCount: 0 });
      const view = render();
      await flush();
      expect(unlock(view)).toBeNull();
      expect(codeInput(view)).not.toBeNull();
      view.unmount();
    });
  });

  describe('code mode', () => {
    it('keeps the code masked as dots, with Show and Hide on the existing toggle', async () => {
      const view = render();
      await flush();
      setInputValue(codeInput(view), '48');
      expect(view.container.querySelectorAll('.preflight-cell__dot').length).toBe(2);
      expect($(view, '.preflight-cell--next')).toBe(view.container.querySelectorAll('.preflight-cell')[2]);
      const reveal = $(view, '.preflight-reveal');
      expect(reveal.getAttribute('aria-pressed')).toBe('false');
      click(reveal);
      expect(codeInput(view).type).toBe('text');
      expect(reveal.getAttribute('aria-pressed')).toBe('true');
      expect(Array.from(view.container.querySelectorAll('.preflight-cell')).map((c) => c.textContent).join('')).toBe('48');
      expect(verifyTotpChallenge).not.toHaveBeenCalled();
      view.unmount();
    });

    it('sends the code on the sixth digit, keeping only digits from a paste', async () => {
      const view = render();
      await flush();
      setInputValue(codeInput(view), '123 456');
      await flush();
      expect(verifyTotpChallenge).toHaveBeenCalledTimes(1);
      expect(verifyTotpChallenge).toHaveBeenCalledWith('f1', '123456');
      view.unmount();
    });

    it('shows the check in progress: input read-only and busy, cells dimmed, a status line', async () => {
      const check = deferred();
      verifyTotpChallenge.mockReturnValue(check.promise);
      const view = render();
      await flush();
      setInputValue(codeInput(view), '123456');
      await flush();
      const code = codeInput(view);
      expect(code.readOnly).toBe(true);
      expect(code.getAttribute('aria-busy')).toBe('true');
      expect($(view, '.preflight-cells--checking')).not.toBeNull();
      expect($(view, '.preflight-progress')).not.toBeNull();
      expect($(view, '#admin-totp-note').textContent).toBe('Checking the code');
      expect(signOutButton(view).disabled).toBe(true);
      expect(onHoldChange.mock.calls).toEqual([[true]]);
      await act(async () => { check.resolve({ success: true, data: {} }); });
      view.unmount();
    });

    it('clears a wrong code, shakes once, says why, and keeps the keyboard in the cells', async () => {
      const message = 'That code is wrong or has expired. Enter the current code from your app.';
      verifyTotpChallenge.mockResolvedValue({ success: false, error: { message } });
      const view = render();
      await flush();
      const firstRow = $(view, '.preflight-cells__row');
      setInputValue(codeInput(view), '000000');
      await flush();
      expect(view.container.querySelector('[role="alert"]').textContent).toBe(message);
      expect(codeInput(view).value).toBe('');
      expect(codeInput(view).getAttribute('aria-invalid')).toBe('true');
      expect($(view, '.preflight-cells--wrong')).not.toBeNull();
      // the row is new, so the shake animation plays for this attempt
      expect($(view, '.preflight-cells__row')).not.toBe(firstRow);
      expect(document.activeElement).toBe(codeInput(view));
      expect(mockAuth.refreshAssurance).not.toHaveBeenCalled();
      // the route was held for the attempt and released when it failed
      expect(onHoldChange.mock.calls).toEqual([[true], [false]]);
      // typing again clears the error
      setInputValue(codeInput(view), '1');
      expect($(view, '.preflight-cells--wrong')).toBeNull();
      expect(view.container.querySelector('[role="alert"]')).toBeNull();
      view.unmount();
    });

    it('asks for six digits when Enter is pressed early, without calling the server', async () => {
      const view = render();
      await flush();
      setInputValue(codeInput(view), '123');
      await submit(codeInput(view).form);
      expect(view.container.querySelector('[role="alert"]').textContent).toBe('Enter the 6-digit code from your authenticator app.');
      expect(verifyTotpChallenge).not.toHaveBeenCalled();
      view.unmount();
    });

    it('lights 03 Launch, goes to black, hides Sign out, then hands over to the route', async () => {
      const view = render();
      await flush();
      setInputValue(codeInput(view), '123456');
      await flush();
      expect(verifyTotpChallenge).toHaveBeenCalledWith('f1', '123456');
      expect(stepStates(view.container)).toEqual(['identity:done', 'second:done', 'launch:current']);
      expect($(view, '[data-step="second"] .preflight-step__summary').textContent).toBe('Authenticator code accepted');
      expect($(view, '.preflight').classList.contains('preflight--launching')).toBe(true);
      expect($(view, '.preflight-launch').textContent).toBe('Entry starting');
      expect(signOutButton(view)).toBeNull();
      expect(mockAuth.refreshAssurance).not.toHaveBeenCalled();
      // the route stays on this screen while step 03 plays
      expect(onHoldChange.mock.calls).toEqual([[true]]);
      await wait(LAUNCH_HOLD_MS + 20);
      expect(mockAuth.refreshAssurance).toHaveBeenCalledTimes(1);
      expect(onHoldChange.mock.calls).toEqual([[true], [false]]);
      view.unmount();
    });

    it('offers a device choice only when more than one authenticator exists', async () => {
      listTotpFactors.mockResolvedValue({ success: true, data: { verified: [{ id: 'a', friendly_name: 'Phone' }, { id: 'b', friendly_name: 'Backup' }], unverified: [] } });
      const view = render();
      await flush();
      expect(view.container.querySelectorAll('#admin-factor option').length).toBe(2);
      view.unmount();
    });
  });

  describe('Sign out', () => {
    it('is a button in the card footer beside the readout, and signs out', async () => {
      const view = render();
      await flush();
      const button = signOutButton(view);
      expect(button.textContent).toBe('Sign out');
      expect(button.type).toBe('button');
      expect($(view, '.preflight-panel__foot--action .preflight-readout')).not.toBeNull();
      // only one Sign out on the card, and none inside the step
      expect(view.container.querySelectorAll('.preflight-signout').length).toBe(1);
      expect($(view, '.preflight-step__body .preflight-signout')).toBeNull();
      click(button);
      expect(mockAuth.signOut).toHaveBeenCalled();
      view.unmount();
    });
  });

  describe('with a passkey on this device, tapping the row (automatic prompt off)', () => {
    const renderTap = () => render({ autoPromptPasskey: false });

    it('leads with one unlock row named for the device and focuses it', async () => {
      offerPasskey();
      const view = renderTap();
      await flush();
      const row = unlock(view);
      // jsdom's navigator names no known device, so the neutral words show
      expect($(view, '.preflight-unlock__label').textContent).toBe('Unlock with passkey');
      expect(row.getAttribute('aria-describedby')).toBe('admin-passkey-hint');
      expect($(view, '#admin-passkey-hint').textContent).toBe('Your device asks how to confirm it is you');
      expect(document.activeElement).toBe(row);
      // the code waits behind a link; nothing else is open
      expect(codeInput(view)).toBeNull();
      expect(buttonByText(view, /^Use a code instead$/)).toBeDefined();
      expect(passkeys.signInWithPasskey).not.toHaveBeenCalled();
      view.unmount();
    });

    it('switches to the code and back, focusing what was opened', async () => {
      offerPasskey();
      const view = renderTap();
      await flush();
      click(buttonByText(view, /^Use a code instead$/));
      await flush();
      expect(unlock(view)).toBeNull();
      expect(document.activeElement).toBe(codeInput(view));
      expect($(view, '#admin-totp-note').textContent).toBe('Checked as soon as the sixth digit is in. Paste works too.');
      setInputValue(codeInput(view), '12');
      click(buttonByText(view, /^Use passkey instead$/));
      await flush();
      expect(codeInput(view)).toBeNull();
      expect(document.activeElement).toBe(unlock(view));
      view.unmount();
    });

    it('shows the waiting state while the prompt is open: busy row, sweeping ring, the code still reachable', async () => {
      offerPasskey();
      const prompt = deferred();
      passkeys.signInWithPasskey.mockReturnValue(prompt.promise);
      const view = renderTap();
      await flush();
      click(unlock(view));
      await flush();
      const row = unlock(view);
      expect(row.getAttribute('aria-busy')).toBe('true');
      expect(row.classList.contains('preflight-unlock--waiting')).toBe(true);
      expect($(view, '.preflight-unlock__label').textContent).toBe('Waiting for your passkey');
      expect(buttonByText(view, /^Use a code instead$/).disabled).toBe(false);
      expect(signOutButton(view).disabled).toBe(true);
      expect(passkeys.signInWithPasskey.mock.calls[0][0].signal).toBeInstanceOf(AbortSignal);
      // a second press while waiting does not open a second prompt
      click(row);
      expect(passkeys.signInWithPasskey).toHaveBeenCalledTimes(1);
      expect(onHoldChange.mock.calls).toEqual([[true]]);
      await act(async () => { prompt.resolve({ success: false, error: { code: 'cancelled', message: 'closed' } }); });
      view.unmount();
    });

    it('signs in with the passkey, holds the route and plays the same launch', async () => {
      offerPasskey();
      const view = renderTap();
      await flush();
      click(unlock(view));
      await flush();
      expect(passkeys.signInWithPasskey).toHaveBeenCalledTimes(1);
      expect(verifyTotpChallenge).not.toHaveBeenCalled();
      expect(stepStates(view.container)).toEqual(['identity:done', 'second:done', 'launch:current']);
      expect($(view, '[data-step="second"] .preflight-step__summary').textContent).toBe('Passkey accepted');
      expect(onHoldChange.mock.calls).toEqual([[true]]);
      await wait(LAUNCH_HOLD_MS + 20);
      expect(mockAuth.refreshAssurance).toHaveBeenCalledTimes(1);
      expect(onHoldChange.mock.calls).toEqual([[true], [false]]);
      view.unmount();
    });

    it('answers a closed prompt with a calm line and keeps the row ready for another try', async () => {
      offerPasskey();
      const message = 'The passkey prompt was closed, or this device has no passkey for the admin. Try again, or enter a code.';
      passkeys.signInWithPasskey.mockResolvedValue({ success: false, error: { code: 'cancelled', message } });
      const view = renderTap();
      await flush();
      click(unlock(view));
      await flush();
      expect($(view, '.preflight-msg--calm[role="status"]').textContent).toBe(message);
      expect(view.container.querySelector('[role="alert"]')).toBeNull();
      expect(stepStates(view.container)).toEqual(['identity:done', 'second:current', 'launch:pending']);
      expect(onHoldChange.mock.calls).toEqual([[true], [false]]);
      expect(document.activeElement).toBe(unlock(view));
      expect($(view, '.preflight-unlock__label').textContent).toBe('Unlock with passkey');
      // the code is one tap away and works
      click(buttonByText(view, /^Use a code instead$/));
      await flush();
      expect($(view, '.preflight-msg--calm')).toBeNull();
      setInputValue(codeInput(view), '123456');
      await flush();
      expect(verifyTotpChallenge).toHaveBeenCalledWith('f1', '123456');
      view.unmount();
    });

    it('answers a refused passkey with an error line and keeps both ways open', async () => {
      offerPasskey();
      const message = 'The passkey could not be verified. Try again, or enter a code.';
      passkeys.signInWithPasskey.mockResolvedValue({ success: false, error: { code: 'verification_failed', message } });
      const view = renderTap();
      await flush();
      click(unlock(view));
      await flush();
      expect(view.container.querySelector('[role="alert"]').textContent).toBe(message);
      expect(unlock(view).disabled).toBe(false);
      expect(buttonByText(view, /^Use a code instead$/).disabled).toBe(false);
      expect(mockAuth.refreshAssurance).not.toHaveBeenCalled();
      view.unmount();
    });

    it('treats a prompt refused at once after a tap as closed, with the calm line', async () => {
      offerPasskey();
      passkeys.signInWithPasskey.mockResolvedValue({ success: false, error: { code: 'prompt_blocked', message: 'closed' } });
      const view = renderTap();
      await flush();
      click(unlock(view));
      await flush();
      expect($(view, '.preflight-msg--calm').textContent).toBe('closed');
      view.unmount();
    });

    it('treats a thrown failure as a refusal with a fixed sentence', async () => {
      offerPasskey();
      passkeys.signInWithPasskey.mockRejectedValue(new Error('boom: internal detail'));
      const view = renderTap();
      await flush();
      click(unlock(view));
      await flush();
      expect(view.container.querySelector('[role="alert"]').textContent).toBe('Something went wrong with the passkey. Try again, or enter a code.');
      expect(onHoldChange.mock.calls).toEqual([[true], [false]]);
      view.unmount();
    });
  });

  describe('automatic prompt (the default)', () => {
    it('is on by default', () => {
      expect(AUTO_PROMPT_PASSKEY).toBe(true);
    });

    it('opens the prompt once when the step appears, with an abort signal', async () => {
      offerPasskey();
      const prompt = deferred();
      passkeys.signInWithPasskey.mockReturnValue(prompt.promise);
      const view = render();
      await flush();
      await flush();
      expect(passkeys.signInWithPasskey).toHaveBeenCalledTimes(1);
      expect(passkeys.signInWithPasskey.mock.calls[0][0].signal.aborted).toBe(false);
      expect(unlock(view).getAttribute('aria-busy')).toBe('true');
      expect($(view, '.preflight-unlock__label').textContent).toBe('Waiting for your passkey');
      await act(async () => { prompt.resolve({ success: true }); });
      expect($(view, '[data-step="second"] .preflight-step__summary').textContent).toBe('Passkey accepted');
      view.unmount();
    });

    it('does not re-open after a cancel: calm line, then it waits for a tap', async () => {
      offerPasskey();
      const message = 'The passkey prompt was closed, or this device has no passkey for the admin. Try again, or enter a code.';
      passkeys.signInWithPasskey.mockResolvedValue({ success: false, error: { code: 'cancelled', message } });
      const view = render();
      await flush();
      await flush();
      expect(passkeys.signInWithPasskey).toHaveBeenCalledTimes(1);
      expect($(view, '.preflight-msg--calm').textContent).toBe(message);
      expect(document.activeElement).toBe(unlock(view));
      // a trip to the code and back does not count as arriving again
      click(buttonByText(view, /^Use a code instead$/));
      await flush();
      click(buttonByText(view, /^Use passkey instead$/));
      await flush();
      await flush();
      expect(passkeys.signInWithPasskey).toHaveBeenCalledTimes(1);
      // the tap still works
      click(unlock(view));
      await flush();
      expect(passkeys.signInWithPasskey).toHaveBeenCalledTimes(2);
      view.unmount();
    });

    it('does not re-open after a refusal either', async () => {
      offerPasskey();
      passkeys.signInWithPasskey.mockResolvedValue({ success: false, error: { code: 'verification_failed', message: 'refused' } });
      const view = render();
      await flush();
      await flush();
      expect($(view, '[role="alert"]').textContent).toBe('refused');
      expect(passkeys.signInWithPasskey).toHaveBeenCalledTimes(1);
      view.unmount();
    });

    it('falls back to the one-tap row without a word when the browser wants a tap', async () => {
      offerPasskey();
      passkeys.signInWithPasskey.mockResolvedValueOnce({ success: false, error: { code: 'prompt_blocked', message: 'closed' } });
      const view = render();
      await flush();
      await flush();
      expect(passkeys.signInWithPasskey).toHaveBeenCalledTimes(1);
      expect($(view, '.preflight-msg')).toBeNull();
      expect(view.container.querySelector('[role="alert"]')).toBeNull();
      const row = unlock(view);
      expect(row.getAttribute('aria-busy')).toBeNull();
      expect($(view, '.preflight-unlock__label').textContent).toBe('Unlock with passkey');
      expect(document.activeElement).toBe(row);
      expect(onHoldChange.mock.calls).toEqual([[true], [false]]);
      // the tap that follows opens the prompt and signs in
      click(row);
      await flush();
      expect(passkeys.signInWithPasskey).toHaveBeenCalledTimes(2);
      expect(stepStates(view.container)).toEqual(['identity:done', 'second:done', 'launch:current']);
      view.unmount();
    });

    it('closes the open prompt when the code is chosen, and shows the code without a word', async () => {
      offerPasskey();
      const prompt = deferred();
      passkeys.signInWithPasskey.mockReturnValue(prompt.promise);
      const view = render();
      await flush();
      await flush();
      const { signal } = passkeys.signInWithPasskey.mock.calls[0][0];
      click(buttonByText(view, /^Use a code instead$/));
      await flush();
      expect(signal.aborted).toBe(true);
      expect(document.activeElement).toBe(codeInput(view));
      expect(codeInput(view).disabled).toBe(false);
      // the aborted attempt settles later and changes nothing
      await act(async () => { prompt.resolve({ success: false, error: { code: 'aborted', message: 'closed' } }); });
      expect($(view, '.preflight-msg')).toBeNull();
      expect(codeInput(view)).not.toBeNull();
      expect(onHoldChange.mock.calls).toEqual([[true], [false]]);
      setInputValue(codeInput(view), '123456');
      await flush();
      expect(verifyTotpChallenge).toHaveBeenCalledWith('f1', '123456');
      view.unmount();
    });

    it('closes an open prompt when the step goes away', async () => {
      offerPasskey();
      passkeys.signInWithPasskey.mockReturnValue(new Promise(() => {}));
      const view = render();
      await flush();
      await flush();
      const { signal } = passkeys.signInWithPasskey.mock.calls[0][0];
      view.unmount();
      expect(signal.aborted).toBe(true);
    });

    it('opens no prompt on a device without a passkey', async () => {
      passkeys.getPasskeyStatus.mockResolvedValue({ known: true, available: false, bridgeFactorId: null, passkeyCount: 0 });
      const view = render();
      await flush();
      await flush();
      expect(passkeys.signInWithPasskey).not.toHaveBeenCalled();
      expect(document.activeElement).toBe(codeInput(view));
      view.unmount();
    });
  });

  describe('automatic prompt switched off', () => {
    it('waits for a tap', async () => {
      offerPasskey();
      const view = render({ autoPromptPasskey: false });
      await flush();
      await flush();
      expect(passkeys.signInWithPasskey).not.toHaveBeenCalled();
      expect(unlock(view).getAttribute('aria-busy')).toBeNull();
      expect(document.activeElement).toBe(unlock(view));
      view.unmount();
    });
  });
});

describe('MfaCodeStep with the passkey bridge', () => {
  let canvas;

  beforeEach(() => {
    canvas = stubCanvas();
    window.matchMedia = () => ({ matches: false });
    onHoldChange = jest.fn();
    mockAuth = { refreshAssurance: jest.fn().mockResolvedValue({}), signOut: jest.fn(), user: { email: 'raunak@example.com' } };
    verifyTotpChallenge.mockResolvedValue({ success: true, data: { factorId: 'f1' } });
    passkeys.signInWithPasskey.mockResolvedValue({ success: true });
  });

  afterEach(() => { canvas.restore(); });

  const look = { id: 'look', friendly_name: 'Passkey bridge', status: 'verified' };
  const real = { id: 'real-bridge', friendly_name: 'Passkey bridge 1a2b3c4d', status: 'verified' };
  const phone = { id: 'f1', friendly_name: 'Phone', status: 'verified' };

  it('hides exactly the bridge factor the function reports and keeps a look-alike name selectable', async () => {
    // The list alone split by the prefix, so both carry the bridge name there.
    listTotpFactors.mockResolvedValue({ success: true, data: { verified: [phone], unverified: [], bridge: real, all: [look, real, phone] } });
    passkeys.getPasskeyStatus.mockResolvedValue({ known: true, available: false, bridgeFactorId: 'real-bridge', passkeyCount: 1 });
    const view = render();
    await flush();
    const options = Array.from(view.container.querySelectorAll('#admin-factor option')).map((o) => o.value);
    expect(options).toEqual(['look', 'f1']);
    view.unmount();
  });

  it('uses the list as given when the bridge id is unknown', async () => {
    listTotpFactors.mockResolvedValue({ success: true, data: { verified: [phone], unverified: [], bridge: real, all: [real, phone] } });
    passkeys.getPasskeyStatus.mockResolvedValue({ known: false, available: false, bridgeFactorId: undefined, passkeyCount: 0 });
    const view = render();
    await flush();
    expect(view.container.querySelector('#admin-factor')).toBeNull(); // one typed factor, no choice
    expect(document.activeElement).toBe(codeInput(view));
    view.unmount();
  });

  it('keeps the code usable after a rate-limited passkey attempt', async () => {
    listTotpFactors.mockResolvedValue({ success: true, data: { verified: [phone], unverified: [], bridge: real, all: [real, phone] } });
    passkeys.getPasskeyStatus.mockResolvedValue({ known: true, available: true, bridgeFactorId: 'real-bridge', passkeyCount: 1 });
    const message = 'Too many passkey attempts. Enter a code instead, or wait a few minutes and try again.';
    passkeys.signInWithPasskey.mockResolvedValue({ success: false, error: { code: 'rate_limited', message } });
    const view = render({ autoPromptPasskey: false });
    await flush();
    click(unlock(view));
    await flush();
    expect(view.container.querySelector('[role="alert"]').textContent).toBe(message);
    click(buttonByText(view, /^Use a code instead$/));
    await flush();
    expect(codeInput(view).disabled).toBe(false);
    setInputValue(codeInput(view), '123456');
    await flush();
    expect(verifyTotpChallenge).toHaveBeenCalledWith('f1', '123456');
    view.unmount();
  });
});

describe('PreflightSky', () => {
  let canvas, raf;

  beforeEach(() => {
    canvas = stubCanvas();
    raf = jest.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 1);
  });

  afterEach(() => { canvas.restore(); raf.mockRestore(); });

  it('drifts by default: one frame drawn at once and the loop requested', () => {
    window.matchMedia = () => ({ matches: false });
    const view = mount(<PreflightSky />);
    expect(view.container.querySelector('canvas').dataset.motion).toBe('drift');
    expect(canvas.calls.some(([name]) => name === 'arc')).toBe(true);
    expect(raf).toHaveBeenCalled();
    view.unmount();
  });

  it('gives a still sky under reduced motion: the frame is drawn and no loop runs', () => {
    window.matchMedia = (query) => ({ matches: query.includes('reduce') });
    const view = mount(<PreflightSky />);
    expect(view.container.querySelector('canvas').dataset.motion).toBe('still');
    expect(canvas.calls.filter(([name]) => name === 'clearRect').length).toBe(1);
    expect(canvas.calls.some(([name]) => name === 'stroke')).toBe(true); // the limb is part of the still frame
    expect(raf).not.toHaveBeenCalled();
    view.unmount();
  });
});
