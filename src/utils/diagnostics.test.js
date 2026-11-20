import { DEBUG_KEY, diagnosticsOn, reportFailure } from './diagnostics';

const storageWith = (value) => ({ getItem: (key) => (key === DEBUG_KEY ? value : null) });

describe('diagnostics', () => {
  it('prints nothing for a handled failure unless diagnostics are switched on', () => {
    const target = { error: jest.fn() };
    expect(reportFailure('Admin save failed for projects', new Error('denied'), { storage: storageWith(null), target })).toBe(false);
    expect(target.error).not.toHaveBeenCalled();
  });

  it('prints the context and the error once the switch is on', () => {
    const target = { error: jest.fn() };
    const error = new Error('denied');
    expect(reportFailure('Admin save failed for projects', error, { storage: storageWith('1'), target })).toBe(true);
    expect(target.error).toHaveBeenCalledWith('[rc-debug] Admin save failed for projects', error);
  });

  it('treats storage that throws, or any other value, as off', () => {
    expect(diagnosticsOn({ getItem: () => { throw new Error('blocked'); } })).toBe(false);
    expect(diagnosticsOn(storageWith('true'))).toBe(false);
    expect(diagnosticsOn(storageWith('1'))).toBe(true);
  });

  it('leaves the real console alone by default', () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    window.localStorage.removeItem(DEBUG_KEY);
    reportFailure('anything', new Error('x'));
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
