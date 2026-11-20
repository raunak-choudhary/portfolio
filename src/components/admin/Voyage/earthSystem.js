// src/components/admin/Voyage/earthSystem.js
//
// The opening scene in Three.js: Earth with NASA's day map, city lights on
// the night side, drifting clouds, a twilight band along the terminator and a
// blue atmosphere; the Moon, starting from tonight's true place and phase on
// a stylised orbit, lit only by the same Sun and a little earthshine; a few
// satellites in low orbit. All directions, tilts and tempos come from
// earthModel.js; this file only builds meshes and applies the numbers each
// frame.

import * as THREE from 'three';
import {
  EARTH_RADIUS, MOON_ORBIT_RADIUS, MOON_RADIUS, earthScene, earthSpin, earthshineFactor, moonBasis, moonDirection, overReadout, satelliteOrbits, satellitePosition,
} from './earthModel';
import { EARTHLIGHT, EARTHSHINE, RELIEF_EXAGGERATION, RELIEF_GAIN, SUNLIGHT } from './moonShading';

export { EARTHSHINE };

const UP = new THREE.Vector3(0, 1, 0);

export const EARTH_VERTEX = `
  varying vec2 vUv; varying vec3 vNormal; varying vec3 vView;
  void main() {
    vUv = uv;
    vec4 world = modelMatrix * vec4(position, 1.0);
    vNormal = normalize(mat3(modelMatrix) * normal);
    vView = cameraPosition - world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }`;
/**
 * The twilight band in units of N.L (the cosine of the Sun's angle from the
 * zenith): its Gaussian half-width, and how far it sits on the night side.
 * Exported so a test can hold the band narrow.
 */
export const TWILIGHT_WIDTH = 0.045;
export const TWILIGHT_SHIFT = 0.02;
/**
 * Day map where the Sun shines, city lights where it does not, clouds over
 * both (lit by day, dimming the lights by night), a warm twilight band at the
 * terminator, and a blue limb that is strong on the day side and faint on the
 * night side. Colours are in linear light; the last line encodes for the screen.
 */
export const EARTH_FRAGMENT = `
  #define TWILIGHT_WIDTH ${TWILIGHT_WIDTH.toFixed(3)}
  #define TWILIGHT_SHIFT ${TWILIGHT_SHIFT.toFixed(3)}
  uniform sampler2D uDay; uniform sampler2D uNight; uniform sampler2D uClouds; uniform vec3 uSun; uniform float uCloudShift;
  varying vec2 vUv; varying vec3 vNormal; varying vec3 vView;
  void main() {
    vec3 n = normalize(vNormal); vec3 v = normalize(vView);
    float lit = dot(n, uSun);
    vec3 day = texture2D(uDay, vUv).rgb;
    vec3 lights = texture2D(uNight, vUv).rgb;
    vec4 ct = texture2D(uClouds, vec2(fract(vUv.x + uCloudShift), vUv.y));
    float cloud = ct.r * ct.a;
    float dayMix = smoothstep(-0.08, 0.22, lit);
    vec3 surface = mix(day, vec3(0.95, 0.96, 1.0), cloud * 0.9) * (0.06 + 1.1 * max(lit, 0.0));
    vec3 city = lights * vec3(1.3, 1.05, 0.75) * 1.7 * (1.0 - cloud * 0.65);
    vec3 earthshine = (day * 0.03 + vec3(cloud) * 0.03) * (1.0 - cloud * 0.3);
    // Twilight is sunlight reddened on its long path through the air, so it
    // is a thin strip hugging the terminator, a little on the night side, and
    // strongest toward the limb where the line of sight crosses the most air.
    // Its width is set in units of N.L, so it stays the same share of the disc
    // at every screen size (a band of +-0.14 read as a wide orange stripe).
    // A bright core plus a faint, wider skirt so it reads as a glow, not a painted line.
    float core = exp(-pow((lit + TWILIGHT_SHIFT) / TWILIGHT_WIDTH, 2.0));
    float skirt = exp(-pow((lit + TWILIGHT_SHIFT) / (TWILIGHT_WIDTH * 2.4), 2.0));
    float twilight = (core * 0.30 + skirt * 0.10) * (0.5 + 0.5 * pow(1.0 - max(dot(n, v), 0.0), 1.5));
    vec3 color = mix(city + earthshine, surface, dayMix) + twilight * vec3(0.95, 0.44, 0.15) * (1.0 - cloud * 0.4);
    float rim = pow(1.0 - max(dot(n, v), 0.0), 3.0);
    color += rim * vec3(0.30, 0.55, 1.0) * (0.10 + 0.9 * smoothstep(-0.3, 0.35, lit));
    gl_FragColor = vec4(color, 1.0);
    #include <colorspace_fragment>
  }`;
