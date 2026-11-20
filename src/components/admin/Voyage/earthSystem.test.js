import * as THREE from 'three';
import { EARTHSHINE, MOON_FRAGMENT, MOON_TIERS, TWILIGHT_SHIFT, TWILIGHT_WIDTH, createEarthSystem } from './earthSystem';
import { DEG, moonDirection } from './earthModel';

// The shader's twilight weight, mirrored here so the band's shape is pinned:
// a bright core and a faint skirt 2.4 times wider (see EARTH_FRAGMENT).
const twilight = (lit) => {
  const g = (w) => Math.exp(-(((lit + TWILIGHT_SHIFT) / w) ** 2));
  return g(TWILIGHT_WIDTH) * 0.30 + g(TWILIGHT_WIDTH * 2.4) * 0.10;
};

describe('earth twilight band', () => {
  it('is a narrow glow along the terminator, not a wide stripe', () => {
    // the old band (half-width 0.14) still had 32% of its strength at lit = 0.15;
    // the glow must be all but gone there, at every screen size alike
    expect(twilight(0.15) / twilight(-TWILIGHT_SHIFT)).toBeLessThan(0.05);
    expect(TWILIGHT_WIDTH).toBeLessThanOrEqual(0.06);
  });

  it('sits just on the night side, where reddened sunlight is seen', () => {
    expect(twilight(-0.02)).toBeGreaterThan(twilight(0.02));
    expect(TWILIGHT_SHIFT).toBeGreaterThan(0);
  });
});

