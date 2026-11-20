// src/components/admin/Voyage/moonModel.js
//
// Pure model of tonight's Moon: where it is, how much of it is lit, which way
// the lit side points for someone standing in New York, and when it rises,
// sets, and comes back to full and new. No DOM and no Three.js, so every
// formula is unit tested against published values (moonModel.test.js).
//
// Sources, all from Jean Meeus, Astronomical Algorithms (2nd edition, 1998):
//   chapter 12  sidereal time at Greenwich;
//   chapter 13  ecliptic to equatorial coordinates, local altitude;
//   chapter 14  the parallactic angle;
//   chapter 15  rising and setting (the standard altitude of the Moon);
//   chapter 22  nutation (the low-precision series, good to 0.5");
//   chapter 25  the Sun's apparent position (low precision, about 0.01°);
//   chapter 47  the Moon's position (the full ELP-2000/82 abridgement of
//               tables 47.A and 47.B: about 10" in longitude, 4" in latitude);
//   chapter 48  illuminated fraction and the position angle of the bright limb;
//   chapter 49  the instants of the phases (found here by solving the same
//               chapter 47 and 25 positions for the elongation, which is how
//               chapter 49 defines a phase, rather than by its mean series);
//   chapter 53  the optical librations and the position angle of the axis.
//
// What New York changes. The phase (how much is lit) is the same everywhere
// on Earth. What a place changes is the orientation of the disc against its
// horizon: the position angle of the bright limb (chapter 48) is measured
// from celestial north, and the parallactic angle q (chapter 14) is the angle
// between celestial north and the zenith at the Moon. Their difference χ - q
// is the angle of the bright limb from straight up, as a person in New York
// sees it: the "boat" or "bow" orientation. Positive is counterclockwise, to
// the observer's left (east); negative is to the right (west).
//
// Below the horizon. When the Moon is down in New York there is no "as seen"
// orientation, so the model gives the one it will have when it next rises,
// the moment New York can next look at it, and says so (tiltAt, risesLater).
//
// Time scales. A Date is UT; the theory runs on Terrestrial Time. ΔT = TT - UT
// was 69.1 s in 2024 and changes by under 0.1 s a year, so a constant 69.2 s
// is used (the Moon moves 0.5" a second, so an error of a second is nothing).

import { NEW_YORK, julianDay } from '../SkyBackground/skyModel';

export { NEW_YORK };
export const DEG = Math.PI / 180;
/** TT - UT in seconds, near 2026 (IERS Bulletin A gives 69.1 to 69.2 s). */
export const DELTA_T = 69.2;
/** Mean Earth-Moon distance (km), for the apparent size ratio. */
export const MEAN_DISTANCE_KM = 385000.56;
/** Inclination of the Moon's equator to the ecliptic (Meeus chapter 53). */
export const MOON_EQUATOR_INCLINATION = 1.54242;
/** Inclination of the Moon's orbit to the ecliptic, degrees. */
export const MOON_ORBIT_INCLINATION = 5.145;
/** Mean synodic month, days, and a mean new moon to count lunations from (2000-01-06 18:14 UT). */
export const SYNODIC_DAYS = 29.530588853;
const REFERENCE_NEW_MOON = Date.UTC(2000, 0, 6, 18, 14);
/** Earth's equatorial radius (km), for the Moon's horizontal parallax. */
const EARTH_RADIUS_KM = 6378.14;
const AU_KM = 149597870.7;

export const norm360 = (d) => ((d % 360) + 360) % 360;
export const norm180 = (d) => { const v = norm360(d); return v > 180 ? v - 360 : v; };
const sin = (d) => Math.sin(d * DEG);
const cos = (d) => Math.cos(d * DEG);
const atan2d = (y, x) => Math.atan2(y, x) / DEG;
const asind = (x) => Math.asin(Math.max(-1, Math.min(1, x))) / DEG;

/** Julian Ephemeris Day (TT) for a UT moment. */
export const julianEphemerisDay = (date) => julianDay(date) + DELTA_T / 86400;
/** Julian centuries of TT since J2000.0. */
const centuriesTT = (jde) => (jde - 2451545.0) / 36525;

// ---- nutation and obliquity (chapter 22, low precision) ----

