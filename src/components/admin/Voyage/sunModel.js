// src/components/admin/Voyage/sunModel.js
//
// Pure model of the day prologue: the Sun, large and turning, with the Earth
// on its orbit. The light theme opens here instead of on the Earth and Moon.
// No Three.js, so every rule is unit tested; sunSystem.js applies the numbers.
//
// Real (for the moment the page loads):
//   - the Earth's heliocentric longitude, from the same Meeus series as
//     earthModel.js, so the Earth sits where it really is on its orbit today;
//   - the Earth-Sun distance (Meeus chapter 25), shown under the greeting;
//   - the Earth's 23.44 degree axis, fixed in space, so the lit hemisphere and
//     the season are right wherever the Earth is on the orbit;
//   - the Sun's rotation axis, 7.25 degrees from the ecliptic pole toward the
//     node Meeus calls K (chapter 29), so seen from the scene's Earth it has
//     today's B0 (tilt toward us) and P (position angle from celestial north);
//   - differential rotation: the equator turns faster than the poles in the
//     ratio of the Snodgrass rates (14.71, 2.40 and 1.79 degrees a day).
//
// Stylised (so it fits one screen and moves while you watch):
//   - sizes: the Sun's radius is 360 world units, the Earth's 46 (true ratio
//     109 to 1, here about 8 to 1, or the Earth would be a single pixel);
//   - distance: the orbit radius is 2.3 Sun radii (truly 215);
//   - tempo: one solar turn in six minutes at the equator (truly 25.4 days),
//     one Earth year in ten minutes, one Earth day in thirty seconds;
//   - the camera looks down on the ecliptic from 21 degrees above it, so the
//     orbit reads as an ellipse and the Earth can pass in front of the Sun.
//     Only the view is stylised: the whole system (Sun axis, orbit, Earth
//     axis) turns rigidly into world space, so every angle between them stays
//     the real one.
//
// The prominences, loops and eruptions follow a seeded plan: the same date
// gives the same Sun, and each loop slot draws fresh numbers every cycle, so
// nothing repeats within a sitting.

import { julianDay } from '../SkyBackground/skyModel';
import { DEG, EARTH_AXIS_ECLIPTIC, add, cross, dot, eclipticDirection, normalize, rotateAbout, rotateX, rotateY, scale, sunCoordinates } from './earthModel';
import { ANCHORS, cameraTarget } from './voyageModel';

// ---- sizes and tempos (stylised; see the header) ----
export const SUN_RADIUS = 360;
export const DAY_EARTH_RADIUS = 46;
export const EARTH_ORBIT_RADIUS = SUN_RADIUS * 2.3;
/** Sun's equatorial rotation period on screen, ms. */
export const SUN_SPIN_MS = 360000;
/** One Earth orbit on screen, ms: the Earth visibly travels while the page is open. */
export const EARTH_YEAR_MS = 600000;
/** One Earth day on screen, ms: twenty of them per stylised year. */
export const DAY_EARTH_SPIN_MS = 30000;
/** How far above the ecliptic the camera looks down, degrees. */
export const DAY_VIEW_TILT = 21;
/**
 * Where the Earth sits at load, as a unit direction from the Sun in world
 * space: to the left and a little toward the camera, so it starts beside the
 * Sun, half lit, and its orbit then carries it across the front of the disc.
 */
export const EARTH_SCENE_DIRECTION = Object.freeze(normalize([-0.86, 0, 0.5]));
/** Sun's centre relative to the prologue anchor: the spot where the night scene keeps the Earth. */
export const SUN_OFFSET = Object.freeze({ x: 440, y: -300, z: -900 });
/**
 * Narrow-screen framing for the day prologue (see voyageModel.prologueFraming):
 * the orbit is wider than the night Earth, so a portrait phone backs away
 * further to keep the Sun's whole disc and most of the orbit on screen.
 */
export const DAY_NARROW_FRAMING = Object.freeze({ wide: 1.25, narrow: 0.5, shiftX: 330, lift: -10, pullBack: 1500 });