/** A halo just outside the limb on a slightly larger back-facing sphere, brightest where the Sun lights the air. */
export const HALO_FRAGMENT = `
  uniform vec3 uSun; varying vec3 vNormal; varying vec3 vView;
  void main() {
    vec3 n = normalize(vNormal); vec3 v = normalize(vView);
    float toward = clamp(abs(dot(n, v)) / 0.42, 0.0, 1.0);       // 1 at the Earth's limb, 0 at the outer edge of the halo
    float sunlit = 0.12 + 0.88 * smoothstep(-0.35, 0.3, dot(n, uSun));
    float a = pow(toward, 2.6) * sunlit * 0.55;
    gl_FragColor = vec4(vec3(0.32, 0.56, 1.0) * a, a);
    #include <colorspace_fragment>
  }`;
/** The Moon's map tiers: 2048 px wide where the screen is wide, 1024 px on phones (the disc is under 200 device pixels either way). */
export const MOON_TIERS = Object.freeze([1024, 2048]);
/**
 * The Moon's surface: the LROC colour map lit by one Sun with the Lunar-Lambert
 * law (McEwen 1991), a mix of Lommel-Seeliger, which keeps the full Moon flat
 * to the limb with no darkening, and Lambert, which takes over at large phase
 * angles; the weight L(α) is McEwen's cubic. No specular term, since the
 * regolith has none. The normal is tilted by the LOLA relief map in the local
 * east and north frame, so craters and ridges catch the light along the
 * terminator. The night side gets only earthshine from the Earth's direction.
 */
export const MOON_FRAGMENT = `
  #define RELIEF_SCALE ${(RELIEF_EXAGGERATION / RELIEF_GAIN).toFixed(4)}
  #define SUNLIGHT vec3(${SUNLIGHT.map((v) => v.toFixed(3)).join(', ')})
  #define EARTHLIGHT vec3(${EARTHLIGHT.map((v) => v.toFixed(3)).join(', ')})
  uniform sampler2D uAlbedo; uniform sampler2D uRelief; uniform vec3 uSun; uniform vec3 uPole; uniform vec3 uEarth; uniform float uEarthshine;
  varying vec2 vUv; varying vec3 vNormal; varying vec3 vView;
  void main() {
    vec3 n = normalize(vNormal); vec3 v = normalize(vView);
    // local frame on the sphere: east along the parallels, north along the meridians
    vec3 east = cross(uPole, n); float el = length(east);
    east = el > 1e-4 ? east / el : normalize(cross(vec3(0.0, 0.0, 1.0), n));
    vec3 north = cross(n, east);
    vec2 tilt = (texture2D(uRelief, vUv).rg * 2.0 - 1.0) * RELIEF_SCALE;
    vec3 bumped = normalize(n * sqrt(max(0.0, 1.0 - dot(tilt, tilt))) + east * tilt.x + north * tilt.y);
    float mu0 = max(dot(bumped, uSun), 0.0), mu = max(dot(n, v), 0.0);
    // the terminator follows the sphere, not the bumps, so it stays sharp and round
    mu0 *= smoothstep(-0.02, 0.03, dot(n, uSun));
    float alpha = degrees(acos(clamp(dot(uSun, v), -1.0, 1.0)));
    float L = clamp(1.0 - 0.019 * alpha + 2.42e-4 * alpha * alpha - 1.46e-6 * alpha * alpha * alpha, 0.0, 1.0);
    float sunlit = L * 2.0 * mu0 / (mu0 + mu + 1e-4) + (1.0 - L) * mu0;
    float earthlit = uEarthshine * max(dot(n, uEarth), 0.0);
    vec3 albedo = texture2D(uAlbedo, vUv).rgb;
    vec3 color = albedo * (SUNLIGHT * sunlit + EARTHLIGHT * earthlit);
    gl_FragColor = vec4(color, 1.0);
    #include <colorspace_fragment>
  }`;