/** Nutation in longitude and obliquity (degrees) and the mean and true obliquity. */
export function nutation(jde) {
  const T = centuriesTT(jde);
  const omega = 125.04452 - 1934.136261 * T;
  const L = 280.4665 + 36000.7698 * T, Lp = 218.3165 + 481267.8813 * T;
  const dpsi = (-17.20 * sin(omega) - 1.32 * sin(2 * L) - 0.23 * sin(2 * Lp) + 0.21 * sin(2 * omega)) / 3600;
  const deps = (9.20 * cos(omega) + 0.57 * cos(2 * L) + 0.10 * cos(2 * Lp) - 0.09 * cos(2 * omega)) / 3600;
  const eps0 = 23 + 26 / 60 + (21.448 - 46.8150 * T - 0.00059 * T * T + 0.001813 * T * T * T) / 3600;
  return { dpsi, deps, eps0, eps: eps0 + deps };
}

// ---- the Sun (chapter 25, low precision) ----

/** The Sun's apparent geocentric ecliptic longitude (degrees) and distance (km). */
export function sunApparent(jde) {
  const T = centuriesTT(jde);
  const L0 = 280.46646 + 36000.76983 * T + 0.0003032 * T * T;
  const M = 357.52911 + 35999.05029 * T - 0.0001537 * T * T;
  const e = 0.016708634 - 0.000042037 * T - 0.0000001267 * T * T;
  const C = (1.914602 - 0.004817 * T - 0.000014 * T * T) * sin(M) + (0.019993 - 0.000101 * T) * sin(2 * M) + 0.000289 * sin(3 * M);
  const R = (1.000001018 * (1 - e * e)) / (1 + e * cos(M + C));
  // true longitude, then nutation and the 20.4898" annual aberration
  const longitude = norm360(L0 + C + nutation(jde).dpsi - 20.4898 / 3600 / R);
  return { longitude, latitude: 0, distanceKm: R * AU_KM };
}

// ---- the Moon (chapter 47) ----

