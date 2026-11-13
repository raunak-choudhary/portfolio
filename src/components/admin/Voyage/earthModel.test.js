import {
  CITIES, OCEAN_KM, clockIn, distanceKm, facingPoint, nearestCity, overReadout, sceneTime,
  EARTH_AXIS_ECLIPTIC, EARTH_RADIUS, MOON_ORBIT_RADIUS, OBLIQUITY, DEG, alignYTo, dot, earthScene, earthSpin, eclipticDirection, length, moonDirection, moonFraction, moonPosition,
  normalize, rotateAbout, satelliteOrbits, satellitePosition, sceneFrame, spinForSubsolar, subsolarLongitude, sunCoordinates, surfacePoint,
} from './earthModel';
import { ANCHORS } from './voyageModel';

const close = (a, b, eps = 1e-6) => expect(Math.abs(a - b)).toBeLessThan(eps);
const closeVec = (a, b, eps = 1e-6) => a.forEach((v, i) => close(v, b[i], eps));

describe('the Sun', () => {
  it('gives the known declination and equation of time for the solstices and a November day', () => {
    const june = sunCoordinates(new Date('2026-06-21T08:00:00Z'));
    expect(june.declination).toBeGreaterThan(23.3); expect(june.declination).toBeLessThan(23.5);
    const december = sunCoordinates(new Date('2026-12-21T20:00:00Z'));
    expect(december.declination).toBeLessThan(-23.3);
    const november = sunCoordinates(new Date('2026-11-12T12:00:00Z'));
    expect(november.declination).toBeGreaterThan(-18.2); expect(november.declination).toBeLessThan(-17.3);
    expect(november.equationOfTime).toBeGreaterThan(15); expect(november.equationOfTime).toBeLessThan(16.5);   // almanac: +15.7 min
    const february = sunCoordinates(new Date('2026-02-11T12:00:00Z'));
    expect(february.equationOfTime).toBeLessThan(-13.5);   // the year's most negative, about -14.2 min
  });

  it('puts the subsolar point at Greenwich around noon UT, corrected by the equation of time', () => {
    const noon = subsolarLongitude(new Date('2026-11-12T12:00:00Z'));
    // the sundial runs 15.7 min ahead in November, so by 12:00 UT the Sun is already 3.9° west of Greenwich
    expect(noon).toBeLessThan(-3); expect(noon).toBeGreaterThan(-5);
    const six = subsolarLongitude(new Date('2026-11-12T18:00:00Z'));
    expect(six).toBeGreaterThan(-95); expect(six).toBeLessThan(-93);   // 90° west plus the same lead: over the central United States
  });
});

describe('vectors', () => {
  it('rotates about an axis and aligns +y onto any axis with an exact inverse', () => {
    closeVec(rotateAbout([1, 0, 0], [0, 1, 0], Math.PI / 2), [0, 0, -1]);
    const axis = normalize([0.3, 0.8, -0.5]);
    const { apply, inverse } = alignYTo(axis);
    closeVec(apply([0, 1, 0]), axis);
    closeVec(inverse(apply([0.2, -0.7, 0.4])), [0.2, -0.7, 0.4]);
    closeVec(alignYTo([0, 1, 0]).apply([1, 2, 3]), [1, 2, 3]);
    closeVec(alignYTo([0, -1, 0]).apply([0, 1, 0]), [0, -1, 0]);
  });
});

describe('the ecliptic frame', () => {
  it('tilts the axis by the obliquity and yields the declination from the Sun direction', () => {
    close(Math.acos(EARTH_AXIS_ECLIPTIC[1]) / DEG, OBLIQUITY);
    const { longitude, declination } = sunCoordinates(new Date('2026-11-12T12:00:00Z'));
    close(Math.asin(dot(EARTH_AXIS_ECLIPTIC, eclipticDirection(longitude))) / DEG, declination, 1e-9);
  });

  it('carries the Sun to the scene azimuth and keeps angles between vectors', () => {
    const date = new Date('2026-11-12T12:00:00Z');
    const toWorld = sceneFrame(date, 75, 0);
    const sun = toWorld(eclipticDirection(sunCoordinates(date).longitude));
    closeVec(sun, [Math.sin(75 * DEG), 0, -Math.cos(75 * DEG)]);
    const tilted = sceneFrame(date, 75, 22)(eclipticDirection(sunCoordinates(date).longitude));
    expect(tilted[1]).toBeGreaterThan(0);   // tipped so the Sun sits a little above
    close(dot(toWorld(EARTH_AXIS_ECLIPTIC), sun), Math.sin(sunCoordinates(date).declination * DEG), 1e-9);
  });
});

describe('the Earth', () => {
  const date = new Date('2026-11-12T18:30:00Z');
  const scene = earthScene(date);

  it('places the centre off the first anchor and keeps unit directions', () => {
    expect(scene.centre).toEqual([ANCHORS[0].x + 440, ANCHORS[0].y - 320, ANCHORS[0].z - 840]);
    [scene.sunDir, scene.axis, scene.moonNormal].forEach((v) => close(length(v), 1));
    expect(scene.sunDir[0]).toBeGreaterThan(0.8);   // the Sun is to the right: the lit side faces the frame's edge
  });

  it('turns the subsolar point onto the Sun at load, then spins east', () => {
    const { apply } = alignYTo(scene.axis);
    const facing = apply(rotateAbout(surfacePoint(scene.declination, scene.subsolarLongitude), [0, 1, 0], scene.spinAtLoad));
    closeVec(facing, scene.sunDir, 1e-6);
    close(earthSpin(1, 75000), 1 + Math.PI);
    // a point 15° east of the subsolar meridian faces the Sun one twenty-fourth of a turn later
    const later = apply(rotateAbout(surfacePoint(scene.declination, scene.subsolarLongitude - 15), [0, 1, 0], earthSpin(scene.spinAtLoad, 150000 / 24)));
    closeVec(later, scene.sunDir, 1e-6);
  });

  it('solves the spin for any axis and Sun pair', () => {
    const axis = normalize([0.2, 0.9, 0.3]), sun = normalize([0.7, 0.1, -0.6]);
    const dec = Math.asin(dot(axis, sun)) / DEG;
    const spin = spinForSubsolar(axis, sun, dec, 40);
    closeVec(alignYTo(axis).apply(rotateAbout(surfacePoint(dec, 40), [0, 1, 0], spin)), sun, 1e-6);
  });
});

