// The trend chart is shorter on narrow windows, and follows the window when it
// changes (a phone turned on its side), not only its width at first render.
import TrendChart, { NARROW_QUERY } from './TrendChart';
import { React, act, mount } from '../SkyBackground/testUtils';

// Recharts needs real layout; only the height handed to its container is under test.
jest.mock('recharts', () => {
  const ReactLib = require('react');
  const Pass = ({ children }) => ReactLib.createElement(ReactLib.Fragment, null, children);
  return {
    ResponsiveContainer: ({ height }) => ReactLib.createElement('div', { 'data-testid': 'chart', 'data-height': height }),
    ComposedChart: Pass, CartesianGrid: Pass, XAxis: Pass, YAxis: Pass, Tooltip: Pass, Line: Pass, Area: Pass,
  };
});

describe('TrendChart height', () => {
  const realMatchMedia = window.matchMedia;
  let listeners, media;

  beforeEach(() => {
    listeners = new Set();
    media = { matches: false, addEventListener: (_, fn) => listeners.add(fn), removeEventListener: (_, fn) => listeners.delete(fn) };
    window.matchMedia = jest.fn(() => media);
  });
  afterEach(() => { window.matchMedia = realMatchMedia; });

  const props = { points: [], ticks: [], curName: 'Now', prevName: 'Before', summary: 'Visits' };
  const height = (view) => view.container.querySelector('[data-testid="chart"]').getAttribute('data-height');

  it('starts from the window it opens in', () => {
    media.matches = true;
    const view = mount(<TrendChart {...props} />);
    expect(window.matchMedia).toHaveBeenCalledWith(NARROW_QUERY);
    expect(height(view)).toBe('170');
    view.unmount();
  });

  it('changes height when the window crosses the narrow width, and stops listening on unmount', () => {
    const view = mount(<TrendChart {...props} />);
    expect(height(view)).toBe('210');
    act(() => { listeners.forEach((fn) => fn({ matches: true })); });
    expect(height(view)).toBe('170');
    act(() => { listeners.forEach((fn) => fn({ matches: false })); });
    expect(height(view)).toBe('210');
    view.unmount();
    expect(listeners.size).toBe(0);
  });

  it('draws at the wide height where the browser has no matchMedia', () => {
    window.matchMedia = undefined;
    const view = mount(<TrendChart {...props} />);
    expect(height(view)).toBe('210');
    view.unmount();
  });
});
