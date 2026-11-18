/* eslint-disable testing-library/no-container, testing-library/render-result-naming-convention */
// Step 02 (authenticator code) and step 03 (launch) of the login, plus the
// sky behind every step: drifting by default, one still frame under reduced
// motion.

import { ThemeProvider } from '../../../contexts/ThemeContext';
import { GOOGLE_PENDING_KEY } from '../../../services/authService';
import MfaCodeStep, { LAUNCH_HOLD_MS } from './MfaCodeStep';
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

const NOW = new Date('2026-11-18T02:14:00Z');
const flush = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
const wait = (ms) => act(async () => { await new Promise((resolve) => setTimeout(resolve, ms)); });
const submit = (form) => act(async () => { form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
const stepStates = (container) => Array.from(container.querySelectorAll('.preflight-step'))
  .map((step) => `${step.dataset.step}:${step.className.replace(/.*preflight-step--/, '')}`);

let onHoldChange;
const render = () => mount(
  <ThemeProvider>
    <MfaCodeStep now={NOW} onHoldChange={onHoldChange} />
  </ThemeProvider>
);

describe('MfaCodeStep (pre-flight steps 02 and 03)', () => {
  let canvas;

  beforeEach(() => {
    canvas = stubCanvas();
    window.matchMedia = () => ({ matches: false });
    onHoldChange = jest.fn();
    mockAuth = { refreshAssurance: jest.fn().mockResolvedValue({}), signOut: jest.fn(), user: { email: 'raunak@example.com' } };
    listTotpFactors.mockResolvedValue({ success: true, data: { verified: [{ id: 'f1', friendly_name: 'Phone' }], unverified: [] } });
    verifyTotpChallenge.mockResolvedValue({ success: true, data: { factorId: 'f1' } });
  });

  afterEach(() => { canvas.restore(); window.sessionStorage.clear(); });

  it('lights 02 Second key, checks 01 Identity with the masked address, and focuses the code', async () => {
    window.sessionStorage.setItem(GOOGLE_PENDING_KEY, '1');
    const view = render();
    await flush();
    expect(stepStates(view.container)).toEqual(['identity:done', 'second:current', 'launch:pending']);
    const identity = view.container.querySelector('[data-step="identity"]');
    expect(identity.querySelector('.preflight-step__check svg')).not.toBeNull();
    expect(identity.querySelector('.preflight-step__summary').textContent).toBe('Signed in as rau•••••@example.com');
    const code = view.container.querySelector('#admin-totp-code');
    expect(document.activeElement).toBe(code);
    expect(code.getAttribute('autocomplete')).toBe('one-time-code');
    expect(code.getAttribute('inputmode')).toBe('numeric');
    expect(code.type).toBe('password');
    // a Google round trip that reached this step is finished
    expect(window.sessionStorage.getItem(GOOGLE_PENDING_KEY)).toBeNull();
    view.unmount();
  });

  it('shows the authenticator error as a fixed sentence and clears the field', async () => {
    verifyTotpChallenge.mockResolvedValue({ success: false, error: { message: 'That code is wrong or has expired. Enter the current code from your app.' } });
    const view = render();
    await flush();
    const code = view.container.querySelector('#admin-totp-code');
    setInputValue(code, '000000');
    await submit(code.form);
    await flush();
    expect(view.container.querySelector('[role="alert"]').textContent).toBe('That code is wrong or has expired. Enter the current code from your app.');
    expect(code.value).toBe('');
    expect(mockAuth.refreshAssurance).not.toHaveBeenCalled();
    // the route was held for the attempt and released when it failed
    expect(onHoldChange.mock.calls).toEqual([[true], [false]]);
    view.unmount();
  });

  it('lights 03 Launch, goes to black, then hands over to the route', async () => {
    const view = render();
    await flush();
    const code = view.container.querySelector('#admin-totp-code');
    setInputValue(code, '123456');
    await submit(code.form);
    await flush();
    expect(verifyTotpChallenge).toHaveBeenCalledWith('f1', '123456');
    expect(stepStates(view.container)).toEqual(['identity:done', 'second:done', 'launch:current']);
    expect(view.container.querySelector('.preflight').classList.contains('preflight--launching')).toBe(true);
    expect(view.container.querySelector('.preflight-launch').textContent).toBe('Entry starting');
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
    click(Array.from(view.container.querySelectorAll('button')).find((b) => b.textContent === 'Sign out'));
    expect(mockAuth.signOut).toHaveBeenCalled();
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
