// src/utils/diagnostics.js
//
// Where handled failures go instead of the browser console.
//
// The admin's services catch their own failures and hand the caller a result
// it can act on (a typed error, `{ success: false }`, or a safe empty shape),
// and the screen then says what happened in plain words. Printing the same
// failure with console.error as well only fills the console with red lines
// for things that were already dealt with, so those calls come here.
//
// Nothing is printed unless diagnostics are switched on for this browser:
//   localStorage.setItem('rc-debug', '1')    then reload
// With the switch on, each failure is printed with its context, in any build.
// Unhandled errors never pass through here and still reach the console.

/** The localStorage key that switches diagnostics on (value "1"). */
export const DEBUG_KEY = 'rc-debug';

/** True when this browser asked for diagnostics. Storage that cannot be read means no. */
export function diagnosticsOn(storage) {
  try {
    const store = storage ?? (typeof window !== 'undefined' ? window.localStorage : null);
    return store?.getItem(DEBUG_KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * Records a failure that the caller has already handled.
 * @param {string} context what was being done, e.g. "Admin save failed for projects".
 * @param {unknown} [error] the error or detail that came back.
 * @param {{ storage?: Storage, target?: Console }} [options] injectable for tests.
 * @returns {boolean} true when the failure was printed.
 */
export function reportFailure(context, error, { storage, target = console } = {}) {
  if (!diagnosticsOn(storage)) return false;
  target.error(`[rc-debug] ${context}`, error ?? '');
  return true;
}
