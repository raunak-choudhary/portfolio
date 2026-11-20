import * as THREE from 'three';
import { CHAPTERS, chapterPlace } from './chapters';
import { createTextureLoader } from './skyField';
import { CORONA_EXTENT, SUN_TIERS, SUN_VISIBLE_UNTIL, createSunSystem } from './sunSystem';
import { SUN_SURFACE } from './renderBudget';
import { DAY_MOON_MONTH_MS, DAY_MOON_ORBIT_RADIUS, DAY_NARROW_FRAMING, LOOP_SLOTS, SUN_RADIUS, sunScene } from './sunModel';

// The day scene builds its geometry and shaders without a GPU, so the wiring can be
// checked here: what goes into the scene, what moves on update, and what is freed.
// The pictures themselves are checked by eye on the dev server.
const DATE = new Date('2026-11-19T15:00:00Z');
const build = (detail = 'high', mode = 'showcase') => {
  const scene = new THREE.Scene();
  const loadTexture = jest.fn();
  const system = createSunSystem({ scene, loadTexture, assetBase: '/admin/sky/', pixelRatio: 2, detail, mode, date: DATE });
  return { scene, loadTexture, system };
};
/** Shader materials in the given scenes (the main one, and the Sun's own surface scene). */
const shaderMaterials = (...scenes) => {
  const found = new Set();
  scenes.forEach((scene) => scene.traverse((o) => { if (o.material instanceof THREE.ShaderMaterial) found.add(o.material); }));
  return [...found];
};
const surfaceOf = (system) => system.surface.material;
/** A stand-in renderer that records what beforeRender asks of it. */
const recordingGl = (width = 1440, height = 900) => ({
  calls: [],
  getDrawingBufferSize(v) { return v.set(width, height); },
  getRenderTarget() { return null; },
  getClearColor(c) { return c.set(0x101010); },
  getClearAlpha() { return 1; },
  setRenderTarget(t) { this.calls.push(['target', t]); },
  setClearColor(c, a) { this.calls.push(['clear', a]); },
  render(scene) { this.calls.push(['render', scene]); },
});
const cameraOn = (target, from) => {
  const camera = new THREE.PerspectiveCamera(60, 1440 / 900, 1, 9000);
  camera.position.copy(from); camera.lookAt(target); camera.updateMatrixWorld();
  return camera;
};

