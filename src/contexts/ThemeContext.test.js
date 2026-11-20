/* eslint-disable testing-library/no-container, testing-library/render-result-naming-convention */
import { ThemeProvider, useTheme } from './ThemeContext';
import { React, click, mount } from '../components/admin/SkyBackground/testUtils';

function Probe() {
  const { theme, toggleTheme } = useTheme();
  return <button type="button" onClick={toggleTheme}>{theme}</button>;
}

describe('ThemeProvider', () => {
  afterEach(() => { jest.restoreAllMocks(); window.localStorage.clear(); });

  it('reads the saved theme, applies it to the document and remembers a change', () => {
    window.localStorage.setItem('portfolio-theme', 'light');
    const view = mount(<ThemeProvider><Probe /></ThemeProvider>);
    expect(view.container.textContent).toBe('light');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    click(view.container.querySelector('button'));
    expect(document.body.getAttribute('data-theme')).toBe('dark');
    expect(window.localStorage.getItem('portfolio-theme')).toBe('dark');
    view.unmount();
  });

  it('keeps working when storage refuses the write (blocked site data, a full quota)', () => {
    jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('The quota has been exceeded.', 'QuotaExceededError'); });
    const errors = jest.spyOn(console, 'error').mockImplementation(() => {});
    const view = mount(<ThemeProvider><Probe /></ThemeProvider>);
    expect(view.container.textContent).toBe('dark');
    click(view.container.querySelector('button'));
    expect(view.container.textContent).toBe('light');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    expect(errors).not.toHaveBeenCalled();
    view.unmount();
  });

  it('applies a theme set with persist false without touching the saved preference', () => {
    window.localStorage.setItem('portfolio-theme', 'dark');
    function Clock() {
      const { theme, setLightTheme } = useTheme();
      return <button type="button" onClick={() => setLightTheme({ persist: false })}>{theme}</button>;
    }
    const view = mount(<ThemeProvider><Clock /></ThemeProvider>);
    click(view.container.querySelector('button'));
    expect(view.container.textContent).toBe('light');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    expect(window.localStorage.getItem('portfolio-theme')).toBe('dark');
    view.unmount();
  });

  it('has the theme on the document before any passive effect of the first commit runs (no frame in the other palette)', () => {
    window.localStorage.setItem('portfolio-theme', 'light');
    document.documentElement.removeAttribute('data-theme');
    const seen = [];
    function Child() {
      React.useEffect(() => { seen.push(document.documentElement.getAttribute('data-theme')); }, []);
      return null;
    }
    const view = mount(<ThemeProvider><Child /></ThemeProvider>);
    expect(seen).toEqual(['light']);
    view.unmount();
  });

  it('applies a theme a child sets in its layout effect, unsaved, before the first passive effects', () => {
    window.localStorage.setItem('portfolio-theme', 'dark');
    const seen = [];
    function Sky() {
      const { theme, setLightTheme } = useTheme();
      React.useLayoutEffect(() => { if (theme !== 'light') setLightTheme({ persist: false }); }, [theme, setLightTheme]);
      React.useEffect(() => { seen.push(document.documentElement.getAttribute('data-theme')); });
      return null;
    }
    const view = mount(<ThemeProvider><Sky /></ThemeProvider>);
    expect(seen[seen.length - 1]).toBe('light');
    expect(document.body.getAttribute('data-theme')).toBe('light');
    expect(window.localStorage.getItem('portfolio-theme')).toBe('dark');
    view.unmount();
  });
});
