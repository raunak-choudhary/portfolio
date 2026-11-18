import { moonPhase } from '../SkyBackground/skyModel';
import { fakeContext } from '../SkyBackground/testUtils';
import {
  DRIFT_PX_PER_SECOND,
  STEPS,
  TWINKLE_DEPTH,
  drawFrame,
  driftedX,
  limbGeometry,
  makeStars,
  moonLabel,
  newYorkClock,
  readoutParts,
  starAlpha,
  stepState
} from './preflightModel';

describe('checklist steps', () => {
  it('lists Identity, Second key and Launch in order with condensed numerals', () => {
    expect(STEPS.map((step) => `${step.numeral} ${step.label}`)).toEqual(['01 Identity', '02 Second key', '03 Launch']);
  });

  it('marks earlier steps done, the current one lit and later ones pending', () => {
    expect(STEPS.map((step) => stepState(step.id, 'identity'))).toEqual(['current', 'pending', 'pending']);
    expect(STEPS.map((step) => stepState(step.id, 'second'))).toEqual(['done', 'current', 'pending']);
    expect(STEPS.map((step) => stepState(step.id, 'launch'))).toEqual(['done', 'done', 'current']);
  });

  it('lights nothing for an unknown step, the safe reading', () => {
    expect(STEPS.map((step) => stepState(step.id, 'nowhere'))).toEqual(['pending', 'pending', 'pending']);
  });
});

describe('readout', () => {
  // 02:14 UTC on 18 Nov 2026 is 21:14 the evening before in New York (EST, UTC-5).
  const evening = new Date('2026-11-18T02:14:00Z');

  it('shows the New York clock with its zone, whatever the machine zone is', () => {
    expect(newYorkClock(evening)).toBe('21:14 EST');
    expect(newYorkClock(new Date('2026-07-01T04:05:00Z'))).toBe('00:05 EDT');
  });

  it('reports the Moon from the shared sky model, rounded to a whole percent', () => {
    const { lit, waxing } = moonPhase(evening);
    expect(moonLabel(evening)).toBe(`MOON ${Math.round(lit * 100)}% ${waxing ? 'WAXING' : 'WANING'}`);
  });

  it('names new and full moons instead of 0% and 100%', () => {
    expect(moonLabel(new Date(Date.UTC(2000, 0, 6, 18, 14)))).toBe('MOON NEW');
    expect(moonLabel(new Date(Date.UTC(2000, 0, 6, 18, 14) + 29.530588853 * 43200000))).toBe('MOON FULL');
  });

  it('builds the line from those two true facts only', () => {
    expect(readoutParts(evening)).toEqual(['NEW YORK 21:14 EST', moonLabel(evening)]);
  });
});

describe('starfield', () => {
  it('is the same for the same seed and size, and scales with the area within bounds', () => {
    expect(makeStars(800, 600, 7)).toEqual(makeStars(800, 600, 7));
    expect(makeStars(320, 568).length).toBe(120);
    expect(makeStars(1440, 900).length).toBe(498);
    expect(makeStars(5120, 2880).length).toBe(650);
  });

  it('keeps every star inside the box with a small radius and a visible opacity', () => {
    for (const star of makeStars(390, 844)) {
      expect(star.x).toBeGreaterThanOrEqual(0);
      expect(star.x).toBeLessThan(390);
      expect(star.y).toBeLessThan(844);
      expect(star.r).toBeLessThanOrEqual(1.6);
      expect(star.alpha).toBeGreaterThan(0.2);
    }
  });

  it('draws the still frame at full base brightness, with no drift', () => {
    const star = { x: 10, y: 5, r: 1, alpha: 0.8, phase: 1, speed: 1, tint: 0 };
    expect(starAlpha(star, 0)).toBe(0.8);
    expect(driftedX(star, 0, 100)).toBe(10);
  });

  it('twinkles faintly and drifts slowly, wrapping at the edge', () => {
    const star = { x: 99, y: 5, r: 1, alpha: 0.8, phase: 0, speed: 1, tint: 0 };
    for (let t = 0.5; t < 10; t += 0.7) {
      expect(starAlpha(star, t)).toBeGreaterThanOrEqual(0.8 * (1 - TWINKLE_DEPTH) - 1e-9);
      expect(starAlpha(star, t)).toBeLessThanOrEqual(0.8);
    }
    expect(driftedX(star, 1, 100)).toBeCloseTo((99 + DRIFT_PX_PER_SECOND) % 100);
  });
});

describe('Earth limb', () => {
  it.each([[390, 844], [1440, 900], [320, 568]])('stands a thin arc on the bottom edge at %ix%i', (width, height) => {
    const { cx, cy, radius, rise } = limbGeometry(width, height);
    // top of the circle at the centre of the screen
    expect(cy - radius).toBeCloseTo(height - rise);
    // still above the bottom edge at both screen edges, so the arc spans the full width
    const edgeY = cy - Math.sqrt(radius * radius - cx * cx);
    expect(edgeY).toBeLessThan(height);
    expect(edgeY).toBeGreaterThan(height - rise);
  });

  it('paints stars first and the planet over them in one frame', () => {
    const calls = [];
    drawFrame(fakeContext(calls), makeStars(400, 300), { width: 400, height: 300, seconds: 0 });
    const names = calls.map(([name]) => name);
    expect(names[0]).toBe('clearRect');
    expect(names.filter((name) => name === 'arc').length).toBe(makeStars(400, 300).length + 5);
    expect(names[names.length - 1]).toBe('stroke');
  });
});
