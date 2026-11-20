// src/components/admin/Voyage/moonShading.js
//
// The numbers the 3D Moon's shader and the Tonight tile's painter share, so
// the two Moons are lit alike. No Three.js here, so the tile does not pull it in.

/**
 * The relief map stores the east and north tilt of the surface normal times
 * this gain, so gentle slopes use the 8-bit range (the tool that made it,
 * from the LOLA heights, used the same number). See public/admin/sky/LICENSES.md.
 */
export const RELIEF_GAIN = 3;
/** Relief is drawn this many times steeper than the measured slopes, so it reads on a disc a few hundred pixels wide. */
export const RELIEF_EXAGGERATION = 2.2;
/**
 * Earthshine at its strongest (new Moon, a full Earth overhead), as a share of
 * direct sunlight. The real ratio is nearer 1/5000; it is lifted so the night
 * side shows faintly as a disc, as it does in a photograph exposed for the
 * crescent, and it fades to nothing at full.
 */
export const EARTHSHINE = 0.02;
/** Sunlight on the Moon in linear light (white, a touch warm), scaled so the bright highlands of the map come out near white. */
export const SUNLIGHT = Object.freeze([2.1, 2.07, 2.02]);
/** Earthlight is the Earth's blue-white glow. */
export const EARTHLIGHT = Object.freeze([0.78, 0.86, 1.0]);
/**
 * Exposure, like a photograph of the Moon: past quarter the brightest visible
 * ground is lit at a slant (at most sin i), so a crescent is opened up to read
 * as bright. Shared, so the tile and the 3D Moon are exposed alike.
 * @param {number} phaseAngle degrees, 0 at full
 */
export const moonExposure = (phaseAngle) => (phaseAngle > 90 ? 1 / Math.max(0.45, Math.sin((phaseAngle * Math.PI) / 180)) : 1);
/**
 * The tone curve's knee, in linear light: below it light is passed through,
 * above it a gentle shoulder rolls highlights toward white without clipping,
 * so the bright highlands keep their detail at full.
 */
export const TONE_KNEE = 0.62;
/** The shoulder above TONE_KNEE: continuous and smooth at the knee, approaching 1 and never reaching it. */
export const toneCurve = (v) => (v <= TONE_KNEE ? v : TONE_KNEE + (1 - TONE_KNEE) * (1 - Math.exp(-(v - TONE_KNEE) / (1 - TONE_KNEE))));
/**
 * The light on a bumped normal ramps in over this much of N.L instead of
 * switching at zero (a smooth max), so along the terminator relief does not
 * flip single pixels in and out of light.
 */
export const LIGHT_SOFTNESS = 0.05;
/** max(0, x) with a soft quadratic knee of half-width LIGHT_SOFTNESS. */
export const softLight = (x, w = LIGHT_SOFTNESS) => (x <= -w ? 0 : x >= w ? x : ((x + w) * (x + w)) / (4 * w));
/**
 * The Tonight tile draws the relief at this share of the 3D Moon's: its disc
 * is under 170 device pixels, where the full exaggeration turns into speckle.
 */
export const TILE_RELIEF_SHARE = 0.6;
