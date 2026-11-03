import {
  VERBOSE_CONSOLE_METHODS,
  silenceVerboseConsoleInProduction,
} from './productionConsole';

/** A console double whose methods record calls, so tests never touch the real console. */
const createConsoleDouble = () => ({
  log: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
});

describe('silenceVerboseConsoleInProduction', () => {
  it('silences log, info and debug in production', () => {
    const target = createConsoleDouble();
    const originals = { ...target };

    const silenced = silenceVerboseConsoleInProduction({ env: 'production', target });

    expect(silenced).toBe(true);
    VERBOSE_CONSOLE_METHODS.forEach((method) => {
      target[method]('internal detail');
      expect(originals[method]).not.toHaveBeenCalled();
    });
  });

  it('keeps warn and error working in production so real failures stay visible', () => {
    const target = createConsoleDouble();

    silenceVerboseConsoleInProduction({ env: 'production', target });
    target.warn('degraded');
    target.error('failed');

    expect(target.warn).toHaveBeenCalledWith('degraded');
    expect(target.error).toHaveBeenCalledWith('failed');
  });

  it.each(['development', 'test', undefined])('leaves the console untouched when env is %s', (env) => {
    const target = createConsoleDouble();
    const originalLog = target.log;

    const silenced = silenceVerboseConsoleInProduction({ env, target });
    target.log('visible');

    expect(silenced).toBe(false);
    expect(target.log).toBe(originalLog);
    expect(originalLog).toHaveBeenCalledWith('visible');
  });

  it('returns false without throwing when no console is available', () => {
    expect(silenceVerboseConsoleInProduction({ env: 'production', target: null })).toBe(false);
  });

  it('skips methods the target does not implement', () => {
    const target = { log: jest.fn() };

    expect(() => silenceVerboseConsoleInProduction({ env: 'production', target })).not.toThrow();
    expect(target.info).toBeUndefined();
  });

  it('exposes an immutable list of silenced methods', () => {
    expect(Object.isFrozen(VERBOSE_CONSOLE_METHODS)).toBe(true);
    expect(VERBOSE_CONSOLE_METHODS).toEqual(['log', 'info', 'debug']);
  });
});
