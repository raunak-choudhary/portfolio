import * as THREE from 'three';
import { CHAPTERS, chapterPlace } from './chapters';
import { createTextureLoader } from './skyField';
import { CORONA_EXTENT, createSunSystem } from './sunSystem';
import { DAY_NARROW_FRAMING, LOOP_SLOTS, SUN_RADIUS, sunScene } from './sunModel';

// The day scene builds its geometry and shaders without a GPU, so the wiring can be
// checked here: what goes into the scene, what moves on update, and what is freed.
// The pictures themselves are checked by eye on the dev server.
const DATE = new Date('2026-11-19T15:00:00Z');
const build = (detail = 'high') => {
  const scene = new THREE.Scene();
  const loadTexture = jest.fn();
  const system = createSunSystem({ scene, loadTexture, assetBase: '/admin/sky/', pixelRatio: 2, detail, date: DATE });
  return { scene, loadTexture, system };
};
const shaderMaterials = (scene) => {
  const found = new Set();
  scene.traverse((o) => { if (o.material instanceof THREE.ShaderMaterial) found.add(o.material); });
  return [...found];
};

describe('createSunSystem', () => {
  it('adds the Sun group and the Earth, centred where the model puts the Sun', () => {
    const { scene, system } = build();
    expect(system.kind).toBe('sun');
    expect(system.framing).toBe(DAY_NARROW_FRAMING);
    expect(system.glareRadius).toBe(SUN_RADIUS);
    expect(system.centre.toArray()).toEqual(sunScene(DATE).centre);
    expect(scene.children).toHaveLength(2);
    expect(CORONA_EXTENT).toBeGreaterThan(2);
  });

  it('asks only for the NASA Earth maps already in public/admin/sky', () => {
    const { loadTexture } = build();
    expect(loadTexture.mock.calls.map(([url]) => url)).toEqual(['/admin/sky/earth/earth-day.webp', '/admin/sky/earth/earth-night.webp', '/admin/sky/earth/earth-clouds.webp']);
  });

  it('turns the Sun, moves the Earth and lights loop footpoints on update', () => {
    const { scene, system } = build();
    const [sunMaterial] = shaderMaterials(scene).filter((m) => m.uniforms.uSpin);
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
    const { scene, system } = build();
    const [sunMaterial] = shaderMaterials(scene).filter((m) => m.uniforms.uSpin);
    system.update(0);
    const first = sunMaterial.uniforms.uFeet.value.map((v) => v.toArray());
    system.update(0);
    expect(sunMaterial.uniforms.uFeet.value.map((v) => v.toArray())).toEqual(first);
  });

  it('fades out as the camera leaves the prologue and stops drawing once gone', () => {
    const { scene, system } = build();
    const [root, earth] = scene.children;
    system.setPresence(0.4);
    shaderMaterials(scene).filter((m) => m.uniforms.uFade).forEach((m) => expect(m.uniforms.uFade.value).toBeCloseTo(0.4));
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
    ['high', 'low'].forEach((detail) => shaderMaterials(build(detail).scene).forEach((m) => {
      expect(m.fragmentShader).not.toMatch(reserved);
      expect(m.vertexShader).not.toMatch(reserved);
    }));
  });

  it('builds a lighter tier for phones', () => {
    const count = (detail) => build(detail).scene.children[0].children.find((o) => o.isPoints).geometry.getAttribute('aLoop').count;
    expect(count('low')).toBe(count('high') / 2);
    expect(shaderMaterials(build('low').scene).find((m) => m.uniforms.uSpin).fragmentShader).not.toMatch('#define HIGH');
  });

  it('takes everything out of the scene and frees what it made', () => {
    const { scene, system } = build();
    const geometries = [];
    scene.traverse((o) => { if (o.geometry) geometries.push(jest.spyOn(o.geometry, 'dispose')); });
    const materials = shaderMaterials(scene).map((m) => jest.spyOn(m, 'dispose'));
    system.dispose();
    expect(scene.children).toHaveLength(0);
    geometries.forEach((spy) => expect(spy).toHaveBeenCalled());
    materials.forEach((spy) => expect(spy).toHaveBeenCalled());
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
