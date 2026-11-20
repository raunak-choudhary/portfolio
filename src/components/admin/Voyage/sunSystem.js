// src/components/admin/Voyage/sunSystem.js
//
// The day prologue in Three.js: a large Sun that boils, turns and throws gas,
// with the Earth travelling its orbit. It takes the night prologue's place
// (earthSystem.js) when the theme is light. Directions, angles, sizes and
// tempos come from sunModel.js; this file builds the meshes and shaders and
// applies the numbers each frame.
//
// The look is the Sun as NASA's SDO sees it at 304 angstrom (the orange
// ultraviolet picture the owner chose for the 2D sky): the chromosphere, all
// orange and amber, with a bright mottled network, brighter active regions,
// a fringe of spicules at the limb and prominences standing off it. Nothing
// is a photograph: every pixel is a shader, so the sphere can turn.
//
// Layers, back to front:
//   corona   a camera-facing quad behind the limb: a soft glow that warms the
//            space round the Sun, long slow streamers, and a flickering fringe.
//   surface  the sphere: boiling cells under a broken bright network, the
//            day's active regions (bright plage with hot cores and sunspots),
//            dark filaments where the long-lived prominences lie on the disc,
//            limb treatment, flare flashes at loop footpoints.
//   gas      points strung in strands along magnetic arcs: long-lived
//            prominences (the same objects as the filaments, glowing once
//            they stand against space at the limb), short-lived loops rooted
//            on the limb or in an active region, hedgerow curtains, and now
//            and then an eruption that swells, breaks and throws out a cloud.
//   Earth    NASA's day map, city lights and clouds (the night prologue's
//            own shader), lit by this Sun, on a faint orbit with a trail.
//
// Cost: one draw for each layer plus the Earth's two, and one more for the
// surface. The surface shader is the expensive one: on the high tier two
// 8-cell Worley lookups (granulation and the coarse network) and about 17
// value-noise lookups per pixel, plus short loops over 5 regions, 7 filaments
// and 12 flare points (the filament and flare loops skip early on most
// pixels). So it is not run at full resolution: it writes the surface's heat
// into a smaller buffer of its own (renderBudget.sunSurfaceScale), and the
// sphere in the scene reads that heat back and adds the limb darkening, the
// bright rim and the colour ramp per screen pixel, so the edge of the disc
// stays sharp. The medium tier (the working sky) drops two fine noise
// octaves; the low tier, used on phones where the disc is small, has no
// Worley lookup, about 13 noise lookups, and draws less than half the gas.
// SUN_TIERS holds the knobs. The corona quad and the gas points are additive
// and overdraw the disc and the space round it; drawn straight into the
// antialiased canvas they cost more than the surface once it was cheap (3.4
// and 2.2 ms of 6.2 in the working mode), because every blend lands on four
// samples. So they too are drawn into smaller buffers of their own, without
// antialiasing, and a quad adds each to the scene. The corona's quad sits at
// the Sun's centre and is depth tested as before, so the disc's antialiased
// edge still cuts it cleanly. The gas, which also glows faintly in front of
// the disc, is drawn behind a depth-only copy of the Sun and the Earth in its
// own buffer, and its quad is not depth tested.
//
// Measured on the M3 at 1440 x 900 (scripts/measure-frames.mjs, GPU time per
// drawn frame, 2026-11-20): the day scene took 16.9 ms against the night's
// 0.7 in the working mode before this layout; 27-cell Worley lookups were 12
// of those milliseconds.

import * as THREE from 'three';
import { earthSpin, eclipticDirection, spinForSubsolar, subsolarLongitude } from './earthModel';
import { EARTH_FRAGMENT, EARTH_VERTEX, HALO_FRAGMENT } from './earthSystem';
import {
  ACTIVE_REGION_COUNT, DAY_EARTH_RADIUS, DAY_EARTH_SPIN_MS, DAY_NARROW_FRAMING, DIFFERENTIAL, EARTH_ORBIT_RADIUS, ERUPTION_BREAK, LOOP_SLOTS, PROMINENCE_COUNT, SUN_RADIUS,
  activeRegions, bodyToWorldInto, createLoopTracker, distanceReadout, earthDirection, earthDirectionInto, earthLongitude, eclipticBasis, prominences, sunScene, sunSpin,
} from './sunModel';
import { sunSurfaceScale, sunTierFor } from './renderBudget';

const UP = new THREE.Vector3(0, 1, 0);

/** The surface buffer's sphere is this much larger than the visible one, so filtering at the limb never reads the empty space past it. */
const SURFACE_OVERSCAN = 1.02;
/** The day Sun is gone from the frame past this route coordinate (the field fades it out between 0.3 and 0.8). */
export const SUN_VISIBLE_UNTIL = 0.8;

/** How far the corona quad reaches, in Sun radii. */
export const CORONA_EXTENT = 4.2;
/** How far the quad that adds the gas buffer reaches, in Sun radii (an eruption's cloud can pass the corona). */
const GLOW_EXTENT = 5.5;

/**
 * Quality tiers, in one place so a performance pass can add or retune one.
 * worley: the two Worley lookups (granulation and the coarse network), the
 * costliest part of the surface, compiled in or out. The octave counts are
 * uniforms, so they can change without recompiling: high and medium differ
 * only in those, and the page moves between them when the sky mode changes
 * (renderBudget.sunTierFor). segments: the sphere's
 * width and height segments. perProminence and perEvent: gas points per
 * long-lived prominence and per loop slot.
 */
export const SUN_TIERS = Object.freeze({
  high: Object.freeze({ worley: true, warpOctaves: 2, netOctaves: 2, mottOctaves: 3, segments: [128, 96], perProminence: 420, perEvent: 240 }),
  medium: Object.freeze({ worley: true, warpOctaves: 1, netOctaves: 2, mottOctaves: 2, segments: [128, 96], perProminence: 420, perEvent: 240 }),
  low: Object.freeze({ worley: false, warpOctaves: 1, netOctaves: 2, mottOctaves: 2, segments: [72, 48], perProminence: 170, perEvent: 100 }),
});

/**
 * Small noise kit shared by the shaders: an integer-free lattice hash, a
 * smooth value noise and a Worley (cellular) lookup whose feature points
 * wander with time, which is what makes the cells boil instead of slide.
 */