describe('createSunSystem', () => {
  it('adds the Sun group, the Earth and the Moon, centred where the model puts the Sun', () => {
    const { scene, system } = build();
    expect(system.kind).toBe('sun');
    expect(system.framing).toBe(DAY_NARROW_FRAMING);
    expect(system.glareRadius).toBe(SUN_RADIUS);
    expect(system.centre.toArray()).toEqual(sunScene(DATE).centre);
    expect(scene.children).toHaveLength(3);
    expect(CORONA_EXTENT).toBeGreaterThan(2);
  });

  it('asks only for the NASA Earth and Moon maps already in public/admin/sky', () => {
    const { loadTexture } = build();
    expect(loadTexture.mock.calls.map(([url]) => url)).toEqual(['/admin/sky/earth/earth-day.webp', '/admin/sky/earth/earth-night.webp', '/admin/sky/earth/earth-clouds.webp', '/admin/sky/moon/moon-color-1024.webp', '/admin/sky/moon/moon-relief-1024.webp']);
  });

  it('keeps the Moon on its orbit round the Earth, near side to the Earth, lit from the Sun', () => {
    const { scene, system } = build();
    const earth = scene.children[1], moon = scene.children[2];
    for (const t of [0, 20000, 61000]) {
      system.update(t);
      expect(moon.position.distanceTo(earth.position)).toBeCloseTo(DAY_MOON_ORBIT_RADIUS, 6);
      const toEarth = earth.position.clone().sub(moon.position).normalize();
      // map longitude 0 is the mesh's +x: it faces the Earth (to within the orbit's tilt off the pole's plane)
      expect(new THREE.Vector3(1, 0, 0).applyQuaternion(moon.quaternion).dot(toEarth)).toBeGreaterThan(0.99);
      const toSun = system.centre.clone().sub(moon.position).normalize();
      expect(moon.material.uniforms.uSun.value.dot(toSun)).toBeCloseTo(1, 6);
      expect(moon.material.uniforms.uEarth.value.dot(toEarth)).toBeCloseTo(1, 6);
    }
    // it moves: a quarter of its stylised month carries it a quarter of the way round
    system.update(0); const a = moon.position.clone().sub(earth.position);
    system.update(DAY_MOON_MONTH_MS / 4); const b = moon.position.clone().sub(earth.position);
    expect(Math.abs(a.angleTo(b) - Math.PI / 2)).toBeLessThan(0.2);   // the Earth moved too, so not exact
  });

  it('shows and hides the Moon with the Earth, and frees it on dispose', () => {
    const { scene, system } = build();
    const moon = scene.children[2];
    system.setPresence(0.3); expect(moon.visible).toBe(false);
    system.setPresence(1); expect(moon.visible).toBe(true);
    system.dispose(); expect(scene.children).not.toContain(moon);
  });

  it('turns the Sun, moves the Earth and lights loop footpoints on update', () => {
    const { scene, system } = build();
    const sunMaterial = surfaceOf(system);
    const earth = scene.children[1];
    system.update(0);
    const spin0 = sunMaterial.uniforms.uSpin.value, earth0 = earth.position.clone();
    system.update(60000);
    expect(sunMaterial.uniforms.uSpin.value).toBeGreaterThan(spin0);
    expect(earth.position.distanceTo(earth0)).toBeGreaterThan(1);
    // every footpoint is a unit vector on the sphere, one pair per loop slot
    expect(sunMaterial.uniforms.uFeet.value).toHaveLength(LOOP_SLOTS * 2);
    sunMaterial.uniforms.uFeet.value.forEach((v) => expect(v.length()).toBeCloseTo(1, 6));
  });

  it('holds a still frame for a constant clock (reduced motion)', () => {
    const { system } = build();
    const sunMaterial = surfaceOf(system);
    system.update(0);
    const first = sunMaterial.uniforms.uFeet.value.map((v) => v.toArray());
    system.update(0);
    expect(sunMaterial.uniforms.uFeet.value.map((v) => v.toArray())).toEqual(first);
  });

  it('fades out as the camera leaves the prologue and stops drawing once gone', () => {
    const { scene, system } = build();
    const [root, earth] = scene.children;
    system.setPresence(0.4);
    shaderMaterials(scene, system.corona.scene, system.glow.scene).filter((m) => m.uniforms.uFade).forEach((m) => expect(m.uniforms.uFade.value).toBeCloseTo(0.4));
    expect(root.visible).toBe(true);
    expect(earth.visible).toBe(false);
    system.setPresence(0);
    expect(root.visible).toBe(false);
    system.setPresence(2);
    expect(root.visible && earth.visible).toBe(true);
  });

  it('reads today\'s true Earth-Sun distance', () => {
    expect(build().system.readout()).toBe('Earth to Sun · 147.8 million km and closing');
  });

  it('writes shaders free of GLSL ES 3.0 reserved words used as names', () => {
    // "active" once slipped in as a variable and failed to compile on the GPU only
    const reserved = /\b(?:float|vec[234]|int)\s+(active|input|output|filter|sample|common|partition|resource)\b/;
    ['high', 'low'].forEach((detail) => { const { scene, system } = build(detail); shaderMaterials(scene, system.surface.scene, system.corona.scene, system.glow.scene).forEach((m) => {
      expect(m.fragmentShader).not.toMatch(reserved);
      expect(m.vertexShader).not.toMatch(reserved);
    }); });
  });

  it('builds a lighter tier for phones', () => {
    const count = (detail) => { let n = 0; build(detail).system.glow.scene.traverse((o) => { if (o.isPoints) n = o.geometry.getAttribute('aLoop').count; }); return n; };
    expect(count('low')).toBeLessThan(count('high') / 2);
    expect(surfaceOf(build('low').system).fragmentShader).not.toMatch('#define WORLEY');
    expect(surfaceOf(build('high').system).fragmentShader).toMatch('#define WORLEY');
  });

  it('takes everything out of the scene and frees what it made', () => {
    const { scene, system } = build();
    const geometries = [];
    const scenes = [scene, system.surface.scene, system.corona.scene, system.glow.scene];
    scenes.forEach((s) => s.traverse((o) => { if (o.geometry) geometries.push(jest.spyOn(o.geometry, 'dispose')); }));
    const materials = shaderMaterials(...scenes).map((m) => jest.spyOn(m, 'dispose'));
    const targets = [system.surface.target, system.corona.target, system.glow.target].map((t) => jest.spyOn(t, 'dispose'));
    system.dispose();
    scenes.forEach((s) => expect(s.children).toHaveLength(0));
    targets.forEach((spy) => expect(spy).toHaveBeenCalled());
    geometries.forEach((spy) => expect(spy).toHaveBeenCalled());
    materials.forEach((spy) => expect(spy).toHaveBeenCalled());
  });
});

