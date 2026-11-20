import { DEG, EARTH_AXIS_ECLIPTIC, OBLIQUITY, dot, length, normalize, subsolarLongitude, sunCoordinates } from './earthModel';
import {
  AU_KM, DAY_EARTH_RADIUS, EARTH_ORBIT_RADIUS, EARTH_SCENE_DIRECTION, EARTH_YEAR_MS, LOOP_SLOTS, SOLAR_INCLINATION, SUN_RADIUS,
  differentialRate, distanceReadout, earthDirection, earthLongitude, earthPosition, eclipticVector, hash01, loopEvent, loopFootpoints,
  seedFor, solarOrientation, solarPoleEcliptic, sunDistanceAU, sunDistanceKm, sunScene, viewAngles,
} from './sunModel';
import { ANCHORS } from './voyageModel';

const close = (a, b, eps) => expect(Math.abs(a - b)).toBeLessThan(eps);
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];

describe('the Earth-Sun distance (Meeus chapter 25)', () => {
  it('matches the published values within 0.0002 AU (about 30,000 km)', () => {
    close(sunDistanceAU(new Date('1992-10-13T00:00:00Z')), 0.99766, 0.0002);   // Meeus example 25.a
    close(sunDistanceAU(new Date('2026-01-03T17:15:00Z')), 0.983302, 0.0002);   // 2026 perihelion
    close(sunDistanceAU(new Date('2026-07-06T17:31:00Z')), 1.016643, 0.0002);   // 2026 aphelion
    close(sunDistanceKm(new Date('2026-01-03T17:15:00Z')) / 1e6, 147.1, 0.05);
    expect(AU_KM).toBeCloseTo(149597870.7, 1);
  });

  it('reads today\'s distance and its direction under the greeting', () => {
    // 19 November: about 147.8 million km, shrinking toward the January perihelion
    expect(distanceReadout(new Date('2026-11-19T15:00:00Z'))).toBe('Earth to Sun · 147.8 million km and closing');
    expect(distanceReadout(new Date('2026-03-20T12:00:00Z'))).toMatch(/^Earth to Sun · 14\d\.\d million km and widening$/);
    expect(distanceReadout(new Date('2026-08-01T12:00:00Z'))).toMatch(/and closing$/);   // past the July aphelion
  });
});

describe('the Sun\'s rotation axis (Meeus chapter 29)', () => {
  it('matches Meeus example 29.a within 0.05 degrees', () => {
    const o = solarOrientation(new Date('1992-10-13T00:00:00Z'));
    close(o.P, 26.27, 0.05); close(o.B0, 5.99, 0.05); close(o.L0, 238.63, 0.1);
  });

  it('crosses zero and peaks on the dates the almanacs give', () => {
    close(solarOrientation(new Date('2026-06-06T12:00:00Z')).B0, 0, 0.3);
    close(solarOrientation(new Date('2026-12-08T12:00:00Z')).B0, 0, 0.3);
    close(solarOrientation(new Date('2026-09-08T12:00:00Z')).B0, 7.25, 0.05);
    close(solarOrientation(new Date('2026-03-07T12:00:00Z')).B0, -7.25, 0.05);
    close(solarOrientation(new Date('2026-01-05T12:00:00Z')).P, 0, 0.6);
    close(solarOrientation(new Date('2026-07-07T12:00:00Z')).P, 0, 0.6);
    close(solarOrientation(new Date('2026-10-11T12:00:00Z')).P, 26.3, 0.1);
    close(solarOrientation(new Date('2026-04-07T12:00:00Z')).P, -26.3, 0.1);
  });

  it('puts the pole 7.25 degrees from the ecliptic pole, and the vectors give back B0 and P', () => {
    const date = new Date('2026-11-19T15:00:00Z');
    const pole = solarPoleEcliptic(date);
    close(Math.acos(pole[1]) / DEG, SOLAR_INCLINATION, 1e-9);
    // seen from the Earth (line of sight = toward the Sun), the pole vector carries the Meeus angles
    const toSun = eclipticVector(sunCoordinates(date).longitude, 0);
    const seen = viewAngles(pole, toSun, EARTH_AXIS_ECLIPTIC);
    const meeus = solarOrientation(date);
    close(seen.B0, meeus.B0, 0.01); close(seen.P, meeus.P, 0.03);
  });

  it('turns the equator faster than the poles in the Snodgrass ratio', () => {
    expect(differentialRate(0)).toBe(1);
    close(differentialRate(Math.sin(30 * DEG)), (14.713 - 2.396 * 0.25 - 1.787 * 0.0625) / 14.713, 1e-12);
    close(differentialRate(1), (14.713 - 2.396 - 1.787) / 14.713, 1e-12);   // about 72 percent at the pole
  });
});