const NOISE = `
  float hash1(vec3 p) { p = fract(p * vec3(0.1379, 0.1723, 0.1131)); p += dot(p, p.zyx + 27.31); return fract((p.x + p.y) * p.z); }
  vec3 hash3(vec3 p) { p = fract(p * vec3(0.1379, 0.1723, 0.1131)); p += dot(p, p.yzx + 27.31); return fract((p.xxy + p.yzz) * p.zyx); }
  float vnoise(vec3 p) {
    vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(hash1(i), hash1(i + vec3(1, 0, 0)), f.x), mix(hash1(i + vec3(0, 1, 0)), hash1(i + vec3(1, 1, 0)), f.x), f.y),
               mix(mix(hash1(i + vec3(0, 0, 1)), hash1(i + vec3(1, 0, 1)), f.x), mix(hash1(i + vec3(0, 1, 1)), hash1(i + vec3(1, 1, 1)), f.x), f.y), f.z);
  }
  // a sine-shaped wave from a parabola, much cheaper than sin() and the same to the eye here
  vec3 psin(vec3 x) { x = fract(x * 0.1591549 + 0.5) * 2.0 - 1.0; return 4.0 * x * (1.0 - abs(x)); }
  // F1 and F2 distances to the nearest wandering feature points. Only the 8 cells
  // round the nearer corner are searched, not all 27 neighbours: a point wanders
  // at most 0.42 from its cell centre, so a nearer one is rarely missed, and the
  // pattern looked the same side by side at a third of the cost.
  vec2 worley(vec3 p, float t) {
    vec3 i = floor(p - 0.5), f = p - i; vec2 d = vec2(8.0);
    for (int z = 0; z <= 1; z++) for (int y = 0; y <= 1; y++) for (int x = 0; x <= 1; x++) {
      vec3 g = vec3(float(x), float(y), float(z)); vec3 h = hash3(i + g);
      vec3 o = g + 0.5 + 0.42 * psin(t * (0.6 + h) + 6.2831 * h) - f;
      float q = dot(o, o);
      if (q < d.x) { d.y = d.x; d.x = q; } else if (q < d.y) { d.y = q; }
    }
    return sqrt(d);
  }`;

/** Heat (0 to about 1.1) to colour, in linear light: deep rust, orange, amber, then yellow-white only in the hottest cores. */
const RAMP = `
  vec3 ramp(float h) {
    vec3 c = mix(vec3(0.10, 0.012, 0.0), vec3(0.62, 0.11, 0.006), smoothstep(0.0, 0.42, h));
    c = mix(c, vec3(1.0, 0.36, 0.035), smoothstep(0.36, 0.68, h));
    c = mix(c, vec3(1.0, 0.72, 0.30), smoothstep(0.66, 0.92, h));
    return mix(c, vec3(1.0, 0.95, 0.82), smoothstep(0.92, 1.15, h));
  }`;

const SUN_VERTEX = `
  varying vec3 vLocal; varying vec3 vNormal; varying vec3 vView;
  void main() {
    vLocal = normalize(position);
    vec4 world = modelMatrix * vec4(position, 1.0);
    vNormal = normalize(mat3(modelMatrix) * normal);
    vView = cameraPosition - world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }`;

/** The surface buffer holds heat from HEAT_MIN to HEAT_MIN + HEAT_SPAN, split across two 8-bit channels. */
const HEAT_MIN = -0.5, HEAT_SPAN = 2.5;

/**
 * The surface, drawn into the smaller buffer. The mesh's local frame is the
 * Sun's body frame (y = the rotation pole), so the turn is applied here, per
 * latitude: each point is sampled where it was `uSpin x rate(latitude)` ago,
 * which is differential rotation for free and keeps the mesh itself still.
 * It writes heat, not colour: red holds the whole 255ths and green the
 * remainder, which survives linear filtering exactly (each channel is
 * interpolated on its own and the sum is linear), so an 8-bit buffer, which
 * every WebGL device can render to, keeps 16 bits of heat.
 */
const SUN_FRAGMENT = (tier) => `
  #define LOOPS ${LOOP_SLOTS}
  #define REGIONS ${ACTIVE_REGION_COUNT}
  #define PROMS ${PROMINENCE_COUNT}
  ${tier.worley ? '#define WORLEY 1' : ''}
  uniform float uSpin; uniform float uTime; uniform vec3 uSeed;
  uniform float uWarpOctaves; uniform float uNetOctaves; uniform float uMottOctaves;   // quality knobs (1 to 3), set from the tier
  uniform vec3 uFeet[LOOPS * 2]; uniform float uFlare[LOOPS];
  uniform vec4 uRegion[REGIONS];   // body-frame centre, angular radius
  uniform float uRegionStrength[REGIONS];
  uniform vec3 uFilA[PROMS]; uniform vec3 uFilB[PROMS]; uniform float uFilW[PROMS];
  varying vec3 vLocal; varying vec3 vNormal; varying vec3 vView;
  ${NOISE}
  float ridged(vec3 p) { return 1.0 - abs(2.0 * vnoise(p) - 1.0); }
  void main() {
    vec3 n = normalize(vNormal); vec3 v = normalize(vView);
    float s = vLocal.y, s2 = s * s;
    float a = -uSpin * (1.0 - ${DIFFERENTIAL.b.toFixed(5)} * s2 - ${DIFFERENTIAL.c.toFixed(5)} * s2 * s2);
    // p: this pixel in the Sun's body frame (where regions and filaments are fixed); q: the same, offset by the day's seed for noise
    vec3 p = vec3(cos(a) * vLocal.x + sin(a) * vLocal.z, vLocal.y, -sin(a) * vLocal.x + cos(a) * vLocal.z);
    vec3 q = p + uSeed;
    float t = uTime * 0.001;
    // slow domain warp, so no lane is a straight polygon edge and no cell repeats its neighbour's shape (each octave is three noise lookups)
    vec3 w1 = vec3(vnoise(q * 4.0 + vec3(t * 0.02)), vnoise(q * 4.0 + 7.3), vnoise(q * 4.0 + 13.1)) - 0.5;
    vec3 q2 = q + 0.11 * w1;
    if (uWarpOctaves > 1.5) q2 += 0.035 * (vec3(vnoise(q2 * 11.0 + 2.1), vnoise(q2 * 11.0 + 5.7), vnoise(q2 * 11.0 - 3.3)) - 0.5);
    // the chromospheric network of 304 angstrom pictures: broken, fuzzy bright lanes at one or two irregular scales
    float lanes = pow(ridged(q2 * 12.0), 5.0);
    if (uNetOctaves > 1.5) lanes = lanes * 0.65 + pow(ridged(q2 * 25.0 + 3.0), 5.0) * 0.35;
    #ifdef WORLEY
      vec2 g = worley(q2 * 46.0, t * 0.6);
      float gran = 1.0 - smoothstep(0.05, 0.85, g.x);   // granulation: small soft cells that boil
      vec2 w = worley(q2 * 9.0, t * 0.08);
      float net = mix(lanes, exp(-pow((w.y - w.x) / 0.26, 2.0)), 0.45);
    #else
      float gran = vnoise(q2 * 40.0 + t * 0.3);
      float net = lanes;
    #endif
    net *= 0.35 + 0.65 * vnoise(q * 22.0 + vec3(t * 0.03));
    // mottling and fine fuzz, so no two patches of the disc read alike
    float mott = vnoise(q * 5.0 + vec3(t * 0.01)) * 0.55 + vnoise(q * 13.0 - vec3(t * 0.02)) * 0.30;
    mott += uMottOctaves > 2.5 ? vnoise(q2 * 31.0 + vec3(t * 0.05)) * 0.15 : 0.075;
    // the day's active regions: bright plage, ragged at the edges, with hot cores (sunspotNumber-free, but where spots live)
    float region = 0.0;
    for (int k = 0; k < REGIONS; k++) {
      float d = 1.0 - dot(p, uRegion[k].xyz);
      region += uRegionStrength[k] * exp(-d / (0.5 * uRegion[k].w * uRegion[k].w));
    }
    region *= 0.45 + 0.9 * vnoise(q2 * 6.5 + vec3(t * 0.004));
    region = clamp(region, 0.0, 1.2);
    float core = smoothstep(0.62, 1.05, region * (0.55 + 0.9 * vnoise(q2 * 15.0 - vec3(t * 0.01))));
    // a faint scatter of small bright patches elsewhere in the royal zones
    float belt = exp(-pow((abs(s) - 0.36) / 0.17, 2.0));
    float faint = smoothstep(0.58, 0.86, vnoise(q2 * 3.2)) * belt * 0.45;
    // sunspot groups: small dark knots, umbra inside penumbra, only in the hottest cores
    float spotField = vnoise(q * 16.0 + 3.7);
    float spot = smoothstep(0.66, 0.80, spotField) * smoothstep(0.2, 0.7, core);
    float umbra = smoothstep(0.78, 0.86, spotField) * smoothstep(0.2, 0.7, core);
    // filaments: the long-lived prominences seen from above, dark and ragged, lying along their footpoint line
    float filament = 0.0;
    for (int k = 0; k < PROMS; k++) {
      vec3 A = uFilA[k], B = uFilB[k];
      float ab = dot(A, B);
      float along = smoothstep(ab - 0.004, ab + 0.006, min(dot(p, A), dot(p, B)));
      if (along <= 0.0) continue;   // most pixels are nowhere near a filament
      float off = abs(dot(p, normalize(cross(A, B))));
      filament += along * exp(-pow(off / uFilW[k], 2.0));
    }
    // ragged edges: one noise lookup, and only where a filament lies
    if (filament > 0.01) filament *= 0.4 + 0.9 * vnoise(q2 * 38.0) * (0.75 + 0.25 * vnoise(q * 60.0));
    // toward the limb a filament is seen edge-on and becomes the glowing prominence instead, so it fades out there
    float mu = max(dot(n, v), 0.0);
    filament = min(filament, 1.0) * smoothstep(0.12, 0.45, mu);
    float heat = 0.30 + 0.08 * gran + 0.15 * net * (0.4 + mott) + 0.24 * (mott - 0.5)
      + region * (0.40 + 0.26 * net + 0.08 * gran) + core * 0.34 + faint * (0.25 + 0.2 * net)
      - 0.30 * spot - 0.22 * umbra;
    heat *= 1.0 - 0.42 * filament;
    // flares: a footpoint flashes as its loop is born
    for (int i = 0; i < LOOPS; i++) {
      if (uFlare[i] <= 0.0) continue;
      float d = max(dot(n, uFeet[i * 2]), dot(n, uFeet[i * 2 + 1]));
      heat += uFlare[i] * exp(-(1.0 - d) / 0.00035) * 0.9;
    }
    float e = clamp((heat - ${HEAT_MIN.toFixed(2)}) / ${HEAT_SPAN.toFixed(2)}, 0.0, 1.0) * 255.0;
    gl_FragColor = vec4(floor(e) / 255.0, fract(e), 0.0, 1.0);
  }`;

