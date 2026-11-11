/* eslint-disable testing-library/no-container, testing-library/render-result-naming-convention */
import { ThemeProvider } from '../../../contexts/ThemeContext';
import { SESSION_FACTS_KEY } from '../../../services/adminSessionFacts';
import { REDUCED_TIMELINE, TIMELINE } from './exitModel';
import AdminSignOut from './AdminSignOut';
import { React, act, mount, stubCanvas } from '../SkyBackground/testUtils';

const mockNavigate = jest.fn();
// react-router 7 ships package exports that this Jest cannot resolve, and the page only needs useNavigate.
jest.mock('react-router-dom', () => ({ useNavigate: () => mockNavigate }));
jest.mock('../../../services/authService', () => ({ signOutAdmin: jest.fn(), getAssuranceState: jest.fn() }));
const { signOutAdmin, getAssuranceState } = jest.requireMock('../../../services/authService');

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
    getAssuranceState.mockResolvedValue({ currentLevel: 'aal2' });
  });

  afterEach(() => { canvas.restore(); frames.restore(); performanceNow.mockRestore(); delete global.fetch; window.matchMedia = matchMediaOriginal; window.sessionStorage.clear(); });

  it('ends the session on mount and writes the chalk lines from the session facts', async () => {
    const view = render();
    await flush();
    expect(getAssuranceState).toHaveBeenCalledTimes(1);
    expect(signOutAdmin).toHaveBeenCalledTimes(1);
    const slate = view.container.querySelector('.exit-clap__slate').textContent;
    expect(slate).toContain('RC PORTFOLIO');
    expect(slate).toContain('2 CHANGES SAVED');
    expect(slate).toContain('RAUNAK CHOUDHARY');
    expect(view.container.querySelector('.exit-card__shubham').textContent).toBe('शुभम्');
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

  it('shows only the card, briefly, under reduced motion', async () => {
    window.matchMedia = () => ({ matches: true });
    const view = render();
    await flush();
    const el = root(view.container);
    frames.run(10000 + 100);
    expect(el.className).toContain('card');
    expect(el.className).not.toContain('clap-in');
    frames.run(10000 + REDUCED_TIMELINE.login);
    expect(mockNavigate).toHaveBeenCalledWith('/adminlogin', { replace: true });
    expect(performanceNow).toHaveBeenCalled();
    view.unmount();
  });
});
