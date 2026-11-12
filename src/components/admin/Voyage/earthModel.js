// src/components/admin/Voyage/earthModel.js
//
// Pure model of the voyage's opening scene: Earth, its Moon and a few
// satellites near the first chapter. Real where it matters (today's solar
// declination sets the axial tilt against the Sun, the subsolar point sets
// where the terminator falls at load, the Moon starts at tonight's phase),
// stylised where reality is invisible (the Earth turns once in a few minutes,
// the Moon orbits in a minute and a half, and sits under two Earth radii out
// instead of sixty, close enough to share the frame). No Three.js here so every rule is unit tested; the
// scene applies the vectors.
//
// Frames. Everything is computed in an ecliptic frame (y = ecliptic north,
// x = the vernal equinox, z = toward the point of ecliptic longitude 270°)
// and then turned into world space by `sceneFrame`, which puts the Sun where
// the scene wants it (to the right and a little behind the Earth, so the
// night side with its city lights faces the camera and the terminator
// crosses the globe) and tips the whole system so we look down on the
// Moon's orbit from a little above.

import { julianDay, moonPhase, seededRandom } from '../SkyBackground/skyModel';
import { ANCHORS } from './voyageModel';

export const DEG = Math.PI / 180;
export const OBLIQUITY = 23.4393;      // Earth's axial tilt, degrees
export const MOON_INCLINATION = 5.145; // Moon's orbit against the ecliptic, degrees

/** World sizes and tempos (stylised). */
export const EARTH_RADIUS = 300;
export const MOON_RADIUS = EARTH_RADIUS * 0.2727;
export const MOON_ORBIT_RADIUS = EARTH_RADIUS * 1.6;
export const EARTH_SPIN_MS = 150000;   // one turn in two and a half minutes
export const MOON_ORBIT_MS = 95000;    // one orbit in a minute and a half
/** Where the Sun sits in world space: ecliptic longitude of the Sun as seen in the scene, measured so 90° is straight right. */
export const SUN_SCENE_AZIMUTH = 75;
/** How far above the Moon's orbit the camera looks, degrees: steep, so the orbit reads as a ring and the Moon never crosses the camera's path. */
export const VIEW_TILT = 62;
/** Earth's centre relative to the prologue's anchor: right of centre, well ahead, and clear of the camera's path to the later chapters. */
export const EARTH_OFFSET = Object.freeze({ x: 440, y: -320, z: -840 });

const norm360 = (d) => ((d % 360) + 360) % 360;
const wrap180 = (d) => { let v = norm360(d); if (v > 180) v -= 360; return v; };

