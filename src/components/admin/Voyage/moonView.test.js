import * as THREE from 'three';
import { MOON_RADIUS, earthScene, moonPosition } from './earthModel';
import { moonTonight, norm180 } from './moonModel';
import { bodyToScreen, newYorkBasis, newYorkLight, screenFrame, sunOnScreen } from './moonView';
import { cameraTarget, routePosition } from './voyageModel';

// Seven nights through one lunation (UT), from a thin waxing crescent to a thin waning one.
const NIGHTS = [
  ['thin waxing crescent', '2026-11-11T22:30:00Z'], ['first quarter', '2026-11-17T23:00:00Z'], ['waxing gibbous', '2026-11-21T01:00:00Z'],
  ['full', '2026-11-25T04:00:00Z'], ['waning gibbous', '2026-11-28T06:00:00Z'], ['last quarter', '2026-12-01T11:00:00Z'], ['thin waning crescent', '2026-12-07T11:30:00Z'],
];
// Camera poses along the prologue: at rest, part way out, leaving; plus a still frame (no fly) and a moved Moon.
const POSES = [[0, true, 0], [0.02, true, 150000], [0.05, true, 330000], [0, false, 480000]];
const SAMPLES = 240;

/** A real Three camera at a point on the route, looking where the voyage looks. */
const cameraAt = (scroll, fly) => {
  const target = cameraTarget(routePosition(scroll), fly);
  const camera = new THREE.PerspectiveCamera(60, 1440 / 900, 1, 9000);
  camera.position.set(target.position.x, target.position.y, target.position.z);
  camera.lookAt(target.look.x, target.look.y, target.look.z);
  camera.updateMatrixWorld();
  return camera;
};
const frameFor = (moon, camera) => {
  const m = camera.matrixWorld.elements;
  return screenFrame(moon, [m[12], m[13], m[14]], [m[4], m[5], m[6]], { r: [0, 0, 0], u: [0, 0, 0], v: [0, 0, 0], distance: 1 });
};

/**
 * What the camera sees of the lit Moon, by projecting sample points of the
 * sphere: a fine grid over the Moon's image, each pixel cast back from the
 * camera onto the unit sphere (an exact pinhole from the camera's true
 * distance, so the visible cap is the one a perspective camera sees), lit or
 * not under the light. The screen axes are the frame's right and up, so the
 * lit side's angle is counterclockwise from screen up, as moonModel's tilt is.
 */
function litOnScreen(frame, light) {
  const D = frame.distance / MOON_RADIUS, r0 = 1 / Math.sqrt(D * D - 1);   // the image radius, tan of the angular radius
  const lr = light[0] * frame.r[0] + light[1] * frame.r[1] + light[2] * frame.r[2];
  const lu = light[0] * frame.u[0] + light[1] * frame.u[1] + light[2] * frame.u[2];
  const lv = light[0] * frame.v[0] + light[1] * frame.v[1] + light[2] * frame.v[2];
  let total = 0, lit = 0, sx = 0, sy = 0;
  for (let j = 0; j < SAMPLES; j++) {
    for (let i = 0; i < SAMPLES; i++) {
      const x = ((i + 0.5) / SAMPLES * 2 - 1) * r0, y = ((j + 0.5) / SAMPLES * 2 - 1) * r0, w2 = x * x + y * y;
      if (w2 > r0 * r0) continue;
      // the ray from the camera at (0, 0, D) through (x, y) meets the sphere at distance t (in units of the ray's z step)
      const t = (D - Math.sqrt(Math.max(0, D * D - (D * D - 1) * (1 + w2)))) / (1 + w2);
      total++;
      if (t * x * lr + t * y * lu + (D - t) * lv > 0) { lit++; sx += x; sy += y; }
    }
  }
  return { fraction: lit / total, angle: Math.atan2(-sx, sy) / (Math.PI / 180) };
}

describe('the New York light: tonight\'s phase on the 3D Moon from any camera', () => {
  describe.each(NIGHTS)('%s', (name, iso) => {
    const date = new Date(iso), view = moonTonight(date), scene = earthScene(date);
    it.each(POSES)('scroll %f (fly %s, %d ms of orbit): the lit share and the bright limb match New York', (scroll, fly, elapsed) => {
      const camera = cameraAt(scroll, fly), centre = moonPosition(scene, elapsed), frame = frameFor(centre, camera);
      const light = newYorkLight(frame, view, [0, 0, 0], Math.asin(MOON_RADIUS / frame.distance));
      const seen = litOnScreen(frame, light);
      expect(Math.abs(seen.fraction - view.fraction)).toBeLessThan(0.006);
      // at full the lit side's centre is a sliver off the middle; its direction still has to hold
      expect(Math.abs(norm180(seen.angle - view.tilt))).toBeLessThan(view.fraction > 0.97 ? 4 : 1.5);
    });
  });

  it('is the screen-frame Sun the tile paints, carried into the world', () => {
    const frame = { r: [1, 0, 0], u: [0, 1, 0], v: [0, 0, 1] };
    const moon = { tilt: -72, phaseAngle: 48 };
    expect(newYorkLight(frame, moon, [0, 0, 0])).toEqual(sunOnScreen(moon.tilt, moon.phaseAngle));
  });

  it('makes a right-handed screen frame with up as near the camera\'s up as the line of sight allows', () => {
    const f = screenFrame([0, 0, 0], [0, 100, 1000], [0, 1, 0], { r: [0, 0, 0], u: [0, 0, 0], v: [0, 0, 0] });
    const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    cross(f.r, f.u).forEach((x, i) => expect(x).toBeCloseTo(f.v[i], 12));
    expect(f.r[0]).toBeCloseTo(1, 12);
    expect(f.u[1]).toBeGreaterThan(0.99);
  });
});

