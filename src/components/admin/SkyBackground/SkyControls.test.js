/* eslint-disable testing-library/no-container, testing-library/render-result-naming-convention */
import { ThemeProvider } from '../../../contexts/ThemeContext';
import SkyControls, { describeSky } from './SkyControls';
import { SkySettingsProvider, useSkySettings } from './SkySettingsContext';
import { React, act, click, mount, setInputValue } from './testUtils';

function Probe() {
  const { settings } = useSkySettings();
  return <output data-testid="state">{JSON.stringify(settings)}</output>;
}

const memoryStorage = () => { const data = {}; return { getItem: (k) => data[k] ?? null, setItem: (k, v) => { data[k] = v; } }; };
const render = () => mount(
  <ThemeProvider>
    <SkySettingsProvider storage={memoryStorage()} now={() => new Date('2026-11-11T05:00:00Z')}>
      <SkyControls />
      <Probe />
    </SkySettingsProvider>
  </ThemeProvider>,
);
const state = (c) => JSON.parse(c.querySelector('[data-testid="state"]').textContent);
const panel = (c) => c.querySelector('.sky-controls__panel');

describe('SkyControls', () => {
  it('opens a labelled dialog from the Sky button and closes it on Escape', () => {
    const view = render();
    const button = view.container.querySelector('.sky-controls__button');
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(panel(view.container)).toBeNull();
    click(button);
    expect(button.getAttribute('aria-expanded')).toBe('true');
    expect(panel(view.container).getAttribute('role')).toBe('dialog');
    act(() => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); });
    expect(panel(view.container)).toBeNull();
    view.unmount();
  });

  it('changes the theme mode, the layer toggles and the sliders', () => {
    const view = render();
    click(view.container.querySelector('.sky-controls__button'));
    const segments = [...panel(view.container).querySelectorAll('.sky-controls__segment')];
    click(segments.find((b) => b.textContent === 'Day'));
    expect(state(view.container).themeMode).toBe('light');
    expect(segments.find((b) => b.textContent === 'Day').getAttribute('aria-pressed')).toBe('true');

    const switches = [...panel(view.container).querySelectorAll('input[type="checkbox"]')];
    expect(switches).toHaveLength(4);
    setInputValue(switches[0], false);   // drawings
    setInputValue(switches[3], false);   // panels
    expect(state(view.container)).toMatchObject({ drawings: false, panels: false, clouds: true });

    const [glass, blur] = panel(view.container).querySelectorAll('input[type="range"]');
    setInputValue(glass, '0.42');
    setInputValue(blur, '12');
    expect(state(view.container)).toMatchObject({ glass: 0.42, blur: 12 });
    expect(panel(view.container).textContent).toContain('0.42');
    expect(panel(view.container).textContent).toContain('12px');
    view.unmount();
  });

  it('shows the Moon and the time of day in its foot', () => {
    expect(describeSky('dark', new Date('2026-11-26T02:00:00Z'))).toMatch(/^Night over New York · Moon 9\d% waning$/);
    expect(describeSky('light', new Date('2026-11-11T17:00:00Z'))).toMatch(/^Day over New York · Moon \d+% waxing$/);
  });
});
