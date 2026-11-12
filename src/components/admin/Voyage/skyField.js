// src/components/admin/Voyage/skyField.js
//
// The 3D field the voyage travels through, built with Three.js: a seeded star
// field in three depth bands, one constellation group per chapter (lines drawn
// by scroll, star points by magnitude, the atlas drawing on a plane), real
// deep-sky photographs beside the route under additive blending with faded
// edges, and a procedural black hole with a lensed accretion disc. Night and
// dawn palettes. The page owns the frame loop and passes the scroll fraction.
//
// Textures are same-origin files under public/admin/sky; nothing external.

import * as THREE from 'three';
import { CHAPTERS } from './chapters';
import { PALETTES, buildFigureGeometry, buildStarField, drawRangeFor, drawingPlacement, paletteForTheme } from './skyFieldMath';
import { ANCHORS, blackHolePlacement, cameraTarget, deepSkyLayout, figureState, routePosition } from './voyageModel';

const STAR_VERTEX = `
  attribute float aSize; varying vec3 vColor; uniform float uPixelRatio;
  varying float vNear;
  void main() { vColor = color; vec4 mv = modelViewMatrix * vec4(position, 1.0); float depth = max(1.0, -mv.z); vNear = smoothstep(40.0, 140.0, depth); gl_PointSize = clamp(aSize * (900.0 / depth), 0.6, 7.0) * uPixelRatio; gl_Position = projectionMatrix * mv; }`;
const STAR_FRAGMENT = `
  uniform float uAlpha; varying vec3 vColor; varying float vNear;
  void main() { float d = length(gl_PointCoord - 0.5); if (d > 0.5) discard; gl_FragColor = vec4(vColor, smoothstep(0.5, 0.1, d) * uAlpha * vNear); }`;
const POINT_VERTEX = `
  attribute float aSize; uniform float uPixelRatio;
  void main() { vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = clamp(aSize * (700.0 / max(1.0, -mv.z)), 2.0, 28.0) * uPixelRatio; gl_Position = projectionMatrix * mv; }`;
const POINT_FRAGMENT = `
  uniform float uAlpha; uniform vec3 uColor;
  void main() { float d = length(gl_PointCoord - 0.5); if (d > 0.5) discard; gl_FragColor = vec4(uColor, smoothstep(0.5, 0.0, d) * uAlpha); }`;
/** A photograph with its edges faded to nothing, so a bright-background nebula never shows as a rectangle. */
const DEEP_VERTEX = 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';
const DEEP_FRAGMENT = `
  uniform sampler2D uMap; uniform float uAlpha; varying vec2 vUv;
  void main() {
    vec2 c = (vUv - 0.5) * 2.0;
    float edge = 1.0 - smoothstep(0.55, 1.0, length(c));          // radial fade
    float box = smoothstep(0.0, 0.18, 1.0 - abs(c.x)) * smoothstep(0.0, 0.18, 1.0 - abs(c.y));   // and a soft frame
    vec4 t = texture2D(uMap, vUv);
    gl_FragColor = vec4(t.rgb * uAlpha * edge * box, 1.0);
  }`;
/** Gargantua-style black hole: shadow, photon ring, a thin disc seen edge-on with the far side lensed over the top. */
const HOLE_VERTEX = 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';
const HOLE_FRAGMENT = `
  uniform float uTime; uniform float uAlpha; varying vec2 vUv;
  vec3 heat(float t) { return mix(vec3(0.55, 0.12, 0.02), mix(vec3(1.0, 0.55, 0.15), vec3(1.0, 0.96, 0.85), smoothstep(0.5, 1.0, t)), smoothstep(0.0, 0.6, t)); }
  void main() {
    vec2 p = (vUv - 0.5) * 2.0;
    float d = length(p);
    float shadow = 1.0 - smoothstep(0.40, 0.44, d);
    float ring = exp(-pow((d - 0.465) / 0.022, 2.0));
    // primary disc image: a thin ellipse, near side (lower half) in front of the shadow
    vec2 q = vec2(p.x, p.y / 0.17); float rd = length(q);
    float band = smoothstep(0.52, 0.66, rd) * pow(1.0 - smoothstep(0.66, 2.3, rd), 1.6);   // bright at the inner edge, thinning outward
    float grain = 0.88 + 0.12 * sin(rd * 26.0 + atan(q.y, q.x) * 5.0 + uTime * 0.6);        // faint streaks in the gas
    float doppler = clamp(1.0 - 0.6 * (p.x / max(rd, 0.3)), 0.35, 1.5);                      // the side rotating toward us is brighter
    float behind = step(0.0, p.y) * (1.0 - smoothstep(0.42, 0.50, d)); // far side hidden behind the shadow
    float disc = band * grain * doppler * (1.0 - behind) * 0.85;
    // secondary (lensed) images: an arch above and a thinner one below
    float upper = smoothstep(0.47, 0.52, d) * (1.0 - smoothstep(0.62, 0.95, d)) * max(0.0, p.y / max(d, 0.001));
    float lower = smoothstep(0.47, 0.50, d) * (1.0 - smoothstep(0.54, 0.66, d)) * max(0.0, -p.y / max(d, 0.001)) * 0.6;
    float flicker = 0.92 + 0.08 * sin(uTime * 2.1 + p.x * 7.0) * sin(uTime * 1.3 + p.y * 9.0);
    float glow = (disc + upper * 0.9 + lower + ring * 1.6) * flicker;
    float halo = exp(-pow(max(0.0, d - 0.5) / 0.6, 2.0)) * 0.12;
    vec3 color = heat(clamp(glow, 0.0, 1.0)) * min(glow, 1.15) + vec3(1.0, 0.8, 0.6) * halo;
    float alpha = max(shadow, clamp(glow + halo, 0.0, 1.0)) * uAlpha;
    gl_FragColor = vec4(mix(color, vec3(0.0), shadow), alpha);
  }`;