// ---- real constants ----
/** Inclination of the Sun's equator to the ecliptic, degrees (Carrington). */
export const SOLAR_INCLINATION = 7.25;
/** Sidereal Carrington rotation period, days. */
export const CARRINGTON_DAYS = 25.38;
export const AU_KM = 149597870.7;
/** Snodgrass differential rotation, as fractions of the equatorial rate (14.713, 2.396, 1.787 degrees a day). */
export const DIFFERENTIAL = Object.freeze({ b: 2.396 / 14.713, c: 1.787 / 14.713 });

const norm360 = (d) => ((d % 360) + 360) % 360;
const centuries = (date) => (julianDay(date) - 2451545.0) / 36525;

// ---- the Earth-Sun distance ----

/**
 * Distance from the Earth to the Sun in astronomical units, Meeus chapter 25
 * (low precision, good to about 0.0001 AU, some fifteen thousand km).
 */
export function sunDistanceAU(date) {
  const T = centuries(date);
  const M = norm360(357.52911 + 35999.05029 * T - 0.0001537 * T * T);
  const e = 0.016708634 - 0.000042037 * T - 0.0000001267 * T * T;
  const C = (1.914602 - 0.004817 * T - 0.000014 * T * T) * Math.sin(M * DEG) + (0.019993 - 0.000101 * T) * Math.sin(2 * M * DEG) + 0.000289 * Math.sin(3 * M * DEG);
  const v = M + C;
  return (1.000001018 * (1 - e * e)) / (1 + e * Math.cos(v * DEG));
}

export const sunDistanceKm = (date) => sunDistanceAU(date) * AU_KM;

/**
 * The line under the greeting in the day prologue: today's real Earth-Sun
 * distance in million km and whether it is shrinking (autumn and winter,
 * toward the early-January perihelion) or growing.
 */
export function distanceReadout(date = new Date()) {
  const km = sunDistanceKm(date) / 1e6;
  const tomorrow = sunDistanceKm(new Date(date.getTime() + 86400000)) / 1e6;
  return `Earth to Sun · ${km.toFixed(1)} million km and ${tomorrow < km ? 'closing' : 'widening'}`;
}

// ---- the Sun's rotation axis (Meeus chapter 29) ----

/**
 * The Sun's orientation as seen from the Earth: P, the position angle of its
 * north pole measured east from celestial north; B0, the heliographic
 * latitude of the disc centre (how far the north pole tips toward us); L0,
 * the Carrington longitude of the disc centre. Degrees.
 */
export function solarOrientation(date) {
  const jd = julianDay(date), T = centuries(date);
  const theta = norm360(((jd - 2398220) * 360) / CARRINGTON_DAYS);
  const I = SOLAR_INCLINATION * DEG;
  const K = (73.6667 + (1.3958333 * (jd - 2396758)) / 36525) * DEG;
  const omega = (125.04 - 1934.136 * T) * DEG;
  // apparent longitude (aberration included), then with nutation for the obliquity term
  const lambda = (sunCoordinates(date).longitude - 0.00569 - 0.00478 * Math.sin(omega)) * DEG;
  const lambdaN = lambda - 0.004778 * Math.sin(omega) * DEG;
  const eps0 = 23.439291 - 0.0130042 * T;
  const eps = (eps0 + 0.00256 * Math.cos(omega)) * DEG;
  const x = Math.atan(-Math.cos(lambdaN) * Math.tan(eps));
  const y = Math.atan(-Math.cos(lambda - K) * Math.tan(I));
  const B0 = Math.asin(Math.sin(lambda - K) * Math.sin(I));
  const eta = Math.atan2(-Math.sin(lambda - K) * Math.cos(I), -Math.cos(lambda - K));
  return { P: (x + y) / DEG, B0: B0 / DEG, L0: norm360(eta / DEG - theta) };
}

/** Direction for ecliptic longitude and latitude (degrees) in earthModel's ecliptic frame (y = ecliptic north). */
export const eclipticVector = (lon, lat) => [Math.cos(lat * DEG) * Math.cos(lon * DEG), Math.sin(lat * DEG), -Math.cos(lat * DEG) * Math.sin(lon * DEG)];

/**
 * The Sun's north rotation pole in the ecliptic frame. Its equator crosses
 * the ecliptic northward at longitude K, so the pole sits 7.25 degrees from
 * the ecliptic pole toward longitude K - 90.
 */
