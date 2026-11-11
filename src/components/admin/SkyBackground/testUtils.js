// src/components/admin/SkyBackground/testUtils.js
//
// Small helpers for the sky component tests: a React 19 render into jsdom
// without Testing Library, and a recording stand-in for the 2D canvas
// context (jsdom has no canvas).

import React, { act } from 'react';
import { createRoot } from 'react-dom/client';

global.IS_REACT_ACT_ENVIRONMENT = true;

/** Mounts an element and returns the container plus helpers to re-render and unmount. */
export function mount(element) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(element));
  return {
    container,
    rerender: (next) => act(() => root.render(next)),
    unmount: () => { act(() => root.unmount()); container.remove(); },
  };
}

/** Fires a React-visible change on a checkbox, range or text input. */
export function setInputValue(input, value) {
  const proto = Object.getPrototypeOf(input);
  const setter = Object.getOwnPropertyDescriptor(proto, input.type === 'checkbox' ? 'checked' : 'value').set;
  act(() => {
    setter.call(input, value);
    input.dispatchEvent(new Event(input.type === 'checkbox' ? 'click' : 'input', { bubbles: true }));
  });
}

export const click = (element) => act(() => { element.dispatchEvent(new MouseEvent('click', { bubbles: true })); });

/**
 * A 2D context that accepts any call and records it. Gradient factories return
 * objects with addColorStop so renderer code runs unchanged.
 */
export function fakeContext(calls = []) {
  const state = {};
  return new Proxy(state, {
    get(target, prop) {
      if (prop in target) return target[prop];
      if (prop === 'measureText') return (text) => ({ width: String(text).length * 6 });
      if (prop === 'getImageData') return () => ({ data: new Uint8ClampedArray(4) });
      return (...args) => {
        // a real CanvasRenderingContext2D throws on NaN or Infinity; so does this stand-in
        for (const arg of args) if (typeof arg === 'number' && !Number.isFinite(arg)) throw new TypeError(`${String(prop)} received a non-finite value`);
        calls.push([prop, args]);
        return String(prop).startsWith('create') ? { addColorStop() {} } : undefined;
      };
    },
    set(target, prop, value) { target[prop] = value; return true; },
  });
}

/** Replaces canvas.getContext for the duration of a test. Returns the recorded calls and a restore function. */
export function stubCanvas() {
  const calls = [];
  const original = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function getContext() { return fakeContext(calls); };
  return { calls, restore: () => { HTMLCanvasElement.prototype.getContext = original; } };
}

export { React, act };
