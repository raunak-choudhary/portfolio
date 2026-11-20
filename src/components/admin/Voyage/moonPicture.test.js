import { lunarLambertWeight, paintMoon, sunOnScreen } from './moonPicture';

const SIZE = 96;
const moonAt = (over) => ({ tilt: 0, axisTilt: 0, phaseAngle: 0, fraction: 1, libration: { lon: 0, lat: 0 }, ...over });
const paint = (moon, maps) => paintMoon(new Uint8ClampedArray(SIZE * SIZE * 4), SIZE, moon, maps);
const brightness = (p, i) => (p[i * 4] + p[i * 4 + 1] + p[i * 4 + 2]) / 3;
/** Pixels well inside the disc, as {x, y} on the unit disc (y up) with their index. */
const inside = () => {
  const out = [];
  for (let py = 0; py < SIZE; py++) for (let px = 0; px < SIZE; px++) {
    const x = (px + 0.5 - SIZE / 2) / (SIZE / 2), y = (SIZE / 2 - py - 0.5) / (SIZE / 2);
    if (x * x + y * y < 0.95) out.push({ x, y, i: py * SIZE + px });
  }
  return out;
};
/** A map of uniform grey with one dark spot (a "mare") at a selenographic latitude and longitude. */
const mapWithSpot = (lat, lon, w = 256, h = 128) => {
  const data = new Uint8ClampedArray(w * h * 4).fill(200);
  const cx = Math.round((0.5 + lon / 360) * w), cy = Math.round((0.5 - lat / 180) * h);
  for (let y = cy - 3; y <= cy + 3; y++) for (let x = cx - 3; x <= cx + 3; x++) { const o = (y * w + x) * 4; data[o] = 20; data[o + 1] = 20; data[o + 2] = 20; }
  return { width: w, height: h, data };
};
const darkest = (p) => inside().reduce((best, q) => (brightness(p, q.i) < brightness(p, best.i) ? q : best));

describe('the lighting', () => {
  it('puts the Sun toward the viewer at full and along the tilt at quarter', () => {
    expect(sunOnScreen(0, 0)).toEqual([-0, 0, 1]);
    const right = sunOnScreen(-90, 90);
    expect(right[0]).toBeCloseTo(1, 12); expect(right[1]).toBeCloseTo(0, 12); expect(right[2]).toBeCloseTo(0, 12);
  });

  it('uses McEwen\'s Lunar-Lambert weight: 1 at full, falling with the phase angle', () => {
    expect(lunarLambertWeight(0)).toBe(1);
    expect(lunarLambertWeight(60)).toBeLessThan(lunarLambertWeight(30));
    expect(lunarLambertWeight(90)).toBeCloseTo(0.1859, 3);   // 1 - 1.71 + 1.9602 - 1.0643
  });
});

describe('paintMoon', () => {
  it('draws a full Moon as an evenly bright disc to the limb, with a soft one-pixel edge and nothing outside', () => {
    const p = paint(moonAt());
    const centre = brightness(p, (SIZE / 2) * SIZE + SIZE / 2), nearLimb = brightness(p, (SIZE / 2) * SIZE + 3);
    expect(Math.abs(centre - nearLimb)).toBeLessThan(10);   // Lommel-Seeliger: no limb darkening at full
    expect(p[3]).toBe(0);   // a corner
    const edgeAlphas = new Set(); for (let px = 0; px < SIZE; px++) edgeAlphas.add(p[((SIZE / 2) * SIZE + px) * 4 + 3]);
    expect([...edgeAlphas].some((a) => a > 0 && a < 255)).toBe(true);
  });

  it.each([[0.25, 120], [0.5, 90], [0.83, 48.5]])('lights a share of the disc close to the fraction %f', (fraction, phaseAngle) => {
    const p = paint(moonAt({ tilt: -90, phaseAngle, fraction }));
    const disc = inside(), full = paint(moonAt());
    const lit = disc.filter((q) => brightness(p, q.i) > 0.1 * brightness(full, q.i)).length / disc.length;
    expect(Math.abs(lit - fraction)).toBeLessThan(0.05);
  });

  it.each([[-90, 'right'], [90, 'left'], [0, 'up'], [-150, 'down and right']])('turns the lit side to the tilt %d° (%s)', (tilt) => {
    const p = paint(moonAt({ tilt, phaseAngle: 100, fraction: 0.41 }));
    let sx = 0, sy = 0, w = 0;
    for (const q of inside()) { const b = brightness(p, q.i); sx += q.x * b; sy += q.y * b; w += b; }
    const angle = Math.atan2(-sx / w, sy / w) * 180 / Math.PI;   // counterclockwise from up, as the tilt is
    expect(Math.abs(((angle - tilt + 540) % 360) - 180)).toBeLessThan(3);
  });

  it('shows the near side the right way up: Mare Crisium near the right limb, Tycho in the south', () => {
    const crisium = darkest(paint(moonAt(), { albedo: mapWithSpot(17, 59) }));
    expect(crisium.x).toBeGreaterThan(0.75); expect(crisium.y).toBeGreaterThan(0.2);
    const tycho = darkest(paint(moonAt(), { albedo: mapWithSpot(-43, -11) }));
    expect(tycho.y).toBeLessThan(-0.6); expect(Math.abs(tycho.x)).toBeLessThan(0.25);
  });

  it('turns the map with the axis and the librations', () => {
    // the axis tilted 30° to the left of the zenith carries the north (a spot at 60° N) with it
    const north = darkest(paint(moonAt({ axisTilt: 30 }), { albedo: mapWithSpot(60, 0) }));
    expect(Math.atan2(-north.x, north.y) * 180 / Math.PI).toBeCloseTo(30, -1);
    // a libration of +7° in longitude brings the east limb's features toward the middle
    const plain = darkest(paint(moonAt(), { albedo: mapWithSpot(0, 70) })), librated = darkest(paint(moonAt({ libration: { lon: 7, lat: 0 } }), { albedo: mapWithSpot(0, 70) }));
    expect(librated.x).toBeLessThan(plain.x);
  });

  it('leaves the night side dark with a trace of earthshine at a crescent, and none at full', () => {
    const crescent = paint(moonAt({ tilt: -90, phaseAngle: 150, fraction: 0.067 }));
    const night = brightness(crescent, (SIZE / 2) * SIZE + 8), day = brightness(crescent, (SIZE / 2) * SIZE + SIZE - 5);
    expect(night).toBeGreaterThan(0); expect(night).toBeLessThan(day * 0.25);
    const full = paint(moonAt({ tilt: -90, phaseAngle: 179.9, fraction: 0 }));   // the dark disc of a new Moon is earthshine only
    expect(brightness(full, (SIZE / 2) * SIZE + SIZE / 2)).toBeGreaterThan(night * 0.9);
  });

  it('catches the relief along the terminator', () => {
    // a relief map with every slope tilted east: at a first quarter (Sun to the east, on the right)
    // the terminator brightens against a flat map
    const w = 64, h = 32, tilted = { width: w, height: h, data: new Uint8ClampedArray(w * h * 4).map((_, i) => (i % 4 === 0 ? 200 : 128)) };
    const moon = moonAt({ tilt: -90, phaseAngle: 90, fraction: 0.5 });
    const flat = paint(moon), bumped = paint(moon, { relief: tilted });
    const nearTerminator = (SIZE / 2) * SIZE + SIZE / 2 + 2;
    expect(brightness(bumped, nearTerminator)).toBeGreaterThan(brightness(flat, nearTerminator) + 10);
  });
});
