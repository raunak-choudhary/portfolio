/* eslint-disable testing-library/no-container, testing-library/render-result-naming-convention */
import useMediaQuery, { PHONE_QUERY } from './useMediaQuery';
import { React, act, mount } from '../components/admin/SkyBackground/testUtils';

function Probe({ q }) {
  const matches = useMediaQuery(q, false);
  return <output data-testid="out">{String(matches)}</output>;
}

/** A controllable matchMedia: one list per query, with a way to flip it. */
function fakeMatchMedia(initial) {
  const lists = new Map();
  window.matchMedia = (q) => {
    if (!lists.has(q)) {
      const listeners = new Set();
      lists.set(q, { matches: initial, media: q, addEventListener: (_, fn) => listeners.add(fn), removeEventListener: (_, fn) => listeners.delete(fn), fire(next) { this.matches = next; listeners.forEach((fn) => fn({ matches: next })); }, listeners });
    }
    return lists.get(q);
  };
  return lists;
}

describe('useMediaQuery', () => {
  const original = window.matchMedia;
  afterEach(() => { window.matchMedia = original; });

  it('reads the query at once and follows changes', () => {
    const lists = fakeMatchMedia(false);
    const view = mount(<Probe q={PHONE_QUERY} />);
    const out = () => view.container.querySelector('[data-testid="out"]').textContent;
    expect(out()).toBe('false');
    act(() => lists.get(PHONE_QUERY).fire(true));
    expect(out()).toBe('true');
    view.unmount();
    expect(lists.get(PHONE_QUERY).listeners.size).toBe(0);
  });

  it('falls back when matchMedia is unavailable', () => {
    window.matchMedia = undefined;
    const view = mount(<Probe q={PHONE_QUERY} />);
    expect(view.container.textContent).toBe('false');
    view.unmount();
  });
});
