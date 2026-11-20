import {
  DELTA_T, NEW_YORK, altitude, julianEphemerisDay, moonEcliptic, moonForObserver, moonGeocentric, moonTonight, nextPhase, norm180,
  parallacticAngle, phaseName, previousPhase, riseAndSet, siderealGreenwich, standardAltitude, sunApparent, tiltWords, toEquatorial,
} from './moonModel';

const DEG = Math.PI / 180;
const close = (actual, expected, tolerance) => expect(Math.abs(actual - expected)).toBeLessThanOrEqual(tolerance);
const closeAngle = (actual, expected, tolerance) => expect(Math.abs(norm180(actual - expected))).toBeLessThanOrEqual(tolerance);
/** The UT moment whose Julian Ephemeris Day is `jde` (Meeus's examples are given in TD). */
const fromJDE = (jde) => new Date((jde - DELTA_T / 86400 - 2440587.5) * 86400000);
const minutesApart = (a, b) => Math.abs(a.getTime() - b.getTime()) / 60000;

// Published values used below:
//   Meeus, Astronomical Algorithms, 2nd ed.: examples 12.a, 47.a, 48.a, 53.a;
//   JPL Horizons (ssd.jpl.nasa.gov, DE441), geocentric (500@399) and from New York
//   (40.7128 N, 74.0060 W), fetched 2026-11-20: illuminated fraction (quantity 10),
//   angular diameter (13), sub-observer point (14, the libration), sub-solar position
//   angle (16, the bright limb), north pole position angle (17), ecliptic position (31),
//   elevation (4) and hour angle (42);
//   U.S. Naval Observatory, Astronomical Applications API (aa.usno.navy.mil), fetched
//   2026-11-20: phases of the Moon for 2026 and 2027, and moonrise and moonset for
//   New York (40.7128, -74.006) on three dates.

describe('sidereal time and coordinates (Meeus chapters 12 and 13)', () => {
  it('matches example 12.a: 1987 April 10 at 0h UT, apparent 13h10m46.1351s', () => {
    close(siderealGreenwich(new Date('1987-04-10T00:00:00Z')), 197.692230, 0.0003);
  });

  it('turns ecliptic into equatorial coordinates (example 13.a, Pollux)', () => {
    // λ 113.215630, β 6.684170, ε 23.4392911 give α 116.328942, δ 28.026183
    const { ra, dec } = toEquatorial(113.215630, 6.684170, 23.4392911);
    close(ra, 116.328942, 1e-5); close(dec, 28.026183, 1e-5);
  });
});

describe('the Moon\'s position (Meeus chapter 47)', () => {
  it('matches example 47.a: 1992 April 12 at 0h TD', () => {
    const m = moonEcliptic(2448724.5);
    close(m.trueLongitude, 133.162655, 0.00001);
    close(m.longitude, 133.167265, 0.0003);   // with nutation (the book's Δψ is 0.004610°, the short series gives 0.0045°)
    close(m.latitude, -3.229126, 0.00001);
    close(m.distanceKm, 368409.7, 0.1);
  });

  it('agrees with JPL Horizons\' apparent ecliptic position within 0.01° (36") on dates in 2026 and 2027', () => {
    const rows = [
      ['2026-03-22T00:30:00Z', 40.7977751, 4.6212503], ['2026-06-25T02:00:00Z', 219.7244518, -4.7091979], ['2026-11-21T01:00:00Z', 10.7040182, 3.5985967],
      ['2026-12-01T06:08:00Z', 159.0449350, -1.3267171], ['2027-02-28T12:00:00Z', 252.7743220, -4.8748505], ['2027-09-20T03:00:00Z', 45.6254777, 5.1136528],
    ];
    for (const [iso, lon, lat] of rows) {
      const m = moonEcliptic(julianEphemerisDay(new Date(iso)));
      closeAngle(m.longitude, lon, 0.01); close(m.latitude, lat, 0.01);
    }
  });

  it('places the Sun within 0.01° of Meeus example 25.a (1992 October 13, apparent λ 199.90895°)', () => {
    closeAngle(sunApparent(2448908.5).longitude, 199.90895, 0.01);
  });
});