// Table 47.A: multiples of D, M, M', F; Σl (1e-6 degree); Σr (1e-3 km).
const TABLE_LR = [
  [0, 0, 1, 0, 6288774, -20905355], [2, 0, -1, 0, 1274027, -3699111], [2, 0, 0, 0, 658314, -2955968], [0, 0, 2, 0, 213618, -569925],
  [0, 1, 0, 0, -185116, 48888], [0, 0, 0, 2, -114332, -3149], [2, 0, -2, 0, 58793, 246158], [2, -1, -1, 0, 57066, -152138],
  [2, 0, 1, 0, 53322, -170733], [2, -1, 0, 0, 45758, -204586], [0, 1, -1, 0, -40923, -129620], [1, 0, 0, 0, -34720, 108743],
  [0, 1, 1, 0, -30383, 104755], [2, 0, 0, -2, 15327, 10321], [0, 0, 1, 2, -12528, 0], [0, 0, 1, -2, 10980, 79661],
  [4, 0, -1, 0, 10675, -34782], [0, 0, 3, 0, 10034, -23210], [4, 0, -2, 0, 8548, -21636], [2, 1, -1, 0, -7888, 24208],
  [2, 1, 0, 0, -6766, 30824], [1, 0, -1, 0, -5163, -8379], [1, 1, 0, 0, 4987, -16675], [2, -1, 1, 0, 4036, -12831],
  [2, 0, 2, 0, 3994, -10445], [4, 0, 0, 0, 3861, -11650], [2, 0, -3, 0, 3665, 14403], [0, 1, -2, 0, -2689, -7003],
  [2, 0, -1, 2, -2602, 0], [2, -1, -2, 0, 2390, 10056], [1, 0, 1, 0, -2348, 6322], [2, -2, 0, 0, 2236, -9884],
  [0, 1, 2, 0, -2120, 5751], [0, 2, 0, 0, -2069, 0], [2, -2, -1, 0, 2048, -4950], [2, 0, 1, -2, -1773, 4130],
  [2, 0, 0, 2, -1595, 0], [4, -1, -1, 0, 1215, -3958], [0, 0, 2, 2, -1110, 0], [3, 0, -1, 0, -892, 3258],
  [2, 1, 1, 0, -810, 2616], [4, -1, -2, 0, 759, -1897], [0, 2, -1, 0, -713, -2117], [2, 2, -1, 0, -700, 2354],
  [2, 1, -2, 0, 691, 0], [2, -1, 0, -2, 596, 0], [4, 0, 1, 0, 549, -1423], [0, 0, 4, 0, 537, -1117],
  [4, -1, 0, 0, 520, -1571], [1, 0, -2, 0, -487, -1739], [2, 1, 0, -2, -399, 0], [0, 0, 2, -2, -381, -4421],
  [1, 1, 1, 0, 351, 0], [3, 0, -2, 0, -340, 0], [4, 0, -3, 0, 330, 0], [2, -1, 2, 0, 327, 0],
  [0, 2, 1, 0, -323, 1165], [1, 1, -1, 0, 299, 0], [2, 0, 3, 0, 294, 0], [2, 0, -1, -2, 0, 8752],
];
// Table 47.B: multiples of D, M, M', F; Σb (1e-6 degree).
const TABLE_B = [
  [0, 0, 0, 1, 5128122], [0, 0, 1, 1, 280602], [0, 0, 1, -1, 277693], [2, 0, 0, -1, 173237], [2, 0, -1, 1, 55413],
  [2, 0, -1, -1, 46271], [2, 0, 0, 1, 32573], [0, 0, 2, 1, 17198], [2, 0, 1, -1, 9266], [0, 0, 2, -1, 8822],
  [2, -1, 0, -1, 8216], [2, 0, -2, -1, 4324], [2, 0, 1, 1, 4200], [2, 1, 0, -1, -3359], [2, -1, -1, 1, 2463],
  [2, -1, 0, 1, 2211], [2, -1, -1, -1, 2065], [0, 1, -1, -1, -1870], [4, 0, -1, -1, 1828], [0, 1, 0, 1, -1794],
  [0, 0, 0, 3, -1749], [0, 1, -1, 1, -1565], [1, 0, 0, 1, -1491], [0, 1, 1, 1, -1475], [0, 1, 1, -1, -1410],
  [0, 1, 0, -1, -1344], [1, 0, 0, -1, -1335], [0, 0, 3, 1, 1107], [4, 0, 0, -1, 1021], [4, 0, -1, 1, 833],
  [0, 0, 1, -3, 777], [4, 0, -2, 1, 671], [2, 0, 0, -3, 607], [2, 0, 2, -1, 596], [2, -1, 1, -1, 491],
  [2, 0, -2, 1, -451], [0, 0, 3, -1, 439], [2, 0, 2, 1, 422], [2, 0, -3, -1, 421], [2, 1, -1, 1, -366],
  [2, 1, 0, 1, -351], [4, 0, 0, 1, 331], [2, -1, 1, 1, 315], [2, -2, 0, -1, 302], [0, 0, 1, 3, -283],
  [2, 1, 1, -1, -229], [1, 1, 0, -1, 223], [1, 1, 0, 1, 223], [0, 1, -2, -1, -220], [2, 1, -1, -1, -220],
  [1, 0, 1, 1, -185], [2, -1, -2, -1, 181], [0, 1, 2, 1, -177], [4, 0, -2, -1, 176], [4, -1, -1, -1, 166],
  [1, 0, 1, -1, -164], [4, 0, 1, -1, 132], [1, 0, -1, -1, -119], [4, -1, 0, -1, 115], [2, -2, 0, 1, 107],
];

/** The fundamental arguments of chapter 47, degrees, for T in Julian centuries of TT. */
export function lunarArguments(T) {
  const T2 = T * T, T3 = T2 * T, T4 = T3 * T;
  return {
    Lp: norm360(218.3164477 + 481267.88123421 * T - 0.0015786 * T2 + T3 / 538841 - T4 / 65194000),
    D: norm360(297.8501921 + 445267.1114034 * T - 0.0018819 * T2 + T3 / 545868 - T4 / 113065000),
    M: norm360(357.5291092 + 35999.0502909 * T - 0.0001536 * T2 + T3 / 24490000),
    Mp: norm360(134.9633964 + 477198.8675055 * T + 0.0087414 * T2 + T3 / 69699 - T4 / 14712000),
    F: norm360(93.2720950 + 483202.0175233 * T - 0.0036539 * T2 - T3 / 3526000 + T4 / 863310000),
    /** Longitude of the mean ascending node (chapter 47, also used by chapter 53). */
    Omega: norm360(125.0445479 - 1934.1362891 * T + 0.0020754 * T2 + T3 / 467441 - T4 / 60616000),
  };
}

/**
 * The Moon's geocentric position for a Julian Ephemeris Day: apparent
 * ecliptic longitude (true longitude plus nutation), latitude (degrees) and
 * distance from the Earth's centre (km). Meeus chapter 47.
 */