describe('the surface buffer', () => {
  it('draws the surface and the glow into their own buffers, sized by the mode, and puts the renderer back as it was', () => {
    const { system } = build('high', 'working');
    system.setQuality({ pixelRatio: 1 });
    const gl = recordingGl();
    const camera = cameraOn(system.centre, system.centre.clone().add(new THREE.Vector3(0, 300, 1500)));
    expect(system.beforeRender(gl, camera)).toBe(true);
    expect(gl.calls.map(([k]) => k)).toEqual(['clear', 'target', 'render', 'target', 'render', 'target', 'render', 'target', 'clear']);
    expect(gl.calls.filter(([k]) => k === 'target').map(([, t]) => t)).toEqual([system.surface.target, system.corona.target, system.glow.target, null]);
    expect(gl.calls.filter(([k]) => k === 'render').map(([, t]) => t)).toEqual([system.surface.scene, system.corona.scene, system.glow.scene]);
    expect(system.glow.target.width).toBe(system.surface.target.width);
    expect([system.surface.target.width, system.surface.target.height]).toEqual([Math.round(1440 * SUN_SURFACE.working), Math.round(900 * SUN_SURFACE.working)]);
    system.setQuality({ mode: 'showcase', pixelRatio: 2 });
    system.beforeRender(recordingGl(2880, 1800), camera);
    expect(system.surface.target.width).toBe(1440);   // one buffer pixel per CSS pixel
  });

  it('shrinks with the adaptive step', () => {
    const { system } = build('high', 'showcase');
    system.setQuality({ pixelRatio: 1 });
    const before = system.surface.scale;
    system.setQuality({ level: 2 });
    expect(system.surface.scale).toBeLessThan(before);
  });

  it('costs nothing while the Sun is out of view or faded out', () => {
    const { system } = build();
    const away = cameraOn(system.centre.clone().add(new THREE.Vector3(0, 0, 9000)), system.centre.clone().add(new THREE.Vector3(0, 0, 4000)));
    const gl = recordingGl();
    expect(system.beforeRender(gl, away)).toBe(false);
    system.setPresence(0);
    const towards = cameraOn(system.centre, system.centre.clone().add(new THREE.Vector3(0, 0, 1500)));
    expect(system.beforeRender(gl, towards)).toBe(false);
    expect(gl.calls).toHaveLength(0);
    // and update() leaves everything where it was
    const spin = surfaceOf(system).uniforms.uSpin.value;
    system.update(90000);
    expect(surfaceOf(system).uniforms.uSpin.value).toBe(spin);
    expect(SUN_VISIBLE_UNTIL).toBeLessThanOrEqual(0.8);
    expect(system.visibleUntil).toBe(SUN_VISIBLE_UNTIL);
  });

  it('moves between the high and medium octaves with the mode, and keeps the low tier low', () => {
    const octaves = (m) => [m.uniforms.uWarpOctaves.value, m.uniforms.uNetOctaves.value, m.uniforms.uMottOctaves.value];
    const { system } = build('high', 'working');
    const knobs = (t) => [t.warpOctaves, t.netOctaves, t.mottOctaves];
    expect(octaves(surfaceOf(system))).toEqual(knobs(SUN_TIERS.medium));
    system.setQuality({ mode: 'showcase' });
    expect(octaves(surfaceOf(system))).toEqual(knobs(SUN_TIERS.high));
    const low = build('low', 'showcase').system;
    expect(octaves(surfaceOf(low))).toEqual(knobs(SUN_TIERS.low));
  });

  it('writes heat as two 8-bit channels and shades the limb in the scene sphere', () => {
    const { scene, system } = build();
    expect(surfaceOf(system).fragmentShader).toMatch('floor(e) / 255.0, fract(e)');
    expect(surfaceOf(system).fragmentShader).not.toMatch('pow(1.0 - mu, 6.0)');
    const composite = shaderMaterials(scene).find((m) => m.uniforms.uHeat);
    expect(composite.uniforms.uHeat.value).toBe(system.surface.target.texture);
    expect(composite.fragmentShader).toMatch('pow(1.0 - mu, 6.0)');
  });
});

describe('texture loader release, for a prologue swapped out mid-load', () => {
  it('drops a texture whose caller has gone and frees one on request', () => {
    const original = global.createImageBitmap;
    global.createImageBitmap = undefined;
    const textures = [new THREE.Texture(), new THREE.Texture()];
    let next = 0;
    const plain = jest.spyOn(THREE.TextureLoader.prototype, 'load').mockImplementation(function stub(url, onLoad) { onLoad(textures[next++]); });
    try {
      const gl = { initTexture: jest.fn() };
      const load = createTextureLoader(gl);
      const gone = jest.spyOn(textures[0], 'dispose');
      load('/a.webp', () => false);
      expect(gone).toHaveBeenCalled();
      expect(gl.initTexture).not.toHaveBeenCalled();
      expect(load.loaded).toEqual([]);
      load('/b.webp', () => {});
      expect(load.loaded).toEqual([textures[1]]);
      const freed = jest.spyOn(textures[1], 'dispose');
      load.release(textures[1]);
      expect(freed).toHaveBeenCalled();
      expect(load.loaded).toEqual([]);
    } finally {
      plain.mockRestore();
      global.createImageBitmap = original;
    }
  });
});

describe('chapterPlace', () => {
  it('names the prologue for the scene the theme shows', () => {
    const prologue = CHAPTERS[0];
    expect(chapterPlace(prologue, {}, 'light')).toBe('Inner solar system');
    expect(chapterPlace(prologue, {}, 'dark')).toBe(prologue.place);
    expect(chapterPlace(prologue)).toBe(prologue.place);
    const named = CHAPTERS.find((c) => c.constellation);
    expect(chapterPlace(named, { [named.constellation]: 'Great Bear' }, 'light')).toBe('Great Bear');
  });
});