describe('illumination and the bright limb (Meeus chapter 48)', () => {
  it('matches example 48.a: k 0.6786, i 69.08°, χ 285.0°', () => {
    const g = moonGeocentric(fromJDE(2448724.5));
    close(g.fraction, 0.6786, 0.0015);
    close(g.phaseAngle, 69.0756, 0.1);
    closeAngle(g.brightLimb, 285.0, 0.2);
    expect(g.waxing).toBe(true);   // elongation 111°: an evening Moon past first quarter, χ 285° puts the lit side west, toward the Sun
  });

  // Horizons: geocentric illuminated %, sub-solar position angle (the direction of the bright limb's midpoint)
  const HORIZONS = [
    ['2026-03-22T00:30:00Z', 11.54213, 245.78], ['2026-06-25T02:00:00Z', 79.48860, 285.47], ['2026-11-21T01:00:00Z', 83.44733, 250.01],
    ['2026-12-01T06:08:00Z', 50.13309, 111.97], ['2027-01-25T04:00:00Z', 90.09505, 114.84], ['2027-02-28T12:00:00Z', 47.43064, 97.34],
    ['2027-06-08T01:30:00Z', 14.67078, 282.05], ['2027-09-20T03:00:00Z', 82.95601, 68.14],
  ];

  it.each(HORIZONS)('agrees with JPL Horizons on %s: lit within 0.15 points, bright limb within 0.5°', (iso, percent, sn) => {
    const g = moonGeocentric(new Date(iso));
    close(g.fraction * 100, percent, 0.15);
    closeAngle(g.brightLimb, sn, 0.5);
  });

  it('is half lit at the last quarter of 1 December 2026, waning, lit side to the east', () => {
    const g = moonGeocentric(new Date('2026-12-01T06:08:00Z'));
    close(g.fraction, 0.5, 0.003); expect(g.waxing).toBe(false);
    expect(norm180(g.brightLimb)).toBeGreaterThan(0);   // position angle 0..180 is the east (left, north up) side
  });
});

describe('libration, the axis and the apparent size (Meeus chapters 53 and 55)', () => {
  it("matches example 53.a: optical l' -1.206°, b' +4.194°, P 15.08°", () => {
    const g = moonGeocentric(fromJDE(2448724.5));
    close(g.libration.lon, -1.206, 0.03);
    close(g.libration.lat, 4.194, 0.03);
    close(g.axis, 15.08, 0.1);
  });

  // Horizons geocentric: sub-observer longitude and latitude, north pole position angle, angular diameter (")
  const HORIZONS = [
    ['2026-03-22T00:30:00Z', 358.346667, -5.963012, 342.0857, 1952.987], ['2026-06-25T02:00:00Z', 4.714574, 6.160648, 18.2980, 1782.935],
    ['2026-11-21T01:00:00Z', 352.951526, -4.675957, 337.8754, 1898.591], ['2027-01-25T04:00:00Z', 5.806885, 2.451536, 20.8609, 1953.068],
    ['2027-09-20T03:00:00Z', 354.425985, -6.650297, 342.4615, 1856.823],
  ];

  it.each(HORIZONS)('agrees with JPL Horizons on %s: librations within 0.15°, axis within 0.15°, size within 2"', (iso, lon, lat, np, diameter) => {
    // the physical librations (under 0.04°) are left out, hence the tolerance
    const g = moonGeocentric(new Date(iso));
    closeAngle(g.libration.lon, lon, 0.15); close(g.libration.lat, lat, 0.15);
    closeAngle(g.axis, np, 0.15);
    close(g.semidiameter * 2, diameter, 2);
  });

  it('swings about nine percent in apparent size between a near and a far Moon', () => {
    const near = moonGeocentric(new Date('2026-03-22T00:30:00Z')).sizeRatio, far = moonGeocentric(new Date('2026-06-25T02:00:00Z')).sizeRatio;
    expect(near).toBeGreaterThan(1.04); expect(far).toBeLessThan(0.97);
    close(near / far, 1952.987 / 1782.935, 0.003);
  });
});

