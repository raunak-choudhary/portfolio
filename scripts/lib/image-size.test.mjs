import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { imageSize } from './image-size.mjs';

/** A minimal PNG header: signature plus an IHDR chunk for the given size. */
function pngHeader(width, height) {
  const buf = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(buf, 0);
  buf.writeUInt32BE(13, 8);
  buf.write('IHDR', 12, 'ascii');
  buf.writeUInt32BE(width, 16);
  buf.writeUInt32BE(height, 20);
  return buf;
}

/** A minimal JPEG: SOI, an APP0 segment to skip, then SOF2 (progressive) with the size. */
function jpegHeader(width, height) {
  const app0 = [0xff, 0xe0, 0x00, 0x04, 0x00, 0x00];
  const sof = [0xff, 0xc2, 0x00, 0x0b, 0x08, height >> 8, height & 0xff, width >> 8, width & 0xff, 0x01, 0x01, 0x11, 0x00];
  return Buffer.from([0xff, 0xd8, ...app0, ...sof]);
}

describe('imageSize', () => {
  it('reads PNG and JPEG sizes from their headers', () => {
    assert.deepEqual(imageSize(pngHeader(9745, 6889)), { width: 9745, height: 6889 });
    assert.deepEqual(imageSize(jpegHeader(768, 1024)), { width: 768, height: 1024 });
  });

  it('reads a lossless WebP size', () => {
    const buf = Buffer.alloc(30);
    buf.write('RIFF', 0, 'ascii');
    buf.write('WEBPVP8L', 8, 'ascii');
    buf.writeUInt32LE((640 - 1) | ((480 - 1) << 14), 21);
    assert.deepEqual(imageSize(buf), { width: 640, height: 480 });
  });

  it('returns null for bytes it does not recognise', () => {
    assert.equal(imageSize(Buffer.from('GIF89a and some more bytes here')), null);
  });
});

// The hero cube shows its pictures on faces at most 320 CSS px wide, so 1024 px
// is sharp even at a 3x phone. The originals were camera and print exports up to
// 9745 px and 3.3 MB, which the home page downloaded and decoded on first load.
const MAX_EDGE = 1024;
const MAX_BYTES = 400 * 1024;
const listImages = (dir) => readdirSync(dir).flatMap((name) => {
  const file = path.join(dir, name);
  if (statSync(file).isDirectory()) return listImages(file);
  return /\.(png|jpe?g|webp)$/i.test(name) ? [file] : [];
});

describe('public site image weight', () => {
  const images = [...listImages('src/assets/images'), 'public/profile_pic_1.jpg', 'public/profile_pic_2.jpg'];

  it('finds the images it is meant to police', () => {
    assert.ok(images.some((f) => f.includes(`cube${path.sep}inner-cube`)));
  });

  for (const file of images) {
    it(`${file} is at most ${MAX_EDGE} px on its long edge and ${MAX_BYTES / 1024} KB`, () => {
      const bytes = readFileSync(file);
      const size = imageSize(bytes);
      assert.ok(size, 'unrecognised image format');
      assert.ok(Math.max(size.width, size.height) <= MAX_EDGE, `${size.width} x ${size.height}`);
      assert.ok(bytes.length <= MAX_BYTES, `${Math.round(bytes.length / 1024)} KB`);
    });
  }

  // The footer draws its social icons at 18 to 22 CSS px on every page.
  for (const file of listImages('src/assets/icons')) {
    it(`${file} is at most 128 px and 32 KB`, () => {
      const bytes = readFileSync(file);
      const size = imageSize(bytes);
      assert.ok(size && Math.max(size.width, size.height) <= 128, size ? `${size.width} x ${size.height}` : 'unrecognised image format');
      assert.ok(bytes.length <= 32 * 1024, `${Math.round(bytes.length / 1024)} KB`);
    });
  }
});
