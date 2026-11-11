// src/components/admin/AdminWelcome/adminReadiness.js
//
// A tiny signal from the dashboard to the entry screen: "my first data has
// arrived". The entry screen holds its final second (showing LOADING JUMP
// PROGRAM) only if this has not fired by then, so the rain never hides a
// still-empty dashboard, and never waits forever either.

let ready = false;
const listeners = new Set();

export const markDashboardReady = () => {
  ready = true;
  listeners.forEach((fn) => fn());
  listeners.clear();
};

/** Calls back at once when already ready, otherwise when the dashboard reports in. Returns an unsubscribe. */
export const onDashboardReady = (fn) => {
  if (ready) { fn(); return () => {}; }
  listeners.add(fn);
  return () => listeners.delete(fn);
};

/** For tests and for a fresh login after sign-out. */
export const resetDashboardReady = () => { ready = false; listeners.clear(); };
export const isDashboardReady = () => ready;
