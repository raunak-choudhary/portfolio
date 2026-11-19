import * as THREE from 'three';
import { createTextureLoader } from './skyField';

// The loader is the one piece of skyField.js that runs without a GPU: it picks
// off-thread decoding when the browser has it, falls back to the plain loader,
// and uploads each texture as it lands. The network loaders are stubbed.
describe('createTextureLoader', () => {
  const fakeGpu = () => ({ initTexture: jest.fn() });
  let original;

  beforeEach(() => { original = global.createImageBitmap; });
  afterEach(() => { global.createImageBitmap = original; jest.restoreAllMocks(); });

  it('decodes with ImageBitmap, keeps the decode-time flip, uploads and reports the load', () => {
    global.createImageBitmap = jest.fn();
    const bitmap = { width: 2, height: 2, close: jest.fn() };
    const load = jest.spyOn(THREE.ImageBitmapLoader.prototype, 'load').mockImplementation(function stub(url, onLoad) { onLoad(bitmap); });
    const gl = fakeGpu(), onAny = jest.fn(), onLoad = jest.fn();
    const loadTexture = createTextureLoader(gl, onAny);
    loadTexture('/admin/sky/earth/earth-day.webp', onLoad);
    expect(load).toHaveBeenCalledWith('/admin/sky/earth/earth-day.webp', expect.any(Function), undefined, expect.any(Function));
    const texture = onLoad.mock.calls[0][0];
    expect(texture.image).toBe(bitmap);
    expect(texture.flipY).toBe(false);
    expect(texture.colorSpace).toBe(THREE.SRGBColorSpace);
    expect(gl.initTexture).toHaveBeenCalledWith(texture);
    expect(onAny).toHaveBeenCalledWith(texture);
    expect(loadTexture.loaded).toEqual([texture]);
  });

  it('falls back to the plain loader when the bitmap decode fails', () => {
    global.createImageBitmap = jest.fn();
    jest.spyOn(THREE.ImageBitmapLoader.prototype, 'load').mockImplementation(function stub(url, onLoad, onProgress, onError) { onError(new Error('no')); });
    const fallback = new THREE.Texture();
    const plain = jest.spyOn(THREE.TextureLoader.prototype, 'load').mockImplementation(function stub(url, onLoad) { onLoad(fallback); return fallback; });
    const onLoad = jest.fn();
    createTextureLoader(fakeGpu())('/a.webp', onLoad);
    expect(plain).toHaveBeenCalled();
    expect(onLoad).toHaveBeenCalledWith(fallback);
  });

  it('uses the plain loader where createImageBitmap is missing, and survives a refused upload', () => {
    delete global.createImageBitmap;
    const bitmapLoad = jest.spyOn(THREE.ImageBitmapLoader.prototype, 'load');
    const fallback = new THREE.Texture();
    jest.spyOn(THREE.TextureLoader.prototype, 'load').mockImplementation(function stub(url, onLoad) { onLoad(fallback); return fallback; });
    const gl = { initTexture: jest.fn(() => { throw new Error('context lost'); }) };
    const onLoad = jest.fn();
    expect(() => createTextureLoader(gl)('/a.webp', onLoad)).not.toThrow();
    expect(bitmapLoad).not.toHaveBeenCalled();
    expect(onLoad).toHaveBeenCalledWith(fallback);
  });
});
