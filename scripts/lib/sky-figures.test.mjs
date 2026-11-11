import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  FIGURE_IDS,
  ZODIAC_IDS,
  applySimilarity,
  assertFinite,
  boundingBox,
  buildFiguresDocument,
  isStale,
  makeGnomonic,
  nearestMagnitude,
  normaliseRa,
  parseStarsScript,
  serializeFigures,
  solveSimilarity,
  sphericalCentre,
  uniqueVertices,
} from './sky-figures.mjs';

const DEG = Math.PI / 180;
const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const SOURCES = join(ROOT, 'scripts/sky-sources');
const CLI = join(ROOT, 'scripts/build-sky-figures.mjs');

const near = (actual, expected, tolerance, label = '') =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${label} expected ${expected} ± ${tolerance}, got ${actual}`);

describe('normaliseRa and parseStarsScript', () => {
  it('maps d3-celestial RA (-180..180) onto 0..360', () => {
    assert.equal(normaliseRa(-41.5), 318.5);
    assert.equal(normaliseRa(370), 10);
    assert.equal(normaliseRa(0), 0);
  });

  it('parses the catalogue array after the equals sign without evaluating the script', () => {
    assert.deepEqual(parseStarsScript('window.STARS=[[1,2,3.5,0.1],[4,5,6,null]];\n'), [
      [1, 2, 3.5, 0.1],
      [4, 5, 6, null],
    ]);
    assert.throws(() => parseStarsScript('[[1,2,3]]'), /no "="/);
    assert.throws(() => parseStarsScript('window.STARS=[];'), /no stars/);
  });
});

describe('gnomonic projection', () => {
  it('maps the centre to the origin', () => {
    const project = makeGnomonic(30 * DEG, 20 * DEG);
    const [x, y] = project(30, 20);
    near(x, 0, 1e-12, 'x');
    near(y, 0, 1e-12, 'y');
  });

  it('puts east to the left and north up (negative y) at about one degree per degree', () => {
    const project = makeGnomonic(100 * DEG, 0);
    const [ex, ey] = project(101, 0);
    near(ex, -1, 1e-3, 'east x');
    near(ey, 0, 1e-12, 'east y');
    const [nx, ny] = project(100, 1);
    near(nx, 0, 1e-12, 'north x');
    near(ny, -1, 1e-3, 'north y');
  });

  it('keeps one degree of sky as about one degree away from the equator', () => {
    // One degree east along the sky at dec 40 is 1 / cos(40°) degrees of RA.
    const project = makeGnomonic(200 * DEG, 40 * DEG);
    const [ex] = project(200 + 1 / Math.cos(40 * DEG), 40);
    near(ex, -1, 0.01, 'east x at dec 40');
    const [, ny] = project(200, 41);
    near(ny, -1, 1e-3, 'north y at dec 40');
  });

  it('centres a figure on the normalised mean of its unit vectors, across RA 0', () => {
    const { ra0, dec0 } = sphericalCentre([
      [359, 10],
      [1, 10],
    ]);
    near(Math.abs(Math.sin(ra0)), 0, 1e-12, 'ra0 on the 0 meridian');
    near(Math.cos(ra0), 1, 1e-12, 'ra0 not at 180');
    near(dec0 / DEG, 10, 0.01, 'dec0');
  });
});

describe('similarity solve', () => {
  const known = { a: 0.012 * Math.cos(0.7), b: 0.012 * Math.sin(0.7), tx: -8.25, ty: 3.5 };
  const src = [
    [120, 340],
    [910, 75],
    [455, 1180],
  ];

  it('recovers a known rotation, scale and translation exactly from three points', () => {
    const solved = solveSimilarity(
      src,
      src.map((point) => applySimilarity(known, point)),
    );
    for (const key of ['a', 'b', 'tx', 'ty']) near(solved[key], known[key], 1e-9, key);
  });

  it('does not reproduce a mirrored correspondence (the solver assumes no reflection)', () => {
    // Mirror the destination about the y axis: no rotation plus scale can do that,
    // so the best fit must leave a clear residual instead of matching every point.
    const mirrored = src.map((point) => {
      const [x, y] = applySimilarity(known, point);
      return [-x, y];
    });
    const solved = solveSimilarity(src, mirrored);
    const worst = Math.max(
      ...src.map((point, k) => {
        const [x, y] = applySimilarity(solved, point);
        return Math.hypot(x - mirrored[k][0], y - mirrored[k][1]);
      }),
    );
    assert.ok(worst > 1, `mirrored input fitted too well (worst ${worst})`);
  });

  it('rejects fewer than two points and coincident sources', () => {
    assert.throws(() => solveSimilarity([[0, 0]], [[1, 1]]), /at least two/);
    assert.throws(
      () =>
        solveSimilarity(
          [
            [5, 5],
            [5, 5],
          ],
          [
            [0, 0],
            [1, 1],
          ],
        ),
      /coincide/,
    );
  });
});

describe('nearestMagnitude', () => {
  const stars = [
    [10, 0, 2.0, 0],
    [10.2, 0, 3.0, 0],
    [10.6, 60, 1.5, 0],
  ];

  it('takes the nearest catalogue star within 0.35 degrees', () => {
    assert.equal(nearestMagnitude(stars, 10.05, 0), 2.0);
    assert.equal(nearestMagnitude(stars, 10.3, 0), 3.0);
  });

  it('falls back to magnitude 6 when nothing is that close', () => {
    assert.equal(nearestMagnitude(stars, 11, 0), 6);
    assert.equal(nearestMagnitude([], 10, 0), 6);
  });

  it('scales RA differences by cos(dec)', () => {
    // 0.6 degrees of RA at dec 60 is 0.3 degrees of sky: inside the radius.
    assert.equal(nearestMagnitude(stars, 10, 60), 1.5);
  });
});

describe('uniqueVertices and boundingBox', () => {
  it('keeps the first of points that agree to three decimals, in order', () => {
    const points = [
      [10, 20],
      [11, 21],
      [10.0001, 20.0002],
      [12, 22],
      [11, 21],
      [10.002, 20],
    ];
    assert.deepEqual(uniqueVertices(points), [
      [10, 20],
      [11, 21],
      [12, 22],
      [10.002, 20],
    ]);
  });

  it('bounds every point and refuses an empty list', () => {
    assert.deepEqual(
      boundingBox([
        [1, -2],
        [-3, 4],
        [0.5, 0],
      ]),
      { x0: -3, x1: 1, y0: -2, y1: 4 },
    );
    assert.throws(() => boundingBox([]), /empty/);
  });
});

describe('buildFiguresDocument', () => {
  // A small hand-made figure near RA 0 written in d3-celestial's -180..180 RA.
  const lines = {
    type: 'FeatureCollection',
    features: [
      {
        id: 'Ari',
        geometry: {
          type: 'MultiLineString',
          coordinates: [
            [
              [-2, 10],
              [0, 12],
              [2, 10],
            ],
            [
              [0, 12],
              [0, 15],
            ],
          ],
        },
      },
      {
        id: 'Ori',
        geometry: {
          type: 'MultiLineString',
          coordinates: [
            [
              [80, 0],
              [82, 2],
            ],
            [
              [82, 2],
              [84, 0],
            ],
          ],
        },
      },
    ],
  };
  const names = { features: [{ id: 'Ari', properties: { name: 'Aries' } }] };
  const stars = [[0, 12, 2.1, 0]];
  const manifest = {
    Ari: {
      file: 'Ari.png',
      width: 400,
      height: 300,
      refs: [
        // east is to the left in the sky, so the star with the larger RA sits at the smaller x
        { name: 'one', x: 100, y: 200, ra: 2, dec: 10 },
        { name: 'two', x: 300, y: 200, ra: 358, dec: 10 },
      ],
    },
    Ori: { file: 'Ori.png', width: 100, height: 100, refs: [{ name: 'only', x: 1, y: 1, ra: 80, dec: 0 }] },
  };
  const document = buildFiguresDocument({ lines, names, stars, manifest, ids: ['Ari', 'Ori'] });
  const [aries, orion] = document.figures;

  it('writes the version, credits and figures in the documented key order', () => {
    assert.deepEqual(Object.keys(document), ['version', 'credits', 'figures']);
    assert.equal(document.version, 1);
    assert.deepEqual(Object.keys(aries), ['id', 'name', 'zodiac', 'lines', 'verts', 'box', 'art']);
    assert.deepEqual(Object.keys(aries.art), ['file', 'width', 'height', 'a', 'b', 'tx', 'ty', 'fit', 'residual']);
  });

  it('names figures, falls back to the id, and flags the zodiac', () => {
    assert.equal(aries.name, 'Aries');
    assert.equal(aries.zodiac, true);
    assert.equal(orion.name, 'Ori');
    assert.equal(orion.zodiac, false);
  });

  it('projects lines symmetrically about the centre with east to the left', () => {
    const [first] = aries.lines;
    near(first[0][0], -first[2][0], 1e-3, 'symmetric x');
    assert.ok(first[0][0] > 0, 'the western end (RA 358) lies to the right');
    assert.ok(aries.lines[1][1][1] < aries.lines[1][0][1], 'the northern end lies higher (smaller y)');
  });

  it('lists each vertex once with its magnitude, and boxes the lines', () => {
    assert.equal(aries.verts.length, 4);
    assert.deepEqual(
      aries.verts.map((vert) => vert.mag),
      [6, 2.1, 6, 6],
    );
    const xs = aries.lines.flat().map((p) => p[0]);
    assert.equal(aries.box.x0, Math.min(...xs));
    assert.equal(aries.box.x1, Math.max(...xs));
  });

  it('fits two reference stars exactly and keeps the drawing inside the fit box', () => {
    assert.equal(aries.art.file, 'Ari.webp');
    assert.equal(aries.art.residual, 0);
    assert.ok(aries.art.fit.x0 <= aries.box.x0 && aries.art.fit.x1 >= aries.box.x1);
    // Both refs sit on y = 200 and the stars on dec 10 with west on the right, so
    // pixel x grows toward the west: the drawing is not rotated (b ≈ 0, a < 0
    // would be a half turn); a must be positive and of the right size.
    assert.ok(aries.art.a > 0);
    near(aries.art.b, 0, 1e-6, 'b');
  });

  it('leaves art null when a drawing has fewer than two reference stars', () => {
    assert.equal(orion.art, null);
  });

  it('refuses an id with no lines', () => {
    assert.throws(() => buildFiguresDocument({ lines, names, stars, manifest, ids: ['Leo'] }), /Leo: no constellation lines/);
  });

  it('rejects NaN anywhere in the output', () => {
    assert.throws(() => assertFinite({ figures: [{ x: Number.NaN }] }), /figures\.figures\[0\]\.x/);
    assert.doesNotThrow(() => assertFinite(document));
  });
});

describe('--check comparison', () => {
  it('treats a matching file as fresh and a changed or missing file as stale', () => {
    const built = serializeFigures({ version: 1, figures: [] });
    assert.equal(isStale(built, built), false);
    assert.equal(isStale(built.replace('1', '2'), built), true);
    assert.equal(isStale(null, built), true);
  });

  it('serialises compact JSON with a trailing newline', () => {
    assert.equal(serializeFigures({ a: [1, 2] }), '{"a":[1,2]}\n');
  });
});

describe('smoke: the committed sources', () => {
  const read = (name) => readFileSync(join(SOURCES, name), 'utf8');
  const sources = {
    lines: JSON.parse(read('lines.json')),
    names: JSON.parse(read('names.json')),
    stars: parseStarsScript(read('stars.js')),
    manifest: JSON.parse(read('manifest.json')),
  };
  const document = buildFiguresDocument(sources);

  it('builds the eighteen figures in order with the right zodiac flags', () => {
    assert.deepEqual(
      document.figures.map((figure) => figure.id),
      FIGURE_IDS,
    );
    assert.equal(FIGURE_IDS.length, 18);
    for (const figure of document.figures) assert.equal(figure.zodiac, ZODIAC_IDS.includes(figure.id), figure.id);
  });

  it('has no NaN or infinite number anywhere', () => {
    const json = serializeFigures(document);
    // JSON.stringify writes NaN and Infinity as null, and every shipped figure has a drawing, so no null may appear
    assert.ok(!/null/.test(json));
    assert.doesNotThrow(() => assertFinite(document));
  });

  it('gives every figure at least two line segments and three vertices', () => {
    // Aries, Capricornus, Ursa Minor and Cassiopeia are each a single polyline in
    // d3-celestial, so the floor is on segments (vertex pairs), not polylines.
    for (const figure of document.figures) {
      const segments = figure.lines.reduce((sum, line) => sum + line.length - 1, 0);
      assert.ok(figure.lines.length >= 1 && segments >= 2, `${figure.id} has ${segments} segments`);
      assert.ok(figure.verts.length >= 3, `${figure.id} has ${figure.verts.length} vertices`);
    }
  });

  it('registers every drawing within one degree of its reference stars', () => {
    for (const figure of document.figures) {
      assert.ok(figure.art, `${figure.id} has a drawing`);
      assert.ok(figure.art.residual < 1, `${figure.id} residual ${figure.art.residual}`);
    }
  });

  it("places Leo's drawing so Regulus lands within 0.35 degrees of the star", () => {
    const leo = document.figures.find((figure) => figure.id === 'Leo');
    const leoLines = sources.lines.features.find((feature) => feature.id === 'Leo').geometry.coordinates;
    const { ra0, dec0 } = sphericalCentre(leoLines.flat().map(([ra, dec]) => [normaliseRa(ra), dec]));
    // Regulus from the catalogue itself (the brightest star near RA 152.09, Dec 11.97).
    const regulus = sources.stars
      .filter(([ra, dec]) => Math.abs(ra - 152.09) < 0.2 && Math.abs(dec - 11.97) < 0.2)
      .sort((p, q) => p[2] - q[2])[0];
    assert.ok(regulus && regulus[2] < 1.5, 'Regulus is in the catalogue');
    const [sx, sy] = makeGnomonic(ra0, dec0)(regulus[0], regulus[1]);
    const ref = sources.manifest.Leo.refs.find((candidate) => candidate.name === 'Regulus');
    const [ax, ay] = applySimilarity(leo.art, [ref.x, ref.y]);
    const miss = Math.hypot(ax - sx, ay - sy);
    assert.ok(miss < 0.35, `Regulus misses by ${miss} degrees`);
  });
});

describe('CLI (integration)', () => {
  it('passes --check on the committed figures.json', () => {
    const result = spawnSync(process.execPath, [CLI, '--check'], { cwd: ROOT, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /up to date/);
  });

  it('fails --check on a stale file and rewrites it without --check', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sky-figures-'));
    try {
      const out = join(dir, 'figures.json');
      writeFileSync(out, '{"version":0}\n');
      const stale = spawnSync(process.execPath, [CLI, '--check', '--out', out], { cwd: ROOT, encoding: 'utf8' });
      assert.equal(stale.status, 1);
      assert.match(stale.stderr, /out of date/);
      const write = spawnSync(process.execPath, [CLI, '--out', out], { cwd: ROOT, encoding: 'utf8' });
      assert.equal(write.status, 0, write.stderr);
      assert.equal(readFileSync(out, 'utf8'), readFileSync(join(ROOT, 'public/admin/sky/figures.json'), 'utf8'));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
