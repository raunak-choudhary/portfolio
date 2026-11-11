/* eslint-disable testing-library/no-container, testing-library/render-result-naming-convention */
import HeaderMenu from './HeaderMenu';
import { React, act, click, mount } from '../SkyBackground/testUtils';

const menu = () => document.querySelector('.header-menu');

describe('HeaderMenu', () => {
  it('opens a menu in the document body, runs the chosen action and closes', () => {
    const preview = jest.fn(), signOut = jest.fn();
    const view = mount(<HeaderMenu items={[
      { id: 'preview', label: 'Preview', icon: '👁️', onSelect: preview },
      { id: 'signout', label: 'Sign Out', icon: '🚪', onSelect: signOut, tone: 'danger' },
    ]} />);
    const button = view.container.querySelector('.header-menu__button');
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(menu()).toBeNull();
    click(button);
    expect(menu().parentElement).toBe(document.body);
    expect(menu().getAttribute('role')).toBe('menu');
    const items = [...menu().querySelectorAll('[role="menuitem"]')];
    expect(items.map((i) => i.textContent)).toEqual(['👁️Preview', '🚪Sign Out']);
    expect(items[1].className).toContain('header-menu__item--danger');
    click(items[1]);
    expect(signOut).toHaveBeenCalledTimes(1);
    expect(preview).not.toHaveBeenCalled();
    expect(menu()).toBeNull();
    view.unmount();
  });

  it('respects disabled items and closes on Escape or an outside click', () => {
    const refresh = jest.fn();
    const view = mount(<HeaderMenu items={[{ id: 'refresh', label: 'Refresh', icon: '🔄', onSelect: refresh, disabled: true }]} />);
    const button = view.container.querySelector('.header-menu__button');
    click(button);
    const item = menu().querySelector('[role="menuitem"]');
    expect(item.disabled).toBe(true);
    click(item);
    expect(refresh).not.toHaveBeenCalled();
    act(() => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); });
    expect(menu()).toBeNull();
    click(button);
    act(() => { document.body.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true })); });
    expect(menu()).toBeNull();
    view.unmount();
  });
});
