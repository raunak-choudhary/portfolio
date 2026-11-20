// src/components/admin/Voyage/skyField.js
//
// The 3D field the voyage travels through, built with Three.js: a seeded star
// field in three depth bands, the opening scene at the first chapter (the
// Earth and Moon by night, earthSystem.js; the Sun with the Earth on its
// orbit by day, sunSystem.js), one constellation group per chapter (lines drawn by
// scroll, star points by magnitude, the atlas drawing on a plane), and eight
// real deep-sky photographs far behind the route, blended by their own light
// so the stars hang in front of them and nothing reads as a pasted layer.
// Night and dawn palettes. The page owns the frame loop and passes the scroll
// fraction and the clock.
//
// Textures are same-origin files under public/admin/sky; nothing external.
//
// Cost (measured 2026-11-18, scripts/measure-frames.mjs): the field renders
// only when something on it moves (renderBudget.renderDue), at the pixel
// ratio and frame interval the page asks for (setQuality); textures decode
// off the main thread and are uploaded before first use; shaders compile at
// creation, not on the first frame that shows them.

import * as THREE from 'three';
import { CHAPTERS } from './chapters';
import { PALETTES, buildFigureGeometry, buildStarField, drawRangeFor, drawingPlacement, paletteForTheme } from './skyFieldMath';
import { ANCHORS, cameraTarget, deepSkyLayout, figureState, prologueFraming, routePosition } from './voyageModel';
import { createEarthSystem } from './earthSystem';
import { createSunSystem } from './sunSystem';
import { renderDue } from './renderBudget';

/**
 * Stars, with a glare term for the day scene: within a few radii of the Sun
 * (uGlareDir, the Sun's direction in view space; uGlareCos, the cosines where
 * the fade starts and where the stars are gone) they dim as they would in
 * its light. By night uGlare is 0 and the term is exactly 1.
 */
const STAR_VERTEX = `
  attribute float aSize; varying vec3 vColor; uniform float uPixelRatio;
  uniform float uGlare; uniform vec3 uGlareDir; uniform vec2 uGlareCos;
  varying float vNear;
  void main() { vColor = color; vec4 mv = modelViewMatrix * vec4(position, 1.0); float depth = max(1.0, -mv.z); vNear = smoothstep(40.0, 140.0, depth) * (1.0 - uGlare * smoothstep(uGlareCos.x, uGlareCos.y, dot(normalize(mv.xyz), uGlareDir))); gl_PointSize = clamp(aSize * (900.0 / depth), 0.6, 7.0) * uPixelRatio; gl_Position = projectionMatrix * mv; }`;
const STAR_FRAGMENT = `
  uniform float uAlpha; varying vec3 vColor; varying float vNear;
  void main() { float d = length(gl_PointCoord - 0.5); if (d > 0.5) discard; gl_FragColor = vec4(vColor, smoothstep(0.5, 0.1, d) * uAlpha * vNear); }`;
const POINT_VERTEX = `
  attribute float aSize; uniform float uPixelRatio;
  void main() { vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = clamp(aSize * (700.0 / max(1.0, -mv.z)), 2.0, 28.0) * uPixelRatio; gl_Position = projectionMatrix * mv; }`;
const POINT_FRAGMENT = `
  uniform float uAlpha; uniform vec3 uColor;
  void main() { float d = length(gl_PointCoord - 0.5); if (d > 0.5) discard; gl_FragColor = vec4(uColor, smoothstep(0.5, 0.0, d) * uAlpha); }`;
/**
 * A photograph blended by its own light: the alpha comes from each pixel's
 * brightness, so the black sky around a nebula vanishes and only the glowing
 * gas and the galaxy's arms remain, with a soft radial fade so the frame's
 * edge never shows. Colours are kept as published (linear in, encoded out).
 */
const DEEP_VERTEX = 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';
const DEEP_FRAGMENT = `
  uniform sampler2D uMap; uniform float uAlpha; varying vec2 vUv;
  void main() {
    vec2 c = (vUv - 0.5) * 2.0;
    float edge = 1.0 - smoothstep(0.5, 1.0, length(c));
    float box = smoothstep(0.0, 0.2, 1.0 - abs(c.x)) * smoothstep(0.0, 0.2, 1.0 - abs(c.y));
    vec4 t = texture2D(uMap, vUv);
    float lum = dot(t.rgb, vec3(0.299, 0.587, 0.114));
    float body = smoothstep(0.003, 0.09, lum);
    gl_FragColor = vec4(t.rgb, body * edge * box * uAlpha);
    #include <colorspace_fragment>
  }`;

