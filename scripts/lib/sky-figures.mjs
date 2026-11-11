// scripts/lib/sky-figures.mjs
//
// Precomputes the admin dashboard's "zodiac sky": eighteen constellation
// figures (the twelve zodiac signs, then six well-known northern and
// equatorial figures), each projected flat on its own so the shape is true,
// plus the transform that lays a Sidney Hall drawing over the stars.
//
// The browser then loads one small JSON file instead of the star catalogue
// (about 9,000 stars) and the full d3-celestial line set. Everything here is
// pure: inputs are parsed objects, outputs are plain data, and the CLI in
// scripts/build-sky-figures.mjs does the file I/O.
//
// The maths is a port of buildFigure in
// captures/zodiac-sky-preview-2026-11-11/index.html, kept step for step so
// the built data draws exactly what the reviewed preview drew.
//
// Units: right ascension (RA) and declination (dec) are degrees; projected
// x and y are degrees on the tangent plane, north up and east to the left,
// as the sky looks from the ground.

const DEG = Math.PI / 180;

/** The zodiac in calendar order, starting with Aries at the March equinox. */
export const ZODIAC_IDS = ['Ari', 'Tau', 'Gem', 'Cnc', 'Leo', 'Vir', 'Lib', 'Sco', 'Sgr', 'Cap', 'Aqr', 'Psc'];
/** Well-known figures drawn above the zodiac rows. */
export const FAMOUS_IDS = ['UMa', 'UMi', 'Ori', 'Cas', 'Her', 'Cyg'];
/** Every figure in output order. */
export const FIGURE_IDS = [...ZODIAC_IDS, ...FAMOUS_IDS];

export const CREDITS = {
  figures: 'd3-celestial (BSD 3-clause)',
  stars: 'Yale Bright Star Catalogue',
  drawings: "Sidney Hall, Urania's Mirror, 1824 (public domain)",
};

/** A vertex takes the magnitude of the nearest catalogue star within this many degrees. */
export const STAR_MATCH_RADIUS = 0.35;
/** Magnitude used when no catalogue star is close enough (the faint end of naked-eye). */
export const FALLBACK_MAGNITUDE = 6;

/** Rounds to a fixed number of decimals; keeps the JSON short and the build stable. */
export const round = (value, decimals) => {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
};

/** Maps any RA in degrees (d3-celestial uses -180..180) onto 0..360. */
export const normaliseRa = (ra) => ((ra % 360) + 360) % 360;

/**
 * Reads the star catalogue script (`window.STARS=[[ra,dec,mag,bv],...];`) and
 * returns the array. The file is parsed as JSON, never evaluated.
 */
export const parseStarsScript = (text) => {
  const equals = text.indexOf('=');
  if (equals < 0) throw new Error('stars script has no "=" before the catalogue array');
  const body = text.slice(equals + 1).trim().replace(/;\s*$/, '');
  const stars = JSON.parse(body);
  if (!Array.isArray(stars) || stars.length === 0) throw new Error('stars script holds no stars');
  return stars;
};

/** Unit vector on the celestial sphere for an RA and dec in degrees. */
export const toUnitVector = (ra, dec) => [
  Math.cos(dec * DEG) * Math.cos(ra * DEG),
  Math.cos(dec * DEG) * Math.sin(ra * DEG),
  Math.sin(dec * DEG),
];

/**
 * Centre of a set of [ra, dec] points on the sphere: the normalised mean of
 * their unit vectors. Duplicate points count each time they appear, as in the
 * reference, because shared line ends are listed once per line.
 * Returns { ra0, dec0 } in radians.
 */
export const sphericalCentre = (points) => {
  let cx = 0;
  let cy = 0;
  let cz = 0;
  for (const [ra, dec] of points) {
    const [x, y, z] = toUnitVector(ra, dec);
    cx += x;
    cy += y;
    cz += z;
  }
  const length = Math.hypot(cx, cy, cz);
  if (!(length > 0)) throw new Error('cannot centre an empty or perfectly balanced set of points');
  return { ra0: Math.atan2(cy / length, cx / length), dec0: Math.asin(cz / length) };
};

/**
 * Gnomonic (tangent-plane) projection about (ra0, dec0), both in radians.
 * Returns a function (ra, dec in degrees) => [x, y] in degrees with north up
 * and east to the left. Great circles become straight lines, so constellation
 * lines stay straight; distortion grows away from the centre but is small
 * across a single figure.
 */
