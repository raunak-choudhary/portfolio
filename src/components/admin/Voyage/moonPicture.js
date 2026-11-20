// src/components/admin/Voyage/moonPicture.js
//
// Paints the Moon as New York sees it into an RGBA pixel buffer: the LROC
// colour map and the LOLA relief map (the 3D scene's own maps, public/admin/sky/moon)
// projected onto the disc with the librations and the axis, lit from the
// direction moonModel gives (the bright limb turned by the parallactic angle,
// so "up" is the zenith), with the same Lunar-Lambert law as the 3D Moon. No
// DOM here: the tile hands in a buffer and draws it, and the tests read it.
//
// Screen frame: x to the right, y up, z toward the viewer, on a unit disc.
// The Sun is at angle `tilt` counterclockwise from up and at the phase angle i
// from the line of sight, so it lies along (-sin tilt sin i, cos tilt sin i, cos i).

import { DEG } from './moonModel';
import { EARTHLIGHT, EARTHSHINE, RELIEF_EXAGGERATION, RELIEF_GAIN, SUNLIGHT } from './moonShading';

const SRGB_TO_LINEAR = new Float32Array(256).map((_, i) => { const c = i / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
const toSrgb = (v) => { const c = v <= 0 ? 0 : v >= 1 ? 1 : v; return 255 * (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055); };

/** Bilinear sample of an RGBA map at (u, v) in 0..1, u wrapping around the Moon. Writes three channels into `out`. */
function sample(map, u, v, out) {
  const { width: w, height: h, data } = map;
  const x = (((u * w - 0.5) % w) + w) % w, y = Math.min(h - 1, Math.max(0, v * h - 0.5));
  const x0 = Math.floor(x), y0 = Math.floor(y), x1 = (x0 + 1) % w, y1 = Math.min(h - 1, y0 + 1), fx = x - x0, fy = y - y0;
  for (let c = 0; c < 3; c++) {
    const a = data[(y0 * w + x0) * 4 + c], b = data[(y0 * w + x1) * 4 + c], d = data[(y1 * w + x0) * 4 + c], e = data[(y1 * w + x1) * 4 + c];
    out[c] = (a * (1 - fx) + b * fx) * (1 - fy) + (d * (1 - fx) + e * fx) * fy;
  }
}

/**
 * McEwen's Lunar-Lambert weight L(α), α the phase angle in degrees: 1 at full
 * (pure Lommel-Seeliger, a flat disc), falling toward Lambert at large angles.
 */
export const lunarLambertWeight = (alpha) => Math.min(1, Math.max(0, 1 - 0.019 * alpha + 2.42e-4 * alpha * alpha - 1.46e-6 * alpha * alpha * alpha));

/**
 * The Sun's direction in the screen frame.
 * @param {number} tilt degrees, counterclockwise from up (moonModel's tilt)
 * @param {number} phaseAngle degrees, 0 at full
 */
export const sunOnScreen = (tilt, phaseAngle) => {
  const t = tilt * DEG, i = phaseAngle * DEG;
  return [-Math.sin(t) * Math.sin(i), Math.cos(t) * Math.sin(i), Math.cos(i)];
};

/**
 * Paint the Moon into `pixels` (RGBA, size × size), transparent outside the disc.
 * @param {Uint8ClampedArray} pixels
 * @param {number} size side in device pixels
 * @param {{tilt: number, axisTilt: number, phaseAngle: number, fraction: number, libration: {lon: number, lat: number}}} moon from moonTonight
 * @param {{albedo?: ImageData|null, relief?: ImageData|null}} [maps] the colour and relief maps; mid grey and flat without them
 */
export function paintMoon(pixels, size, moon, { albedo = null, relief = null } = {}) {
  const sun = sunOnScreen(moon.tilt, moon.phaseAngle);
  const L = lunarLambertWeight(moon.phaseAngle);
  // screen to body: undo the axis (its position angle from the zenith), then the libration in latitude
  const a = -moon.axisTilt * DEG, ca = Math.cos(a), sa = Math.sin(a);
  const b = -moon.libration.lat * DEG, cb = Math.cos(b), sb = Math.sin(b);
  const toBody = (x, y, z, out) => { const x1 = x * ca - y * sa, y1 = x * sa + y * ca; out[0] = x1; out[1] = y1 * cb - z * sb; out[2] = y1 * sb + z * cb; };
  const sb3 = [0, 0, 0]; toBody(sun[0], sun[1], sun[2], sb3);
  const earthshine = EARTHSHINE * (1 - moon.fraction);   // how full the Earth looks from the Moon
  const reliefScale = RELIEF_EXAGGERATION / RELIEF_GAIN;
  // Exposed like a photograph of the Moon: past quarter the brightest visible ground
  // is lit at a slant (at most sin i), so a crescent is opened up to read as bright.
  const exposure = moon.phaseAngle > 90 ? 1 / Math.max(0.45, Math.sin(moon.phaseAngle * DEG)) : 1;
  const lon0 = moon.libration.lon * DEG;
  const n = [0, 0, 0], tex = [0, 0, 0], rel = [0, 0, 0];
  const radius = size / 2;
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      const o = (py * size + px) * 4;
      const x = (px + 0.5 - radius) / radius, y = (radius - py - 0.5) / radius, r2 = x * x + y * y;
      // the edge is antialiased over one device pixel
      const coverage = Math.min(1, Math.max(0, (1 - Math.sqrt(r2)) * radius + 0.5));
      if (coverage <= 0) { pixels[o] = 0; pixels[o + 1] = 0; pixels[o + 2] = 0; pixels[o + 3] = 0; continue; }
      const z = Math.sqrt(Math.max(0, 1 - r2));
      toBody(x, y, z, n);
      const lon = Math.atan2(n[0], n[2]) + lon0, lat = Math.asin(Math.max(-1, Math.min(1, n[1])));
      const u = 0.5 + lon / (2 * Math.PI), v = 0.5 - lat / Math.PI;
      if (albedo) sample(albedo, u, v, tex); else { tex[0] = 128; tex[1] = 128; tex[2] = 128; }
      // east and north on the sphere (pole along body +y), tilted by the relief
      let ex = n[2], ez = -n[0]; const el = Math.hypot(ex, ez) || 1; ex /= el; ez /= el;
      const nx = n[1] * ez, ny = n[2] * ex - n[0] * ez, nz = -n[1] * ex;   // north = n × east
      let tE = 0, tN = 0;
      if (relief) { sample(relief, u, v, rel); tE = (rel[0] / 127.5 - 1) * reliefScale; tN = (rel[1] / 127.5 - 1) * reliefScale; }
      const up = Math.sqrt(Math.max(0, 1 - tE * tE - tN * tN));
      const bx = n[0] * up + ex * tE + nx * tN, by = n[1] * up + ny * tN, bz = n[2] * up + ez * tE + nz * tN;
      const sphereLit = n[0] * sb3[0] + n[1] * sb3[1] + n[2] * sb3[2];
      const gate = sphereLit <= -0.02 ? 0 : sphereLit >= 0.03 ? 1 : ((sphereLit + 0.02) / 0.05) ** 2 * (3 - 2 * ((sphereLit + 0.02) / 0.05));
      const mu0 = Math.max(0, bx * sb3[0] + by * sb3[1] + bz * sb3[2]) * gate, mu = z;
      const sunlit = (L * 2 * mu0 / (mu0 + mu + 1e-4) + (1 - L) * mu0) * exposure;
      const earthlit = earthshine * z;
      const light = [sunlit * SUNLIGHT[0] + earthlit * EARTHLIGHT[0], sunlit * SUNLIGHT[1] + earthlit * EARTHLIGHT[1], sunlit * SUNLIGHT[2] + earthlit * EARTHLIGHT[2]];
      pixels[o] = toSrgb(SRGB_TO_LINEAR[Math.round(tex[0])] * light[0]);
      pixels[o + 1] = toSrgb(SRGB_TO_LINEAR[Math.round(tex[1])] * light[1]);
      pixels[o + 2] = toSrgb(SRGB_TO_LINEAR[Math.round(tex[2])] * light[2]);
      pixels[o + 3] = Math.round(coverage * 255);
    }
  }
  return pixels;
}