export function moonEcliptic(jde) {
  const T = centuriesTT(jde);
  const { Lp, D, M, Mp, F, Omega } = lunarArguments(T);
  const A1 = 119.75 + 131.849 * T, A2 = 53.09 + 479264.290 * T, A3 = 313.45 + 481266.484 * T;
  const E = 1 - 0.002516 * T - 0.0000074 * T * T;
  let sl = 0, sr = 0, sb = 0;
  for (const [d, m, mp, f, l, r] of TABLE_LR) {
    const arg = d * D + m * M + mp * Mp + f * F, e = m === 0 ? 1 : Math.abs(m) === 1 ? E : E * E;
    sl += l * e * sin(arg); sr += r * e * cos(arg);
  }
  for (const [d, m, mp, f, b] of TABLE_B) {
    const e = m === 0 ? 1 : Math.abs(m) === 1 ? E : E * E;
    sb += b * e * sin(d * D + m * M + mp * Mp + f * F);
  }
  sl += 3958 * sin(A1) + 1962 * sin(Lp - F) + 318 * sin(A2);
  sb += -2235 * sin(Lp) + 382 * sin(A3) + 175 * sin(A1 - F) + 175 * sin(A1 + F) + 127 * sin(Lp - Mp) - 115 * sin(Lp + Mp);
  const trueLongitude = norm360(Lp + sl / 1e6);
  return { longitude: norm360(trueLongitude + nutation(jde).dpsi), trueLongitude, latitude: sb / 1e6, distanceKm: 385000.56 + sr / 1000, F, Omega };
}

/** Ecliptic (λ, β) to equatorial (α, δ), degrees, for an obliquity ε (chapter 13). */
export function toEquatorial(lambda, beta, eps) {
  const ra = norm360(atan2d(sin(lambda) * cos(eps) - Math.tan(beta * DEG) * sin(eps), cos(lambda)));
  const dec = asind(sin(beta) * cos(eps) + cos(beta) * sin(eps) * sin(lambda));
  return { ra, dec };
}

/** Apparent sidereal time at Greenwich, degrees (chapter 12, with the equation of the equinoxes). */
export function siderealGreenwich(date) {
  const jd = julianDay(date), T = (jd - 2451545.0) / 36525;
  const mean = 280.46061837 + 360.98564736629 * (jd - 2451545.0) + 0.000387933 * T * T - (T * T * T) / 38710000;
  const { dpsi, eps } = nutation(jd + DELTA_T / 86400);
  return norm360(mean + dpsi * cos(eps));
}

/**
 * The parallactic angle q (degrees) at an object's place (chapter 14,
 * formula 14.1): the angle between the direction to the celestial north pole
 * and the direction to the zenith, positive when the object is west of the
 * meridian. H is the local hour angle, all in degrees.
 */
export const parallacticAngle = (H, dec, lat) => atan2d(sin(H), Math.tan(lat * DEG) * cos(dec) - sin(dec) * cos(H));

/** Altitude (degrees) of an object at hour angle H and declination δ for a latitude (chapter 13). */
export const altitude = (H, dec, lat) => asind(sin(lat) * sin(dec) + cos(lat) * cos(dec) * cos(H));

/**
 * Everything about the Moon at one moment that does not depend on the
 * observer: positions of both bodies, the illumination (chapter 48), the
 * librations and the axis (chapter 53), the apparent size.
 */
