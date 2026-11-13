// src/components/admin/Voyage/earthSystem.js
//
// The opening scene in Three.js: Earth with NASA's day map, city lights on
// the night side, drifting clouds, a twilight band along the terminator and a
// blue atmosphere; the Moon on a stylised orbit lit by the same Sun; a few
// satellites in low orbit. All directions, tilts and tempos come from
// earthModel.js; this file only builds meshes and applies the numbers each
// frame.

import * as THREE from 'three';
import {
  EARTH_RADIUS, MOON_RADIUS, earthScene, earthSpin, moonPosition, overReadout, satelliteOrbits, satellitePosition,
} from './earthModel';

const UP = new THREE.Vector3(0, 1, 0);

const EARTH_VERTEX = `
  varying vec2 vUv; varying vec3 vNormal; varying vec3 vView;
  void main() {
    vUv = uv;
    vec4 world = modelMatrix * vec4(position, 1.0);
    vNormal = normalize(mat3(modelMatrix) * normal);
    vView = cameraPosition - world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }`;
/**
 * Day map where the Sun shines, city lights where it does not, clouds over
 * both (lit by day, dimming the lights by night), a warm twilight band at the
 * terminator, and a blue limb that is strong on the day side and faint on the
 * night side. Colours are in linear light; the last line encodes for the screen.
 */
const EARTH_FRAGMENT = `
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
    float twilight = exp(-pow(lit / 0.14, 2.0));
    vec3 color = mix(city + earthshine, surface, dayMix) + twilight * vec3(0.9, 0.42, 0.14) * 0.35 * (1.0 - cloud * 0.4);
    float rim = pow(1.0 - max(dot(n, v), 0.0), 3.0);
    color += rim * vec3(0.30, 0.55, 1.0) * (0.10 + 0.9 * smoothstep(-0.3, 0.35, lit));
    gl_FragColor = vec4(color, 1.0);
    #include <colorspace_fragment>
  }`;
/** A halo just outside the limb on a slightly larger back-facing sphere, brightest where the Sun lights the air. */
const HALO_FRAGMENT = `
  uniform vec3 uSun; varying vec3 vNormal; varying vec3 vView;
  void main() {
    vec3 n = normalize(vNormal); vec3 v = normalize(vView);
    float toward = clamp(abs(dot(n, v)) / 0.42, 0.0, 1.0);       // 1 at the Earth's limb, 0 at the outer edge of the halo
    float sunlit = 0.12 + 0.88 * smoothstep(-0.35, 0.3, dot(n, uSun));
    float a = pow(toward, 2.6) * sunlit * 0.55;
    gl_FragColor = vec4(vec3(0.32, 0.56, 1.0) * a, a);
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
 * @returns {{group: THREE.Group, scene: object, update(elapsed: number): void, readout(elapsed: number, viewer: THREE.Vector3): string, dispose(): void}}
 */
export function createEarthSystem({ scene, loadTexture, assetBase, pixelRatio, satellites = 9, date = new Date() }) {
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

  // ---- Moon, lit by the same Sun ----
  const moonMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, metalness: 0 });
  loadTexture(`${assetBase}earth/moon-color.webp`, (t) => { moonMaterial.map = t; moonMaterial.needsUpdate = true; });
  const moon = new THREE.Mesh(new THREE.SphereGeometry(MOON_RADIUS, 48, 32), moonMaterial);
  scene.add(moon);
  const sunlight = new THREE.DirectionalLight(0xfff4e6, 2.6);
  sunlight.position.copy(sun).multiplyScalar(4000).add(group.position); sunlight.target = earth;
  scene.add(sunlight);
  const fill = new THREE.AmbientLight(0x9fb4d8, 0.55);   // so the Moon's night side still reads as a disc
  scene.add(fill);

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

  disposables.push(earth.geometry, earthMaterial, halo.geometry, haloMaterial, moon.geometry, moonMaterial, satGeometry, satMaterial, black, clear);
  const centre = group.position.clone();

  return {
    group, scene: model,
    /** Pose everything for `elapsed` ms since load (pass a constant to hold a still frame). */
    update(elapsed) {
      spinQuaternion.setFromAxisAngle(UP, earthSpin(model.spinAtLoad, elapsed));
      earth.quaternion.copy(align).multiply(spinQuaternion);
      earthMaterial.uniforms.uCloudShift.value = (elapsed / 900000) % 1;   // clouds drift west to east over the ground
      const m = moonPosition(model, elapsed);
      moon.position.set(m[0], m[1], m[2]);
      moon.lookAt(centre); moon.rotateY(-Math.PI / 2);   // the near side (longitude 0 of the map) faces Earth
      for (let i = 0; i < orbits.length; i++) { const p = satellitePosition(orbits[i], elapsed, model); satPositions[i * 3] = p[0]; satPositions[i * 3 + 1] = p[1]; satPositions[i * 3 + 2] = p[2]; }
      satGeometry.attributes.position.needsUpdate = true;
      satMaterial.uniforms.uTime.value = elapsed;
    },
    /** The city passing under the viewer and its time on the scene's clock. */
    readout(elapsed, viewer) { return overReadout(model, elapsed, [viewer.x, viewer.y, viewer.z], date); },
    dispose() { for (const d of disposables) d.dispose?.(); },
  };
}
