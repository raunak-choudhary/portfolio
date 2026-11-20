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
