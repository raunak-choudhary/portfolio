// src/components/admin/Voyage/moonView.js
//
// The 3D Moon "as New York sees it": the one deliberate departure from
// single-Sun physics in the night scene. No Three.js here, so every rule is
// unit tested (moonView.test.js); earthSystem.js applies the vectors.
//
// Why. The scene's Sun lights the Earth, and if it also lit the Moon, the
// prologue camera (outside the Earth-Moon system, the Sun to the right and a
// little behind) would see the Moon at roughly the Earth's own phase: a fat
// crescent on most nights, whatever New York sees. The owner asked for
// tonight's phase on the 3D Moon, night by night, as the old 2D sky showed it.
//
// What is real. The illuminated fraction (from the phase angle, Meeus 48),
// the orientation of the bright limb from straight up as seen from New York
// (moonTonight's tilt: now, or at the next moonrise when the Moon is down,
// the same value the Tonight tile draws), the direction of the Moon's axis on
// the sky and the librations, and the surface maps themselves.
//
// What is the departure. (1) The Moon has its own light, the "New York
// light", built from the camera's view of it: the view direction turned by
// the phase angle toward the bright limb's position angle on the screen, with
// "up" taken as the camera's screen up. (2) The Moon is turned so the camera
// sees the face New York sees (the near side, with tonight's librations and
// the axis tilted as on the sky), instead of the near side facing the Earth:
// the prologue camera looks down from high above the orbit, so a tidally
// locked Moon would show it mostly polar and far-side ground. The tile and
// the 3D Moon are therefore the same Moon at two sizes. The Moon's position
// on its orbit stays where earthModel.js puts it.
//
// Frames. The screen frame is R (right), U (up), V (toward the viewer), all
// unit world vectors at the Moon; the tile's painter (moonPicture.js) uses
// the same frame with R, U, V = x, y, z.

import { DEG } from './moonModel';

/**
 * The screen frame at the Moon for a camera, written into `out` (no allocation).
 * @param {number[]} moon the Moon's centre, world space
 * @param {number[]} camera the camera's position, world space
 * @param {number[]} cameraUp the camera's screen up (the second column of its world matrix)
 * @param {{r: number[], u: number[], v: number[]}} out three length-3 arrays
 */
export function screenFrame(moon, camera, cameraUp, out) {
  const { r, u, v } = out;
  v[0] = camera[0] - moon[0]; v[1] = camera[1] - moon[1]; v[2] = camera[2] - moon[2];
  let l = Math.hypot(v[0], v[1], v[2]) || 1; v[0] /= l; v[1] /= l; v[2] /= l;
  out.distance = l;
  // up, made perpendicular to the line of sight
  const k = cameraUp[0] * v[0] + cameraUp[1] * v[1] + cameraUp[2] * v[2];
  u[0] = cameraUp[0] - k * v[0]; u[1] = cameraUp[1] - k * v[1]; u[2] = cameraUp[2] - k * v[2];
  l = Math.hypot(u[0], u[1], u[2]);
  if (l < 1e-9) { u[0] = 0; u[1] = 1; u[2] = 0; l = 1; }   // looking straight along the up vector: never on this route
  u[0] /= l; u[1] /= l; u[2] /= l;
  // right = up × toward-viewer, so (right, up, toward) is right handed like the screen's (x, y, z)
  r[0] = u[1] * v[2] - u[2] * v[1]; r[1] = u[2] * v[0] - u[0] * v[2]; r[2] = u[0] * v[1] - u[1] * v[0];
  return out;
}

/** World vector for screen coordinates (x right, y up, z toward the viewer), into `out`. */
const toWorld = (frame, x, y, z, out) => {
  const { r, u, v } = frame;
  out[0] = x * r[0] + y * u[0] + z * v[0]; out[1] = x * r[1] + y * u[1] + z * v[1]; out[2] = x * r[2] + y * u[2] + z * v[2];
  return out;
};

/**
 * The Sun's direction in the screen frame: at angle `tilt` counterclockwise
 * from up and at the phase angle i from the line of sight.
 * @param {number} tilt degrees, counterclockwise from up (moonModel's tilt)
 * @param {number} phaseAngle degrees, 0 at full
 */