describe('the Moon from New York (Meeus chapters 13, 14 and 15)', () => {
  it('gives the parallactic angle\'s known values: zero on the meridian, 90° - φ for an equatorial object six hours west', () => {
    expect(parallacticAngle(0, 20, 40.7128)).toBeCloseTo(0, 12);
    close(parallacticAngle(90, 0, 40.7128), 90 - 40.7128, 1e-9);
    close(parallacticAngle(-90, 0, 40.7128), -(90 - 40.7128), 1e-9);
    expect(parallacticAngle(30, 10, 40.7128)).toBeGreaterThan(0);   // west of the meridian: positive
  });

  it('equals the position angle of the zenith worked out with vectors, for any hour angle and declination', () => {
    // An independent construction: project the pole and the zenith onto the sky plane at the
    // object and measure the angle from north through east. Meeus's q is that angle.
    const lat = NEW_YORK.lat;
    const unit = (ra, dec) => [Math.cos(dec * DEG) * Math.cos(ra * DEG), Math.cos(dec * DEG) * Math.sin(ra * DEG), Math.sin(dec * DEG)];
    const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    const reject = (v, s) => { const d = dot(v, s); return [v[0] - d * s[0], v[1] - d * s[1], v[2] - d * s[2]]; };
    for (const [H, dec] of [[-70, 25], [-20, -10], [15, 5], [60, 18], [110, -20]]) {
      const lst = 100, s = unit(lst - H, dec), zenith = unit(lst, lat);
      const north = reject([0, 0, 1], s), east = cross([0, 0, 1], s), z = reject(zenith, s);
      const pa = Math.atan2(dot(z, east) / Math.hypot(...east), dot(z, north) / Math.hypot(...north)) / DEG;
      close(parallacticAngle(H, dec, lat), pa, 1e-9);
    }
  });

  it('agrees with Horizons on the hour angle and altitude seen from New York (geocentric against topocentric, within the parallax)', () => {
    // Horizons gives the topocentric elevation; the Moon's parallax lowers it by up to about a degree
    const rows = [['2026-11-21T01:00:00Z', -0.497734851, 55.645467], ['2026-11-20T05:00:00Z', 4.162904516, 21.786087], ['2027-02-28T12:00:00Z', 0.908688532, 20.132238]];
    for (const [iso, hours, elevation] of rows) {
      const m = moonForObserver(new Date(iso));
      close(m.hourAngle, hours * 15, 1.0);
      expect(m.altitude - elevation).toBeGreaterThan(0); expect(m.altitude - elevation).toBeLessThan(1.0);
      expect(m.up).toBe(true);
    }
  });

  it('turns the bright limb toward the Sun along the sky, measured from the zenith (checked with altitude and azimuth vectors)', () => {
    // Independent of chapters 14 and 48: put the Moon and the Sun on the observer's sky by
    // their hour angles, and take the direction from the Moon toward the Sun against "up".
    const horizontal = (H, dec) => {
      const lat = NEW_YORK.lat * DEG, h = H * DEG, d = dec * DEG;
      // x south, y east, z up
      return [Math.sin(lat) * Math.cos(d) * Math.cos(h) - Math.cos(lat) * Math.sin(d), -Math.cos(d) * Math.sin(h), Math.cos(lat) * Math.cos(d) * Math.cos(h) + Math.sin(lat) * Math.sin(d)];
    };
    const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    const reject = (v, s) => { const k = dot(v, s); return [v[0] - k * s[0], v[1] - k * s[1], v[2] - k * s[2]]; };
    for (const iso of ['2026-11-21T01:00:00Z', '2026-03-22T00:30:00Z', '2027-02-28T12:00:00Z', '2027-09-20T03:00:00Z']) {
      const date = new Date(iso), m = moonForObserver(date), lst = siderealGreenwich(date) + NEW_YORK.lon;
      const moon = horizontal(m.hourAngle, m.dec), sun = horizontal(norm180(lst - m.sunRa), m.sunDec);
      const up = reject([0, 0, 1], moon), toSun = reject(sun, moon);
      // facing the Moon with the zenith up, the observer's left is up x line of sight
      const left = cross(up, moon);
      const angle = Math.atan2(dot(toSun, left) / Math.hypot(...left), dot(toSun, up) / Math.hypot(...up)) / DEG;
      closeAngle(m.tilt, angle, 0.3);
    }
  });

  it('shows the evening Moon lit on its right and the morning Moon lit on its left, as New York sees them', () => {
    expect(moonForObserver(new Date('2026-11-21T01:00:00Z')).tilt).toBeLessThan(-45);   // waxing gibbous, 8 pm
    expect(moonForObserver(new Date('2027-02-28T12:00:00Z')).tilt).toBeGreaterThan(45);  // waning, 7 am
    // a thin spring crescent at dusk lies on its back: the lit side points down toward the set Sun
    expect(Math.abs(moonForObserver(new Date('2026-03-22T00:30:00Z')).tilt)).toBeGreaterThan(120);
  });

  it('rises and sets within two minutes of the Naval Observatory\'s times for New York', () => {
    // USNO, Eastern Standard Time: 20 Nov 2026 set 02:06, rise 13:58; 22 Mar 2026 rise 07:32, set 23:00; 28 Feb 2027 rise 01:39, set 10:27
    const nov = riseAndSet(new Date('2026-11-20T05:00:00Z'));
    expect(minutesApart(nov.set, new Date('2026-11-20T07:06:00Z'))).toBeLessThanOrEqual(2);
    expect(minutesApart(nov.rise, new Date('2026-11-20T18:58:00Z'))).toBeLessThanOrEqual(2);
    const mar = riseAndSet(new Date('2026-03-22T05:00:00Z'));
    expect(minutesApart(mar.rise, new Date('2026-03-22T12:32:00Z'))).toBeLessThanOrEqual(2);
    expect(minutesApart(mar.set, new Date('2026-03-23T04:00:00Z'))).toBeLessThanOrEqual(2);
    const feb = riseAndSet(new Date('2027-02-28T05:00:00Z'));
    expect(minutesApart(feb.rise, new Date('2027-02-28T06:39:00Z'))).toBeLessThanOrEqual(2);
    expect(minutesApart(feb.set, new Date('2027-02-28T15:27:00Z'))).toBeLessThanOrEqual(2);
  });

  it('uses the Moon\'s standard altitude of about +0.125° (chapter 15)', () => {
    close(standardAltitude(385000), 0.7275 * 0.9507 - 34 / 60, 0.005);
    expect(altitude(0, 90, NEW_YORK.lat)).toBeCloseTo(NEW_YORK.lat, 9);
  });
});