// ---- small vector helpers (arrays of three numbers) ----
export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const length = (a) => Math.hypot(a[0], a[1], a[2]);
export const normalize = (a) => { const l = length(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
export const scale = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
export const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
/** Rodrigues rotation of v by `angle` (radians) about the unit axis k. */
export function rotateAbout(v, k, angle) {
  const c = Math.cos(angle), s = Math.sin(angle), kv = cross(k, v), kd = dot(k, v);
  return [v[0] * c + kv[0] * s + k[0] * kd * (1 - c), v[1] * c + kv[1] * s + k[1] * kd * (1 - c), v[2] * c + kv[2] * s + k[2] * kd * (1 - c)];
}
export const rotateX = (v, a) => rotateAbout(v, [1, 0, 0], a);
export const rotateY = (v, a) => rotateAbout(v, [0, 1, 0], a);
/**
 * The minimal rotation that takes +y onto `axis` (the same rotation Three's
 * Quaternion.setFromUnitVectors(up, axis) builds), as apply and inverse.
 */
export function alignYTo(axis) {
  const up = [0, 1, 0], a = normalize(axis);
  const k = cross(up, a), s = length(k), c = dot(up, a);
  if (s < 1e-9) { const sign = c >= 0 ? 1 : -1; return { apply: (v) => [v[0], sign * v[1], sign * v[2]], inverse: (v) => [v[0], sign * v[1], sign * v[2]] }; }
  const unit = scale(k, 1 / s), angle = Math.atan2(s, c);
  return { apply: (v) => rotateAbout(v, unit, angle), inverse: (v) => rotateAbout(v, unit, -angle) };
}

// ---- the Sun ----

/**
 * The Sun's apparent ecliptic longitude and declination (degrees) and the
 * equation of time (minutes) for a moment. Meeus's low-precision series,
 * good to a few arcminutes, far more than a drawing needs.
 */
export function sunCoordinates(date) {
  const T = (julianDay(date) - 2451545.0) / 36525;
  const L0 = norm360(280.46646 + 36000.76983 * T), M = norm360(357.52911 + 35999.05029 * T);
  const C = 1.914602 * Math.sin(M * DEG) + 0.019993 * Math.sin(2 * M * DEG);
  const longitude = norm360(L0 + C), e = OBLIQUITY * DEG;
  const ra = norm360(Math.atan2(Math.cos(e) * Math.sin(longitude * DEG), Math.cos(longitude * DEG)) / DEG);
  const declination = Math.asin(Math.sin(e) * Math.sin(longitude * DEG)) / DEG;
  return { longitude, declination, equationOfTime: wrap180(L0 - ra) * 4 };
}

/** Longitude (degrees east, -180..180) of the point directly under the Sun. */
export function subsolarLongitude(date) {
  const { equationOfTime } = sunCoordinates(date);
  const ut = date.getUTCHours() + date.getUTCMinutes() / 60 + date.getUTCSeconds() / 3600;
  return wrap180(-((ut + equationOfTime / 60 - 12) * 15));
}

// ---- the ecliptic frame ----

/** Direction of ecliptic longitude λ (degrees) in the ecliptic frame. */
export const eclipticDirection = (lambda) => [Math.cos(lambda * DEG), 0, -Math.sin(lambda * DEG)];
/** Earth's rotation axis in the ecliptic frame: tilted by the obliquity toward longitude 90°. */
export const EARTH_AXIS_ECLIPTIC = Object.freeze([0, Math.cos(OBLIQUITY * DEG), -Math.sin(OBLIQUITY * DEG)]);
/** Normal of the Moon's orbit in the ecliptic frame, tilted by its inclination (node placed at longitude 0). */
export const MOON_ORBIT_NORMAL_ECLIPTIC = Object.freeze([Math.sin(MOON_INCLINATION * DEG), Math.cos(MOON_INCLINATION * DEG), 0]);

/**
 * The world frame of the scene: rotates ecliptic-frame vectors so the Sun
 * sits at SUN_SCENE_AZIMUTH and the system is tipped by VIEW_TILT.
 * @returns {(v: number[]) => number[]}
 */
export function sceneFrame(date, azimuth = SUN_SCENE_AZIMUTH, tilt = VIEW_TILT) {
  const sun = eclipticDirection(sunCoordinates(date).longitude);
  const want = [Math.sin(azimuth * DEG), 0, -Math.cos(azimuth * DEG)];
  // the angle about y that carries the real Sun direction onto the wanted one (both lie in the x-z plane)
  const turn = Math.atan2(-want[2], want[0]) - Math.atan2(-sun[2], sun[0]);
  return (v) => rotateX(rotateY(v, turn), tilt * DEG);
}

/**
 * Everything the scene needs for a moment: unit directions in world space
 * and the Earth's spin at load.
 */
export function earthScene(date = new Date(), anchor = ANCHORS[0]) {
  const toWorld = sceneFrame(date);
  const sun = sunCoordinates(date);
  const sunDir = normalize(toWorld(eclipticDirection(sun.longitude)));
  const axis = normalize(toWorld(EARTH_AXIS_ECLIPTIC));
  const moonNormal = normalize(toWorld(MOON_ORBIT_NORMAL_ECLIPTIC));
  const centre = [anchor.x + EARTH_OFFSET.x, anchor.y + EARTH_OFFSET.y, anchor.z + EARTH_OFFSET.z];
  return { sunDir, axis, moonNormal, centre, declination: sun.declination, subsolarLongitude: subsolarLongitude(date), spinAtLoad: spinForSubsolar(axis, sunDir, sun.declination, subsolarLongitude(date)), moonPhaseAtLoad: moonPhase(date).fraction };
}

/** Where a surface point (latitude, longitude in degrees) sits in the Earth mesh's own frame, before any rotation. */
export const surfacePoint = (lat, lon) => [Math.cos(lat * DEG) * Math.cos(lon * DEG), Math.sin(lat * DEG), -Math.cos(lat * DEG) * Math.sin(lon * DEG)];
const yaw = (v) => Math.atan2(-v[2], v[0]);

/**
 * The spin angle (radians about the axis) that turns the subsolar point to face the Sun.
 * The mesh is oriented as alignYTo(axis) · spin, so after undoing the alignment the Sun
 * direction has the subsolar latitude and the spin is the yaw difference in the x-z plane.
 */
export function spinForSubsolar(axis, sunDir, declination, subsolar) {
  const local = alignYTo(axis).inverse(sunDir);
  return yaw(local) - yaw(surfacePoint(declination, subsolar));
}

/** Spin angle at `elapsed` ms after load: eastward, one turn per EARTH_SPIN_MS. */
export const earthSpin = (spinAtLoad, elapsed, period = EARTH_SPIN_MS) => spinAtLoad + (2 * Math.PI * elapsed) / period;

// ---- the Moon ----

/**
 * Unit direction from Earth to the Moon for a phase fraction (0 new, 0.5 full):
 * the Sun's direction projected onto the orbit plane and swung east by the
 * elongation. Then world position = centre + direction × orbit radius.
 */
export function moonDirection(sunDir, orbitNormal, fraction) {
  const inPlane = normalize(add(sunDir, scale(orbitNormal, -dot(sunDir, orbitNormal))));
  return rotateAbout(inPlane, orbitNormal, fraction * 2 * Math.PI);
}
/** Phase fraction at `elapsed` ms after load (stylised: one orbit per MOON_ORBIT_MS). */
export const moonFraction = (fractionAtLoad, elapsed, period = MOON_ORBIT_MS) => (fractionAtLoad + elapsed / period) % 1;
export const moonPosition = (scene, elapsed) => add(scene.centre, scale(moonDirection(scene.sunDir, scene.moonNormal, moonFraction(scene.moonPhaseAtLoad, elapsed)), MOON_ORBIT_RADIUS));

// ---- satellites ----

/**
 * A handful of low orbits: radius in Earth radii, inclination, node and
 * period, seeded so every load gives the same constellation of satellites.
 * @returns {Array<{radius: number, inclination: number, node: number, period: number, phase: number}>}
 */
export function satelliteOrbits(count, seed = 11) {
  const rnd = seededRandom(seed);
  return Array.from({ length: count }, () => ({
    radius: EARTH_RADIUS * (1.07 + rnd() * 0.26), inclination: rnd() * 98 * DEG, node: rnd() * 2 * Math.PI, period: 22000 + rnd() * 26000, phase: rnd() * 2 * Math.PI,
  }));
}
/** World position of a satellite at `elapsed` ms, around a centre with the given equatorial axis frame. */
export function satellitePosition(orbit, elapsed, scene) {
  const a = orbit.phase + (2 * Math.PI * elapsed) / orbit.period;
  const flat = [Math.cos(a), 0, -Math.sin(a)];
  const inclined = rotateY(rotateX(flat, orbit.inclination), orbit.node);
  return add(scene.centre, scale(alignYTo(scene.axis).apply(inclined), orbit.radius));
}