// The night scene builds without a GPU, so its wiring is checked here: what goes
// into the scene, which maps it asks for, how the Moon is posed and lit, what is freed.
describe('createEarthSystem: the Moon', () => {
  const DATE = new Date('2026-11-21T01:00:00Z');   // 8 pm in New York, a waxing gibbous Moon
  const build = (moonTier) => {
    const scene = new THREE.Scene();
    const loadTexture = jest.fn();
    const system = createEarthSystem({ scene, loadTexture, assetBase: '/admin/sky/', pixelRatio: 2, date: DATE, ...(moonTier ? { moonTier } : {}) });
    const moon = scene.children.find((o) => o.material?.fragmentShader === MOON_FRAGMENT);
    return { scene, loadTexture, system, moon };
  };

  // A camera like the prologue's: above and in front of the system, looking at the Earth.
  const cameraAt = (system, x, y, z) => {
    const camera = new THREE.PerspectiveCamera(50, 1.6, 1, 20000);
    camera.position.set(x, y, z);
    camera.lookAt(new THREE.Vector3(...system.scene.centre));
    camera.updateMatrixWorld();
    return camera;
  };

  it('has no lamps and no ambient fill, and its own New York light instead of the scene\'s Sun', () => {
    const { scene, moon, system } = build();
    let lights = 0; scene.traverse((o) => { if (o.isLight) lights++; });
    expect(lights).toBe(0);
    expect(MOON_FRAGMENT).not.toMatch(/specular|pow\(max\(dot\(reflect/);
    system.update(0);
    system.beforeRender(null, cameraAt(system, 300, 900, 1500));
    const light = moon.material.uniforms.uSun.value;
    expect(light.length()).toBeCloseTo(1, 6);
    // the angle between the light and the line of sight is tonight's phase angle (give or take the close-camera correction)
    const toCamera = new THREE.Vector3(300, 900, 1500).sub(moon.position).normalize();
    expect(Math.abs(light.angleTo(toCamera) / DEG - system.moonView.phaseAngle)).toBeLessThan(8);
    // and it is not the Sun that lights the Earth
    expect(light.angleTo(new THREE.Vector3(...system.scene.sunDir)) / DEG).toBeGreaterThan(5);
  });

  it('shows the same phase from another camera: the light follows the view, the date sets the phase', () => {
    const { moon, system } = build();
    system.update(0);
    const litShare = (x, y, z) => {
      system.beforeRender(null, cameraAt(system, x, y, z));
      const toCamera = new THREE.Vector3(x, y, z).sub(moon.position).normalize();
      return (1 + Math.cos(moon.material.uniforms.uSun.value.angleTo(toCamera))) / 2;
    };
    const a = litShare(300, 900, 1500), b = litShare(-1200, 400, 900);
    expect(Math.abs(a - b)).toBeLessThan(0.03);
    expect(Math.abs(a - system.moonView.fraction)).toBeLessThan(0.06);
  });

  it('asks for the 2048 px maps by default and the 1024 px maps on the small tier, under moon/', () => {
    const urls = (tier) => build(tier).loadTexture.mock.calls.map(([url]) => url).filter((u) => u.includes('moon'));
    expect(urls()).toEqual(['/admin/sky/moon/moon-color-2048.webp', '/admin/sky/moon/moon-relief-2048.webp']);
    expect(urls(1024)).toEqual(['/admin/sky/moon/moon-color-1024.webp', '/admin/sky/moon/moon-relief-1024.webp']);
    expect(MOON_TIERS).toEqual([1024, 2048]);
  });

  it('reads the relief map as stored data and the colour map as sRGB', () => {
    const { loadTexture, moon } = build();
    const [, colourDone] = loadTexture.mock.calls.find(([url]) => url.includes('moon-color'));
    const [, reliefDone] = loadTexture.mock.calls.find(([url]) => url.includes('moon-relief'));
    const colour = new THREE.Texture(); colour.colorSpace = THREE.SRGBColorSpace;
    const relief = new THREE.Texture(); relief.colorSpace = THREE.SRGBColorSpace;   // as the shared loader hands it over
    colourDone(colour); reliefDone(relief);
    expect(relief.colorSpace).toBe(THREE.NoColorSpace);
    expect(colour.colorSpace).toBe(THREE.SRGBColorSpace);
    expect(moon.material.uniforms.uAlbedo.value).toBe(colour);
    expect(moon.material.uniforms.uRelief.value).toBe(relief);
  });

  it('starts where tonight\'s Moon is and turns the face New York sees to the camera', () => {
    const { moon, system } = build();
    system.update(0);
    const toMoon = moonDirection(system.scene, 0);
    const centre = new THREE.Vector3(...system.scene.centre);
    expect(moon.position.clone().sub(centre).normalize().toArray().map((v, i) => v - toMoon[i]).every((e) => Math.abs(e) < 1e-6)).toBe(true);
    system.beforeRender(null, cameraAt(system, 300, 900, 1500));
    const nearSide = new THREE.Vector3(1, 0, 0).applyQuaternion(moon.quaternion);   // the middle of the map
    const toCamera = new THREE.Vector3(300, 900, 1500).sub(moon.position).normalize();
    expect(nearSide.angleTo(toCamera) / DEG).toBeLessThan(10);   // the librations, a few degrees
    // the mesh stays a rigid rotation: its three axes are still perpendicular unit vectors
    const north = new THREE.Vector3(0, 1, 0).applyQuaternion(moon.quaternion);
    expect(north.length()).toBeCloseTo(1, 6);
    expect(Math.abs(north.dot(nearSide))).toBeLessThan(1e-6);
  });

  it('gets faint earthshine that fades toward full, and moves on with the orbit', () => {
    const { moon, system } = build();
    system.update(0);
    const tonight = moon.material.uniforms.uEarthshine.value, at = moon.position.clone();
    expect(tonight).toBeGreaterThan(0); expect(tonight).toBeLessThan(EARTHSHINE * 0.2);   // 83% lit: a thin Earth seen from the Moon
    system.update(120000);
    expect(moon.position.distanceTo(at)).toBeGreaterThan(100);
    system.update(0);
    expect(moon.position.distanceTo(at)).toBeLessThan(1e-9);   // reduced motion holds tonight's Moon
  });

  it('takes the Moon and everything else out of the scene on dispose', () => {
    const { scene, moon, system } = build();
    const freed = jest.spyOn(moon.material, 'dispose');
    system.dispose();
    expect(scene.children).toHaveLength(0);
    expect(freed).toHaveBeenCalled();
  });
});
