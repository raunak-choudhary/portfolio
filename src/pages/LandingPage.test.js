// The home page lands on the section named in the address on first load
// (/home#about from a shared link or the admin's View on site), once that
// section has stopped moving. Only plain ids are looked up.

import { useLandOnHash } from './LandingPage';
import { React, mount } from '../components/admin/SkyBackground/testUtils';

jest.mock('../components/sections/Hero/Hero', () => () => null);
jest.mock('../components/sections/About/About', () => () => null);
jest.mock('../components/sections/Navigation/Navigation', () => () => null);
jest.mock('../components/sections/Contact/Contact', () => () => null);

function Probe({ hash }) {
  useLandOnHash(hash);
  return null;
}

let scrolled;
let view;
beforeEach(() => {
  jest.useFakeTimers();               // also fakes requestAnimationFrame
  scrolled = jest.fn();
  window.HTMLElement.prototype.scrollIntoView = scrolled;
  document.body.innerHTML = '<section id="about"></section>';
});
afterEach(() => {
  view?.unmount();
  view = null;
  jest.useRealTimers();
  document.body.innerHTML = '';
});

it('jumps to the section named in the address once it has settled', () => {
  view = mount(<Probe hash="#about" />);
  expect(scrolled).not.toHaveBeenCalled();
  jest.advanceTimersByTime(1000);
  expect(scrolled).toHaveBeenCalledTimes(1);
  expect(scrolled).toHaveBeenCalledWith({ behavior: 'auto' });
});

it.each([
  ['no hash', ''],
  ['an id that is not on the page', '#nowhere'],
  ['text that is not a plain id', '#<img src=x>'],
  ['a broken escape', '#%E0%A4%A'],
])('does nothing for %s', (_label, hash) => {
  view = mount(<Probe hash={hash} />);
  jest.advanceTimersByTime(5000);
  expect(scrolled).not.toHaveBeenCalled();
});