describe('the day scene', () => {
  const date = new Date('2026-11-19T15:00:00Z');
  const scene = sunScene(date);

  it('sizes the Sun like the night Earth and keeps a stylised orbit', () => {
    expect(SUN_RADIUS).toBeGreaterThan(300);
    expect(EARTH_ORBIT_RADIUS / SUN_RADIUS).toBeCloseTo(2.3);
    expect(SUN_RADIUS / DAY_EARTH_RADIUS).toBeGreaterThan(7);
    expect(scene.centre).toEqual([ANCHORS[0].x + 440, ANCHORS[0].y - 300, ANCHORS[0].z - 900]);
    [scene.sunPole, scene.orbitNormal, scene.earthAxis, scene.viewer].forEach((v) => close(length(v), 1, 1e-9));
  });

  it('places the Earth at today\'s real heliocentric longitude, at the chosen spot on screen', () => {
    close(scene.earthLongitudeAtLoad, (sunCoordinates(date).longitude + 180) % 360, 1e-9);
    const d = earthDirection(scene, 0);
    // the scene direction, tipped by the view tilt: same azimuth in the orbit plane
    close(dot(d, scene.orbitNormal), 0, 1e-9);
    close(Math.atan2(d[0], dot(d, normalize([0, -scene.orbitNormal[2], scene.orbitNormal[1]]))), Math.atan2(EARTH_SCENE_DIRECTION[0], EARTH_SCENE_DIRECTION[2]), 1e-6);
    close(length(sub(earthPosition(scene, 0), scene.centre)), EARTH_ORBIT_RADIUS, 1e-6);
  });

  it('moves the Earth prograde, one orbit per stylised year', () => {
    close(earthLongitude(scene, EARTH_YEAR_MS), scene.earthLongitudeAtLoad, 1e-6);
    close(earthLongitude(scene, EARTH_YEAR_MS / 4), (scene.earthLongitudeAtLoad + 90) % 360, 1e-6);
    // counterclockwise seen from ecliptic north: (r0 x r1) points along the orbit normal
    const r0 = earthDirection(scene, 0), r1 = earthDirection(scene, 10000);
    const c = [r0[1] * r1[2] - r0[2] * r1[1], r0[2] * r1[0] - r0[0] * r1[2], r0[0] * r1[1] - r0[1] * r1[0]];
    expect(dot(c, scene.orbitNormal)).toBeGreaterThan(0);
  });

  it('lights the Earth for today\'s season: the Sun\'s declination seen from the scene Earth is the real one', () => {
    const toSun = earthDirection(scene, 0).map((v) => -v);
    close(Math.asin(dot(scene.earthAxis, toSun)) / DEG, sunCoordinates(date).declination, 0.01);
    close(Math.acos(dot(scene.earthAxis, scene.orbitNormal)) / DEG, OBLIQUITY, 1e-9);
    expect(subsolarLongitude(date)).toBeLessThan(0);   // sanity: 15:00 UT puts the Sun over the Atlantic
  });

  it('carries the Sun\'s real B0 and P to the scene Earth', () => {
    const toSun = earthDirection(scene, 0).map((v) => -v);
    const seen = viewAngles(scene.sunPole, toSun, scene.earthAxis);
    const meeus = solarOrientation(date);
    close(seen.B0, meeus.B0, 0.02); close(seen.P, meeus.P, 0.05);
  });
});