export const sunOnScreen = (tilt, phaseAngle) => {
  const t = tilt * DEG, i = phaseAngle * DEG;
  return [-Math.sin(t) * Math.sin(i), Math.cos(t) * Math.sin(i), Math.cos(i)];
};

/**
 * How much a camera at a finite distance shifts the phase it sees, as a share
 * of the Moon's angular radius: from close by the visible cap is less than a
 * hemisphere, so a crescent looks thinner and a gibbous Moon fuller than at
 * infinity, by about this times ρ cos i (fitted to an exact perspective
 * integration for ρ up to 5°, good to about 0.2°).
 */
export const PERSPECTIVE_PHASE_SHIFT = 1.2;

/**
 * The phase angle (degrees) to light with so a camera with the Moon at angular
 * radius `rho` (radians) sees the model's phase angle `phaseAngle`.
 */
export const phaseForCamera = (phaseAngle, rho) => Math.min(180, Math.max(0, phaseAngle + PERSPECTIVE_PHASE_SHIFT * (rho / DEG) * Math.cos(phaseAngle * DEG)));

/**
 * The New York light in world space, into `out`: the view direction V turned
 * by the phase angle about the image-plane axis perpendicular to the bright
 * limb's direction, so the limb lands at the tilt's position on the screen.
 * @param {{r: number[], u: number[], v: number[]}} frame from screenFrame
 * @param {{tilt: number, phaseAngle: number}} moon from moonTonight
 * @param {number[]} out
 * @param {number} [rho] the Moon's angular radius from the camera, radians (0: seen from infinity)
 */
export function newYorkLight(frame, moon, out, rho = 0) {
  const t = moon.tilt * DEG, i = phaseForCamera(moon.phaseAngle, rho) * DEG, s = Math.sin(i);
  return toWorld(frame, -Math.sin(t) * s, Math.cos(t) * s, Math.cos(i), out);
}

/**
 * Screen coordinates of a body-frame vector: the inverse of the tile
 * painter's screen-to-body turn (the axis's position angle from the zenith,
 * then the libration in latitude). Body frame: y the Moon's north pole, z the
 * sub-observer point, x toward selenographic east (on the right, as seen
 * from the Earth). Into `out`.
 */
export function bodyToScreen(moon, x, y, z, out) {
  const a = -moon.axisTilt * DEG, b = -moon.libration.lat * DEG;
  const ca = Math.cos(a), sa = Math.sin(a), cb = Math.cos(b), sb = Math.sin(b);
  const y1 = y * cb + z * sb, z1 = -y * sb + z * cb;   // undo the libration in latitude
  out[0] = x * ca + y1 * sa; out[1] = -x * sa + y1 * ca; out[2] = z1;   // undo the axis
  return out;
}

const scratch = [0, 0, 0];

/**
 * The Moon mesh's orientation for the camera, as world vectors for
 * Matrix4.makeBasis, into `out` ({x, y, z}, each length 3): the mesh's local
 * +x is longitude 0 of the map, +y the north pole, -z longitude 90° east (as
 * earthModel.moonBasis). The sub-observer point sits at the libration's
 * longitude, so the camera sees the face New York sees tonight.
 * @param {{r: number[], u: number[], v: number[]}} frame from screenFrame
 * @param {{axisTilt: number, libration: {lon: number, lat: number}}} moon from moonTonight
 */
export function newYorkBasis(frame, moon, out) {
  const l = moon.libration.lon * DEG, cl = Math.cos(l), sl = Math.sin(l);
  // map longitude L lies at body (sin(L - l), 0, cos(L - l))
  bodyToScreen(moon, -sl, 0, cl, scratch); toWorld(frame, scratch[0], scratch[1], scratch[2], out.x);
  bodyToScreen(moon, 0, 1, 0, scratch); toWorld(frame, scratch[0], scratch[1], scratch[2], out.y);
  bodyToScreen(moon, -cl, 0, -sl, scratch); toWorld(frame, scratch[0], scratch[1], scratch[2], out.z);
  return out;
}