export function solarPoleEcliptic(date) {
  const K = 73.6667 + (1.3958333 * (julianDay(date) - 2396758)) / 36525;
  return eclipticVector(K - 90, 90 - SOLAR_INCLINATION);
}

/**
 * P and B0 measured off vectors: the Sun's pole, the line of sight from the
 * observer to the Sun, and the celestial north pole, all in one frame. Used
 * to prove the 3D scene carries the real angles (and by the tests).
 */
export function viewAngles(pole, lineOfSight, celestialNorth) {
  const d = normalize(lineOfSight);
  const east = normalize(cross(celestialNorth, d));
  const north = normalize(cross(d, east));
  return { P: Math.atan2(dot(pole, east), dot(pole, north)) / DEG, B0: Math.asin(-dot(pole, d)) / DEG };
}

// ---- the scene ----

/**
 * Turn ecliptic-frame vectors into world space: a turn about the ecliptic
 * pole that puts today's Earth at EARTH_SCENE_DIRECTION, then a tip of the
 * whole system toward the camera so we look down on the orbit.
 */
export function daySceneFrame(earthLongitude, want = EARTH_SCENE_DIRECTION, tilt = DAY_VIEW_TILT) {
  const earth = eclipticDirection(earthLongitude);
  const turn = Math.atan2(-want[2], want[0]) - Math.atan2(-earth[2], earth[0]);
  return (v) => rotateX(rotateY(v, turn), tilt * DEG);
}

/** The seed of a date's Sun: its UTC calendar day, so one day keeps one Sun. */
export const seedFor = (date) => date.getUTCFullYear() * 10000 + (date.getUTCMonth() + 1) * 100 + date.getUTCDate();

/**
 * Everything the day scene needs for a moment, in world space.
 * @returns {{centre: number[], sunPole: number[], orbitNormal: number[], earthAxis: number[], earthLongitudeAtLoad: number,
 *   viewer: number[], seed: number, toWorld: (v: number[]) => number[], declination: number, subsolarLongitude: number}}
 */
export function sunScene(date = new Date(), anchor = ANCHORS[0]) {
  const sun = sunCoordinates(date);
  const earthLongitudeAtLoad = norm360(sun.longitude + 180);
  const toWorld = daySceneFrame(earthLongitudeAtLoad);
  const centre = [anchor.x + SUN_OFFSET.x, anchor.y + SUN_OFFSET.y, anchor.z + SUN_OFFSET.z];
  const rest = cameraTarget({ index: 0, frac: 0 }).position;
  return {
    centre,
    sunPole: normalize(toWorld(solarPoleEcliptic(date))),
    orbitNormal: normalize(toWorld([0, 1, 0])),
    earthAxis: normalize(toWorld(EARTH_AXIS_ECLIPTIC)),
    earthLongitudeAtLoad,
    viewer: normalize([rest.x - centre[0], rest.y - centre[1], rest.z - centre[2]]),
    seed: seedFor(date),
    toWorld,
    declination: sun.declination,
  };
}

/** The Earth's heliocentric longitude at `elapsed` ms after load: prograde, one orbit per EARTH_YEAR_MS. */
export const earthLongitude = (scene, elapsed, period = EARTH_YEAR_MS) => norm360(scene.earthLongitudeAtLoad + (360 * elapsed) / period);

/** Unit direction from the Sun to the Earth in world space. */
export const earthDirection = (scene, elapsed) => normalize(scene.toWorld(eclipticDirection(earthLongitude(scene, elapsed))));

/** World position of the Earth's centre. */
export const earthPosition = (scene, elapsed) => add(scene.centre, scale(earthDirection(scene, elapsed), EARTH_ORBIT_RADIUS));

/** Rate of the Sun's rotation at a heliographic latitude, as a fraction of the equator's. */
export const differentialRate = (sinLat) => 1 - DIFFERENTIAL.b * sinLat * sinLat - DIFFERENTIAL.c * sinLat ** 4;

/** Angle (radians) the Sun's equator has turned `elapsed` ms after load. */
export const sunSpin = (elapsed, period = SUN_SPIN_MS) => (2 * Math.PI * elapsed) / period;

// ---- prominences, loops and eruptions ----

/** How many loop slots run at once, by quality. */
export const LOOP_SLOTS = 12;

