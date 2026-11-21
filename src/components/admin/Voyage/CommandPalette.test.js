/* eslint-disable testing-library/no-container, testing-library/render-result-naming-convention */
import CommandPalette from './CommandPalette';
import { React, act, click, mount } from '../SkyBackground/testUtils';

// cmdk ships package "exports" this Jest cannot resolve. The stand-in keeps its shape (input, list,
// groups, items that call onSelect), so everything this file adds around it is exercised for real:
// the shortcut, Escape, the tab stop, focus return and the dialog semantics.
jest.mock('cmdk', () => {
  const React = require('react');
  const el = (tag, pick = (p) => p) => function Part({ children, ...props }) { return React.createElement(tag, pick(props), children); };
  const Command = el('div', ({ label, loop, ...rest }) => ({ ...rest, 'aria-label': label }));
  Command.Input = function Input({ autoFocus, ...props }) { const ref = React.useRef(null); React.useEffect(() => { if (autoFocus) ref.current.focus(); }, [autoFocus]); return React.createElement('input', { ...props, ref }); };
  Command.List = el('div');
  Command.Empty = () => null;
  Command.Group = el('div', ({ heading, ...rest }) => rest);
  Command.Item = function Item({ onSelect, value, children, ...props }) { return React.createElement('button', { ...props, type: 'button', 'data-value': value, onClick: onSelect }, children); };
  return { Command };
}, { virtual: true });

const key = (init) => { const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init }); act(() => { document.dispatchEvent(event); }); return event; };

/** A host that owns the open state, as the page does. */
function Host({ onJump = () => {}, actions, theme }) {
  const [open, setOpen] = React.useState(false);
  return <><button type="button" id="opener" onClick={() => setOpen(true)}>Jump</button><CommandPalette open={open} onOpenChange={setOpen} onJump={onJump} actions={actions} theme={theme} names={{ Cyg: 'Cygnus' }} /></>;
}

describe('CommandPalette', () => {
  const palette = (view) => view.container.querySelector('.voyage-palette');

  it('opens on Cmd+K as a modal dialog, jumps on a choice and closes', () => {
    const onJump = jest.fn();
    const view = mount(<Host onJump={onJump} />);
    expect(palette(view)).toBeNull();
    expect(key({ key: 'k', metaKey: true }).defaultPrevented).toBe(true);
    expect(palette(view).getAttribute('role')).toBe('dialog');
    expect(palette(view).getAttribute('aria-modal')).toBe('true');
    expect(document.activeElement === view.container.querySelector('.voyage-palette__input')).toBe(true);
    click([...view.container.querySelectorAll('.voyage-palette__item')].find((b) => b.textContent.startsWith('Inbox')));
    expect(onJump).toHaveBeenCalledWith(14);   // Inbox is fourteenth since Media left the route
    expect(palette(view)).toBeNull();
    view.unmount();
  });

  it('closes on Escape and gives focus back to the control that opened it', () => {
    const view = mount(<Host />);
    const opener = view.container.querySelector('#opener');
    opener.focus();
    click(opener);
    expect(document.activeElement === view.container.querySelector('.voyage-palette__input')).toBe(true);
    const escape = key({ key: 'Escape' });
    expect(escape.defaultPrevented).toBe(true);
    expect(palette(view)).toBeNull();
    expect(document.activeElement === opener).toBe(true);
    view.unmount();
  });

  it('keeps Tab inside the palette', () => {
    const view = mount(<Host />);
    key({ key: 'k', ctrlKey: true });
    expect(key({ key: 'Tab' }).defaultPrevented).toBe(true);
    key({ key: 'Escape' });
    expect(key({ key: 'Tab' }).defaultPrevented).toBe(false);   // closed: Tab is the page's again
    view.unmount();
  });

  it('does not open over another dialog', () => {
    const view = mount(<Host />);
    const backdrop = document.createElement('div');
    backdrop.className = 'record-backdrop';
    document.body.appendChild(backdrop);
    try {
      // the shortcut is still claimed, so the browser's own Ctrl+K (Firefox's search bar) does not run behind the dialog
      expect(key({ key: 'k', metaKey: true }).defaultPrevented).toBe(true);
      expect(palette(view)).toBeNull();
    } finally { backdrop.remove(); }
    key({ key: 'k', metaKey: true });
    expect(palette(view)).not.toBeNull();
    view.unmount();
  });

  it('names the prologue for the day scene in the light theme, and runs an action', () => {
    const run = jest.fn();
    const view = mount(<Host theme="light" actions={[{ id: 'signout', label: 'Sign out', hint: 'the film plays', run }]} />);
    key({ key: 'k', metaKey: true });
    const items = [...view.container.querySelectorAll('.voyage-palette__item')];
    expect(items[0].textContent).toBe('EarthInner solar system');
    expect(items.find((b) => b.textContent.startsWith('Inbox')).textContent).toBe('InboxCygnus');
    click(items.find((b) => b.textContent.startsWith('Sign out')));
    expect(run).toHaveBeenCalledTimes(1);
    expect(palette(view)).toBeNull();
    view.unmount();
  });
});
