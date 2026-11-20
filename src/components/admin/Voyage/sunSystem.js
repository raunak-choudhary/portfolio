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
//            space round the Sun, slow streamers, and the flickering fringe.
//   surface  the sphere: boiling cells, belts of active regions with
//            sunspot groups, dark filaments, limb treatment, flare flashes.
//   loops    glowing gas: points strung along magnetic arcs between two
//            footpoints, draining back down both legs (coronal rain); some
//            arcs stand tall, a few erupt and leave the limb.
//   Earth    NASA's day map, city lights and clouds (the night prologue's
//            own shader), lit by this Sun, on a faint orbit with a trail.
//
// Cost: one draw for each layer plus the Earth's two. The surface shader is
// the expensive one (a 27-cell Worley lookup and two or three value noises
// per pixel); the low detail tier, used on phones where the disc is small,
// drops the finest noise octave, the filaments and half the loop points.

import * as THREE from 'three';
import { earthSpin, eclipticDirection, spinForSubsolar, subsolarLongitude } from './earthModel';
import { EARTH_FRAGMENT, EARTH_VERTEX, HALO_FRAGMENT } from './earthSystem';
import {
  DAY_EARTH_RADIUS, DAY_EARTH_SPIN_MS, DAY_NARROW_FRAMING, DIFFERENTIAL, EARTH_ORBIT_RADIUS, LOOP_SLOTS, SUN_RADIUS,
  distanceReadout, earthDirection, earthLongitude, loopEvent, loopFootpoints, sunScene, sunSpin,
} from './sunModel';

const UP = new THREE.Vector3(0, 1, 0);

