// src/utils/productionConsole.js
//
// Keeps the browser console quiet in production.
//
// The codebase carries several hundred diagnostic `console.log` calls that
// print internal state (query results, storage paths, session details).
// Create React App 5 cannot configure its minifier to drop them without
// ejecting, so this module neutralises the verbose levels at startup
// instead. `console.warn` and `console.error` are deliberately preserved so
// genuine failures still reach the console and any error reporting.

/** Console methods silenced in production. */
export const VERBOSE_CONSOLE_METHODS = Object.freeze(['log', 'info', 'debug']);

const noop = () => {};

/**
 * Replaces the verbose console methods with no-ops when running a
 * production build. Development and test environments are left untouched.
 *
 * Inputs are injectable so the behaviour can be tested without mutating the
 * real global console or depending on the build-time NODE_ENV.
 *
 * @param {object} [options]
 * @param {string} [options.env=process.env.NODE_ENV] build environment name.
 * @param {Console} [options.target=console] console to modify.
 * @returns {boolean} true if the console was silenced, false otherwise.
 */
export const silenceVerboseConsoleInProduction = ({
  env = process.env.NODE_ENV,
  target = console,
} = {}) => {
  if (env !== 'production' || !target) {
    return false;
  }

  VERBOSE_CONSOLE_METHODS.forEach((method) => {
    if (typeof target[method] === 'function') {
      target[method] = noop;
    }
  });

  return true;
};