/**
 * @param {object} input
 * @param {HTMLCanvasElement} input.canvas
 * @param {Array} input.figures figures.json entries.
 * @param {Array} input.deepManifest public/admin/sky/deep/manifest.json entries.
 * @param {string} input.assetBase URL prefix, e.g. "/admin/sky/".
 * @param {{stars: number, pixelRatio: number, fly: boolean, frameInterval?: number}} input.quality from qualityFor.
 * @param {'dark'|'light'} input.theme
 * @param {boolean} [input.smallTextures] use the 512 px photographs and the 1024 px Moon maps.
 * @param {Date} [input.date] the moment the Earth scene is set for.
 * @param {() => void} [input.onPictureChange] called when the picture changed outside the frame loop
 *   (a texture landed, or the GPU context came back), so the page can retake its glass snapshot.
 */
export function createSkyField({ canvas, figures, deepManifest, assetBase, quality, theme, smallTextures = false, date = new Date(), onPictureChange = () => {} }) {
  // No preserveDrawingBuffer: keeping the frame costs a copy on every swap. snapshot() reads
  // the canvas in the same task as its render, which works without it, and so do screenshots.
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(quality.pixelRatio);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(60, 1, 1, 9000);
  let dirty = true;   // set when something outside the frame loop changed the picture (a texture, the size, the theme)
  const loadTexture = createTextureLoader(renderer, () => { dirty = true; onPictureChange(); });
  const byId = Object.fromEntries(figures.map((f) => [f.id, f]));
  let palette = paletteForTheme(theme), fly = quality.fly;
  const disposables = [];

  // ---- star field ----
  const { positions, colors, sizes } = buildStarField(quality.stars);
  const starGeometry = new THREE.BufferGeometry();
  starGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  starGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  starGeometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
  const starMaterial = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, vertexColors: true, uniforms: { uAlpha: { value: 1 }, uPixelRatio: { value: quality.pixelRatio }, uGlare: { value: 0 }, uGlareDir: { value: new THREE.Vector3() }, uGlareCos: { value: new THREE.Vector2(1, 1) } }, vertexShader: STAR_VERTEX, fragmentShader: STAR_FRAGMENT });
  const pixelRatioUniforms = [starMaterial.uniforms.uPixelRatio];   // every shader that sizes points in device pixels
  const stars = new THREE.Points(starGeometry, starMaterial);
  stars.renderOrder = 2;   // after the photographs, so stars lie over them
  scene.add(stars);
  disposables.push(starGeometry, starMaterial);

  const placeholderTexture = new THREE.DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1); placeholderTexture.needsUpdate = true;
  disposables.push(placeholderTexture);

  // ---- the opening scene at the first chapter: the Earth and Moon by night, the Sun by day ----
  // Each scene loads its textures through its own scope, so a theme switch frees the old
  // scene's GPU memory (geometry, programs and textures) instead of keeping both resident.
  const scopedLoader = () => {
    const mine = []; let closed = false;
    const load = (url, onLoad) => loadTexture(url, (t) => { if (closed) return false; mine.push(t); onLoad(t); return true; });
    load.release = () => { closed = true; for (const t of mine) loadTexture.release(t); mine.length = 0; };
    return load;
  };
  const prologueKind = (t) => (t === 'light' ? 'sun' : 'earth');
  const makePrologue = (t) => {
    const load = scopedLoader();
    const system = prologueKind(t) === 'sun'
      ? createSunSystem({ scene, loadTexture: load, assetBase, pixelRatio: renderer.getPixelRatio(), detail: quality.stars < 5000 ? 'low' : 'high', mode: skyMode, date })
      : createEarthSystem({ scene, loadTexture: load, assetBase, pixelRatio: renderer.getPixelRatio(), satellites: quality.stars < 5000 ? 6 : 9, date, moonTier: smallTextures ? 1024 : 2048 });
    system.setQuality?.({ level: qualityLevel });
    return { kind: prologueKind(t), system, release: () => { system.dispose(); load.release(); } };
  };
  // The sky mode and adaptive step, for the day Sun's surface buffer (setQuality keeps them current).
  let skyMode = quality.frameInterval ? 'working' : 'showcase', qualityLevel = 0;
  let prologue = makePrologue(theme);
  /** Compile the prologue's own off-screen scene too (the day Sun's surface), so its first frame does not stall. */
  const compilePrologue = () => { for (const extra of [prologue.system.surface?.scene, prologue.system.corona?.scene, prologue.system.glow?.scene]) if (extra) renderer.compile(extra, camera); };
  const glareDir = new THREE.Vector3();

  // ---- one constellation per chapter ----
  const groups = CHAPTERS.map((chapter, i) => {
    const figure = byId[chapter.constellation];
    const group = new THREE.Group();
    const a = ANCHORS[i]; group.position.set(a.x, a.y, a.z);
    group.renderOrder = 3;
    scene.add(group);
    if (!figure) return { group, lines: null };
    const geo = buildFigureGeometry(figure);
    const lineGeometry = new THREE.BufferGeometry(); lineGeometry.setAttribute('position', new THREE.Float32BufferAttribute(geo.segments, 3)); lineGeometry.setDrawRange(0, 0);
    const lineMaterial = new THREE.LineBasicMaterial({ color: palette.line, transparent: true, opacity: 0.85 });
    const lines = new THREE.LineSegments(lineGeometry, lineMaterial); lines.renderOrder = 3; group.add(lines);
    const pointGeometry = new THREE.BufferGeometry(); pointGeometry.setAttribute('position', new THREE.Float32BufferAttribute(geo.points, 3)); pointGeometry.setAttribute('aSize', new THREE.Float32BufferAttribute(geo.sizes, 1));
    const pointMaterial = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, uniforms: { uAlpha: { value: 0 }, uColor: { value: new THREE.Color(palette.point) }, uPixelRatio: { value: quality.pixelRatio } }, vertexShader: POINT_VERTEX, fragmentShader: POINT_FRAGMENT });
    pixelRatioUniforms.push(pointMaterial.uniforms.uPixelRatio);
    const points = new THREE.Points(pointGeometry, pointMaterial); points.renderOrder = 3; group.add(points);
    let art = null;
    const place = drawingPlacement(figure);
    if (place) {
      // A 1 x 1 stand-in map from the start, so the shader is compiled with its map once, at creation, and not again when the drawing arrives.
      const artMaterial = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, color: palette.art, depthWrite: false, map: placeholderTexture });
      // hidden until its texture arrives: without a map the plane would paint as a flat grey card
      loadTexture(`${assetBase}art/${figure.art.file}`, (t) => { artMaterial.map = t; artMaterial.needsUpdate = true; if (art) art.visible = true; });
      art = new THREE.Mesh(new THREE.PlaneGeometry(place.width, place.height), artMaterial);
      art.visible = false;
      art.position.set(place.x, place.y, -2); art.rotation.z = place.rotation; art.renderOrder = 3; group.add(art);
      disposables.push(art.geometry, artMaterial);
    }
    disposables.push(lineGeometry, lineMaterial, pointGeometry, pointMaterial);
    return { group, lines, lineMaterial, pointMaterial, art, segmentVertices: geo.segments.length / 3 };
  });

  // ---- deep-sky photographs ----
  const deep = deepSkyLayout(deepManifest).map((item) => {
    const material = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, uniforms: { uMap: { value: null }, uAlpha: { value: 0 } }, vertexShader: DEEP_VERTEX, fragmentShader: DEEP_FRAGMENT });
    loadTexture(`${assetBase}deep/${smallTextures ? item.image.small : item.image.file}`, (t) => { material.uniforms.uMap.value = t; entry.loaded = true; });
    const entry = { loaded: false };
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(item.width, item.height), material);
    mesh.userData.entry = entry;
    mesh.renderOrder = 1;
    mesh.position.set(item.x, item.y, item.z);
    mesh.rotation.z = (item.side === 'left' ? -1 : 1) * 0.12;
    scene.add(mesh);
    disposables.push(mesh.geometry, material);
    return { mesh, baseY: item.y, baseRotation: mesh.rotation.z, speed: 0.00004 + (item.slug.length % 5) * 0.00001, loaded: false };
  });

  const applyPalette = () => {
    scene.background = new THREE.Color(palette.background);
    scene.fog = new THREE.Fog(palette.background, palette.fogNear, palette.fogFar);
    starMaterial.uniforms.uAlpha.value = palette.starAlpha;
    for (const g of groups) { if (!g.lines) continue; g.lineMaterial.color.set(palette.line); g.pointMaterial.uniforms.uColor.value.set(palette.point); if (g.art) g.art.material.color.set(palette.art); }
  };
  /** 1 while an object is within `reach` ahead of the camera, fading in from twice that distance and out once it has passed. */
  const emergence = (objectZ, reach) => { const ahead = cameraPosition.z - objectZ; if (ahead < -300) return 0; if (ahead < 0) return 1 + ahead / 300; return Math.max(0, Math.min(1, (reach * 2 - ahead) / reach)); };
  applyPalette();

  const cameraPosition = new THREE.Vector3(0, 20, ANCHORS[0].z + 520), cameraLook = new THREE.Vector3(ANCHORS[0].x, ANCHORS[0].y, ANCHORS[0].z);
  const wantPosition = new THREE.Vector3(), wantLook = new THREE.Vector3();
  let startedAt = null, readoutAt = -Infinity, over = '', aspect = 16 / 9, disposed = false, lastElapsed = 0;
  let frameInterval = quality.frameInterval || 0, lastRenderAt = -Infinity;

  // Compile every shader now (the drawing planes are hidden until their textures land, and
  // compile() skips hidden objects, so they are shown for the call). Otherwise each program
  // compiles on the first frame that shows it, a 50 ms hitch measured mid-scroll.
  const hiddenArt = groups.filter((g) => g.art && !g.art.visible);
  hiddenArt.forEach((g) => { g.art.visible = true; });
  try { renderer.compile(scene, camera); compilePrologue(); } catch { /* a lost context compiles on first use instead */ }
  hiddenArt.forEach((g) => { g.art.visible = false; });

  // After a GPU reset the browser hands the context back and three rebuilds its state, but
  // nothing asks for a frame: a resting sky would stay black until the next scroll.
  const onContextRestored = () => { if (disposed) return; dirty = true; onPictureChange(); };
  canvas.addEventListener?.('webglcontextrestored', onContextRestored);

  /** Draw now and note when. */
  const draw = () => { prologue.system.beforeRender?.(renderer, camera); renderer.render(scene, camera); };
  const render = (now) => { draw(); lastRenderAt = now; dirty = false; };

  return {
    resize(width, height) { renderer.setSize(width, height, false); aspect = width / Math.max(1, height); camera.aspect = aspect; camera.updateProjectionMatrix(); dirty = true; },
    setTheme(next) {
      palette = paletteForTheme(next); applyPalette();
      if (prologueKind(next) !== prologue.kind && !disposed) {
        prologue.release();
        prologue = makePrologue(next);
        if (startedAt !== null) prologue.system.update(fly ? lastElapsed : 0);
        try { renderer.compile(scene, camera); compilePrologue(); } catch { /* compiled on first use instead */ }
        readoutAt = -Infinity;
      }
      dirty = true;
    },
    setFly(next) { fly = !!next; dirty = true; },
    /**
     * Change the resolution and the shortest gap between renders without rebuilding the scene.
     * `mode` and `level` (the sky mode and the adaptive step) are passed on to the prologue,
     * which sizes the day Sun's surface buffer from them.
     * @param {{pixelRatio?: number, frameInterval?: number, mode?: 'working'|'showcase', level?: number}} next
     */
    setQuality({ pixelRatio, frameInterval: interval, mode, level } = {}) {
      if (Number.isFinite(pixelRatio) && pixelRatio > 0 && pixelRatio !== renderer.getPixelRatio()) {
        renderer.setPixelRatio(pixelRatio);
        for (const u of pixelRatioUniforms) u.value = pixelRatio;
        dirty = true;
      }
      if (mode === 'working' || mode === 'showcase') { if (mode !== skyMode) dirty = true; skyMode = mode; }
      if (Number.isFinite(level)) qualityLevel = level;
      if (prologue.system.setQuality) prologue.system.setQuality({ pixelRatio: renderer.getPixelRatio(), mode: skyMode, level: qualityLevel });
      else prologue.system.setPixelRatio(renderer.getPixelRatio());
      if (Number.isFinite(interval) && interval >= 0) frameInterval = interval;
    },
    /** The canvas resolution in use, for the measurement script and tests. */
    get pixelRatio() { return renderer.getPixelRatio(); },
    /** Which opening scene is built ('earth' or 'sun') and the renderer's resource counts, for leak checks. */
    get info() { return { prologue: prologue.kind, geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures, programs: renderer.info.programs?.length ?? 0 }; },
    /**
     * Advance one animation frame. `scrollFraction` is 0..1 over the page; `now` is the animation clock in ms.
     * The scene is redrawn only when something on it moves or changed, and no more often than the
     * frame interval; a resting sky is repainted every half second for the slow drift of the photographs.
     * With `snap` the camera lands on its pose at once instead of easing there (a frozen view, such as
     * the sign-out backdrop), and the frame is always drawn.
     * @returns {{index: number, f: number, over: string, rendered: boolean, settled: boolean}} the route position
     *   for the page's stage and rail state, the Earth readout (refreshed once a second), whether this
     *   call drew, and whether the camera has come to rest.
     */
    frame(scrollFraction, now, { snap = false } = {}) {
      const route = routePosition(scrollFraction);
      const target = cameraTarget(route, fly);
      const framing = prologueFraming(aspect, route.f, prologue.system.framing);   // zero on landscape screens and past the prologue
      wantPosition.set(target.position.x + framing.x, target.position.y + framing.y, target.position.z + framing.z); wantLook.set(target.look.x + framing.x, target.look.y + framing.y, target.look.z);
      // 8% of the way per 60 Hz frame, scaled by the real gap so the glide takes the same time at 30 fps.
      const steps = Number.isFinite(lastRenderAt) ? Math.min(6, Math.max(0, now - lastRenderAt) / (1000 / 60)) : 1;
      const ease = fly && !snap ? 1 - Math.pow(1 - 0.08, steps) : 1;
      // Moving while the eased camera is still more than a tenth of a unit from its pose (the route spans thousands).
      const settled = cameraPosition.distanceToSquared(wantPosition) < 0.01 && cameraLook.distanceToSquared(wantLook) < 0.01;
      // the prologue animates only while it is in view: the night Earth until the camera has passed it, the day Sun until it has faded
      const earthLive = fly && route.f < (prologue.system.visibleUntil ?? EARTH_VISIBLE_UNTIL);
      if (!snap && !renderDue({ now, lastRenderAt, frameInterval, active: !settled || earthLive || dirty })) {
        if (now - readoutAt > 1000 && route.f < EARTH_VISIBLE_UNTIL) { readoutAt = now; over = prologue.system.readout(fly && startedAt !== null ? now - startedAt : 0, cameraPosition); }
        return { index: route.index, f: route.f, over, rendered: false, settled };
      }
      cameraPosition.lerp(wantPosition, ease); cameraLook.lerp(wantLook, ease);
      camera.position.copy(cameraPosition); camera.lookAt(cameraLook);
      // the day Sun dims the stars near it; computed in view space after the camera has moved
      const glare = prologue.system.centre;
      const presence = 1 - THREE.MathUtils.smoothstep(route.f, 0.3, 0.8);   // the day Sun leaves with the prologue (see sunSystem.setPresence)
      prologue.system.setPresence?.(presence);
      if (glare) {
        camera.updateMatrixWorld();
        glareDir.copy(glare).applyMatrix4(camera.matrixWorldInverse);
        const distance = Math.max(1, glareDir.length());
        glareDir.divideScalar(distance);
        starMaterial.uniforms.uGlareDir.value.copy(glareDir);
        starMaterial.uniforms.uGlareCos.value.set(Math.cos(Math.atan((prologue.system.glareRadius * 4.2) / distance)), Math.cos(Math.atan((prologue.system.glareRadius * 1.3) / distance)));
        starMaterial.uniforms.uGlare.value = presence;
      } else {
        starMaterial.uniforms.uGlare.value = 0;
      }
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
        d.mesh.material.uniforms.uAlpha.value = d.mesh.userData.entry.loaded ? palette.deepAlpha * emergence(d.mesh.position.z, 3000) : 0;
        d.mesh.visible = d.mesh.material.uniforms.uAlpha.value > 0.01;
      }
      if (startedAt === null) startedAt = now;
      const elapsed = fly ? now - startedAt : 0;   // a still frame under reduced motion: today's terminator, tonight's Moon, today's Sun
      lastElapsed = elapsed;
      prologue.system.update(elapsed);
      if (now - readoutAt > 1000) { readoutAt = now; over = prologue.system.readout(elapsed, cameraPosition); }
      render(now);
      return { index: route.index, f: route.f, over, rendered: true, settled };
    },
    /**
     * A small, blurred still of the current view for the working mode's glass (a CSS background
     * instead of a live backdrop blur). Drawn in the same task as a fresh render, because without
     * preserveDrawingBuffer the canvas is cleared once the frame is presented.
     * @param {{scale?: number, blurPx?: number, type?: string, quality?: number}} [options]
     * @returns {Promise<Blob|null>} null when the browser cannot encode it or the field is gone.
     */
    snapshot({ scale = 0.25, blurPx = 2, type = 'image/jpeg', quality: encodeQuality = 0.82 } = {}) {
      if (disposed || typeof document === 'undefined') return Promise.resolve(null);
      const width = Math.max(16, Math.round((canvas.clientWidth || canvas.width) * scale));
      const height = Math.max(16, Math.round((canvas.clientHeight || canvas.height) * scale));
      const out = document.createElement('canvas'); out.width = width; out.height = height;
      const ctx = out.getContext('2d');
      if (!ctx) return Promise.resolve(null);
      draw();
      ctx.fillStyle = palette.background; ctx.fillRect(0, 0, width, height);
      // Overscan by the blur radius so the blur does not pull the dark fill in at the edges.
      if (blurPx > 0 && 'filter' in ctx) ctx.filter = `blur(${blurPx}px)`;
      const pad = Math.ceil(blurPx * 2);
      ctx.drawImage(canvas, -pad, -pad, width + pad * 2, height + pad * 2);
      return new Promise((resolve) => { try { out.toBlob((blob) => resolve(blob || null), type, encodeQuality); } catch { resolve(null); } });
    },
    /** Frees geometry, materials and the renderer, then gives the WebGL context back to the browser (it holds only a handful). Safe to call twice. */
    dispose() {
      if (disposed) return;
      disposed = true;
      canvas.removeEventListener?.('webglcontextrestored', onContextRestored);
      loadTexture.close();   // a texture still in flight is freed on arrival instead of uploaded to the lost context
      prologue.release();
      for (const d of disposables) d.dispose?.();
      for (const t of loadTexture.loaded) { t.dispose(); t.image?.close?.(); }   // ImageBitmaps hold decoded pixels until closed
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
}

