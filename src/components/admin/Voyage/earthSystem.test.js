import { TWILIGHT_SHIFT, TWILIGHT_WIDTH } from './earthSystem';

// The shader's twilight weight, mirrored here so the band's shape is pinned:
// a bright core and a faint skirt 2.4 times wider (see EARTH_FRAGMENT).
const twilight = (lit) => {
  const g = (w) => Math.exp(-(((lit + TWILIGHT_SHIFT) / w) ** 2));
  return g(TWILIGHT_WIDTH) * 0.30 + g(TWILIGHT_WIDTH * 2.4) * 0.10;
};

describe('earth twilight band', () => {
  it('is a narrow glow along the terminator, not a wide stripe', () => {
    // the old band (half-width 0.14) still had 32% of its strength at lit = 0.15;
    // the glow must be all but gone there, at every screen size alike
    expect(twilight(0.15) / twilight(-TWILIGHT_SHIFT)).toBeLessThan(0.05);
    expect(TWILIGHT_WIDTH).toBeLessThanOrEqual(0.06);
  });

  it('sits just on the night side, where reddened sunlight is seen', () => {
    expect(twilight(-0.02)).toBeGreaterThan(twilight(0.02));
    expect(TWILIGHT_SHIFT).toBeGreaterThan(0);
  });
});