describe('the phases (Meeus chapter 49, solved from chapters 47 and 25)', () => {
  // USNO instants, UT
  const USNO = [
    ['full', '2026-01-03T10:03:00Z'], ['new', '2026-11-09T07:02:00Z'], ['firstQuarter', '2026-11-17T11:48:00Z'], ['full', '2026-11-24T14:53:00Z'],
    ['lastQuarter', '2026-12-01T06:08:00Z'], ['new', '2027-01-07T20:24:00Z'], ['full', '2027-06-19T00:44:00Z'], ['lastQuarter', '2027-09-23T10:20:00Z'],
    ['new', '2027-12-27T20:12:00Z'],
  ];

  it.each(USNO)('finds the %s of %s within three minutes', (kind, iso) => {
    const at = new Date(iso);
    expect(minutesApart(nextPhase(new Date(at.getTime() - 3 * 86400000), kind), at)).toBeLessThanOrEqual(3);
    expect(minutesApart(previousPhase(new Date(at.getTime() + 3 * 86400000), kind), at)).toBeLessThanOrEqual(3);
  });

  it('gives the next phase strictly after the moment, even a minute after the last one', () => {
    const full = nextPhase(new Date('2026-11-24T14:54:00Z'), 'full');
    expect(minutesApart(full, new Date('2026-12-24T01:28:00Z'))).toBeLessThanOrEqual(3);
  });

  it('names the phases by elongation, principal phases within half a day', () => {
    expect(phaseName(2)).toBe('new moon'); expect(phaseName(40)).toBe('waxing crescent'); expect(phaseName(91)).toBe('first quarter');
    expect(phaseName(130)).toBe('waxing gibbous'); expect(phaseName(178)).toBe('full moon'); expect(phaseName(200)).toBe('waning gibbous');
    expect(phaseName(268)).toBe('last quarter'); expect(phaseName(330)).toBe('waning crescent'); expect(phaseName(358)).toBe('new moon');
  });
});

describe('tonight\'s Moon for the tile', () => {
  it('describes an evening Moon that is up: phase, tilt now, age, coming phases', () => {
    const t = moonTonight(new Date('2026-11-21T01:00:00Z'));
    expect(t.up).toBe(true); expect(t.risesLater).toBe(false);
    expect(t.phase).toBe('waxing gibbous'); expect(t.waxing).toBe(true);
    close(t.fraction, 0.8345, 0.002);
    expect(t.tiltAt).toEqual(new Date('2026-11-21T01:00:00Z'));
    close(t.daysSinceNew, (new Date('2026-11-21T01:00:00Z') - new Date('2026-11-09T07:02:00Z')) / 86400000, 0.003);
    expect(minutesApart(t.nextFull, new Date('2026-11-24T14:53:00Z'))).toBeLessThanOrEqual(3);
    expect(minutesApart(t.nextNew, new Date('2026-12-09T00:52:00Z'))).toBeLessThanOrEqual(3);
    expect(minutesApart(t.set, new Date('2026-11-21T07:58:00Z'))).toBeLessThanOrEqual(30);   // about 50 minutes later each night
  });

  it('gives the orientation at the next rise while the Moon is below New York\'s horizon', () => {
    const noon = new Date('2026-11-20T17:00:00Z');   // noon in New York; the Moon set at 02:06 and rises at 13:58
    const t = moonTonight(noon);
    expect(t.up).toBe(false); expect(t.risesLater).toBe(true);
    expect(minutesApart(t.rise, new Date('2026-11-20T18:58:00Z'))).toBeLessThanOrEqual(2);
    expect(t.tiltAt).toEqual(t.rise);
    close(t.tilt, moonForObserver(t.rise).tilt, 1e-9);
    // at moonrise in the east the waxing gibbous Moon's lit side faces the Sun, high in the south-west: up and to the right
    expect(t.tilt).toBeLessThan(0); expect(t.tilt).toBeGreaterThan(-90);
  });
});

describe('words for the tilt', () => {
  it('says which way the lit side leans from straight up, in whole degrees', () => {
    expect(tiltWords(32.4)).toBe('lit side tilted 32° left of up');
    expect(tiltWords(-101.6)).toBe('lit side tilted 102° right of up');
    expect(tiltWords(0.3)).toBe('lit side straight up');
    expect(tiltWords(-179.8)).toBe('lit side straight down');
  });
});
