import { getViewportFixer, viewportUtils } from './viewportUtils';

// jsdom reports a zero-width window, which the fixer treats as a scaling
// problem and warns about; that warning is expected here and not under test.
beforeEach(() => {
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('viewportUtils', () => {
  it('creates one shared fixer and returns the same instance on later calls', () => {
    const first = viewportUtils.init();
    const second = viewportUtils.init();

    expect(first).toBe(second);
    expect(getViewportFixer()).toBe(first);
  });

  it('does not publish the fixer on window outside development builds', () => {
    // Jest runs with NODE_ENV=test; production behaves the same way.
    viewportUtils.init();

    expect(window.viewportFixer).toBeUndefined();
  });

  it('reset uses the shared fixer without throwing', () => {
    const fixer = viewportUtils.init();
    const forceReset = jest.spyOn(fixer, 'forceReset');

    expect(() => viewportUtils.reset()).not.toThrow();
    expect(forceReset).toHaveBeenCalledTimes(1);
  });
});
