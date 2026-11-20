import * as THREE from 'three';
import { DEG, EARTH_AXIS_ECLIPTIC, OBLIQUITY, dot, eclipticDirection, length, normalize, subsolarLongitude, sunCoordinates } from './earthModel';
import {
  ACTIVE_REGION_COUNT, AU_KM, DAY_EARTH_RADIUS, DAY_NARROW_FRAMING, EARTH_ORBIT_RADIUS, EARTH_SCENE_DIRECTION, EARTH_YEAR_MS, LOOP_SLOTS,
  PROMINENCE_COUNT, SOLAR_INCLINATION, SUN_RADIUS, activeRegions, bodyToWorld, bodyVector, differentialRate, distanceReadout, earthDirection,
  earthLongitude, earthPosition, eclipticVector, hash01, loopEvent, loopFootpoints, prominences, prominencesAtLimb, seedFor, SIZEABLE_PROMINENCE, standingHeight, solarOrientation, solarPoleEcliptic,
  sunDistanceAU, sunDistanceKm, sunScene, viewAngles,
} from './sunModel';
import { ANCHORS, cameraTarget, prologueFraming } from './voyageModel';

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
    const limbEvents = [];
    for (let s = 0; s < LOOP_SLOTS; s++) for (let t = 0; limbEvents.length < 3 * LOOP_SLOTS && t < 300000; t += 15000) {
      const e = loopEvent(scene.seed, s, t);
      if (e.anchor === 'limb') limbEvents.push({ ...e, born: 0 });
    }
    expect(limbEvents.length).toBeGreaterThan(LOOP_SLOTS);
    for (const e of limbEvents) {
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

describe('the surface frame: active regions and long-lived prominences', () => {
  const scene = sunScene(new Date('2026-11-19T15:00:00Z'));
  const facing = (v, t) => dot(bodyToWorld(scene, v, t), scene.viewer);

  it('puts body longitude 0 toward the camera at load, the limb at 90 degrees, and turns prograde', () => {
    close(facing(bodyVector(0, 0), 0), Math.sqrt(1 - dot(scene.viewer, scene.sunPole) ** 2), 1e-9);
    close(facing(bodyVector(0, 90), 0), 0, 1e-9);
    close(facing(bodyVector(0, -90), 0), 0, 1e-9);
    const north = bodyToWorld(scene, bodyVector(90, 0), 12345);
    close(dot(north, scene.sunPole), 1, 1e-9);   // the pole stays put
    // the equator turns at the full rate, higher latitudes lag (differential rotation)
    const turn = (lat) => Math.acos(Math.min(1, dot(bodyToWorld(scene, bodyVector(lat, 0), 20000), bodyToWorld(scene, bodyVector(lat, 0), 0)) / Math.cos(lat * DEG) ** 2 - Math.tan(lat * DEG) ** 2));
    expect(turn(0)).toBeGreaterThan(turn(50));
  });

  it('places the day\'s active regions in the royal zones, two or three on the disc as it turns', () => {
    const regions = activeRegions(scene.seed);
    expect(regions).toHaveLength(ACTIVE_REGION_COUNT);
    regions.forEach((g) => { expect(Math.abs(g.lat)).toBeGreaterThanOrEqual(8); expect(Math.abs(g.lat)).toBeLessThanOrEqual(28); close(length(g.centre), 1, 1e-9); });
    for (let t = 0; t < 360000; t += 30000) {
      const onDisc = regions.filter((g) => facing(g.centre, t) > 0.15).length;
      expect(onDisc).toBeGreaterThanOrEqual(2);
      expect(onDisc).toBeLessThanOrEqual(4);
    }
    expect(activeRegions(scene.seed)).toEqual(regions);   // seeded
    expect(activeRegions(scene.seed + 1)).not.toEqual(regions);
  });

  it('gives the prominences a steep spread of sizes, one at least a quarter of the radius tall', () => {
    const list = prominences(scene.seed);
    expect(list).toHaveLength(PROMINENCE_COUNT);
    const heights = list.map((f) => f.height);
    expect(Math.max(...heights)).toBeGreaterThanOrEqual(0.25);
    expect(Math.max(...heights)).toBeLessThanOrEqual(0.42);
    expect(heights.filter((h) => h < SIZEABLE_PROMINENCE).length).toBeGreaterThanOrEqual(2);
    expect(heights.filter((h) => h >= SIZEABLE_PROMINENCE).length).toBeGreaterThanOrEqual(4);
    list.forEach((f) => { expect(['arch', 'hedge']).toContain(f.kind); f.feet.forEach((v) => close(length(v), 1, 1e-9)); });
    // the largest stands near the limb at load, so the still frame shows it against space
    expect(Math.abs(facing(list[0].centre, 0))).toBeLessThan(0.35);
  });

  it('keeps at least two sizeable prominences standing at the limb through a whole turn, on any day of the year', () => {
    // a still frame or a long look at the prologue never shows a bare rim
    for (let month = 0; month < 12; month++) {
      const day = sunScene(new Date(Date.UTC(2026, month, 3 + month * 2, 15)));
      const list = prominences(day.seed);
      let fewest = Infinity;
      for (let t = 0; t <= 360000; t += 1000) fewest = Math.min(fewest, prominencesAtLimb(day, list, t));
      expect(fewest).toBeGreaterThanOrEqual(2);
    }
  });

  it('measures how far a prominence stands proud of the limb', () => {
    const onLimb = { centre: bodyVector(0, 90), height: 0.3 };   // in the limb plane at load: all of it shows
    close(standingHeight(scene, onLimb, 0), 0.3, 1e-9);
    const b = dot(scene.viewer, scene.sunPole);
    const towardCamera = { centre: [0, b, Math.sqrt(1 - b * b)], height: 0.3 };   // the viewer's own direction in the body frame
    expect(standingHeight(scene, towardCamera, 0)).toBe(0);
    // a quarter turn later the limb prominence has turned onto the disc or behind it, and shows less
    expect(standingHeight(scene, onLimb, 90000)).toBeLessThan(0.3);
    expect(prominencesAtLimb(scene, [onLimb, { ...onLimb, height: 0.05 }], 0)).toBe(1);   // the small one does not count
  });

  it('roots region loops in their active region and turns them with the surface', () => {
    const regions = activeRegions(scene.seed);
    let found = 0;
    for (let s = 0; s < LOOP_SLOTS; s++) for (let t = 0; t < 300000; t += 7000) {
      const e = loopEvent(scene.seed, s, t);
      if (e.anchor !== 'region') continue;
      found += 1;
      const centre = bodyToWorld(scene, regions[e.region].centre, t);
      loopFootpoints(e, scene, t).forEach((v) => expect(dot(v, centre)).toBeGreaterThan(Math.cos(0.09)));
    }
    expect(found).toBeGreaterThan(10);
  });

  it('flings an eruption out only after it breaks, and the fling grows to the end', () => {
    for (let s = 0; s < LOOP_SLOTS; s++) for (let t = 0; t < 600000; t += 500) {
      const e = loopEvent(scene.seed, s, t);
      if (e.kind !== 'eruption' || e.progress > 0.02) continue;
      const period = 11000 + 8000 * hash01(scene.seed, s, -1);
      const at = (p) => loopEvent(scene.seed, s, t + p * period * 0.92);
      expect(at(0.3).fling).toBe(0);
      expect(at(0.6).fling).toBeGreaterThan(0);
      expect(at(0.9).fling).toBeGreaterThan(at(0.6).fling);
      return;
    }
    throw new Error('no eruption found');
  });
});

describe('the day prologue on narrow screens', () => {
  const scene = sunScene(new Date('2026-11-19T15:00:00Z'));
  // project the system as the prologue camera sees it, in percent of the screen
  const view = (width, height) => {
    const aspect = width / height;
    const target = cameraTarget({ index: 0, frac: 0 });
    const o = prologueFraming(aspect, 0, DAY_NARROW_FRAMING);
    const camera = new THREE.PerspectiveCamera(60, aspect, 1, 9000);
    camera.position.set(target.position.x + o.x, target.position.y + o.y, target.position.z + o.z);
    camera.lookAt(target.look.x + o.x, target.look.y + o.y, target.look.z);
    camera.updateMatrixWorld();
    const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0), up = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
    const box = { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity };
    const add = (p, r) => {
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const v = new THREE.Vector3(...p).addScaledVector(right, dx * r).addScaledVector(up, dy * r).project(camera);
        const x = ((v.x + 1) / 2) * 100, y = ((1 - v.y) / 2) * 100;
        box.x0 = Math.min(box.x0, x); box.x1 = Math.max(box.x1, x); box.y0 = Math.min(box.y0, y); box.y1 = Math.max(box.y1, y);
      }
    };
    add(scene.centre, SUN_RADIUS);
    for (let lon = 0; lon < 360; lon += 3) {
      const d = scene.toWorld(eclipticDirection(lon));
      add(d.map((c, k) => scene.centre[k] + c * EARTH_ORBIT_RADIUS), DAY_EARTH_RADIUS);
    }
    return box;
  };

  it('fits the whole Sun and the whole orbit between the top bar and the greeting on a phone', () => {
    const box = view(390, 844);
    expect(box.x0).toBeGreaterThan(4); expect(box.x1).toBeLessThan(96);
    expect(box.y0).toBeGreaterThan(14); expect(box.y1).toBeLessThan(68);   // the bar ends near 13%, the greeting starts near 72%
  });

  it('fits it on a portrait tablet too', () => {
    const box = view(768, 1024);
    expect(box.x0).toBeGreaterThan(4); expect(box.x1).toBeLessThan(92);   // clear of the chapter rail
    expect(box.y0).toBeGreaterThan(8); expect(box.y1).toBeLessThan(78);
  });
});