export const makeGnomonic = (ra0, dec0) => (ra, dec) => {
  const r = ra * DEG;
  const d = dec * DEG;
  const cosc = Math.sin(dec0) * Math.sin(d) + Math.cos(dec0) * Math.cos(d) * Math.cos(r - ra0);
  const x = (Math.cos(d) * Math.sin(r - ra0)) / cosc;
  const y = (Math.cos(dec0) * Math.sin(d) - Math.sin(dec0) * Math.cos(d) * Math.cos(r - ra0)) / cosc;
  return [-x / DEG, -y / DEG];
};

/**
 * Magnitude of the catalogue star nearest to (ra, dec) within the match
 * radius, or the fallback when none is that close. Distance is the flat-sky
 * approximation hypot(dRA * cos(dec), dDec), which is accurate at this scale.
 * Like the reference, RA differences are not wrapped at 0/360.
 */
export const nearestMagnitude = (stars, ra, dec, radius = STAR_MATCH_RADIUS, fallback = FALLBACK_MAGNITUDE) => {
  let best = fallback;
  let bestDistance = radius;
  const cosDec = Math.cos(dec * DEG);
  for (const [starRa, starDec, magnitude] of stars) {
    const distance = Math.hypot((starRa - ra) * cosDec, starDec - dec);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = magnitude;
    }
  }
  return best;
};

/**
 * Distinct [ra, dec] points in first-seen order. Two points are the same star
 * when both coordinates agree to three decimals (about 4 arcseconds).
 */