const SATELLITE_VERTEX = `
  attribute float aPhase; uniform float uTime; uniform float uPixelRatio; varying float vTwinkle;
  void main() { vTwinkle = 0.7 + 0.3 * sin(uTime * 0.004 + aPhase); vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = clamp(2600.0 / max(1.0, -mv.z), 1.5, 4.0) * uPixelRatio; gl_Position = projectionMatrix * mv; }`;
const SATELLITE_FRAGMENT = `
  varying float vTwinkle;
  void main() { float d = length(gl_PointCoord - 0.5); if (d > 0.5) discard; gl_FragColor = vec4(vec3(0.95, 0.97, 1.0), smoothstep(0.5, 0.05, d) * vTwinkle); }`;

/**
 * Build the Earth system into a scene.
 * @param {object} input
 * @param {THREE.Scene} input.scene
 * @param {(url: string, onLoad: (t: THREE.Texture) => void) => void} input.loadTexture same-origin loader that sets the colour space.
 * @param {string} input.assetBase e.g. "/admin/sky/".
 * @param {number} input.pixelRatio
 * @param {number} [input.satellites] how many satellites to draw.
 * @param {Date} [input.date] the moment the scene is set for (real Sun, tilt and Moon phase).
 * @param {number} [input.moonTier] width of the Moon maps, one of MOON_TIERS.
 * @returns {{group: THREE.Group, scene: object, update(elapsed: number): void, readout(elapsed: number, viewer: THREE.Vector3): string, setPixelRatio(ratio: number): void, dispose(): void}}
 */