describe('prominences, loops and eruptions', () => {
  const scene = sunScene(new Date('2026-11-19T15:00:00Z'));

  it('is deterministic for a date and differs between dates', () => {
    expect(seedFor(new Date('2026-11-19T01:00:00Z'))).toBe(20261119);
    expect(seedFor(new Date('2026-11-19T23:00:00Z'))).toBe(20261119);
    expect(loopEvent(scene.seed, 3, 42000)).toEqual(loopEvent(scene.seed, 3, 42000));
    const a = Array.from({ length: LOOP_SLOTS }, (_, s) => loopEvent(20261119, s, 0).limbAngle);
    const b = Array.from({ length: LOOP_SLOTS }, (_, s) => loopEvent(20261120, s, 0).limbAngle);
    expect(a).not.toEqual(b);
    expect(hash01(1, 2, 3)).not.toBe(hash01(1, 2, 4));
  });

  it('shows gas on the limb from the first frame, so the still (reduced motion) Sun has prominences', () => {
    const lit = Array.from({ length: LOOP_SLOTS }, (_, s) => loopEvent(scene.seed, s, 0)).filter((e) => e.brightness > 0.3);
    expect(lit.length).toBeGreaterThanOrEqual(3);
  });

  it('never repeats a loop within ten minutes and erupts now and then', () => {
    const seen = new Set();
    let eruptions = 0;
    for (let s = 0; s < LOOP_SLOTS; s++) {
      for (let t = 0; t < 600000; t += 1000) {
        const e = loopEvent(scene.seed, s, t);
        if (e.progress < 0.01 || seen.has(`${s}:${e.cycle}`)) continue;
        seen.add(`${s}:${e.cycle}`);
        if (e.kind === 'eruption') eruptions += 1;
      }
    }
    // every event draws its own place on the limb
    const angles = [...seen].map((k) => { const [s, c] = k.split(':').map(Number); return hash01(scene.seed, s, c, 2); });
    expect(new Set(angles).size).toBe(angles.length);
    expect(seen.size).toBeGreaterThan(300);
    expect(eruptions).toBeGreaterThan(10);
  });

  it('rises, hangs and falls back; an eruption keeps rising', () => {
    const find = (kind) => { for (let s = 0; s < LOOP_SLOTS; s++) for (let t = 0; t < 900000; t += 500) { const e = loopEvent(scene.seed, s, t); if (e.kind === kind && e.progress < 0.02) return { s, t }; } return null; };
    const loop = find('loop');
    const at = (p) => { const period = 11000 + 8000 * hash01(scene.seed, loop.s, -1); return loopEvent(scene.seed, loop.s, loop.t + (p * period * 0.7)); };
    expect(at(0.5).lift).toBeGreaterThan(0.9);
    expect(at(0.99).lift).toBeLessThan(at(0.6).lift);
    const eruption = find('eruption');
    const e1 = loopEvent(scene.seed, eruption.s, eruption.t + 4000), e2 = loopEvent(scene.seed, eruption.s, eruption.t + 8000);
    expect(e2.lift).toBeGreaterThanOrEqual(e1.lift);
  });

  it('sets footpoints on the visible limb at birth, then turns them with the Sun', () => {
    for (let s = 0; s < LOOP_SLOTS; s++) {
      const e = { ...loopEvent(scene.seed, s, 0), born: 0 };
      const [a, b] = loopFootpoints(e, scene, 0);
      close(length(a), 1, 1e-9); close(length(b), 1, 1e-9);
      expect(Math.abs(dot(a, scene.viewer))).toBeLessThan(Math.sin(0.26));   // within 15 degrees of the limb plane
      const [a2] = loopFootpoints(e, scene, 30000);
      // turned about the solar pole: latitude kept, longitude advanced
      close(dot(a2, scene.sunPole), dot(a, scene.sunPole), 1e-9);
      expect(dot(a2, a)).toBeLessThan(1 - 1e-6);
    }
  });
});
