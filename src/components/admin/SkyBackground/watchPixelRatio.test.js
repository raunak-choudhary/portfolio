// src/components/admin/SkyBackground/watchPixelRatio.test.js

import { watchPixelRatio } from './watchPixelRatio';

/** A window stand-in whose matchMedia hands back controllable queries. */
function fakeView(ratio = 1) {
  const queries = [];
  const view = {
    devicePixelRatio: ratio,
    matchMedia: jest.fn((media) => {
      const listeners = new Set();
      const query = { media, addEventListener: (_, fn) => listeners.add(fn), removeEventListener: (_, fn) => listeners.delete(fn), fire: () => [...listeners].forEach((fn) => fn()), listeners };
      queries.push(query);
      return query;
    }),
  };
  return { view, queries };
}

describe('watchPixelRatio', () => {
  test('calls back when the ratio changes and arms a query for the new ratio', () => {
    const { view, queries } = fakeView(1);
    const onChange = jest.fn();
    watchPixelRatio(onChange, view);
    expect(queries[0].media).toBe('(resolution: 1dppx)');

    view.devicePixelRatio = 2;
    queries[0].fire();
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(queries[1].media).toBe('(resolution: 2dppx)');
    expect(queries[0].listeners.size).toBe(0);

    view.devicePixelRatio = 1;
    queries[1].fire();
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  test('stops watching when asked', () => {
    const { view, queries } = fakeView(2);
    const onChange = jest.fn();
    const stop = watchPixelRatio(onChange, view);
    stop();
    expect(queries[0].listeners.size).toBe(0);
    queries[0].fire();
    expect(onChange).not.toHaveBeenCalled();
  });

  test('does nothing where matchMedia is missing or refuses the query', () => {
    expect(() => watchPixelRatio(jest.fn(), {})()).not.toThrow();
    expect(() => watchPixelRatio(jest.fn(), { devicePixelRatio: 1, matchMedia: () => { throw new Error('no'); } })()).not.toThrow();
    expect(() => watchPixelRatio(jest.fn(), { devicePixelRatio: 1, matchMedia: () => ({}) })()).not.toThrow();
  });
});
