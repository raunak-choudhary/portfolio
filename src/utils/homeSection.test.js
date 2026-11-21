import { goToHomeSection, isHomePath, whenElementExists } from './homeSection';

describe('isHomePath', () => {
  it.each(['/', '/home', '/home/'])('treats %s as the home page', (p) => expect(isHomePath(p)).toBe(true));
  it.each(['/projects', '/homework', '', '/admindashboard'])('does not treat %s as the home page', (p) => expect(isHomePath(p)).toBe(false));
});

describe('whenElementExists', () => {
  afterEach(() => { document.body.innerHTML = ''; });

  it('calls back at once when the element is already there', () => {
    document.body.innerHTML = '<div id="contact"></div>';
    const found = jest.fn();
    whenElementExists('contact', found, { raf: () => {} });
    expect(found).toHaveBeenCalledWith(document.getElementById('contact'));
  });

  it('keeps checking each frame until the element appears', () => {
    const frames = [];
    const found = jest.fn();
    whenElementExists('contact', found, { raf: (fn) => frames.push(fn) });
    expect(found).not.toHaveBeenCalled();
    frames.shift()();
    expect(found).not.toHaveBeenCalled();
    document.body.innerHTML = '<div id="contact"></div>';
    frames.shift()();
    expect(found).toHaveBeenCalledTimes(1);
  });

  it('gives up after the timeout', () => {
    let clock = 0;
    const frames = [];
    whenElementExists('missing', jest.fn(), { timeoutMs: 100, raf: (fn) => frames.push(fn), now: () => clock });
    clock = 150;
    frames.shift()();
    expect(frames).toHaveLength(0);
  });

  it('stops when told to', () => {
    const frames = [];
    const found = jest.fn();
    const stop = whenElementExists('contact', found, { raf: (fn) => frames.push(fn) });
    stop();
    document.body.innerHTML = '<div id="contact"></div>';
    frames.shift()();
    expect(found).not.toHaveBeenCalled();
  });
});

describe('goToHomeSection', () => {
  let scrolled;
  beforeEach(() => {
    scrolled = jest.fn();
    window.HTMLElement.prototype.scrollIntoView = scrolled;
    window.history.replaceState(null, '', '/home');
  });
  afterEach(() => { document.body.innerHTML = ''; });

  it('from /home, stays on the page: marks the address and scrolls to the section', () => {
    document.body.innerHTML = '<div id="contact"></div>';
    const navigate = jest.fn();
    goToHomeSection('contact', { pathname: '/home', navigate });
    expect(navigate).toHaveBeenCalledWith('/home#contact');
    expect(navigate).not.toHaveBeenCalledWith('/');
    expect(scrolled).toHaveBeenCalledWith({ behavior: 'smooth' });
  });

  it('from another page, goes to /home#section, never to "/" (whose redirect drops the section)', () => {
    const navigate = jest.fn();
    goToHomeSection('contact', { pathname: '/projects', navigate });
    expect(navigate).toHaveBeenCalledWith('/home#contact');
  });

  it('does not push the same address twice', () => {
    window.history.replaceState(null, '', '/home#contact');
    document.body.innerHTML = '<div id="contact"></div>';
    const navigate = jest.fn();
    goToHomeSection('contact', { pathname: '/home', navigate });
    expect(navigate).not.toHaveBeenCalled();
    expect(scrolled).toHaveBeenCalled();
  });

  it('for the hero, goes to /home and scrolls to the top', () => {
    const navigate = jest.fn();
    const scrollTo = jest.spyOn(window, 'scrollTo').mockImplementation(() => {});
    const raf = jest.spyOn(window, 'requestAnimationFrame').mockImplementation((fn) => { fn(); return 1; });
    goToHomeSection('hero', { pathname: '/skills', navigate });
    expect(navigate).toHaveBeenCalledWith('/home');
    expect(scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' });
    scrollTo.mockRestore(); raf.mockRestore();
  });
});