/** Past this route coordinate the Earth is behind the camera, so it no longer needs animating. */
export const EARTH_VISIBLE_UNTIL = 1.2;

/**
 * A loader that decodes images off the main thread (createImageBitmap, flipped at decode
 * time because WebGL ignores UNPACK_FLIP_Y for bitmaps) and uploads each texture to the GPU
 * as it lands, so neither the decode nor the upload happens inside a frame. Falls back to
 * the plain TextureLoader where ImageBitmap is missing or refuses the options.
 * `close()` ends the loader: textures that arrive afterwards are freed, never uploaded.
 * @returns {((url: string, onLoad: (t: THREE.Texture) => void) => void) & {loaded: THREE.Texture[], release: (t: THREE.Texture) => void, close: () => void}}
 */
export function createTextureLoader(renderer, onAnyLoad = () => {}) {
  const loaded = [];
  let closed = false;
  const bitmaps = typeof createImageBitmap === 'function' ? new THREE.ImageBitmapLoader().setOptions({ imageOrientation: 'flipY', premultiplyAlpha: 'none' }) : null;
  const plain = new THREE.TextureLoader();
  const finish = (t, onLoad) => {
    if (closed) { t.dispose(); t.image?.close?.(); return; }   // the field is gone; its context is lost
    t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
    // a caller that no longer wants the texture (its scene was swapped out meanwhile) answers false
    if (onLoad(t) === false) { t.dispose(); t.image?.close?.(); return; }
    loaded.push(t);
    try { renderer.initTexture(t); } catch { /* uploaded on first use instead */ }
    onAnyLoad(t);
  };
  const viaPlain = (url, onLoad) => plain.load(url, (t) => finish(t, onLoad));
  const load = (url, onLoad) => {
    if (!bitmaps) { viaPlain(url, onLoad); return; }
    bitmaps.load(url, (bitmap) => {
      const t = new THREE.Texture(bitmap);
      t.flipY = false;   // already flipped by createImageBitmap
      t.needsUpdate = true;
      finish(t, onLoad);
    }, undefined, () => viaPlain(url, onLoad));
  };
  load.loaded = loaded;
  /** Frees one texture now (GPU copy and decoded pixels) and forgets it. */
  load.release = (t) => { t.dispose(); t.image?.close?.(); const i = loaded.indexOf(t); if (i >= 0) loaded.splice(i, 1); };
  load.close = () => { closed = true; };
  return load;
}

export { webglAvailable } from './webgl';
export { PALETTES };