/**
 * The sphere in the scene: reads the heat under this pixel from the surface
 * buffer, then adds what depends on the view at full resolution, the limb
 * darkening and the bright chromospheric rim, and turns heat into colour.
 */
const SUN_COMPOSITE_FRAGMENT = `
  uniform sampler2D uHeat; uniform vec2 uInvSize; uniform float uFade;
  varying vec3 vLocal; varying vec3 vNormal; varying vec3 vView;
  ${RAMP}
  void main() {
    vec4 e = texture2D(uHeat, gl_FragCoord.xy * uInvSize);
    float heat = (e.r * 255.0 + e.g) / 255.0 * ${HEAT_SPAN.toFixed(2)} + ${HEAT_MIN.toFixed(2)};
    float mu = max(dot(normalize(vNormal), normalize(vView)), 0.0);
    // the limb: a little darker just inside, then the bright chromospheric rim (304 shows limb brightening)
    heat *= 0.74 + 0.26 * pow(mu, 0.45);
    heat += 0.22 * pow(1.0 - mu, 6.0);
    gl_FragColor = vec4(ramp(heat), uFade);
    #include <colorspace_fragment>
  }`;

/** Adds a corona or gas buffer under this pixel (display values, as they were drawn). */
const GLOW_FRAGMENT = `
  uniform sampler2D uGlow; uniform vec2 uInvSize;
  void main() { gl_FragColor = vec4(texture2D(uGlow, gl_FragCoord.xy * uInvSize).rgb, 1.0); }`;

/** A quad that always faces the camera, centred on the Sun, sized in world units. */
const CORONA_VERTEX = `
  varying vec2 vXY;
  void main() { vXY = position.xy; vec4 c = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0); gl_Position = projectionMatrix * (c + vec4(position.xy, 0.0, 0.0)); }`;
/**
 * The light round the limb, in units of the Sun's radius: a thin bright
 * fringe that flickers (spicules), an inner glow, a long faint halo that
 * warms the dark sky, and slow streamers, all additive.
 */
const CORONA_FRAGMENT = `
  uniform float uR; uniform float uTime; uniform float uSeedA; uniform float uFade;
  varying vec2 vXY;
  float h1(vec2 p) { p = fract(p * vec2(0.1471, 0.1932)); p += dot(p, p.yx + 19.19); return fract(p.x * p.y); }
  float n2(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(h1(i), h1(i + vec2(1, 0)), f.x), mix(h1(i + vec2(0, 1)), h1(i + vec2(1, 1)), f.x), f.y); }
  void main() {
    float r = length(vXY) / uR;
    if (r > ${CORONA_EXTENT.toFixed(1)}) discard;
    vec2 dir = vXY / max(1e-4, length(vXY));
    float t = uTime * 0.001;
    float x = max(r - 1.0, 0.0);
    // spicules: a ragged rim of flame whose height flickers along the limb (noise on the circle, so no seam)
    // (only near the limb: past 0.45 radii the tallest flame has faded to a fiftieth of a percent)
    float fringe = 0.0;
    if (x < 0.45) {
      float flameH = 0.010 + 0.050 * pow(n2(dir * 34.0 + vec2(t * 0.35, uSeedA - t * 0.25)), 2.5) + 0.012 * n2(dir * 90.0 + vec2(t * 1.1, 0.0));
      fringe = exp(-x / flameH) * (0.55 + 0.45 * n2(dir * 60.0 + vec2(t * 0.9, uSeedA)));
    }
    // streamers: a few long soft petals whose reach varies round the limb and breathes slowly
    float petal = n2(dir * 2.4 + vec2(uSeedA, t * 0.015)) * 0.65 + n2(dir * 5.2 - vec2(t * 0.012, uSeedA)) * 0.35;
    float reach = 0.9 + 2.2 * pow(petal, 1.6);
    float streamer = exp(-x * 2.2 / reach) * (0.35 + 0.65 * petal);
    float glow = 0.34 * exp(-x * 7.0) + 0.16 * exp(-x * 2.6) + 0.17 * streamer + 0.045 * exp(-x * 0.75);
    float edge = 1.0 - smoothstep(${(CORONA_EXTENT - 1.4).toFixed(1)}, ${CORONA_EXTENT.toFixed(1)}, r);
    // written in display values, not linear: additive layers are tuned by eye on the screen
    vec3 col = vec3(1.0, 0.46, 0.12) * glow + vec3(1.0, 0.62, 0.26) * fringe * 0.36;
    gl_FragColor = vec4(col * edge * uFade, 1.0);
  }`;