describe('the face New York sees, turned to the camera', () => {
  const date = new Date('2026-11-21T01:00:00Z'), view = moonTonight(date), scene = earthScene(date);

  it('puts the sub-observer point (map longitude = the libration) toward the camera, wherever the Moon is', () => {
    for (const [scroll, fly, elapsed] of POSES) {
      const camera = cameraAt(scroll, fly), centre = moonPosition(scene, elapsed), frame = frameFor(centre, camera);
      const axes = newYorkBasis(frame, view, { x: [0, 0, 0], y: [0, 0, 0], z: [0, 0, 0] });
      // the map point at the libration's longitude and latitude, in mesh terms, then in the world
      const l = view.libration.lon * Math.PI / 180, b = view.libration.lat * Math.PI / 180;
      const local = [Math.cos(b) * Math.cos(l), Math.sin(b), -Math.cos(b) * Math.sin(l)];
      const world = [0, 1, 2].map((k) => local[0] * axes.x[k] + local[1] * axes.y[k] + local[2] * axes.z[k]);
      const facing = world[0] * frame.v[0] + world[1] * frame.v[1] + world[2] * frame.v[2];
      expect(facing).toBeGreaterThan(Math.cos(2 * Math.PI / 180));
    }
  });

  it('tilts the north pole on the screen by New York\'s axis angle, and keeps the axes orthonormal and right handed', () => {
    const frame = { r: [1, 0, 0], u: [0, 1, 0], v: [0, 0, 1] };
    const moon = { axisTilt: 25, libration: { lon: 0, lat: 0 } };
    const axes = newYorkBasis(frame, moon, { x: [0, 0, 0], y: [0, 0, 0], z: [0, 0, 0] });
    expect(Math.atan2(-axes.y[0], axes.y[1]) * 180 / Math.PI).toBeCloseTo(25, 9);
    const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    expect(dot(axes.x, axes.y)).toBeCloseTo(0, 12); expect(dot(axes.y, axes.z)).toBeCloseTo(0, 12);
    const c = [axes.x[1] * axes.y[2] - axes.x[2] * axes.y[1], axes.x[2] * axes.y[0] - axes.x[0] * axes.y[2], axes.x[0] * axes.y[1] - axes.x[1] * axes.y[0]];
    c.forEach((v, i) => expect(v).toBeCloseTo(axes.z[i], 12));
  });

  it('places Mare Crisium (17° N, 59° E) on the right of the disc, as the tile does with no tilt', () => {
    const axes = newYorkBasis({ r: [1, 0, 0], u: [0, 1, 0], v: [0, 0, 1] }, { axisTilt: 0, libration: { lon: 0, lat: 0 } }, { x: [0, 0, 0], y: [0, 0, 0], z: [0, 0, 0] });
    const lat = 17 * Math.PI / 180, lon = 59 * Math.PI / 180;
    const local = [Math.cos(lat) * Math.cos(lon), Math.sin(lat), -Math.cos(lat) * Math.sin(lon)];
    const world = [0, 1, 2].map((k) => local[0] * axes.x[k] + local[1] * axes.y[k] + local[2] * axes.z[k]);
    expect(world[0]).toBeGreaterThan(0.75); expect(world[1]).toBeGreaterThan(0.2); expect(world[2]).toBeGreaterThan(0);
  });

  it('inverts the tile painter\'s screen-to-body turn', () => {
    const moon = { axisTilt: -33, libration: { lon: 4, lat: -6 } };
    const a = -moon.axisTilt * Math.PI / 180, b = -moon.libration.lat * Math.PI / 180;
    const toBody = ([x, y, z]) => { const x1 = x * Math.cos(a) - y * Math.sin(a), y1 = x * Math.sin(a) + y * Math.cos(a); return [x1, y1 * Math.cos(b) - z * Math.sin(b), y1 * Math.sin(b) + z * Math.cos(b)]; };
    const s = [0.3, -0.5, 0.81], body = toBody(s);
    bodyToScreen(moon, body[0], body[1], body[2], [0, 0, 0]).forEach((v, i) => expect(v).toBeCloseTo(s[i], 12));
  });
});
