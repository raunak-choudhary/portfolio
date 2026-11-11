/* eslint-disable testing-library/no-container, testing-library/render-result-naming-convention */
import { ThemeProvider } from '../../../contexts/ThemeContext';
import { SETTINGS_STORAGE_KEY } from './skyModel';
import { SkySettingsProvider, useSkySettings } from './SkySettingsContext';
import { React, act, click, mount } from './testUtils';

/** A probe that shows the context and offers buttons to change it. */
function Probe() {
  const { settings, update, reset, resolvedTheme, effectiveMotion } = useSkySettings();
  return (
    <div>
      <output data-testid="state">{JSON.stringify({ ...settings, resolvedTheme, effectiveMotion })}</output>
      <button data-testid="day" onClick={() => update({ themeMode: 'light' })}>day</button>
      <button data-testid="auto" onClick={() => update({ themeMode: 'auto' })}>auto</button>
      <button data-testid="bad" onClick={() => update({ glass: 99, blur: 'x', themeMode: 'neon' })}>bad</button>
      <button data-testid="reset" onClick={reset}>reset</button>
    </div>
  );
}

const memoryStorage = (seed = {}) => {
  const data = { ...seed };
  return { getItem: (k) => (k in data ? data[k] : null), setItem: (k, v) => { data[k] = v; }, data };
};

const render = ({ storage, now }) => mount(
  <ThemeProvider>
    <SkySettingsProvider storage={storage} now={now}>
      <Probe />
    </SkySettingsProvider>
  </ThemeProvider>,
);
const state = (container) => JSON.parse(container.querySelector('[data-testid="state"]').textContent);

describe('SkySettingsProvider', () => {
  const noon = () => new Date('2026-11-11T17:00:00Z');
  const midnight = () => new Date('2026-11-11T05:00:00Z');

  afterEach(() => { document.documentElement.style.removeProperty('--sky-glass'); document.documentElement.style.removeProperty('--sky-blur'); });

  it('starts from defaults, follows the New York clock and drives the site theme', () => {
    const storage = memoryStorage();
    const view = render({ storage, now: midnight });
    expect(state(view.container)).toMatchObject({ themeMode: 'auto', glass: 0.1, blur: 5, resolvedTheme: 'dark' });
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    view.unmount();

    const day = render({ storage, now: noon });
    expect(state(day.container).resolvedTheme).toBe('light');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    day.unmount();
  });

  it('restores remembered settings and ignores a malformed entry', () => {
    const good = memoryStorage({ [SETTINGS_STORAGE_KEY]: JSON.stringify({ themeMode: 'dark', drawings: false, glass: 0.3, blur: 12 }) });
    const view = render({ storage: good, now: noon });
    expect(state(view.container)).toMatchObject({ themeMode: 'dark', drawings: false, glass: 0.3, blur: 12, resolvedTheme: 'dark' });
    view.unmount();

    const bad = memoryStorage({ [SETTINGS_STORAGE_KEY]: '{not json' });
    const second = render({ storage: bad, now: noon });
    expect(state(second.container)).toMatchObject({ themeMode: 'auto', drawings: true });
    second.unmount();
  });

  it('sanitises updates, persists them and exposes the glass values to CSS', () => {
    const storage = memoryStorage();
    const view = render({ storage, now: midnight });
    click(view.container.querySelector('[data-testid="day"]'));
    expect(state(view.container).resolvedTheme).toBe('light');
    click(view.container.querySelector('[data-testid="bad"]'));
    expect(state(view.container)).toMatchObject({ glass: 0.8, blur: 5, themeMode: 'light' });
    expect(JSON.parse(storage.data[SETTINGS_STORAGE_KEY])).toMatchObject({ glass: 0.8, themeMode: 'light' });
    expect(document.documentElement.style.getPropertyValue('--sky-glass')).toBe('0.8');
    expect(document.documentElement.style.getPropertyValue('--sky-blur')).toBe('5px');
    click(view.container.querySelector('[data-testid="reset"]'));
    expect(state(view.container)).toMatchObject({ glass: 0.1, themeMode: 'auto', resolvedTheme: 'dark' });
    view.unmount();
  });

  it('re-checks the clock every minute in auto mode', () => {
    jest.useFakeTimers();
    let current = new Date('2026-11-11T05:00:00Z');
    const view = render({ storage: memoryStorage(), now: () => current });
    expect(state(view.container).resolvedTheme).toBe('dark');
    current = new Date('2026-11-11T17:00:00Z');
    act(() => { jest.advanceTimersByTime(60 * 1000); });
    expect(state(view.container).resolvedTheme).toBe('light');
    view.unmount();
    jest.useRealTimers();
  });

  it('refuses to work outside the provider', () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => mount(<Probe />)).toThrow(/within a SkySettingsProvider/);
    spy.mockRestore();
  });
});