/** How far the corona quad reaches, in Sun radii. */
export const CORONA_EXTENT = 3.4;

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
  // F1 and F2 distances to the nearest wandering feature points
  vec2 worley(vec3 p, float t) {
    vec3 i = floor(p), f = fract(p); vec2 d = vec2(8.0);
    for (int z = -1; z <= 1; z++) for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
      vec3 g = vec3(float(x), float(y), float(z)); vec3 h = hash3(i + g);
      vec3 o = g + 0.5 + 0.42 * sin(t * (0.6 + h) + 6.2831 * h) - f;
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

/**
 * The surface. The mesh's local frame is the Sun's body frame (y = the
 * rotation pole), so the turn is applied here, per latitude: each point is
 * sampled where it was `uSpin x rate(latitude)` ago, which is differential
 * rotation for free and keeps the mesh itself still.
 */
const SUN_FRAGMENT = (detail) => `
  #define LOOPS ${LOOP_SLOTS}
  ${detail === 'high' ? '#define HIGH 1' : ''}
  uniform float uSpin; uniform float uTime; uniform vec3 uSeed; uniform float uFade;
  uniform vec3 uFeet[LOOPS * 2]; uniform float uFlare[LOOPS];
  varying vec3 vLocal; varying vec3 vNormal; varying vec3 vView;
  ${NOISE}
  ${RAMP}
  void main() {
    vec3 n = normalize(vNormal); vec3 v = normalize(vView);
    float s = vLocal.y, s2 = s * s;
    float a = -uSpin * (1.0 - ${DIFFERENTIAL.b.toFixed(5)} * s2 - ${DIFFERENTIAL.c.toFixed(5)} * s2 * s2);
    vec3 q = vec3(cos(a) * vLocal.x + sin(a) * vLocal.z, vLocal.y, -sin(a) * vLocal.x + cos(a) * vLocal.z) + uSeed;
    float t = uTime * 0.001;
    // a slow domain warp first, so no cell boundary is a straight polygon edge
    vec3 q2 = q + 0.07 * (vec3(vnoise(q * 5.0 + vec3(t * 0.02)), vnoise(q * 5.0 + 7.3), vnoise(q * 5.0 + 13.1)) - 0.5);
    // granulation: small soft cells whose feature points wander, so they boil instead of sliding
    #ifdef HIGH
      vec2 g = worley(q2 * 46.0, t * 0.6);
      float gran = 1.0 - smoothstep(0.05, 0.85, g.x);
    #else
      float gran = vnoise(q2 * 40.0 + t * 0.3);
    #endif
    // the chromospheric network that 304 angstrom pictures show: broken, fuzzy bright lanes round larger cells
    vec2 w = worley(q2 * 10.0, t * 0.08);
    float net = exp(-pow((w.y - w.x) / 0.24, 2.0)) * (0.35 + 0.65 * vnoise(q * 22.0 + vec3(t * 0.03)));
    // mottling and fine fuzz, so no two patches of the disc read alike
    float mott = vnoise(q * 5.0 + vec3(t * 0.01)) * 0.55 + vnoise(q * 13.0 - vec3(t * 0.02)) * 0.30 + vnoise(q * 31.0 + vec3(t * 0.05)) * 0.15;
    // active regions live in two belts either side of the equator (the royal zones, 5 to 35 degrees)
    float belt = exp(-pow((abs(s) - 0.36) / 0.17, 2.0));
    float act = vnoise(q * 2.4 + vec3(0.0, t * 0.004, 0.0));
    #ifdef HIGH
      act = act * 0.66 + vnoise(q2 * 5.5 - vec3(t * 0.006)) * 0.34;
    #endif
    float region = smoothstep(0.46, 0.80, act) * belt;
    // sunspot groups: small dark knots, umbra inside penumbra, only in the strongest active regions
    float spotField = vnoise(q * 16.0 + 3.7);
    float spot = smoothstep(0.70, 0.82, spotField) * smoothstep(0.45, 0.85, region);
    float umbra = smoothstep(0.80, 0.88, spotField) * smoothstep(0.45, 0.85, region);
    // filaments: a few short, soft dark threads where a ridged noise peaks, outside the active regions
    float filament = 0.0;
    #ifdef HIGH
      float r = 1.0 - abs(2.0 * vnoise(q2 * 3.1 + 11.0) - 1.0);
      filament = smoothstep(0.94, 0.99, r) * (1.0 - region) * smoothstep(0.66, 0.82, vnoise(q * 2.3 + 5.0)) * (0.5 + 0.5 * vnoise(q2 * 24.0));
    #endif
    float heat = 0.30 + 0.08 * gran + 0.13 * net * (0.4 + mott) + 0.26 * (mott - 0.5)
      + region * (0.48 + 0.26 * net + 0.12 * gran) - 0.34 * spot - 0.22 * umbra - 0.12 * filament;
    // flares: a footpoint flashes as its loop is born
    for (int i = 0; i < LOOPS; i++) {
      if (uFlare[i] <= 0.0) continue;
      float d = max(dot(n, uFeet[i * 2]), dot(n, uFeet[i * 2 + 1]));
      heat += uFlare[i] * exp(-(1.0 - d) / 0.00035) * 0.9;
    }
    // the limb: a little darker just inside, then the bright chromospheric rim (304 shows limb brightening)
    float mu = max(dot(n, v), 0.0);
    heat *= 0.74 + 0.26 * pow(mu, 0.45);
    heat += 0.22 * pow(1.0 - mu, 6.0);
    gl_FragColor = vec4(ramp(heat), uFade);
    #include <colorspace_fragment>
  }`;

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
    float flameH = 0.010 + 0.050 * pow(n2(dir * 34.0 + vec2(t * 0.35, uSeedA - t * 0.25)), 2.5) + 0.012 * n2(dir * 90.0 + vec2(t * 1.1, 0.0));
    float fringe = exp(-x / flameH) * (0.55 + 0.45 * n2(dir * 60.0 + vec2(t * 0.9, uSeedA)));
    float streamer = 0.5 + 0.5 * n2(dir * 3.2 + vec2(uSeedA, t * 0.02)) * n2(dir * 7.0 - vec2(t * 0.015, uSeedA));
    float glow = 0.50 * exp(-x * 10.0) + 0.15 * exp(-x * 2.8) * streamer + 0.035 * exp(-x * 0.9);
    float edge = 1.0 - smoothstep(${(CORONA_EXTENT - 1.0).toFixed(1)}, ${CORONA_EXTENT.toFixed(1)}, r);
    // written in display values, not linear: additive layers are tuned by eye on the screen
    vec3 col = vec3(1.0, 0.46, 0.12) * glow + vec3(1.0, 0.66, 0.30) * fringe * 0.55;
    gl_FragColor = vec4(col * edge * uFade, 1.0);
  }`;

/**
 * Glowing gas: every point belongs to one loop slot and has a place along
 * the arc. Points slide from the top of the arc down both legs (gas draining
 * back to the surface, the "coronal rain" seen in loops), the arc's height
 * follows the slot's rise-hang-fall envelope, and an erupting arc's top is
 * flung outward while its legs stay rooted.
 */
const LOOP_VERTEX = `
  #define LOOPS ${LOOP_SLOTS}
  attribute float aLoop; attribute float aU; attribute float aSide; attribute vec3 aJit; attribute float aSize; attribute float aGlow;
  uniform vec3 uA[LOOPS]; uniform vec3 uB[LOOPS]; uniform vec4 uP[LOOPS];
  uniform float uR; uniform float uTime; uniform float uPixelRatio; uniform float uScale; uniform float uFade;
  varying float vAlpha; varying float vHeat;
  void main() {
    int i = int(aLoop + 0.5);
    vec4 P = uP[i];   // height, lift, brightness, eruption
    float flow = fract(aU + uTime * 0.00005 * (0.7 + aGlow));
    float s = 0.5 + aSide * 0.5 * flow;
    float arch = sin(3.14159 * s);
    vec3 dir = normalize(mix(uA[i], uB[i], s));
    float rise = P.x * P.y * pow(arch, 0.65);
    float fling = P.w * pow(arch, 3.0) * 2.6;
    vec3 pos = dir * uR * (1.0 + rise + fling) + aJit * uR * (0.012 + 0.028 * arch + P.w * 0.06);
    vec4 mv = modelViewMatrix * vec4(pos, 1.0);
    vAlpha = uFade * P.z * (0.06 + 0.12 * aGlow) * (1.0 - 0.75 * P.w) * smoothstep(0.0, 0.08, arch);
    vHeat = aGlow * (0.6 + 0.4 * arch);
    gl_PointSize = clamp(aSize * uR * uScale / max(1.0, -mv.z), 1.0, 48.0) * uPixelRatio;
    gl_Position = projectionMatrix * mv;
  }`;
const LOOP_FRAGMENT = `
  varying float vAlpha; varying float vHeat;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    if (d > 0.5) discard;
    float a = exp(-d * d * 16.0) * vAlpha;
    vec3 col = mix(vec3(1.0, 0.40, 0.10), vec3(1.0, 0.74, 0.42), vHeat * vHeat);
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
 * @param {Date} [input.date] the moment the scene is set for (Earth's place, the Sun's axis, the seed).
 * @returns {{kind: 'sun', framing: object, centre: THREE.Vector3, glareRadius: number, update(elapsed: number): void, readout(): string, setPixelRatio(ratio: number): void, setPresence(presence: number): void, dispose(): void}}
 */