export function moonGeocentric(date) {
  const jde = julianEphemerisDay(date);
  const moon = moonEcliptic(jde), sun = sunApparent(jde);
  const { dpsi, eps } = nutation(jde);
  const m = toEquatorial(moon.longitude, moon.latitude, eps);
  const s = toEquatorial(sun.longitude, 0, eps);
  // chapter 48: geocentric elongation ψ, phase angle i, illuminated fraction k
  const cosPsi = sin(s.dec) * sin(m.dec) + cos(s.dec) * cos(m.dec) * cos(s.ra - m.ra);
  const psi = Math.acos(Math.max(-1, Math.min(1, cosPsi))) / DEG;
  const phaseAngle = atan2d(sun.distanceKm * sin(psi), moon.distanceKm - sun.distanceKm * cos(psi));
  const fraction = (1 + cos(phaseAngle)) / 2;
  // position angle of the midpoint of the bright limb, from celestial north through east (48.5)
  const brightLimb = norm360(atan2d(cos(s.dec) * sin(s.ra - m.ra), sin(s.dec) * cos(m.dec) - cos(s.dec) * sin(m.dec) * cos(s.ra - m.ra)));
  // elongation in longitude, 0 at new, 90 at first quarter, 180 at full (the quantity chapter 49 solves for)
  const elongation = norm360(moon.longitude - sun.longitude);
  // chapter 53: optical librations (the physical ones are under 0.04° and left out) and the axis
  const I = MOON_EQUATOR_INCLINATION, W = moon.longitude - dpsi - moon.Omega;
  const A = atan2d(sin(W) * cos(moon.latitude) * cos(I) - sin(moon.latitude) * sin(I), cos(W) * cos(moon.latitude));
  const librationLon = norm180(A - moon.F);
  const librationLat = asind(-sin(W) * cos(moon.latitude) * sin(I) - sin(moon.latitude) * cos(I));
  const V = moon.Omega + dpsi;
  const X = sin(I) * sin(V), Y = sin(I) * cos(V) * cos(eps) - cos(I) * sin(eps);
  const omega = atan2d(X, Y);
  const axis = asind((Math.sqrt(X * X + Y * Y) * cos(m.ra - omega)) / cos(librationLat));
  return {
    jde, moon, sun, ra: m.ra, dec: m.dec, sunRa: s.ra, sunDec: s.dec, eps,
    elongation, phaseAngle, fraction, waxing: elongation < 180, brightLimb,
    libration: { lon: librationLon, lat: librationLat }, axis,
    /** Geocentric semidiameter, arcseconds (Meeus 55: 358473400 / Δ). */
    semidiameter: 358473400 / moon.distanceKm,
    /** Apparent size against the mean distance: about 1.07 at perigee, 0.94 at apogee. */
    sizeRatio: MEAN_DISTANCE_KM / moon.distanceKm,
  };
}

/** The Moon's standard altitude for rising and setting (chapter 15): 0.7275 π - 34', with π the horizontal parallax. */
export const standardAltitude = (distanceKm) => 0.7275 * asind(EARTH_RADIUS_KM / distanceKm) - 34 / 60;

/**
 * The Moon for an observer: the geocentric facts plus hour angle, altitude,
 * whether it is above the horizon (upper limb, with refraction), the
 * parallactic angle, and the bright limb and axis turned into the observer's
 * frame where 0 is straight up (toward the zenith) and positive is to the left.
 */
export function moonForObserver(date, observer = NEW_YORK) {
  const g = moonGeocentric(date);
  const H = norm180(siderealGreenwich(date) + observer.lon - g.ra);
  const alt = altitude(H, g.dec, observer.lat);
  const q = parallacticAngle(H, g.dec, observer.lat);
  return {
    ...g, hourAngle: H, altitude: alt, up: alt > standardAltitude(g.moon.distanceKm), parallactic: q,
    /** χ - q: the bright limb's angle from straight up, counterclockwise (to the left) positive. */
    tilt: norm180(g.brightLimb - q),
    /** P - q: where the Moon's north pole points, from straight up, counterclockwise positive. */
    axisTilt: norm180(g.axis - q),
  };
}

// ---- events: rising, setting and the phases ----

/**
 * The next rising and setting after `date` within `hours` (chapter 15's
 * standard altitude, found by stepping ten minutes at a time and bisecting
 * each crossing to a second). Either can be null at high latitudes.
 * @returns {{rise: Date|null, set: Date|null}}
 */
export function riseAndSet(date, observer = NEW_YORK, hours = 30) {
  const above = (t) => { const s = moonForObserver(new Date(t), observer); return s.altitude - standardAltitude(s.moon.distanceKm); };
  const step = 10 * 60000, start = date.getTime();
  let rise = null, set = null, t0 = start, f0 = above(t0);
  for (let t1 = start + step; t1 <= start + hours * 3600000 && (!rise || !set); t1 += step) {
    const f1 = above(t1);
    if ((f0 <= 0) !== (f1 <= 0)) {
      let a = t0, b = t1, fa = f0;
      while (b - a > 1000) { const mid = (a + b) / 2, fm = above(mid); if ((fa <= 0) === (fm <= 0)) { a = mid; fa = fm; } else b = mid; }
      const at = new Date(Math.round((a + b) / 2));
      if (f0 <= 0 && !rise) rise = at; else if (f0 > 0 && !set) set = at;
    }
    t0 = t1; f0 = f1;
  }
  return { rise, set };
}