/**
 * Glowing gas. Every point belongs to one structure (the long-lived
 * prominences first, then the loop slots) and to one strand within it, and
 * has a place along it. Per structure: footpoints uA and uB (unit vectors
 * from the centre), uP = (height, lift, brightness, fling) and uQ = (lean,
 * flow direction, kind: 0 arch, 1 hedgerow, 2 eruption, glow left when seen
 * against the disc).
 *
 * Arches: strands of uneven height and brightness, wavering along and across,
 * the apex leaning toward one foot and out of the plane; gas slides from one
 * foot to the other (rising one leg, draining down the other), brightest at
 * the feet and fading at the top. Hedgerows: a curtain of thin vertical
 * threads with a ragged top, gas drifting up or down the threads. Eruptions:
 * the arch swells, then breaks; seven points in ten are thrown out as a
 * billowing shell that widens, thins and fades while the torn legs drain.
 * In front of the disc only a trace glows: there the surface shader draws the
 * same structure as a dark filament.
 */
const LOOP_VERTEX = `
  #define N ${PROMINENCE_COUNT + LOOP_SLOTS}
  attribute float aLoop; attribute float aU; attribute float aStrand; attribute vec3 aJit; attribute float aSize; attribute float aGlow; attribute float aRand;
  uniform vec3 uA[N]; uniform vec3 uB[N]; uniform vec4 uP[N]; uniform vec4 uQ[N];
  uniform float uR; uniform float uTime; uniform float uPixelRatio; uniform float uScale; uniform float uFade;
  varying float vAlpha; varying float vHeat;
  void main() {
    int i = int(aLoop + 0.5);
    vec4 P = uP[i]; vec4 Q = uQ[i];
    vec3 A = uA[i], B = uB[i];
    float t = uTime * 0.001;
    float h = P.x * P.y;
    float st = aStrand;
    vec3 mid = normalize(A + B);
    vec3 side = normalize(cross(B - A, mid) + vec3(1e-5));
    vec3 pos; float alpha; float heat; float grow = 1.0;
    if (Q.z > 0.5 && Q.z < 1.5) {
      // hedgerow: thin threads standing on the limb between the feet
      float thread = floor(aU * 30.0);
      float xx = mix(aU, (thread + 0.5) / 30.0, 0.75);
      vec3 dir = normalize(mix(A, B, xx));
      float edge = smoothstep(0.0, 0.2, xx) * smoothstep(1.0, 0.8, xx);
      float top = h * edge * (0.55 + 0.30 * sin(xx * 9.0 + Q.x * 6.0) + 0.15 * sin(xx * 27.0 + st * 5.0 + t * 0.2));
      float y = fract(aRand + Q.y * t * (0.02 + 0.03 * aGlow));
      pos = dir * (1.0 + top * y) + side * ((st - 0.5) * 0.03 + Q.x * top * y * 0.5) + aJit * (0.006 + 0.02 * y);
      alpha = (1.0 - 0.7 * y) * (0.55 + 0.45 * fract(thread * 0.618 + st));
      heat = aGlow * (1.0 - 0.6 * y);
    } else {
      // an arch of strands
      float s = fract(aU + Q.y * t * (0.025 + 0.02 * aGlow));
      float arch = sin(3.14159 * pow(s, exp2(Q.x * 0.9)));
      vec3 dir = normalize(mix(A, B, s));
      float wob = sin(s * 17.0 + st * 40.0 + t * 0.7) * 0.5 + sin(s * 43.0 + st * 13.0 - t * 1.1) * 0.25;
      float swell = Q.z > 1.5 ? 1.0 + 0.5 * P.y : 1.0;
      float rise = h * swell * (0.7 + 0.6 * fract(st * 3.7 + 0.31)) * pow(arch, 0.7) * (1.0 + 0.18 * wob);
      // two points in five hang below the strands as the sheet's fainter body, so a prominence reads as a curtain, not a ring
      float sheet = step(aRand, 0.4);
      rise *= mix(1.0, pow(fract(aRand * 7.31), 0.7), sheet);
      float across = ((st - 0.5) * (0.03 + 0.05 * arch) * (0.5 + 2.0 * h) + wob * 0.012) * swell;
      pos = dir * (1.0 + rise) + side * (across + Q.x * arch * h * 0.6) + aJit * (0.008 + 0.024 * arch) * (0.6 + h * 2.0);
      alpha = mix(1.0, 0.25, pow(arch, 1.5)) * (0.5 + 0.5 * fract(st * 5.3 + 0.7)) * (0.75 + 0.25 * sin(s * 29.0 + st * 9.0 - t * 2.0)) * mix(1.0, 0.6, sheet);
      heat = aGlow * (1.0 - 0.5 * arch);
      if (P.w > 0.0) {
        float f = P.w;
        float g = smoothstep(0.0, 0.2, f) * step(0.3, aRand);
        vec3 apex = normalize(mid + side * Q.x * 0.25);
        vec3 jd = normalize(aJit + vec3(1e-4));
        float billow = 1.0 + 0.22 * sin(dot(jd, vec3(5.0, 7.0, 3.0)) + t * 1.3) + 0.12 * sin(dot(jd, vec3(-11.0, 4.0, 9.0)) - t);
        vec3 shell = jd * (0.06 + 0.9 * f) * billow * (0.35 + 0.65 * sqrt(fract(aRand * 13.7)));
        vec3 cloud = apex * (1.0 + h * 1.5 + 2.4 * pow(f, 0.8)) + shell - apex * dot(shell, apex) * 0.4;
        // a third of the thrown gas trails back toward the broken arch as a widening, ragged stalk
        float trail = step(aRand, 0.53);
        float tu = pow(fract(aRand * 29.3), 0.7);
        cloud = mix(cloud, mix(apex * (1.0 + h), cloud, tu) + shell * 0.35 * tu, trail);
        vec3 legs = dir * (1.0 + rise * (1.0 - f));
        pos = mix(legs, cloud, g);
        alpha *= mix(1.0 - 0.85 * f, 4.5 * pow(1.0 - f, 1.2), g);
        grow = 1.0 + 4.5 * f * g;
        heat = mix(heat, aGlow * 0.5, g);
      }
    }
    vec3 world = pos * uR;
    vec4 mv = modelViewMatrix * vec4(world, 1.0);
    // against the disc only a trace glows (Q.w); the surface shows the dark filament instead
    vec3 eye = normalize(cameraPosition - (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz);
    float along = dot(world, eye);
    float perp = length(world - along * eye) / uR;
    float onDisc = (1.0 - smoothstep(0.985, 1.03, perp)) * step(0.0, along);
    alpha *= mix(1.0, Q.w, onDisc);
    vAlpha = uFade * P.z * alpha * (0.04 + 0.07 * aGlow);
    vHeat = heat;
    gl_PointSize = clamp(aSize * grow * uR * uScale / max(1.0, -mv.z), 1.0, 64.0) * uPixelRatio;
    // a point too faint to change a pixel (a loop slot between events, a trace far inside the disc) is not rasterised at all
    gl_Position = vAlpha < 0.0005 ? vec4(2.0, 2.0, 2.0, 1.0) : projectionMatrix * mv;
  }`;