export function createEarthSystem({ scene, loadTexture, assetBase, pixelRatio, satellites = 9, date = new Date(), moonTier = 2048 }) {
  const model = earthScene(date);
  const group = new THREE.Group();
  group.position.set(model.centre[0], model.centre[1], model.centre[2]);
  scene.add(group);
  const disposables = [];
  const sun = new THREE.Vector3(model.sunDir[0], model.sunDir[1], model.sunDir[2]);
  const axis = new THREE.Vector3(model.axis[0], model.axis[1], model.axis[2]);

  // ---- Earth ----
  const earthMaterial = new THREE.ShaderMaterial({
    uniforms: { uDay: { value: null }, uNight: { value: null }, uClouds: { value: null }, uSun: { value: sun }, uCloudShift: { value: 0 } },
    vertexShader: EARTH_VERTEX, fragmentShader: EARTH_FRAGMENT,
  });
  const black = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1); black.needsUpdate = true;
  const clear = new THREE.DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1); clear.needsUpdate = true;
  earthMaterial.uniforms.uDay.value = black; earthMaterial.uniforms.uNight.value = black; earthMaterial.uniforms.uClouds.value = clear;
  loadTexture(`${assetBase}earth/earth-day.webp`, (t) => { earthMaterial.uniforms.uDay.value = t; });
  loadTexture(`${assetBase}earth/earth-night.webp`, (t) => { earthMaterial.uniforms.uNight.value = t; });
  loadTexture(`${assetBase}earth/earth-clouds.webp`, (t) => { t.wrapS = THREE.RepeatWrapping; earthMaterial.uniforms.uClouds.value = t; });
  const earth = new THREE.Mesh(new THREE.SphereGeometry(EARTH_RADIUS, 96, 64), earthMaterial);
  earth.renderOrder = 1;
  group.add(earth);
  const align = new THREE.Quaternion().setFromUnitVectors(UP, axis);
  const spinQuaternion = new THREE.Quaternion();

  // ---- atmosphere halo ----
  const haloMaterial = new THREE.ShaderMaterial({ uniforms: { uSun: { value: sun } }, vertexShader: EARTH_VERTEX, fragmentShader: HALO_FRAGMENT, side: THREE.BackSide, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const halo = new THREE.Mesh(new THREE.SphereGeometry(EARTH_RADIUS * 1.10, 64, 48), haloMaterial);
  halo.renderOrder = 4;
  group.add(halo);

  // ---- Moon, lit by the same Sun and nothing else ----
  // Stand-ins until the maps land, so the program is compiled once: mid grey, and a flat relief.
  const grey = new THREE.DataTexture(new Uint8Array([128, 128, 128, 255]), 1, 1); grey.colorSpace = THREE.SRGBColorSpace; grey.needsUpdate = true;
  const flat = new THREE.DataTexture(new Uint8Array([128, 128, 128, 255]), 1, 1); flat.needsUpdate = true;
  const moonMaterial = new THREE.ShaderMaterial({
    uniforms: { uAlbedo: { value: grey }, uRelief: { value: flat }, uSun: { value: sun }, uPole: { value: new THREE.Vector3(...model.moonPole) }, uEarth: { value: new THREE.Vector3() }, uEarthshine: { value: 0 } },
    vertexShader: EARTH_VERTEX, fragmentShader: MOON_FRAGMENT,
  });
  const tier = MOON_TIERS.includes(moonTier) ? moonTier : 2048;
  loadTexture(`${assetBase}moon/moon-color-${tier}.webp`, (t) => { moonMaterial.uniforms.uAlbedo.value = t; });
  // the relief holds directions, not colours: read as stored, before the upload
  loadTexture(`${assetBase}moon/moon-relief-${tier}.webp`, (t) => { t.colorSpace = THREE.NoColorSpace; moonMaterial.uniforms.uRelief.value = t; });
  const moon = new THREE.Mesh(new THREE.SphereGeometry(MOON_RADIUS, 64, 48), moonMaterial);
  scene.add(moon);
  const basis = new THREE.Matrix4(), axisX = new THREE.Vector3(), axisY = new THREE.Vector3(), axisZ = new THREE.Vector3();

  // ---- satellites ----
  const orbits = satelliteOrbits(satellites);
  const satGeometry = new THREE.BufferGeometry();
  const satPositions = new Float32Array(orbits.length * 3);
  satGeometry.setAttribute('position', new THREE.BufferAttribute(satPositions, 3));
  satGeometry.setAttribute('aPhase', new THREE.Float32BufferAttribute(orbits.map((o) => o.phase), 1));
  const satMaterial = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, uniforms: { uTime: { value: 0 }, uPixelRatio: { value: pixelRatio } }, vertexShader: SATELLITE_VERTEX, fragmentShader: SATELLITE_FRAGMENT });
  const sats = new THREE.Points(satGeometry, satMaterial);
  sats.renderOrder = 3; sats.frustumCulled = false;
  scene.add(sats);

  disposables.push(earth.geometry, earthMaterial, halo.geometry, haloMaterial, moon.geometry, moonMaterial, satGeometry, satMaterial, black, clear, grey, flat);
  const centre = group.position.clone();

  return {
    group, scene: model,
    /** Pose everything for `elapsed` ms since load (pass a constant to hold a still frame). */
    update(elapsed) {
      spinQuaternion.setFromAxisAngle(UP, earthSpin(model.spinAtLoad, elapsed));
      earth.quaternion.copy(align).multiply(spinQuaternion);
      earthMaterial.uniforms.uCloudShift.value = (elapsed / 900000) % 1;   // clouds drift west to east over the ground
      const d = moonDirection(model, elapsed), b = moonBasis(model, d);
      moon.position.set(centre.x + d[0] * MOON_ORBIT_RADIUS, centre.y + d[1] * MOON_ORBIT_RADIUS, centre.z + d[2] * MOON_ORBIT_RADIUS);
      moon.quaternion.setFromRotationMatrix(basis.makeBasis(axisX.set(...b.x), axisY.set(...b.y), axisZ.set(...b.z)));   // the near side faces Earth
      moonMaterial.uniforms.uEarth.value.set(-d[0], -d[1], -d[2]);
      moonMaterial.uniforms.uEarthshine.value = EARTHSHINE * earthshineFactor(model.sunDir, d);
      for (let i = 0; i < orbits.length; i++) { const p = satellitePosition(orbits[i], elapsed, model); satPositions[i * 3] = p[0]; satPositions[i * 3 + 1] = p[1]; satPositions[i * 3 + 2] = p[2]; }
      satGeometry.attributes.position.needsUpdate = true;
      satMaterial.uniforms.uTime.value = elapsed;
    },
    /** The city passing under the viewer and its time on the scene's clock. */
    readout(elapsed, viewer) { return overReadout(model, elapsed, [viewer.x, viewer.y, viewer.z], date); },
    /** Satellite points are sized in device pixels; keep them the same size on screen when the canvas resolution changes. */
    setPixelRatio(ratio) { satMaterial.uniforms.uPixelRatio.value = ratio; },
    /** Takes everything out of the scene and frees it, so the day scene can replace it when the theme changes. */
    dispose() {
      scene.remove(group, moon, sats);
      for (const d of disposables) d.dispose?.();
    },
  };
}