/** Elongations that define the four principal phases (chapter 49). */
export const PHASES = Object.freeze({ new: 0, firstQuarter: 90, full: 180, lastQuarter: 270 });

/** The instant (to about a second) when the elongation reaches `target` near a first guess. */
function solveElongation(guessMs, target) {
  let t = guessMs;
  for (let k = 0; k < 8; k++) {
    const off = norm180(moonGeocentric(new Date(t)).elongation - target);
    const dt = (off / 12.190749) * 86400000;   // the mean synodic rate, degrees a day
    t -= dt;
    if (Math.abs(dt) < 500) break;
  }
  return new Date(t);
}

/** The next instant after `date` of a principal phase ('new', 'firstQuarter', 'full', 'lastQuarter'). */
export function nextPhase(date, kind) {
  const target = PHASES[kind];
  const lunations = (date.getTime() - REFERENCE_NEW_MOON) / 86400000 / SYNODIC_DAYS;
  const base = Math.floor(lunations - target / 360);
  // the true instant can be up to about fourteen hours from the mean one, so try neighbours
  for (let n = base - 1; n <= base + 2; n++) {
    const guess = REFERENCE_NEW_MOON + (n + target / 360) * SYNODIC_DAYS * 86400000;
    const at = solveElongation(guess, target);
    if (at.getTime() > date.getTime()) return at;
  }
  return null;
}

/** The last instant at or before `date` of a principal phase. */
export function previousPhase(date, kind) {
  const target = PHASES[kind];
  const lunations = (date.getTime() - REFERENCE_NEW_MOON) / 86400000 / SYNODIC_DAYS;
  const base = Math.floor(lunations - target / 360);
  for (let n = base + 1; n >= base - 2; n--) {
    const guess = REFERENCE_NEW_MOON + (n + target / 360) * SYNODIC_DAYS * 86400000;
    const at = solveElongation(guess, target);
    if (at.getTime() <= date.getTime()) return at;
  }
  return null;
}

/**
 * The phase's name. A principal phase is named while the Moon is within half
 * a day of it (six degrees of elongation, the Moon gaining about twelve a
 * day); in between it is a crescent or gibbous Moon, waxing or waning.
 */
export function phaseName(elongation) {
  const e = norm360(elongation), near = (target) => Math.abs(norm180(e - target)) < 6.1;
  if (near(0)) return 'new moon';
  if (near(90)) return 'first quarter';
  if (near(180)) return 'full moon';
  if (near(270)) return 'last quarter';
  if (e < 90) return 'waxing crescent';
  if (e < 180) return 'waxing gibbous';
  if (e < 270) return 'waning gibbous';
  return 'waning crescent';
}

/**
 * Tonight's Moon from New York, for the Mission Control tile and the 3D
 * scene: the phase now, the orientation of the lit side (now if the Moon is
 * up, else at its next rise), rising and setting, and the coming phases.
 * @param {Date} [date]
 * @param {{lat: number, lon: number}} [observer]
 */
export function moonTonight(date = new Date(), observer = NEW_YORK) {
  const now = moonForObserver(date, observer);
  const { rise, set } = riseAndSet(date, observer);
  const risesLater = !now.up && rise !== null;
  const view = risesLater ? moonForObserver(rise, observer) : now;
  const lastNew = previousPhase(date, 'new');
  return {
    date, now,
    fraction: now.fraction, phaseAngle: now.phaseAngle, elongation: now.elongation, waxing: now.waxing,
    phase: phaseName(now.elongation),
    up: now.up, rise, set, risesLater,
    /** When the orientation below holds: now, or the next moonrise. */
    tiltAt: risesLater ? rise : date,
    tilt: view.tilt, axisTilt: view.axisTilt, brightLimb: view.brightLimb, parallactic: view.parallactic,
    libration: now.libration, sizeRatio: now.sizeRatio,
    daysSinceNew: lastNew ? (date.getTime() - lastNew.getTime()) / 86400000 : null,
    nextNew: nextPhase(date, 'new'), nextFull: nextPhase(date, 'full'),
  };
}

// ---- words ----

/** "lit side tilted 32° left of up", from the bright limb's angle from the zenith (left positive). */
export function tiltWords(tilt) {
  const n = Math.round(Math.abs(norm180(tilt)));
  if (n === 0) return 'lit side straight up';
  if (n === 180) return 'lit side straight down';
  return `lit side tilted ${n}° ${norm180(tilt) > 0 ? 'left' : 'right'} of up`;
}