describe('the Moon', () => {
  const date = new Date('2026-11-12T18:30:00Z');
  const scene = earthScene(date);

  it('starts toward the Sun when new and opposite it when full, in its tilted orbit plane', () => {
    const newMoon = moonDirection(scene.sunDir, scene.moonNormal, 0), full = moonDirection(scene.sunDir, scene.moonNormal, 0.5);
    expect(dot(newMoon, scene.sunDir)).toBeGreaterThan(0.99);
    expect(dot(full, scene.sunDir)).toBeLessThan(-0.99);
    close(dot(newMoon, scene.moonNormal), 0, 1e-9);
    close(length(newMoon), 1);
  });

  it('orbits once per period and sits under two Earth radii out', () => {
    close(moonFraction(0.1, 600000 / 2), 0.6);
    close(moonFraction(0.9, 600000 / 2), 0.4);
    expect(600000 / 150000).toBe(4);   // four Earth turns per Moon orbit, the Earth clearly faster
    const p = moonPosition(scene, 0);
    close(length([p[0] - scene.centre[0], p[1] - scene.centre[1], p[2] - scene.centre[2]]), MOON_ORBIT_RADIUS);
    expect(MOON_ORBIT_RADIUS).toBeCloseTo(EARTH_RADIUS * 1.6);
    expect(scene.moonPhaseAtLoad).toBeGreaterThan(0.05); expect(scene.moonPhaseAtLoad).toBeLessThan(0.15);   // three days past the 9 November new moon
  });
});

describe('satellites', () => {
  it('are deterministic, low and keep their orbit radius while moving', () => {
    const a = satelliteOrbits(6), b = satelliteOrbits(6);
    expect(a).toEqual(b);
    const scene = earthScene(new Date('2026-11-12T18:30:00Z'));
    for (const orbit of a) {
      expect(orbit.radius).toBeGreaterThan(EARTH_RADIUS * 1.06); expect(orbit.radius).toBeLessThan(EARTH_RADIUS * 1.34);
      const p0 = satellitePosition(orbit, 0, scene), p1 = satellitePosition(orbit, 5000, scene);
      close(length([p0[0] - scene.centre[0], p0[1] - scene.centre[1], p0[2] - scene.centre[2]]), orbit.radius, 1e-6);
      expect(length([p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]])).toBeGreaterThan(1);
    }
  });
});

describe('what is under the camera', () => {
  const date = new Date('2026-11-12T18:30:00Z');
  const scene = earthScene(date);
  const viewerOver = (lat, lon, elapsed) => {
    // a viewer placed straight above a surface point, for the Earth's pose at `elapsed`
    const { apply } = alignYTo(scene.axis);
    const dir = apply(rotateAbout(surfacePoint(lat, lon), [0, 1, 0], earthSpin(scene.spinAtLoad, elapsed)));
    return [scene.centre[0] + dir[0] * 900, scene.centre[1] + dir[1] * 900, scene.centre[2] + dir[2] * 900];
  };

  it('reads the surface point back under any viewer at any spin', () => {
    const p = facingPoint(scene, 0, viewerOver(19.08, 72.88, 0));
    close(p.lat, 19.08, 1e-6); close(p.lon, 72.88, 1e-6);
    const q = facingPoint(scene, 40000, viewerOver(-33.87, 151.21, 40000));
    close(q.lat, -33.87, 1e-6); close(q.lon, 151.21, 1e-6);
  });

  it('names the nearest city or open ocean', () => {
    expect(nearestCity(19.2, 73.0).city.name).toBe('Mumbai');
    expect(nearestCity(51.4, -0.5).city.name).toBe('London');
    expect(nearestCity(-20, -140).km).toBeGreaterThan(OCEAN_KM);   // South Pacific
    close(distanceKm(0, 0, 0, 1), 111.19, 0.1);
    expect(CITIES.length).toBeGreaterThan(40);
  });

  it('runs the scene clock at the globe\'s pace and formats a local time', () => {
    const loaded = new Date('2026-11-12T18:30:00Z');
    expect(sceneTime(loaded, 150000 / 24).getTime() - loaded.getTime()).toBe(3600000);   // one twenty-fourth of a turn is one hour
    expect(clockIn(loaded, 'Asia/Kolkata')).toBe('00:00');
    expect(clockIn(loaded, 'America/New_York')).toBe('13:30');
    expect(overReadout(scene, 0, viewerOver(19.08, 72.88, 0), loaded)).toBe('Over Mumbai · 00:00 there');
    expect(overReadout(scene, 0, viewerOver(-20, -140, 0), loaded)).toBe('Over open ocean');
    // a viewer high over the Arctic on Delhi's meridian reads the populated belt below, not the ice
    expect(overReadout(scene, 0, viewerOver(80, 77.21, 0), loaded)).toBe('Over Delhi · 00:00 there');
  });
});