/**
 * @param {object} input
 * @param {HTMLCanvasElement} input.canvas
 * @param {Array} input.figures figures.json entries.
 * @param {Array} input.deepManifest public/admin/sky/deep/manifest.json entries.
 * @param {string} input.assetBase URL prefix, e.g. "/admin/sky/".
 * @param {{stars: number, pixelRatio: number, fly: boolean}} input.quality from qualityFor.
 * @param {'dark'|'light'} input.theme
 * @param {boolean} [input.smallTextures] use the 512 px photographs.
 */
export function createSkyField({ canvas, figures, deepManifest, assetBase, quality, theme, smallTextures = false }) {
  // preserveDrawingBuffer lets screenshots (the verification script, the owner's own captures) read the frame.
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance', preserveDrawingBuffer: true });
  renderer.setPixelRatio(quality.pixelRatio);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(60, 1, 1, 9000);
  const loader = new THREE.TextureLoader();
  const loadTexture = (url, onLoad) => loader.load(url, (t) => { t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; onLoad(t); });
  const byId = Object.fromEntries(figures.map((f) => [f.id, f]));
  let palette = paletteForTheme(theme), fly = quality.fly;
  const disposables = [];

  // ---- star field ----
  const { positions, colors, sizes } = buildStarField(quality.stars);
  const starGeometry = new THREE.BufferGeometry();
  starGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  starGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  starGeometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
  const starMaterial = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, vertexColors: true, uniforms: { uAlpha: { value: 1 }, uPixelRatio: { value: quality.pixelRatio } }, vertexShader: STAR_VERTEX, fragmentShader: STAR_FRAGMENT });
  scene.add(new THREE.Points(starGeometry, starMaterial));
  disposables.push(starGeometry, starMaterial);

  // ---- one constellation per chapter ----
  const groups = CHAPTERS.map((chapter, i) => {
    const figure = byId[chapter.constellation];
    const group = new THREE.Group();
    const a = ANCHORS[i]; group.position.set(a.x, a.y, a.z);
    scene.add(group);
    if (!figure) return { group, lines: null };
    const geo = buildFigureGeometry(figure);
    const lineGeometry = new THREE.BufferGeometry(); lineGeometry.setAttribute('position', new THREE.Float32BufferAttribute(geo.segments, 3)); lineGeometry.setDrawRange(0, 0);
    const lineMaterial = new THREE.LineBasicMaterial({ color: palette.line, transparent: true, opacity: 0.85 });
    const lines = new THREE.LineSegments(lineGeometry, lineMaterial); group.add(lines);
    const pointGeometry = new THREE.BufferGeometry(); pointGeometry.setAttribute('position', new THREE.Float32BufferAttribute(geo.points, 3)); pointGeometry.setAttribute('aSize', new THREE.Float32BufferAttribute(geo.sizes, 1));
    const pointMaterial = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, uniforms: { uAlpha: { value: 0 }, uColor: { value: new THREE.Color(palette.point) }, uPixelRatio: { value: quality.pixelRatio } }, vertexShader: POINT_VERTEX, fragmentShader: POINT_FRAGMENT });
    group.add(new THREE.Points(pointGeometry, pointMaterial));
    let art = null;
    const place = drawingPlacement(figure);
    if (place) {
      const artMaterial = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, color: palette.art, depthWrite: false });
      loadTexture(`${assetBase}art/${figure.art.file}`, (t) => { artMaterial.map = t; artMaterial.needsUpdate = true; });
      art = new THREE.Mesh(new THREE.PlaneGeometry(place.width, place.height), artMaterial);
      art.position.set(place.x, place.y, -2); art.rotation.z = place.rotation; group.add(art);
      disposables.push(art.geometry, artMaterial);
    }
    disposables.push(lineGeometry, lineMaterial, pointGeometry, pointMaterial);
    return { group, lines, lineMaterial, pointMaterial, art, segmentVertices: geo.segments.length / 3 };
  });

  // ---- deep-sky photographs ----
  const deep = deepSkyLayout(deepManifest).map((item) => {
    const material = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { uMap: { value: null }, uAlpha: { value: 0 } }, vertexShader: DEEP_VERTEX, fragmentShader: DEEP_FRAGMENT });
    loadTexture(`${assetBase}deep/${smallTextures ? item.image.small : item.image.file}`, (t) => { material.uniforms.uMap.value = t; entry.loaded = true; });
    const entry = { loaded: false };
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(item.width, item.height), material);
    mesh.userData.entry = entry;
    mesh.position.set(item.x, item.y, item.z);
    mesh.rotation.z = (item.side === 'left' ? -1 : 1) * 0.12;
    scene.add(mesh);
    disposables.push(mesh.geometry, material);
    return { mesh, baseY: item.y, baseRotation: mesh.rotation.z, speed: 0.00004 + (item.slug.length % 5) * 0.00001, loaded: false };
  });

  // ---- the black hole ----
  const hole = blackHolePlacement();
  const holeMaterial = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, uniforms: { uTime: { value: 0 }, uAlpha: { value: 1 } }, vertexShader: HOLE_VERTEX, fragmentShader: HOLE_FRAGMENT });
  const holeMesh = new THREE.Mesh(new THREE.PlaneGeometry(hole.radius * 6, hole.radius * 6), holeMaterial);
  holeMesh.position.set(hole.x, hole.y, hole.z); holeMesh.rotation.z = -0.35;
  scene.add(holeMesh);
  disposables.push(holeMesh.geometry, holeMaterial);

  const applyPalette = () => {
    scene.background = new THREE.Color(palette.background);
    scene.fog = new THREE.Fog(palette.background, palette.fogNear, palette.fogFar);
    starMaterial.uniforms.uAlpha.value = palette.starAlpha;
    for (const g of groups) { if (!g.lines) continue; g.lineMaterial.color.set(palette.line); g.pointMaterial.uniforms.uColor.value.set(palette.point); if (g.art) g.art.material.color.set(palette.art); }
  };
  /** 1 when an object is near the camera, fading to 0 when it is far ahead or already behind. */
  const emergence = (objectZ, reach) => { const ahead = cameraPosition.z - objectZ; if (ahead < -400) return 0; return Math.max(0, Math.min(1, (reach - ahead) / (reach * 0.55))); };
  applyPalette();

  const cameraPosition = new THREE.Vector3(0, 20, ANCHORS[0].z + 520), cameraLook = new THREE.Vector3(ANCHORS[0].x, ANCHORS[0].y, ANCHORS[0].z);
  const wantPosition = new THREE.Vector3(), wantLook = new THREE.Vector3();

  return {
    resize(width, height) { renderer.setSize(width, height, false); camera.aspect = width / Math.max(1, height); camera.updateProjectionMatrix(); },
    setTheme(next) { palette = paletteForTheme(next); applyPalette(); },
    setFly(next) { fly = !!next; },
    /**
     * Paint one frame. `scrollFraction` is 0..1 over the page; `now` is the animation clock in ms.
     * @returns {{index: number, f: number}} the route position, for the page's stage and rail state.
     */
    frame(scrollFraction, now) {
      const route = routePosition(scrollFraction);
      const target = cameraTarget(route, fly);
      wantPosition.set(target.position.x, target.position.y, target.position.z); wantLook.set(target.look.x, target.look.y, target.look.z);
      const ease = fly ? 0.08 : 1;
      cameraPosition.lerp(wantPosition, ease); cameraLook.lerp(wantLook, ease);
      camera.position.copy(cameraPosition); camera.lookAt(cameraLook);
      groups.forEach((g, i) => {
        if (!g.lines) return;
        const state = figureState(i, route.f);
        g.lines.geometry.setDrawRange(0, drawRangeFor(g.segmentVertices, state.draw));
        g.pointMaterial.uniforms.uAlpha.value = state.pointAlpha;
        if (g.art) g.art.material.opacity = state.artAlpha * palette.artAlpha;
        g.group.rotation.y = state.turn;
      });
      for (const d of deep) {
        d.mesh.position.y = d.baseY + Math.sin(now * d.speed) * 14; d.mesh.rotation.z = d.baseRotation + Math.sin(now * d.speed * 0.6) * 0.02;
        d.mesh.material.uniforms.uAlpha.value = d.mesh.userData.entry.loaded ? palette.deepAlpha * emergence(d.mesh.position.z, 1700) : 0;
        d.mesh.visible = d.mesh.material.uniforms.uAlpha.value > 0.01;
      }
      holeMaterial.uniforms.uTime.value = now / 1000;
      holeMaterial.uniforms.uAlpha.value = emergence(holeMesh.position.z, 3200);
      holeMesh.visible = holeMaterial.uniforms.uAlpha.value > 0.01;
      renderer.render(scene, camera);
      return { index: route.index, f: route.f };
    },
    dispose() { for (const d of disposables) d.dispose?.(); renderer.dispose(); },
  };
}

/** Whether this browser can give us a WebGL context (probe on a throwaway canvas). */
export function webglAvailable(doc = document) {
  try {
    const c = doc.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch { return false; }
}

export { PALETTES };
