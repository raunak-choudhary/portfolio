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
 * the orbit is wider than the night Earth, so a portrait phone backs well away
 * and drops below the system: the Sun's whole disc and the whole orbit (with
 * the Earth on it) fit between the top bar and the greeting, with a margin at
 * both sides. Tuned by projecting the scene at 390 by 844 (see the tests).
 */
export const DAY_NARROW_FRAMING = Object.freeze({ wide: 1.25, narrow: 0.5, shiftX: 410, lift: -650, pullBack: 2700 });

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
 * @returns {{centre: number[], sunPole: number[], bodyX: number[], bodyZ: number[], orbitNormal: number[], earthAxis: number[], earthLongitudeAtLoad: number,
 *   viewer: number[], seed: number, toWorld: (v: number[]) => number[], declination: number, subsolarLongitude: number}}
 */
export function sunScene(date = new Date(), anchor = ANCHORS[0]) {
  const sun = sunCoordinates(date);
  const earthLongitudeAtLoad = norm360(sun.longitude + 180);
  const toWorld = daySceneFrame(earthLongitudeAtLoad);
  const centre = [anchor.x + SUN_OFFSET.x, anchor.y + SUN_OFFSET.y, anchor.z + SUN_OFFSET.z];
  const rest = cameraTarget({ index: 0, frac: 0 }).position;
  const sunPole = normalize(toWorld(solarPoleEcliptic(date)));
  const viewer = normalize([rest.x - centre[0], rest.y - centre[1], rest.z - centre[2]]);
  // The Sun's body frame: y the pole, z the meridian that faces the camera at load, x = y cross z.
  // Surface features are placed in this frame (longitude 0 faces us, +-90 is the limb) and turn with it.
  const bodyZ = normalize(add(viewer, scale(sunPole, -dot(viewer, sunPole))));
  const bodyX = cross(sunPole, bodyZ);
  return {
    centre,
    sunPole, bodyX, bodyZ,
    orbitNormal: normalize(toWorld([0, 1, 0])),
    earthAxis: normalize(toWorld(EARTH_AXIS_ECLIPTIC)),
    earthLongitudeAtLoad,
    viewer,
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

// ---- the surface frame: active regions and long-lived prominences ----

/** A unit vector in the Sun's body frame from heliographic latitude and longitude (degrees; longitude 0 faces the camera at load). */
export const bodyVector = (lat, lon) => [Math.cos(lat * DEG) * Math.sin(lon * DEG), Math.sin(lat * DEG), Math.cos(lat * DEG) * Math.cos(lon * DEG)];

/**
 * A body-frame vector in world space `elapsed` ms after load: turned about the
 * pole at its own latitude's rate (differential rotation, as the surface
 * shader turns each latitude), then carried by the body frame.
 */
export function bodyToWorld(scene, v, elapsed) {
  const turned = rotateY(v, sunSpin(elapsed) * differentialRate(v[1]));
  return add(add(scale(scene.bodyX, turned[0]), scale(scene.sunPole, turned[1])), scale(scene.bodyZ, turned[2]));
}

/** Two footpoints either side of `centre` along a surface direction `orient` (radians from north toward east), `spread` radians apart. */
function feetAround(centre, orient, spread) {
  const north = normalize(add([0, 1, 0], scale(centre, -centre[1])));
  const east = cross(north, centre);
  const axis = add(scale(north, Math.cos(orient)), scale(east, Math.sin(orient)));
  const h = spread / 2;
  return [normalize(add(scale(centre, Math.cos(h)), scale(axis, Math.sin(h)))), normalize(add(scale(centre, Math.cos(h)), scale(axis, -Math.sin(h))))];
}

/** How many active regions a day's Sun carries. */
export const ACTIVE_REGION_COUNT = 5;

/**
 * The day's active regions, in the body frame. They sit in the two royal zones
 * (8 to 28 degrees either side of the equator, where sunspots form) and are
 * spread round the Sun 72 degrees apart (give or take 8), two of them well on
 * the near side at load, so two or three are on the disc at any moment as it turns.
 * @returns {{centre: number[], lat: number, lon: number, size: number, strength: number}[]} size is an angular radius in radians.
 */
export function activeRegions(seed) {
  const offsets = [-40, 32, 104, 176, 248];
  return offsets.map((base, k) => {
    const r = (f) => hash01(seed, 900 + k, f);
    const lat = (r(0) < 0.5 ? -1 : 1) * (8 + 20 * r(1));
    const lon = base + (r(2) - 0.5) * 16;
    return { centre: bodyVector(lat, lon), lat, lon, size: 0.15 + 0.09 * r(3), strength: 0.75 + 0.25 * r(4) };
  });
}

/** How many long-lived prominences (filaments when seen on the disc) a day's Sun carries. */
export const PROMINENCE_COUNT = 7;

/** A prominence at least this tall (in Sun radii) reads as a sizeable flame when it stands at the limb. */
export const SIZEABLE_PROMINENCE = 0.1;

/**
 * Where the long-lived prominences sit (body-frame latitude and longitude in
 * degrees, before the day's seeded jitter of up to PROMINENCE_JITTER). The
 * camera looks down on the Sun's north side (25 to 41 degrees above its
 * equator through the year), so the visible limb runs low across the southern
 * hemisphere and over the north polar cap. The plan was searched so that, for
 * every date and every moment of a six-minute turn, at least two of the five
 * sizeable ones stand at least 0.05 radius proud of that limb (a quiet still
 * frame or a long look never leaves the rim bare); prominencesAtLimb measures
 * it and sunModel.test.js holds it. Most are high-latitude, like the polar
 * crown prominences of the real Sun, and the tallest starts on the east limb.
 */
const PROMINENCE_PLAN = Object.freeze([
  [15, 90], [44, 52], [46, 269], [50, 156], [53, 317], [-37, 123], [22, 199],
]);
/** The seeded jitter around the plan, in degrees of latitude and longitude. */
export const PROMINENCE_JITTER = Object.freeze({ lat: 5, lon: 6 });

/**
 * Long-lived prominences: sheets of cooler gas held above the surface by the
 * magnetic field for days. Seen against space at the limb they glow; seen on
 * the disc they are the same objects as dark filaments, so they are placed on
 * the surface and turn with it. Sizes follow a steep spread: one large (a third
 * of a solar radius tall), a few medium, two small. Their places follow
 * PROMINENCE_PLAN, so the limb is never left without a sizeable flame.
 * @returns {{feet: number[][], centre: number[], lat: number, lon: number, height: number, kind: 'arch'|'hedge', lean: number, flow: number, strands: number}[]}
 */
export function prominences(seed) {
  const heights = [0.36, 0.25, 0.19, 0.15, 0.12, 0.07, 0.05];
  return heights.map((base, k) => {
    const r = (f) => hash01(seed, 700 + k, f);
    const lat = PROMINENCE_PLAN[k][0] + (r(1) - 0.5) * 2 * PROMINENCE_JITTER.lat;
    const lon = PROMINENCE_PLAN[k][1] + (r(2) - 0.5) * 2 * PROMINENCE_JITTER.lon;
    const centre = bodyVector(lat, lon);
    // near-meridional sheets show their long side at the east and west limbs
    const orient = (r(3) - 0.5) * 1.2;
    const spread = 0.12 + base * 1.1 + 0.12 * r(4);
    return {
      feet: feetAround(centre, orient, spread), centre, lat, lon,
      height: base * (0.85 + 0.3 * r(5)),
      kind: r(6) < (k === 0 ? 0.6 : 0.45) ? 'hedge' : 'arch',
      lean: (r(7) - 0.5) * 1.1,
      flow: r(8) < 0.5 ? -1 : 1,
      strands: 3 + Math.floor(r(9) * 4),
    };
  });
}

/**
 * How far a prominence's top stands outside the visible disc `elapsed` ms
 * after load, in Sun radii (0 when it is all on the disc or hidden behind it).
 * Its centre turns with the surface; a top at radius 1 + height, at angle
 * delta from the limb plane, projects to (1 + height) cos(delta) from the
 * centre of the disc, whether it leans toward the camera or away.
 */
export function standingHeight(scene, prom, elapsed) {
  const along = dot(bodyToWorld(scene, prom.centre, elapsed), scene.viewer);
  return Math.max(0, (1 + prom.height) * Math.sqrt(Math.max(0, 1 - along * along)) - 1);
}

/** How many sizeable prominences stand at least `minHeight` radii proud of the visible limb `elapsed` ms after load. */
export function prominencesAtLimb(scene, list, elapsed, minHeight = 0.05) {
  return list.filter((p) => p.height >= SIZEABLE_PROMINENCE && standingHeight(scene, p, elapsed) >= minHeight).length;
}

// ---- short-lived loops and eruptions ----

/** How many short-lived loop slots run at once. */
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

/** Eruption phases, as fractions of the event: the arch swells until the break, then splits and its cloud is thrown out. */
export const ERUPTION_BREAK = 0.42;

/**
 * One loop slot at `elapsed` ms. Each slot repeats on its own period (11 to
 * 19 s, so slots drift against each other) and every cycle draws new numbers
 * from the hash, so the Sun never shows the same loop twice in a sitting.
 *
 * Kinds: a loop rises, hangs and drains back (most cycles), a hedgerow stands
 * as a ragged curtain along the limb, and an eruption (about one cycle in
 * seven) swells, breaks and throws a widening cloud out from the limb. About a
 * third of the plain loops are rooted in an active region instead of the limb,
 * so the bright regions on the disc carry their own arcades. Heights follow a
 * steep spread (many small, few large, up to 0.4 of the radius).
 * @returns {{slot: number, cycle: number, active: boolean, kind: 'loop'|'hedge'|'eruption', anchor: 'limb'|'region', region: number,
 *   progress: number, limbAngle: number, depth: number, spread: number, height: number, brightness: number, born: number, lift: number,
 *   fling: number, lean: number, flow: number, orient: number}}
 *   progress runs 0..1 through the event; lift is 0..1 for the height envelope; brightness 0..1; fling 0..1 after an eruption breaks.
 */
export function loopEvent(seed, slot, elapsed) {
  const period = 11000 + 8000 * hash01(seed, slot, -1);
  const offset = hash01(seed, slot, -2) * period;
  const cycle = Math.floor((elapsed + offset) / period);
  const u = (elapsed + offset) / period - cycle;
  const r = (k) => hash01(seed, slot, cycle, k);
  const roll = r(0);
  const kind = roll < 0.14 ? 'eruption' : roll < 0.34 ? 'hedge' : 'loop';
  const anchor = kind === 'loop' && r(6) < 0.35 ? 'region' : 'limb';
  const share = kind === 'eruption' ? 0.92 : 0.7 + 0.25 * r(1);   // the part of the cycle the event lives in
  const progress = Math.min(1, u / share);
  const active = u < share;
  const born = (cycle * period - offset);
  // rise over the first 30%, hang, drain back over the last 25%; an eruption keeps rising
  const smooth = (x) => { const c = Math.min(1, Math.max(0, x)); return c * c * (3 - 2 * c); };
  const lift = kind === 'eruption' ? smooth(progress / ERUPTION_BREAK) : smooth(progress / 0.3) * (1 - smooth((progress - 0.75) / 0.25));
  const brightness = active ? smooth(progress / 0.12) * (kind === 'eruption' ? 1 : 1 - smooth((progress - 0.85) / 0.15)) : 0;
  const fling = kind === 'eruption' && active ? smooth((progress - ERUPTION_BREAK) / (1 - ERUPTION_BREAK)) : 0;
  const size = r(5) ** 2.2;   // most small, a few large
  const height = anchor === 'region' ? 0.04 + 0.08 * r(5)
    : kind === 'hedge' ? 0.08 + 0.22 * size : kind === 'eruption' ? 0.12 + 0.12 * r(5) : 0.05 + 0.35 * size;
  return {
    slot, cycle, active, kind, anchor, progress, born, lift, brightness, fling,
    region: Math.floor(r(7) * ACTIVE_REGION_COUNT),
    limbAngle: r(2) * 2 * Math.PI,
    depth: (r(3) - 0.5) * 0.5,   // radians in front of (+) or behind (-) the limb plane
    spread: anchor === 'region' ? 0.05 + 0.07 * r(4) : kind === 'hedge' ? 0.12 + 0.20 * r(4) : 0.08 + 0.10 * r(4) + 0.5 * height,
    height,
    lean: (r(8) - 0.5) * 1.2,
    flow: r(9) < 0.5 ? -1 : 1,
    orient: r(10) * Math.PI,
  };
}

/**
 * Where a loop's two footpoints are, as unit vectors from the Sun's centre in
 * world space. A limb loop is set at birth on the limb as the prologue camera
 * sees it (so it shows against space, as prominences do in 304 angstrom
 * pictures) and then turns with the Sun at its own latitude's rate. A region
 * loop is rooted in its active region and turns with the surface from load.
 */
export function loopFootpoints(event, scene, elapsed) {
  if (event.anchor === 'region') {
    const region = activeRegions(scene.seed)[event.region];
    return feetAround(region.centre, event.orient, event.spread).map((v) => bodyToWorld(scene, v, elapsed));
  }
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