export const uniqueVertices = (points) => {
  const seen = new Set();
  const unique = [];
  for (const [ra, dec] of points) {
    const key = `${ra.toFixed(3)},${dec.toFixed(3)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push([ra, dec]);
  }
  return unique;
};

/** Bounding box { x0, x1, y0, y1 } of a non-empty list of [x, y] points. */
export const boundingBox = (points) => {
  if (points.length === 0) throw new Error('cannot bound an empty list of points');
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
};

/**
 * Least-squares similarity transform (rotation, uniform scale, translation)
 * taking each src point onto its dst point. It is the closed-form solution of
 * the complex linear fit w = (a + ib)·z + t after both sets are centred.
 *
 * The solver assumes the drawing is not mirrored: it has no reflection term,
 * so a mirrored correspondence is fitted only approximately (with a large
 * residual) rather than reproduced. Urania's Mirror plates are drawn as seen
 * from Earth, the same handedness as the projection, so none is needed.
 *
 * Returns { a, b, tx, ty } such that x' = a·x − b·y + tx, y' = b·x + a·y + ty.
 */
export const solveSimilarity = (src, dst) => {
  if (src.length !== dst.length || src.length < 2) throw new Error('similarity needs at least two matched points');
  const mean = (list) => [
    list.reduce((sum, p) => sum + p[0], 0) / list.length,
    list.reduce((sum, p) => sum + p[1], 0) / list.length,
  ];
  const ms = mean(src);
  const md = mean(dst);
  let nr = 0;
  let ni = 0;
  let den = 0;
  for (let k = 0; k < src.length; k += 1) {
    const zx = src[k][0] - ms[0];
    const zy = src[k][1] - ms[1];
    const wx = dst[k][0] - md[0];
    const wy = dst[k][1] - md[1];
    nr += zx * wx + zy * wy;
    ni += zx * wy - zy * wx;
    den += zx * zx + zy * zy;
  }
  if (!(den > 0)) throw new Error('similarity source points all coincide');
  const a = nr / den;
  const b = ni / den;
  return { a, b, tx: md[0] - (a * ms[0] - b * ms[1]), ty: md[1] - (b * ms[0] + a * ms[1]) };
};

/** Applies a similarity transform from solveSimilarity to one [x, y] point. */
export const applySimilarity = ({ a, b, tx, ty }, [x, y]) => [a * x - b * y + tx, b * x + a * y + ty];

/** Union of two bounding boxes. */
const unionBox = (p, q) => ({
  x0: Math.min(p.x0, q.x0),
  x1: Math.max(p.x1, q.x1),
  y0: Math.min(p.y0, q.y0),
  y1: Math.max(p.y1, q.y1),
});

const roundBox = (box) => ({ x0: round(box.x0, 3), x1: round(box.x1, 3), y0: round(box.y0, 3), y1: round(box.y1, 3) });
const roundPoint = ([x, y]) => [round(x, 3), round(y, 3)];

/**
 * Fits a drawing to the projected figure, or returns null when the manifest
 * has no entry or fewer than two reference stars (one star fixes neither
 * scale nor rotation). Coefficients keep enough decimals that a 1,400 px
 * drawing lands within a few millionths of a degree of the unrounded fit.
 */
export const fitArt = (id, entry, project, box) => {
  if (!entry || !Array.isArray(entry.refs) || entry.refs.length < 2) return null;
  const src = entry.refs.map((ref) => [ref.x, ref.y]);
  const dst = entry.refs.map((ref) => project(ref.ra, ref.dec));
  const transform = solveSimilarity(src, dst);
  const corners = [
    [0, 0],
    [entry.width, 0],
    [entry.width, entry.height],
    [0, entry.height],
  ].map((corner) => applySimilarity(transform, corner));
  const residual = Math.max(
    ...src.map((point, k) => {
      const [x, y] = applySimilarity(transform, point);
      return Math.hypot(x - dst[k][0], y - dst[k][1]);
    }),
  );
  return {
    // The PNG masters are converted to WebP for the site; the pixel grid the
    // refs were measured on stays the manifest's width and height.
    file: `${id}.webp`,
    width: entry.width,
    height: entry.height,
    a: round(transform.a, 10),
    b: round(transform.b, 10),
    tx: round(transform.tx, 6),
    ty: round(transform.ty, 6),
    fit: roundBox(unionBox(boundingBox(corners), box)),
    residual: round(residual, 4),
  };
};

/**
 * Builds one figure from its d3-celestial line feature.
 *
 * @param {object} input
 * @param {string} input.id three-letter constellation id
 * @param {string} input.name display name
 * @param {boolean} input.zodiac whether the figure is a zodiac sign
 * @param {number[][][]} input.coordinates MultiLineString coordinates [[ [ra, dec], ... ], ...]
 * @param {number[][]} input.stars catalogue rows [ra, dec, mag, bv]
 * @param {object|undefined} input.artEntry manifest entry for the drawing
 */
export const buildFigure = ({ id, name, zodiac, coordinates, stars, artEntry }) => {
  const segments = coordinates.map((segment) => segment.map(([ra, dec]) => [normaliseRa(ra), dec]));
  const points = segments.flat();
  if (points.length === 0) throw new Error(`${id}: figure has no line vertices`);
  const { ra0, dec0 } = sphericalCentre(points);
  const project = makeGnomonic(ra0, dec0);
  const lines = segments.map((segment) => segment.map(([ra, dec]) => project(ra, dec)));
  const box = boundingBox(lines.flat());
  const verts = uniqueVertices(points).map(([ra, dec]) => {
    const [x, y] = roundPoint(project(ra, dec));
    return { x, y, mag: nearestMagnitude(stars, ra, dec) };
  });
  return {
    id,
    name,
    zodiac,
    lines: lines.map((line) => line.map(roundPoint)),
    verts,
    box: roundBox(box),
    art: fitArt(id, artEntry, project, box),
  };
};

/** Throws if any number in the value is NaN or infinite; names the path. */
export const assertFinite = (value, path = 'figures') => {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error(`${path} is not a finite number`);
  } else if (Array.isArray(value)) {
    value.forEach((item, index) => assertFinite(item, `${path}[${index}]`));
  } else if (value && typeof value === 'object') {
    Object.entries(value).forEach(([key, item]) => assertFinite(item, `${path}.${key}`));
  }
};

/**
 * Builds the whole figures document from the parsed inputs.
 *
 * @param {object} input
 * @param {object} input.lines d3-celestial constellation lines (GeoJSON FeatureCollection)
 * @param {object} input.names d3-celestial constellation names (GeoJSON FeatureCollection)
 * @param {number[][]} input.stars catalogue rows from parseStarsScript
 * @param {object} input.manifest drawing manifest keyed by constellation id
 * @param {string[]} [input.ids] figure ids in output order
 */
export const buildFiguresDocument = ({ lines, names, stars, manifest, ids = FIGURE_IDS }) => {
  const nameById = new Map((names?.features ?? []).map((feature) => [feature.id, feature.properties?.name]));
  const figures = ids.map((id) => {
    const feature = (lines?.features ?? []).find((candidate) => candidate.id === id);
    if (!feature) throw new Error(`${id}: no constellation lines in the lines file`);
    if (feature.geometry?.type !== 'MultiLineString') throw new Error(`${id}: expected MultiLineString geometry`);
    return buildFigure({
      id,
      name: nameById.get(id) || id,
      zodiac: ZODIAC_IDS.includes(id),
      coordinates: feature.geometry.coordinates,
      stars,
      artEntry: manifest?.[id],
    });
  });
  const document = { version: 1, credits: { ...CREDITS }, figures };
  assertFinite(document);
  return document;
};

/** Serialises the document as compact JSON with a trailing newline. */
export const serializeFigures = (document) => `${JSON.stringify(document)}\n`;

/**
 * True when the file on disk does not match the freshly built text. A missing
 * file (null or undefined) counts as stale.
 */
export const isStale = (onDisk, built) => onDisk == null || onDisk !== built;