const LOOP_FRAGMENT = `
  varying float vAlpha; varying float vHeat;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    if (d > 0.5) discard;
    float a = exp(-d * d * 16.0) * vAlpha;
    vec3 col = mix(vec3(1.0, 0.38, 0.09), vec3(1.0, 0.74, 0.42), vHeat * vHeat);
    gl_FragColor = vec4(col * a, 1.0);   // display values, as the corona
  }`;

/** The orbit, brightest just behind the Earth and fading round the ring, so the line reads as its wake. */
const ORBIT_VERTEX = `
  attribute float aLon; varying float vLon;
  void main() { vLon = aLon; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const ORBIT_FRAGMENT = `
  uniform float uEarthLon; uniform float uFade; varying float vLon;
  void main() {
    float behind = mod(uEarthLon - vLon, 6.28318);
    float a = (0.10 + 0.55 * exp(-behind * 1.4)) * uFade;
    gl_FragColor = vec4(vec3(1.0, 0.62, 0.30) * a, a);
    #include <colorspace_fragment>
  }`;

/**
 * Build the day scene into a Three.js scene.
 * @param {object} input
 * @param {THREE.Scene} input.scene
 * @param {(url: string, onLoad: (t: THREE.Texture) => void) => void} input.loadTexture same-origin loader that sets the colour space.
 * @param {string} input.assetBase e.g. "/admin/sky/".
 * @param {number} input.pixelRatio
 * @param {'high'|'low'} [input.detail] the shader and particle tier (low on phones).
 * @param {'working'|'showcase'} [input.mode] the sky mode, which sets the surface buffer's size and the noise octaves.
 * @param {Date} [input.date] the moment the scene is set for (Earth's place, the Sun's axis, the seed).
 * @returns {{kind: 'sun', framing: object, centre: THREE.Vector3, glareRadius: number, visibleUntil: number, surface: object,
 *   update(elapsed: number): void, beforeRender(renderer: THREE.WebGLRenderer, camera: THREE.Camera): boolean, readout(): string,
 *   setPixelRatio(ratio: number): void, setQuality(q: {pixelRatio?: number, mode?: string, level?: number}): void, setPresence(presence: number): void, dispose(): void}}
 */
export function createSunSystem({ scene, loadTexture, assetBase, pixelRatio, detail = 'high', mode = 'showcase', date = new Date() }) {
  const model = sunScene(date);
  const phone = detail === 'low';
  const tier = SUN_TIERS[detail] || SUN_TIERS.high;
  const centre = new THREE.Vector3(model.centre[0], model.centre[1], model.centre[2]);
  const pole = new THREE.Vector3(model.sunPole[0], model.sunPole[1], model.sunPole[2]);
  const root = new THREE.Group();
  root.position.copy(centre);
  scene.add(root);
  const disposables = [];
  const seedA = (model.seed % 997) / 997;

  // ---- the Sun: oriented so its local y is the real rotation pole ----
  const feet = Array.from({ length: LOOP_SLOTS * 2 }, () => new THREE.Vector3());
  const regions = activeRegions(model.seed);
  const proms = prominences(model.seed);
  const vec = (v) => new THREE.Vector3(v[0], v[1], v[2]);
  const surfaceMaterial = new THREE.ShaderMaterial({
    uniforms: {
      uSpin: { value: 0 }, uTime: { value: 0 }, uSeed: { value: new THREE.Vector3(seedA * 41.3, seedA * 17.9 + 3.1, seedA * 29.7 + 7.7) },
      uFeet: { value: feet }, uFlare: { value: new Array(LOOP_SLOTS).fill(0) },
      uWarpOctaves: { value: tier.warpOctaves }, uNetOctaves: { value: tier.netOctaves }, uMottOctaves: { value: tier.mottOctaves },
      // the surface frame's fixed features, in the body frame (the shader turns the pixel, not them)
      uRegion: { value: regions.map((g) => new THREE.Vector4(g.centre[0], g.centre[1], g.centre[2], g.size)) },
      uRegionStrength: { value: regions.map((g) => g.strength) },
      uFilA: { value: proms.map((f) => vec(f.feet[0])) }, uFilB: { value: proms.map((f) => vec(f.feet[1])) },
      uFilW: { value: proms.map((f) => 0.016 + 0.06 * f.height) },
    },
    vertexShader: SUN_VERTEX, fragmentShader: SUN_FRAGMENT(tier), blending: THREE.NoBlending, depthTest: false, depthWrite: false,
  });
  const sunGeometry = new THREE.SphereGeometry(SUN_RADIUS, tier.segments[0], tier.segments[1]);
  // body frame: y the real rotation pole, z toward the camera at load (longitude 0 faces the viewer)
  const bodyFrame = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(vec(model.bodyX), pole, vec(model.bodyZ)));
  // the surface buffer: its own little scene, drawn before the main one (beforeRender)
  const surfaceScene = new THREE.Scene();
  const surfaceMesh = new THREE.Mesh(sunGeometry, surfaceMaterial);
  surfaceMesh.position.copy(centre); surfaceMesh.quaternion.copy(bodyFrame); surfaceMesh.scale.setScalar(SURFACE_OVERSCAN);
  surfaceScene.add(surfaceMesh);
  const surfaceTarget = new THREE.WebGLRenderTarget(1, 1, { depthBuffer: false, stencilBuffer: false, generateMipmaps: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, type: THREE.UnsignedByteType });
  const sunMaterial = new THREE.ShaderMaterial({
    uniforms: { uHeat: { value: surfaceTarget.texture }, uInvSize: { value: new THREE.Vector2(1, 1) }, uFade: { value: 1 } },
    // transparent only so it can fade as the camera leaves the prologue; it still writes depth, and at full presence alpha is 1
    vertexShader: SUN_VERTEX, fragmentShader: SUN_COMPOSITE_FRAGMENT, transparent: true,
  });
  const sun = new THREE.Mesh(sunGeometry, sunMaterial);
  sun.quaternion.copy(bodyFrame);
  sun.renderOrder = 1;
  root.add(sun);

  // ---- corona ----
  const coronaSize = SUN_RADIUS * CORONA_EXTENT * 2;
  const coronaMaterial = new THREE.ShaderMaterial({
    uniforms: { uR: { value: SUN_RADIUS }, uTime: { value: 0 }, uSeedA: { value: seedA * 50 }, uFade: { value: 1 } },
    vertexShader: CORONA_VERTEX, fragmentShader: CORONA_FRAGMENT, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const corona = new THREE.Mesh(new THREE.PlaneGeometry(coronaSize, coronaSize), coronaMaterial);
  corona.renderOrder = 4; corona.frustumCulled = false;
  // the corona and the gas are each drawn into a buffer of their own (beforeRender) and added back by a quad
  const bufferOptions = { stencilBuffer: false, generateMipmaps: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, type: THREE.UnsignedByteType };
  const addBuffer = (target, extent, depthTest, renderOrder) => {
    const material = new THREE.ShaderMaterial({
      uniforms: { uGlow: { value: target.texture }, uInvSize: sunMaterial.uniforms.uInvSize },
      vertexShader: CORONA_VERTEX, fragmentShader: GLOW_FRAGMENT, transparent: true, depthTest, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(SUN_RADIUS * extent * 2, SUN_RADIUS * extent * 2), material);
    quad.renderOrder = renderOrder; quad.frustumCulled = false;
    root.add(quad);
    return quad;
  };
  const coronaScene = new THREE.Scene();
  const coronaRoot = new THREE.Group();
  coronaRoot.position.copy(centre);
  coronaRoot.add(corona);
  coronaScene.add(coronaRoot);
  const coronaTarget = new THREE.WebGLRenderTarget(1, 1, { ...bufferOptions, depthBuffer: false });
  // depth tested at the Sun's centre, as the corona itself was: the disc in front hides it with its own clean edge
  const coronaQuad = addBuffer(coronaTarget, CORONA_EXTENT, true, 4);
  const glowScene = new THREE.Scene();
  const glowRoot = new THREE.Group();
  glowRoot.position.copy(centre);
  glowScene.add(glowRoot);
  const occluderMaterial = new THREE.MeshBasicMaterial({ colorWrite: false });
  glowRoot.add(new THREE.Mesh(sunGeometry, occluderMaterial));
  const glowTarget = new THREE.WebGLRenderTarget(1, 1, { ...bufferOptions, depthBuffer: true });
  // not depth tested: the gas buffer already hid what lies behind the Sun, and keeps the trace in front of the disc
  const glow = addBuffer(glowTarget, GLOW_EXTENT, false, 5);

  // ---- glowing gas: the long-lived prominences first, then the loop slots ----
  const STRUCTURES = PROMINENCE_COUNT + LOOP_SLOTS;
  const { perProminence, perEvent } = tier;
  const count = perProminence * PROMINENCE_COUNT + perEvent * LOOP_SLOTS;
  const rnd = mulberry(model.seed);
  const attrs = { aLoop: new Float32Array(count), aU: new Float32Array(count), aStrand: new Float32Array(count), aJit: new Float32Array(count * 3), aSize: new Float32Array(count), aGlow: new Float32Array(count), aRand: new Float32Array(count) };
  for (let i = 0; i < count; i++) {
    const inProm = i < perProminence * PROMINENCE_COUNT;
    const structure = inProm ? Math.floor(i / perProminence) : PROMINENCE_COUNT + Math.floor((i - perProminence * PROMINENCE_COUNT) / perEvent);
    const strands = inProm ? proms[structure].strands : 4;
    attrs.aLoop[i] = structure; attrs.aU[i] = rnd();
    attrs.aStrand[i] = (Math.floor(rnd() * strands) + 0.5) / strands;
    // a thin thread with a few strays
    const spread = rnd() < 0.85 ? 1 : 2.5;
    attrs.aJit[i * 3] = (rnd() - 0.5) * spread; attrs.aJit[i * 3 + 1] = (rnd() - 0.5) * spread; attrs.aJit[i * 3 + 2] = (rnd() - 0.5) * spread;
    // mostly fine grains; about one in five is a broad, faint puff that gives a strand some body
    const puff = rnd() < 0.22;
    attrs.aSize[i] = puff ? 0.12 + rnd() * 0.10 : 0.05 + rnd() * rnd() * 0.06; attrs.aGlow[i] = puff ? rnd() * 0.25 : rnd();
    attrs.aRand[i] = rnd();
  }
  const loopGeometry = new THREE.BufferGeometry();
  loopGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));   // placed in the shader
  for (const [name, size] of [['aLoop', 1], ['aU', 1], ['aStrand', 1], ['aJit', 3], ['aSize', 1], ['aGlow', 1], ['aRand', 1]]) {
    loopGeometry.setAttribute(name, new THREE.BufferAttribute(attrs[name], size));
  }
  const loopA = Array.from({ length: STRUCTURES }, () => new THREE.Vector3(1, 0, 0)), loopB = Array.from({ length: STRUCTURES }, () => new THREE.Vector3(1, 0, 0));
  const loopP = Array.from({ length: STRUCTURES }, () => new THREE.Vector4());
  const loopQ = Array.from({ length: STRUCTURES }, () => new THREE.Vector4());
  // the prominences' shape never changes; only their feet turn with the surface
  proms.forEach((f, k) => {
    loopP[k].set(f.height, 1, 0.9, 0);
    loopQ[k].set(f.lean, f.flow, f.kind === 'hedge' ? 1 : 0, 0.08);
  });
  const loopMaterial = new THREE.ShaderMaterial({
    uniforms: { uA: { value: loopA }, uB: { value: loopB }, uP: { value: loopP }, uQ: { value: loopQ }, uR: { value: SUN_RADIUS }, uTime: { value: 0 }, uPixelRatio: { value: pixelRatio }, uScale: { value: 900 }, uFade: { value: 1 } },
    vertexShader: LOOP_VERTEX, fragmentShader: LOOP_FRAGMENT, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const loops = new THREE.Points(loopGeometry, loopMaterial);
  loops.frustumCulled = false; loops.renderOrder = 5;
  glowRoot.add(loops);

  // ---- the orbit ----
  const ORBIT_STEPS = 256;
  const orbitPositions = new Float32Array(ORBIT_STEPS * 3), orbitLon = new Float32Array(ORBIT_STEPS);
  for (let k = 0; k < ORBIT_STEPS; k++) {
    const lon = (360 * k) / ORBIT_STEPS;
    const p = model.toWorld(eclipticDirection(lon));
    orbitPositions.set([p[0] * EARTH_ORBIT_RADIUS, p[1] * EARTH_ORBIT_RADIUS, p[2] * EARTH_ORBIT_RADIUS], k * 3);
    orbitLon[k] = (lon * Math.PI) / 180;
  }
  const orbitGeometry = new THREE.BufferGeometry();
  orbitGeometry.setAttribute('position', new THREE.BufferAttribute(orbitPositions, 3));
  orbitGeometry.setAttribute('aLon', new THREE.BufferAttribute(orbitLon, 1));
  const orbitMaterial = new THREE.ShaderMaterial({ uniforms: { uEarthLon: { value: 0 }, uFade: { value: 1 } }, vertexShader: ORBIT_VERTEX, fragmentShader: ORBIT_FRAGMENT, transparent: true, depthWrite: false });
  const orbit = new THREE.LineLoop(orbitGeometry, orbitMaterial);
  orbit.renderOrder = 3;
  root.add(orbit);

  // ---- the Earth, lit by this Sun ----
  const toSun = new THREE.Vector3();
  const earthMaterial = new THREE.ShaderMaterial({
    uniforms: { uDay: { value: null }, uNight: { value: null }, uClouds: { value: null }, uSun: { value: toSun }, uCloudShift: { value: 0 } },
    vertexShader: EARTH_VERTEX, fragmentShader: EARTH_FRAGMENT,
  });
  const black = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1); black.needsUpdate = true;
  const clear = new THREE.DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1); clear.needsUpdate = true;
  earthMaterial.uniforms.uDay.value = black; earthMaterial.uniforms.uNight.value = black; earthMaterial.uniforms.uClouds.value = clear;
  loadTexture(`${assetBase}earth/earth-day.webp`, (t) => { earthMaterial.uniforms.uDay.value = t; });
  loadTexture(`${assetBase}earth/earth-night.webp`, (t) => { earthMaterial.uniforms.uNight.value = t; });
  loadTexture(`${assetBase}earth/earth-clouds.webp`, (t) => { t.wrapS = THREE.RepeatWrapping; earthMaterial.uniforms.uClouds.value = t; });
  const earth = new THREE.Mesh(new THREE.SphereGeometry(DAY_EARTH_RADIUS, 48, 32), earthMaterial);
  earth.renderOrder = 1;
  scene.add(earth);
  const haloMaterial = new THREE.ShaderMaterial({ uniforms: { uSun: { value: toSun } }, vertexShader: EARTH_VERTEX, fragmentShader: HALO_FRAGMENT, side: THREE.BackSide, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const halo = new THREE.Mesh(new THREE.SphereGeometry(DAY_EARTH_RADIUS * 1.12, 32, 24), haloMaterial);
  halo.renderOrder = 4;
  earth.add(halo);
  // the Earth hides the glow behind it, so the glow scene holds a depth-only copy that follows it
  const earthOccluder = new THREE.Mesh(earth.geometry, occluderMaterial);
  earthOccluder.matrixAutoUpdate = false;
  glowScene.add(earthOccluder);
  const axis = new THREE.Vector3(model.earthAxis[0], model.earthAxis[1], model.earthAxis[2]);
  const align = new THREE.Quaternion().setFromUnitVectors(UP, axis);
  const spinQuaternion = new THREE.Quaternion();
  // the real subsolar point faces the Sun at load, as at night
  const sunFromEarth0 = earthDirection(model, 0).map((v) => -v);
  const spinAtLoad = spinForSubsolar(model.earthAxis, sunFromEarth0, model.declination, subsolarLongitude(date));

  disposables.push(sunGeometry, surfaceMaterial, surfaceTarget, sunMaterial, occluderMaterial, coronaTarget, coronaQuad.geometry, coronaQuad.material, glowTarget, glow.geometry, glow.material, corona.geometry, coronaMaterial, loopGeometry, loopMaterial, orbitGeometry, orbitMaterial, earth.geometry, earthMaterial, halo.geometry, haloMaterial, black, clear);
  const readout = distanceReadout(date);

  // ---- the frame loop's working state, made once so update() allocates nothing ----
  const tracker = createLoopTracker(model);
  const basis = eclipticBasis(model);
  const scratch = new Float64Array(3), earthDir = new Float64Array(3);
  const flares = surfaceMaterial.uniforms.uFlare.value;
  const frustum = new THREE.Frustum(), viewProjection = new THREE.Matrix4(), bufferSize = new THREE.Vector2(), clearColor = new THREE.Color();
  const bound = new THREE.Sphere(centre.clone(), SUN_RADIUS * SURFACE_OVERSCAN);
  const glowBound = new THREE.Sphere(centre.clone(), SUN_RADIUS * GLOW_EXTENT * Math.SQRT2);
  const coronaBound = new THREE.Sphere(centre.clone(), SUN_RADIUS * CORONA_EXTENT * Math.SQRT2);
  let surfaceScale = 1, surfaceMode = mode, surfaceLevel = 0, ratio = pixelRatio;
  const applyQuality = () => {
    surfaceScale = sunSurfaceScale({ mode: surfaceMode, pixelRatio: ratio, phone, level: surfaceLevel });
    // the octave knobs follow the mode; the low tier (no Worley lookup compiled in) stays low
    const knobs = tier === SUN_TIERS.low ? tier : SUN_TIERS[sunTierFor({ mode: surfaceMode, phone })];
    surfaceMaterial.uniforms.uWarpOctaves.value = knobs.warpOctaves;
    surfaceMaterial.uniforms.uNetOctaves.value = knobs.netOctaves;
    surfaceMaterial.uniforms.uMottOctaves.value = knobs.mottOctaves;
  };
  applyQuality();
  /**
   * Follow the canvas: its pixel ratio, the sky mode and the adaptive step, which set the
   * surface buffer's size (renderBudget.sunSurfaceScale) and the noise octaves (sunTierFor).
   */
  const setQuality = ({ pixelRatio: nextRatio, mode: nextMode, level } = {}) => {
    if (Number.isFinite(nextRatio) && nextRatio > 0) ratio = nextRatio;
    if (nextMode === 'working' || nextMode === 'showcase') surfaceMode = nextMode;
    if (Number.isFinite(level)) surfaceLevel = level;
    applyQuality();
  };

  return {
    kind: 'sun',
    /** Narrow-screen framing for this prologue (voyageModel.prologueFraming). */
    framing: DAY_NARROW_FRAMING,
    /** The Sun's centre and radius, for the star field's glare. */
    centre, glareRadius: SUN_RADIUS,
    /** Pose everything for `elapsed` ms since load (a constant holds a still frame: today's Sun, today's Earth). */
    /** Past this route coordinate the Sun has faded out, so the field need not keep animating it. */
    visibleUntil: SUN_VISIBLE_UNTIL,
    /** The surface buffer and its scene, for tests and leak checks. */
    surface: { scene: surfaceScene, target: surfaceTarget, material: surfaceMaterial, get scale() { return surfaceScale; } },
    /** The corona and gas buffer and its scene, likewise. */
    glow: { scene: glowScene, target: glowTarget },
    corona: { scene: coronaScene, target: coronaTarget },
    /**
     * Pose everything for `elapsed` ms since load (a constant holds a still frame: today's Sun, today's Earth).
     * Does nothing while the system is hidden, and allocates nothing.
     */
    update(elapsed) {
      if (!root.visible && !earth.visible) return;
      const t = elapsed;
      surfaceMaterial.uniforms.uSpin.value = sunSpin(t);
      surfaceMaterial.uniforms.uTime.value = t;
      coronaMaterial.uniforms.uTime.value = t;
      loopMaterial.uniforms.uTime.value = t;
      for (let k = 0; k < PROMINENCE_COUNT; k++) {
        const f = proms[k];
        bodyToWorldInto(scratch, model, f.feet[0], t); loopA[k].set(scratch[0], scratch[1], scratch[2]);
        bodyToWorldInto(scratch, model, f.feet[1], t); loopB[k].set(scratch[0], scratch[1], scratch[2]);
      }
      for (let s = 0; s < LOOP_SLOTS; s++) {
        const k = PROMINENCE_COUNT + s;
        const slot = tracker.at(s, t), e = slot.event, ph = slot.phase, a = slot.feet[0], b = slot.feet[1];
        loopA[k].set(a[0], a[1], a[2]); loopB[k].set(b[0], b[1], b[2]);
        feet[s * 2].copy(loopA[k]); feet[s * 2 + 1].copy(loopB[k]);
        loopP[k].set(e.height, ph.lift, ph.brightness, ph.fling);
        const eruption = e.kind === 'eruption';
        loopQ[k].set(e.lean, e.flow, eruption ? 2 : e.kind === 'hedge' ? 1 : 0, e.anchor === 'region' ? 0.85 : 0.5);
        // the feet flash as the arc is born, and again as an eruption breaks
        flares[s] = ph.active ? Math.exp(-ph.progress * 9) * (eruption ? 1.2 : 0.6) + (eruption ? 0.6 * Math.exp(-(((ph.progress - ERUPTION_BREAK) / 0.06) ** 2)) : 0) : 0;
      }
      const lon = earthLongitude(model, t);
      const d = earthDirectionInto(earthDir, model, basis, t);
      earth.position.set(centre.x + d[0] * EARTH_ORBIT_RADIUS, centre.y + d[1] * EARTH_ORBIT_RADIUS, centre.z + d[2] * EARTH_ORBIT_RADIUS);
      toSun.set(-d[0], -d[1], -d[2]);
      spinQuaternion.setFromAxisAngle(UP, earthSpin(spinAtLoad, t, DAY_EARTH_SPIN_MS));
      earth.quaternion.copy(align).multiply(spinQuaternion);
      earthMaterial.uniforms.uCloudShift.value = (t / 240000) % 1;
      orbitMaterial.uniforms.uEarthLon.value = (lon * Math.PI) / 180;
    },
    /**
     * Draw the surface buffer for the coming render. The field calls this just before
     * renderer.render(scene, camera). It skips the work while the Sun is hidden or out of view.
     * @returns {boolean} whether the buffer was drawn.
     */
    beforeRender(renderer, camera) {
      if (!root.visible) return false;
      camera.updateMatrixWorld();
      viewProjection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
      frustum.setFromProjectionMatrix(viewProjection);
      const surfaceInView = frustum.intersectsSphere(bound), glowInView = frustum.intersectsSphere(glowBound), coronaInView = frustum.intersectsSphere(coronaBound);
      glow.visible = glowInView; coronaQuad.visible = coronaInView;   // never add a stale buffer
      if (!surfaceInView && !glowInView && !coronaInView) return false;
      renderer.getDrawingBufferSize(bufferSize);
      const w = Math.max(1, Math.round(bufferSize.x * surfaceScale)), h = Math.max(1, Math.round(bufferSize.y * surfaceScale));
      sunMaterial.uniforms.uInvSize.value.set(1 / Math.max(1, bufferSize.x), 1 / Math.max(1, bufferSize.y));
      // the gas sizes its points in buffer pixels
      loopMaterial.uniforms.uPixelRatio.value = ratio * (w / Math.max(1, bufferSize.x));
      const previous = renderer.getRenderTarget();
      renderer.getClearColor(clearColor);
      const clearAlpha = renderer.getClearAlpha();
      renderer.setClearColor(0x000000, 0);
      if (surfaceInView) {
        if (surfaceTarget.width !== w || surfaceTarget.height !== h) surfaceTarget.setSize(w, h);
        renderer.setRenderTarget(surfaceTarget);
        renderer.render(surfaceScene, camera);
      }
      if (coronaInView) {
        if (coronaTarget.width !== w || coronaTarget.height !== h) coronaTarget.setSize(w, h);
        renderer.setRenderTarget(coronaTarget);
        renderer.render(coronaScene, camera);
      }
      if (glowInView) {
        if (glowTarget.width !== w || glowTarget.height !== h) glowTarget.setSize(w, h);
        earth.updateMatrixWorld();
        earthOccluder.matrix.copy(earth.matrixWorld); earthOccluder.matrixWorldNeedsUpdate = true;
        earthOccluder.visible = earth.visible;
        renderer.setRenderTarget(glowTarget);
        renderer.render(glowScene, camera);
      }
      renderer.setRenderTarget(previous);
      renderer.setClearColor(clearColor, clearAlpha);
      return true;
    },
    /** Today's true Earth-Sun distance (the scene's clock does not change it). */
    readout() { return readout; },
    setPixelRatio(next) { setQuality({ pixelRatio: next }); },
    setQuality,
    /**
     * How present the system is, 0 to 1. Unlike the night Earth, which the camera flies past, the Sun
     * sits deep in the frame and would otherwise hang behind the first chapter's panels; the field
     * fades it out as the camera leaves the prologue and stops drawing it once it is gone.
     */
    setPresence(presence) {
      const p = Math.min(1, Math.max(0, presence));
      [sunMaterial, coronaMaterial, loopMaterial, orbitMaterial].forEach((m) => { m.uniforms.uFade.value = p; });
      root.visible = p > 0.005;
      earth.visible = p > 0.5;   // the small Earth sits near the camera path and simply leaves with the Sun
    },
    /** Takes everything out of the scene and frees it (textures belong to the loader that made them). */
    dispose() {
      scene.remove(root, earth);
      surfaceScene.remove(surfaceMesh);
      glowScene.remove(glowRoot, earthOccluder);
      coronaScene.remove(coronaRoot);
      for (const d of disposables) d.dispose?.();
    },
  };
}

/** A small seeded generator for the particle layout (stable per date). */
function mulberry(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