export function createSunSystem({ scene, loadTexture, assetBase, pixelRatio, detail = 'high', date = new Date() }) {
  const model = sunScene(date);
  const centre = new THREE.Vector3(model.centre[0], model.centre[1], model.centre[2]);
  const pole = new THREE.Vector3(model.sunPole[0], model.sunPole[1], model.sunPole[2]);
  const root = new THREE.Group();
  root.position.copy(centre);
  scene.add(root);
  const disposables = [];
  const seedA = (model.seed % 997) / 997;

  // ---- the Sun: oriented so its local y is the real rotation pole ----
  const feet = Array.from({ length: LOOP_SLOTS * 2 }, () => new THREE.Vector3());
  const sunMaterial = new THREE.ShaderMaterial({
    uniforms: { uSpin: { value: 0 }, uTime: { value: 0 }, uSeed: { value: new THREE.Vector3(seedA * 41.3, seedA * 17.9 + 3.1, seedA * 29.7 + 7.7) }, uFeet: { value: feet }, uFlare: { value: new Array(LOOP_SLOTS).fill(0) }, uFade: { value: 1 } },
    // transparent only so it can fade as the camera leaves the prologue; it still writes depth, and at full presence alpha is 1
    vertexShader: SUN_VERTEX, fragmentShader: SUN_FRAGMENT(detail), transparent: true,
  });
  const sun = new THREE.Mesh(new THREE.SphereGeometry(SUN_RADIUS, detail === 'high' ? 128 : 72, detail === 'high' ? 96 : 48), sunMaterial);
  sun.quaternion.setFromUnitVectors(UP, pole);
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
  root.add(corona);

  // ---- loops of gas ----
  const perLoop = detail === 'high' ? 220 : 110;
  const count = perLoop * LOOP_SLOTS;
  const rnd = mulberry(model.seed);
  const attrs = { aLoop: new Float32Array(count), aU: new Float32Array(count), aSide: new Float32Array(count), aJit: new Float32Array(count * 3), aSize: new Float32Array(count), aGlow: new Float32Array(count) };
  for (let i = 0; i < count; i++) {
    attrs.aLoop[i] = Math.floor(i / perLoop); attrs.aU[i] = rnd(); attrs.aSide[i] = rnd() < 0.5 ? -1 : 1;
    // a thin strand with a few strays: most points close to the arc's spine
    const spread = rnd() < 0.85 ? 1 : 2.5;
    attrs.aJit[i * 3] = (rnd() - 0.5) * spread; attrs.aJit[i * 3 + 1] = (rnd() - 0.5) * spread; attrs.aJit[i * 3 + 2] = (rnd() - 0.5) * spread;
    // most points are fine grains; about one in six is a broad, faint puff that gives the strand some body
    const puff = rnd() < 0.16;
    attrs.aSize[i] = puff ? 0.09 + rnd() * 0.07 : 0.02 + rnd() * rnd() * 0.05; attrs.aGlow[i] = puff ? rnd() * 0.25 : rnd();
  }
  const loopGeometry = new THREE.BufferGeometry();
  loopGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));   // placed in the shader
  loopGeometry.setAttribute('aLoop', new THREE.BufferAttribute(attrs.aLoop, 1));
  loopGeometry.setAttribute('aU', new THREE.BufferAttribute(attrs.aU, 1));
  loopGeometry.setAttribute('aSide', new THREE.BufferAttribute(attrs.aSide, 1));
  loopGeometry.setAttribute('aJit', new THREE.BufferAttribute(attrs.aJit, 3));
  loopGeometry.setAttribute('aSize', new THREE.BufferAttribute(attrs.aSize, 1));
  loopGeometry.setAttribute('aGlow', new THREE.BufferAttribute(attrs.aGlow, 1));
  const loopA = Array.from({ length: LOOP_SLOTS }, () => new THREE.Vector3(1, 0, 0)), loopB = Array.from({ length: LOOP_SLOTS }, () => new THREE.Vector3(1, 0, 0));
  const loopP = Array.from({ length: LOOP_SLOTS }, () => new THREE.Vector4());
  const loopMaterial = new THREE.ShaderMaterial({
    uniforms: { uA: { value: loopA }, uB: { value: loopB }, uP: { value: loopP }, uR: { value: SUN_RADIUS }, uTime: { value: 0 }, uPixelRatio: { value: pixelRatio }, uScale: { value: 900 }, uFade: { value: 1 } },
    vertexShader: LOOP_VERTEX, fragmentShader: LOOP_FRAGMENT, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const loops = new THREE.Points(loopGeometry, loopMaterial);
  loops.frustumCulled = false; loops.renderOrder = 5;
  root.add(loops);

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
  const axis = new THREE.Vector3(model.earthAxis[0], model.earthAxis[1], model.earthAxis[2]);
  const align = new THREE.Quaternion().setFromUnitVectors(UP, axis);
  const spinQuaternion = new THREE.Quaternion();
  // the real subsolar point faces the Sun at load, as at night
  const sunFromEarth0 = earthDirection(model, 0).map((v) => -v);
  const spinAtLoad = spinForSubsolar(model.earthAxis, sunFromEarth0, model.declination, subsolarLongitude(date));

  disposables.push(sun.geometry, sunMaterial, corona.geometry, coronaMaterial, loopGeometry, loopMaterial, orbitGeometry, orbitMaterial, earth.geometry, earthMaterial, halo.geometry, haloMaterial, black, clear);
  const readout = distanceReadout(date);

  return {
    kind: 'sun',
    /** Narrow-screen framing for this prologue (voyageModel.prologueFraming). */
    framing: DAY_NARROW_FRAMING,
    /** The Sun's centre and radius, for the star field's glare. */
    centre, glareRadius: SUN_RADIUS,
    /** Pose everything for `elapsed` ms since load (a constant holds a still frame: today's Sun, today's Earth). */
    update(elapsed) {
      const t = elapsed;
      sunMaterial.uniforms.uSpin.value = sunSpin(t);
      sunMaterial.uniforms.uTime.value = t;
      coronaMaterial.uniforms.uTime.value = t;
      loopMaterial.uniforms.uTime.value = t;
      const flares = sunMaterial.uniforms.uFlare.value;
      for (let s = 0; s < LOOP_SLOTS; s++) {
        const e = loopEvent(model.seed, s, t);
        const [a, b] = loopFootpoints(e, model, t);
        loopA[s].set(a[0], a[1], a[2]); loopB[s].set(b[0], b[1], b[2]);
        feet[s * 2].copy(loopA[s]); feet[s * 2 + 1].copy(loopB[s]);
        const fling = e.kind === 'eruption' ? Math.max(0, (e.progress - 0.42) / 0.58) ** 1.6 : 0;
        loopP[s].set(e.height, e.lift, e.brightness, fling);
        // the feet flash as the arc is born, harder under an eruption
        flares[s] = e.active ? Math.exp(-e.progress * 9) * (e.kind === 'eruption' ? 1.2 : 0.6) + (e.kind === 'eruption' ? 0.5 * Math.exp(-(((e.progress - 0.45) / 0.08) ** 2)) : 0) : 0;
      }
      const lon = earthLongitude(model, t);
      const d = earthDirection(model, t);
      earth.position.set(centre.x + d[0] * EARTH_ORBIT_RADIUS, centre.y + d[1] * EARTH_ORBIT_RADIUS, centre.z + d[2] * EARTH_ORBIT_RADIUS);
      toSun.set(-d[0], -d[1], -d[2]);
      spinQuaternion.setFromAxisAngle(UP, earthSpin(spinAtLoad, t, DAY_EARTH_SPIN_MS));
      earth.quaternion.copy(align).multiply(spinQuaternion);
      earthMaterial.uniforms.uCloudShift.value = (t / 240000) % 1;
      orbitMaterial.uniforms.uEarthLon.value = (lon * Math.PI) / 180;
    },
    /** Today's true Earth-Sun distance (the scene's clock does not change it). */
    readout() { return readout; },
    setPixelRatio(ratio) { loopMaterial.uniforms.uPixelRatio.value = ratio; },
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
      for (const d of disposables) d.dispose?.();
    },
  };
}

/** A small seeded generator for the particle layout (stable per date). */
function mulberry(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
