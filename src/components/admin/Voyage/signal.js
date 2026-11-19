// src/components/admin/Voyage/signal.js
//
// A value the animation loop writes and a few small components read. Setting
// React state from the loop re-rendered the whole voyage (sixteen chapters and
// their decks) whenever the live chapter or the Earth readout changed, which the
// 4x CPU trace showed as 80 ms scheduler tasks mid-scroll. A signal notifies
// only its subscribers, read through useSyncExternalStore, so just the rail,
// the progress bar and the readout re-render.

import { useSyncExternalStore } from 'react';

/**
 * @template T
 * @param {T} initial
 * @returns {{get(): T, set(next: T): void, subscribe(listener: () => void): () => void}}
 */
export function createSignal(initial) {
  let value = initial;
  const listeners = new Set();
  return {
    get: () => value,
    /** Store and notify, but only when the value actually changed (Object.is), so the loop may call it every frame. */
    set(next) {
      if (Object.is(next, value)) return;
      value = next;
      listeners.forEach((listener) => listener());
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

/** Read a signal in a component; it re-renders when the value changes. */
export function useSignal(signal) {
  return useSyncExternalStore(signal.subscribe, signal.get, signal.get);
}