/** A stateless 0..1 hash of a few integers (seed, slot, cycle, field). */
export function hash01(...parts) {
  let h = 0x9e3779b9;
  for (const p of parts) {
    h = Math.imul(h ^ (Math.floor(p) | 0), 0x85ebca6b);
    h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16;
  }
  return (h >>> 0) / 4294967296;
}

/**
 * One loop slot at `elapsed` ms. Each slot repeats on its own period (11 to
 * 19 s, so slots drift against each other) and every cycle draws new numbers
 * from the hash, so the Sun never shows the same loop twice in a sitting.
 *
 * Kinds: a quiescent loop rises, hangs and drains back (most cycles), a
 * hedgerow prominence stands taller and longer, and an eruption (about one
 * cycle in seven) lifts slowly, then lets go and leaves the limb.
 * @returns {{slot: number, cycle: number, active: boolean, kind: 'loop'|'hedge'|'eruption', progress: number,
 *   limbAngle: number, depth: number, spread: number, height: number, brightness: number, born: number, lift: number}}
 *   progress runs 0..1 through the event; lift is 0..1 for the height envelope; brightness 0..1.
 */
export function loopEvent(seed, slot, elapsed) {
  const period = 11000 + 8000 * hash01(seed, slot, -1);
  const offset = hash01(seed, slot, -2) * period;
  const cycle = Math.floor((elapsed + offset) / period);
  const u = (elapsed + offset) / period - cycle;
  const r = (k) => hash01(seed, slot, cycle, k);
  const roll = r(0);
  const kind = roll < 0.14 ? 'eruption' : roll < 0.34 ? 'hedge' : 'loop';
  const share = kind === 'eruption' ? 0.92 : 0.7 + 0.25 * r(1);   // the part of the cycle the event lives in
  const progress = Math.min(1, u / share);
  const active = u < share;
  const born = (cycle * period - offset);
  // rise over the first 30%, hang, drain back over the last 25%; an eruption keeps rising
  const smooth = (x) => { const c = Math.min(1, Math.max(0, x)); return c * c * (3 - 2 * c); };
  const lift = kind === 'eruption' ? smooth(progress / 0.45) : smooth(progress / 0.3) * (1 - smooth((progress - 0.75) / 0.25));
  const brightness = active ? smooth(progress / 0.12) * (1 - smooth((progress - (kind === 'eruption' ? 0.55 : 0.85)) / (kind === 'eruption' ? 0.45 : 0.15))) : 0;
  return {
    slot, cycle, active, kind, progress, born, lift, brightness,
    limbAngle: r(2) * 2 * Math.PI,
    depth: (r(3) - 0.5) * 0.5,   // radians in front of (+) or behind (-) the limb plane
    spread: kind === 'hedge' ? 0.08 + 0.10 * r(4) : 0.10 + 0.22 * r(4),
    height: kind === 'hedge' ? 0.20 + 0.14 * r(5) : kind === 'eruption' ? 0.14 + 0.10 * r(5) : 0.07 + 0.17 * r(5),
  };
}

/**
 * Where a loop's two footpoints are, as unit vectors from the Sun's centre in
 * world space. They are set at birth on the limb as the prologue camera sees
 * it (most loops then show against space, as prominences do in 304 angstrom
 * pictures) and then turn with the Sun at their own latitude's rate.
 */
export function loopFootpoints(event, scene, elapsed) {
  const v = scene.viewer;
  const u1 = normalize(cross(scene.sunPole, v)), u2 = cross(v, u1);
  const limb = add(scale(u1, Math.cos(event.limbAngle)), scale(u2, Math.sin(event.limbAngle)));
  const centre = normalize(add(scale(limb, Math.cos(event.depth)), scale(v, Math.sin(event.depth))));
  const along = normalize(cross(v, limb));   // along the limb, so both feet sit on the rim
  const half = event.spread / 2;
  const a = normalize(add(scale(centre, Math.cos(half)), scale(along, Math.sin(half))));
  const b = normalize(add(scale(centre, Math.cos(half)), scale(along, -Math.sin(half))));
  const turned = sunSpin(Math.max(0, elapsed - Math.max(0, event.born))) * differentialRate(dot(centre, scene.sunPole));
  return [rotateAbout(a, scene.sunPole, turned), rotateAbout(b, scene.sunPole, turned)];
}
