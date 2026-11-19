import { React, act, mount } from '../SkyBackground/testUtils';
import { createSignal, useSignal } from './signal';

describe('createSignal', () => {
  it('stores a value and notifies subscribers on change only', () => {
    const s = createSignal(1);
    const listener = jest.fn();
    const unsubscribe = s.subscribe(listener);
    s.set(1);
    expect(listener).not.toHaveBeenCalled();
    s.set(2);
    expect(s.get()).toBe(2);
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
    s.set(3);
    expect(listener).toHaveBeenCalledTimes(1);
  });
});

describe('useSignal', () => {
  it('re-renders only the component that reads the signal', () => {
    const s = createSignal('a');
    const renders = { reader: 0, parent: 0 };
    function Reader() { renders.reader += 1; return <span data-testid="v">{useSignal(s)}</span>; }
    function Parent() { renders.parent += 1; return <Reader />; }
    const view = mount(<Parent />);
    act(() => s.set('b'));
    expect(view.container.querySelector('[data-testid="v"]').textContent).toBe('b');
    expect(renders.parent).toBe(1);
    expect(renders.reader).toBe(2);
    view.unmount();
  });
});
