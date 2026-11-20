/* eslint-disable testing-library/no-container, testing-library/render-result-naming-convention */
import { ThemeProvider } from '../../../contexts/ThemeContext';
import { SESSION_FACTS_KEY } from '../../../services/adminSessionFacts';
import { VOYAGE_POSITION_KEY } from '../../../services/voyagePosition';
import { REDUCED_TIMELINE, TIMELINE } from './exitModel';
import AdminSignOut, { SIGN_OUT_WAIT_MS } from './AdminSignOut';
import { React, act, mount, stubCanvas } from '../SkyBackground/testUtils';

const mockNavigate = jest.fn();
// react-router 7 ships package exports that this Jest cannot resolve, and the page only needs useNavigate.
jest.mock('react-router-dom', () => ({ useNavigate: () => mockNavigate }));
jest.mock('../../../services/authService', () => ({ signOutAdmin: jest.fn(), hasSecondFactorSession: jest.fn(), forgetLocalSession: jest.fn() }));
const { signOutAdmin, hasSecondFactorSession, forgetLocalSession } = jest.requireMock('../../../services/authService');
// The sounds are recorded, not played: which ones fire, and when, is part of the film's behaviour.
const mockSound = { log: [], options: [] };
jest.mock('./exitAudio', () => ({
  createExitAudio: (options) => {
    mockSound.options.push(options);
    const say = (name) => () => { mockSound.log.push(name); };
    return { clap: say('clap'), beep: say('beep'), whirOn: say('whirOn'), whirOff: say('whirOff'), unlock: say('unlock'), setEnabled: () => {}, dispose: () => {} };
  },
}));
// The backdrop is the voyage field; Three.js does not run in jsdom, so the field is a stand-in.
let mockWebgl = false;
jest.mock('../Voyage/webgl', () => ({ webglAvailable: () => mockWebgl }));
jest.mock('../Voyage/skyField', () => ({ createSkyField: jest.fn() }));
const { createSkyField } = jest.requireMock('../Voyage/skyField');

/** Lets the mount effects settle: the assurance lookup, the state update it causes, and the sign-out call. */
const flush = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); await Promise.resolve(); });

/** Drives the animation loop by hand: every requestAnimationFrame callback is kept and fired with a chosen time. */
function manualFrames() {
  const queue = [];
  const raf = jest.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => { queue.push(cb); return queue.length; });
  const caf = jest.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
  return { run: (time) => act(() => { const cbs = queue.splice(0); cbs.forEach((cb) => cb(time)); }), restore: () => { raf.mockRestore(); caf.mockRestore(); } };
}

const render = () => mount(
  <ThemeProvider>
    <AdminSignOut />
  </ThemeProvider>,
);
const root = (c) => c.querySelector('.exit');

