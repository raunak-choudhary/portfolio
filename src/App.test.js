// App-level tracking start-up: the app starts visitor tracking once on mount
// and hands the returned cleanup back to React, so the engaged clock stops
// when the app unmounts.

import App from './App';
import visitorTrackingService from './services/visitorTrackingService';
import { React, mount } from './components/admin/SkyBackground/testUtils';

// react-router 7 ships package exports this Jest cannot resolve; App only needs the router shell.
jest.mock('react-router-dom', () => ({
  BrowserRouter: ({ children }) => children
}));
jest.mock('./Router', () => () => <p data-testid="routes" />);
jest.mock('./contexts/ThemeContext', () => ({
  ThemeProvider: ({ children }) => children
}));
jest.mock('./utils/viewportUtils', () => ({
  viewportUtils: { init: jest.fn(), reset: jest.fn() }
}));
jest.mock('./services/visitorTrackingService', () => ({
  __esModule: true,
  default: { initializeVisitorTracking: jest.fn() }
}));

describe('App visitor tracking', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('initialises tracking once and stops it on unmount', () => {
    const stop = jest.fn();
    visitorTrackingService.initializeVisitorTracking.mockReturnValue(stop);

    const view = mount(<App />);
    expect(visitorTrackingService.initializeVisitorTracking).toHaveBeenCalledTimes(1);
    expect(stop).not.toHaveBeenCalled();

    view.unmount();
    expect(stop).toHaveBeenCalledTimes(1);
  });

  it('still renders when tracking start-up throws', () => {
    const error = jest.spyOn(console, 'error').mockImplementation(() => {});
    visitorTrackingService.initializeVisitorTracking.mockImplementation(() => {
      throw new Error('storage blocked');
    });

    const view = mount(<App />);
    expect(view.container.querySelector('[data-testid="routes"]')).not.toBeNull();
    expect(() => view.unmount()).not.toThrow();
    error.mockRestore();
  });
});
