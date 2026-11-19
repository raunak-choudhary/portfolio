// Tests for the water card: level as one CSS variable, fill on first view,
// pause off screen, and the accessible name.

import WaterCard, { CardTag, wavePath } from './WaterCard';
import { MIN_LEVEL } from './insightsModel';
import { React, act, mount } from '../SkyBackground/testUtils';

let observers = [];
class FakeObserver {
  constructor(cb, options) { this.cb = cb; this.options = options; observers.push(this); }
  observe() {}
  disconnect() { this.gone = true; }
  fire(isIntersecting) { act(() => this.cb([{ isIntersecting }])); }
}

describe('WaterCard', () => {
  const original = window.IntersectionObserver;
  let view;
  const card = () => view.container.querySelector('[data-testid="water-card"]');
  beforeEach(() => { observers = []; window.IntersectionObserver = FakeObserver; });
  afterEach(() => { view?.unmount(); view = null; window.IntersectionObserver = original; });

  it('draws a looping wave path across the 200-unit strip', () => {
    const d = wavePath(2, 0);
    expect(d.startsWith('M0 5.00')).toBe(true);
    expect(d).toContain(' L200 ');
  });

  it('starts empty, fills on first view and pauses off screen', () => {
    view = mount(<WaterCard level={0.5} name="Visits" num="120" label="Visits: 120" />);
    expect(card().classList.contains('is-filled')).toBe(false);
    expect(observers[0].options).toEqual({ rootMargin: '40px' });
    observers[0].fire(true);
    expect(card().classList.contains('is-filled')).toBe(true);
    observers[0].fire(false);
    // stays filled; only the waves pause
    expect(card().classList.contains('is-filled')).toBe(true);
    expect(card().classList.contains('is-paused')).toBe(true);
  });

  it('sets the level and a stagger delay as CSS variables, with a visible minimum', () => {
    view = mount(<WaterCard level={0.001} index={3} name="Reached out" num="1" label="Reached out: 1" />);
    expect(card().style.getPropertyValue('--level')).toBe(MIN_LEVEL.toFixed(3));
    expect(card().style.getPropertyValue('--delay')).toBe('0.21s');
  });

  it('keeps a zero or missing level empty', () => {
    view = mount(<WaterCard level={null} name="Reached out" num="0" label="Reached out: 0" />);
    expect(card().style.getPropertyValue('--level')).toBe('0.000');
  });

  it('fills at once without IntersectionObserver', () => {
    delete window.IntersectionObserver;
    view = mount(<WaterCard level={0.4} name="Visits" num="3" label="Visits: 3" />);
    expect(card().classList.contains('is-filled')).toBe(true);
  });

  it('is one labelled article; the water, number and lines are hidden from screen readers', () => {
    view = mount(<WaterCard level={0.4} mark={0.75} short name="Hero" num="62%" lines={['of home page visits', 'second']} tag={<CardTag>Best rate</CardTag>} label="Hero: 62% of home page visits" />);
    const el = card();
    expect(el.tagName).toBe('ARTICLE');
    expect(el.getAttribute('aria-label')).toBe('Hero: 62% of home page visits');
    expect(el.classList.contains('wc--short')).toBe(true);
    for (const sel of ['.wc__water', '.wc__num', '.wc__name', '.wc__line']) expect(el.querySelector(sel).getAttribute('aria-hidden')).toBe('true');
    expect(el.querySelector('.wc__mark').style.getPropertyValue('--mark')).toBe('0.75');
    expect(el.querySelector('.wc__line').textContent).toBe('of home page visits');
    expect(el.querySelector('.wc__sub').textContent).toBe('second');
    expect(el.querySelector('.wc__tag').classList.contains('wc__tag--good')).toBe(true);
  });

  it('marks a warning tag without the good tone', () => {
    view = mount(<CardTag tone="warn">Biggest fall</CardTag>);
    const tag = view.container.querySelector('.wc__tag');
    expect(tag.textContent).toBe('Biggest fall');
    expect(tag.classList.contains('wc__tag--good')).toBe(false);
  });
});
