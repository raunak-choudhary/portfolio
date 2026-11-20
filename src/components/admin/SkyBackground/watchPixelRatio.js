// src/components/admin/SkyBackground/watchPixelRatio.js
//
// A change of device pixel ratio (the window dragged to a screen with another
// density, or the browser zoom changed) fires no resize event, so a canvas
// sized for the old ratio stays soft or oversized. A `(resolution: Ndppx)`
// media query matches only the current ratio; when it stops matching, the
// ratio has changed, the callback runs, and a query for the new ratio is
// armed in its place.

/**
 * @param {() => void} onChange called after every change of devicePixelRatio.
 * @param {Window} [view] injectable for tests.
 * @returns {() => void} stops watching.
 */
export function watchPixelRatio(onChange, view = typeof window !== 'undefined' ? window : undefined) {
  if (!view || typeof view.matchMedia !== 'function') return () => {};
  let query = null, stopped = false;
  const changed = () => { if (stopped) return; arm(); onChange(); };
  const disarm = () => { query?.removeEventListener?.('change', changed); query = null; };
  const arm = () => {
    disarm();
    try { query = view.matchMedia(`(resolution: ${view.devicePixelRatio || 1}dppx)`); } catch { query = null; }
    // older Safari has only addListener; without either, there is nothing to watch
    if (query && typeof query.addEventListener !== 'function') query = null;
    query?.addEventListener('change', changed);
  };
  arm();
  return () => { stopped = true; disarm(); };
}