describe('AdminSignOut', () => {
  let canvas, frames, matchMediaOriginal, performanceNow;

  beforeEach(() => {
    canvas = stubCanvas();
    frames = manualFrames();
    global.fetch = jest.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ figures: [] }) }));
    matchMediaOriginal = window.matchMedia;
    window.matchMedia = () => ({ matches: false });
    performanceNow = jest.spyOn(performance, 'now').mockReturnValue(10000);
    window.sessionStorage.setItem(SESSION_FACTS_KEY, JSON.stringify({ signedInAt: '2026-11-11T20:08:00Z', sections: ['dashboard', 'projects'], saves: 2 }));
    // CRA resets every mock before each test, so the module mocks get their behaviour here
    mockNavigate.mockClear();
    signOutAdmin.mockResolvedValue({ success: true });
    hasSecondFactorSession.mockResolvedValue(true);
    forgetLocalSession.mockResolvedValue(true);
    mockSound.log.length = 0; mockSound.options.length = 0;
  });

  afterEach(() => { mockWebgl = false; canvas.restore(); frames.restore(); performanceNow.mockRestore(); delete global.fetch; window.matchMedia = matchMediaOriginal; window.sessionStorage.clear(); });

  it('ends the session on mount and writes the chalk lines from the session facts', async () => {
    const view = render();
    await flush();
    expect(hasSecondFactorSession).toHaveBeenCalledTimes(1);
    expect(signOutAdmin).toHaveBeenCalledTimes(1);
    const slate = view.container.querySelector('.exit-clap__slate').textContent;
    expect(slate).toContain('RC PORTFOLIO');
    expect(slate).toContain('2 CHANGES SAVED');
    expect(slate).toContain('RAUNAK CHOUDHARY');
    expect(view.container.querySelector('.exit-card__shubham').textContent).toBe('शुभम्');
    view.unmount();
  });

  it('draws the mute toggle as a speaker line icon and swaps it when the sound is turned off', async () => {
    const view = render();
    await flush();
    const mute = view.container.querySelector('.exit-mute');
    expect(mute.getAttribute('title')).toBe('Sound on');
    expect(mute.querySelector('svg').getAttribute('class')).toContain('lucide-volume2');
    expect(mute.querySelector('svg').getAttribute('aria-hidden')).toBe('true');
    expect(mute.textContent).toBe('');
    act(() => { mute.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(mute.getAttribute('aria-pressed')).toBe('true');
    expect(mute.getAttribute('title')).toBe('Sound off');
    expect(mute.querySelector('svg').getAttribute('class')).toContain('lucide-volume-x');
    view.unmount();
  });

  it('moves through clapperboard, leader, credits and card, then returns to the login and forgets the session', async () => {
    const view = render();
    await flush();
    const el = root(view.container);
    frames.run(10000 + 500); expect(el.className).toContain('clap-in');
    frames.run(10000 + 2100); expect(el.className).toContain('snap');
    frames.run(10000 + 3000); expect(el.className).toContain('leader');
    expect(canvas.calls.some(([fn, args]) => fn === 'fillText' && args[0] === '3')).toBe(true);
    frames.run(10000 + 7000); expect(el.className).toContain('credits');
    const shown = [...view.container.querySelectorAll('.exit-plane')].filter((p) => Number(p.style.opacity) > 0);
    expect(shown.length).toBeGreaterThan(0);
    frames.run(10000 + 15000); expect(el.className).toContain('card');
    expect(mockNavigate).not.toHaveBeenCalled();
    frames.run(10000 + TIMELINE.login);
    expect(mockNavigate).toHaveBeenCalledWith('/adminlogin', { replace: true });
    expect(window.sessionStorage.getItem(SESSION_FACTS_KEY)).toBeNull();
    view.unmount();
  });

  it('lists the crew from the facts, with the second factor when verified', async () => {
    const view = render();
    await flush();
    const roles = [...view.container.querySelectorAll('.exit-crew__role')].map((e) => e.textContent);
    expect(roles).toEqual(['Signed in', 'Session', 'Changes saved', 'Sections visited', 'Second factor']);
    expect([...view.container.querySelectorAll('.exit-cast__lang')]).toHaveLength(7);
    view.unmount();
  });

  it('skips to the card on a click and to the login on Escape', async () => {
    const view = render();
    await flush();
    const el = root(view.container);
    frames.run(10000 + 1000);
    act(() => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    frames.run(10000 + 1020); expect(el.className).toContain('card');
    act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); });
    frames.run(10000 + 1040);
    expect(mockNavigate).toHaveBeenCalledWith('/adminlogin', { replace: true });
    view.unmount();
  });

  it('plays over the voyage sky at the recorded chapter and gives the WebGL context back before the login', async () => {
    mockWebgl = true;
    const field = { resize: jest.fn(), setTheme: jest.fn(), frame: jest.fn(), dispose: jest.fn() };
    createSkyField.mockImplementation(() => field);
    window.sessionStorage.setItem(VOYAGE_POSITION_KEY, JSON.stringify({ f: 4, chapter: 'projects', theme: 'dark' }));
    const view = render();
    await act(async () => { for (let i = 0; i < 4; i++) { await new Promise((r) => setTimeout(r, 0)); await Promise.resolve(); } });
    expect(view.container.querySelector('.exit-sky canvas.exit-voyage-field').dataset.chapter).toBe('projects');
    expect(view.container.querySelector('.exit-sky + .exit-dim')).not.toBeNull();   // the dim and the black still sit above the sky
    // the opaque black hides the sky from the cut to the end of the credits, so it is not painted then
    frames.run(10000 + 3000);
    const paintedDuringLeader = field.frame.mock.calls.length;
    frames.run(10000 + 3100);
    expect(field.frame.mock.calls.length).toBe(paintedDuringLeader);
    frames.run(10000 + TIMELINE.login);
    expect(field.dispose).toHaveBeenCalledTimes(1);
    expect(field.dispose.mock.invocationCallOrder[0]).toBeLessThan(mockNavigate.mock.invocationCallOrder[0]);
    expect(window.sessionStorage.getItem(VOYAGE_POSITION_KEY)).toBeNull();
    view.unmount();
    expect(field.dispose).toHaveBeenCalledTimes(1);
  });

  it('shows the voyage flat sky, not the classic one, without WebGL', async () => {
    const view = render();
    await flush();
    expect(view.container.querySelector('.exit-sky .voyage-flat-sky .sky-background')).not.toBeNull();
    expect(createSkyField).not.toHaveBeenCalled();
    view.unmount();
  });

  it('shows only the card, briefly, under reduced motion', async () => {
    window.matchMedia = () => ({ matches: true });
    const view = render();
    await flush();
    const el = root(view.container);
    frames.run(10000 + 100);
    expect(el.className).toContain('card');
    expect(el.className).not.toContain('clap-in');
    expect(view.container.querySelector('.exit-mute')).toBeNull();   // no sound under reduced motion, so no switch
    frames.run(10000 + REDUCED_TIMELINE.login);
    expect(mockNavigate).toHaveBeenCalledWith('/adminlogin', { replace: true });
    expect(performanceNow).toHaveBeenCalled();
    view.unmount();
  });

  describe('one film, played once', () => {
    /** A promise the test settles by hand. */
    const deferred = () => { let resolve; const promise = new Promise((r) => { resolve = r; }); return { promise, resolve }; };

    it('does not restart the clock or clap again when the second-factor line arrives mid-film', async () => {
      const level = deferred();
      hasSecondFactorSession.mockReturnValue(level.promise);
      const view = render();
      const el = root(view.container);
      frames.run(10000 + 1000); expect(el.className).toContain('clap-in');
      frames.run(10000 + 2100); expect(el.className).toContain('snap');
      expect(mockSound.log.filter((s) => s === 'clap')).toHaveLength(1);
      // the level arrives 2.2 s in; the credits gain a line and the component re-renders
      performanceNow.mockReturnValue(10000 + 2200);
      level.resolve(true);
      await flush();
      expect([...view.container.querySelectorAll('.exit-crew__role')].map((e) => e.textContent)).toContain('Second factor');
      // the film carries on from where it was: the cut to black and the leader, not the board rising again
      frames.run(10000 + 2400); expect(el.className).toContain('black'); expect(el.className).not.toContain('clap-in');
      frames.run(10000 + 3000); expect(el.className).toContain('leader');
      expect(mockSound.log.filter((s) => s === 'clap')).toHaveLength(1);
      expect(mockSound.options).toHaveLength(1);   // one loop, one sound object
      frames.run(10000 + TIMELINE.login);
      expect(mockNavigate).toHaveBeenCalledTimes(1);
      view.unmount();
    });

    it('a skip to the card before the board has clapped plays no clap', async () => {
      const view = render();
      await flush();
      const el = root(view.container);
      frames.run(10000 + 1000);
      act(() => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
      frames.run(10000 + 1020); expect(el.className).toContain('card');
      expect(mockSound.log).not.toContain('clap');
      expect(mockSound.log).toContain('unlock');   // the click is the gesture that allows sound
      view.unmount();
    });

    it('brings the projector whir back when sound is switched on again during the countdown', async () => {
      const view = render();
      await flush();
      const mute = view.container.querySelector('.exit-mute');
      frames.run(10000 + 3000);
      expect(mockSound.log.filter((s) => s === 'whirOn')).toHaveLength(1);
      act(() => { mute.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
      act(() => { mute.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
      expect(mockSound.log.filter((s) => s === 'whirOn')).toHaveLength(2);
      view.unmount();
    });

    it('starts sound at once after the sign-out click, and waits for a gesture on a visit without a session record', async () => {
      const first = render();
      await flush();
      expect(mockSound.options[0].eager).toBe(true);
      first.unmount();
      window.sessionStorage.clear();
      const direct = render();
      await flush();
      expect(mockSound.options[1].eager).toBe(false);
      direct.unmount();
    });
  });

  describe('the way to the login', () => {
    const deferred = () => { let resolve; const promise = new Promise((r) => { resolve = r; }); return { promise, resolve }; };

    it('waits for a sign-out still in flight after an early Escape', async () => {
      const request = deferred();
      signOutAdmin.mockReturnValue(request.promise);
      const view = render();
      await flush();
      frames.run(10000 + 300);
      act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); });
      frames.run(10000 + 320);
      await flush();
      expect(mockNavigate).not.toHaveBeenCalled();   // the session is still stored: the login would bounce to the dashboard
      request.resolve({ success: true });
      await flush();
      expect(mockNavigate).toHaveBeenCalledWith('/adminlogin', { replace: true });
      expect(forgetLocalSession).not.toHaveBeenCalled();
      view.unmount();
    });

    it('forgets the session on this device when the sign-out does not answer in time', async () => {
      // The one long wait is shortened to a tick; every other timer runs as usual.
      const realSetTimeout = window.setTimeout;
      const waits = [];
      const timers = jest.spyOn(window, 'setTimeout').mockImplementation((fn, ms, ...rest) => {
        if (ms === SIGN_OUT_WAIT_MS) { waits.push(ms); return realSetTimeout(fn, 0); }
        return realSetTimeout(fn, ms, ...rest);
      });
      try {
        signOutAdmin.mockReturnValue(new Promise(() => {}));   // never answers
        const view = render();
        await flush();
        frames.run(10000 + TIMELINE.login);
        expect(waits).toEqual([SIGN_OUT_WAIT_MS]);
        expect(mockNavigate).not.toHaveBeenCalled();
        await flush();
        await flush();
        expect(forgetLocalSession).toHaveBeenCalledTimes(1);
        expect(mockNavigate).toHaveBeenCalledWith('/adminlogin', { replace: true });
        expect(forgetLocalSession.mock.invocationCallOrder[0]).toBeLessThan(mockNavigate.mock.invocationCallOrder[0]);
        view.unmount();
      } finally { timers.mockRestore(); }
    });
  });
});
