// scripts/lib/image-size.mjs
//
// Reads the pixel size of a PNG, JPEG or WebP from its header bytes, so a
// test can hold images to a size limit without an image library.

/** PNG: the IHDR chunk follows the 8-byte signature; width and height are big-endian at 16 and 20. */
function pngSize(buf) {
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

/** JPEG: walks the marker segments to the first start-of-frame (SOF0 to SOF15, except DHT, JPG and DAC). */
function jpegSize(buf) {
  let i = 2;
  while (i + 9 < buf.length) {
    if (buf[i] !== 0xff) { i += 1; continue; }
    const marker = buf[i + 1];
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { i += 2; continue; }
    const length = buf.readUInt16BE(i + 2);
    const isFrame = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isFrame) return { width: buf.readUInt16BE(i + 7), height: buf.readUInt16BE(i + 5) };
    i += 2 + length;
  }
  return null;
}

/** WebP: lossy (VP8), lossless (VP8L) and extended (VP8X) headers. */
function webpSize(buf) {
  const chunk = buf.toString('ascii', 12, 16);
  if (chunk === 'VP8 ') return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff };
  if (chunk === 'VP8L') {
    const bits = buf.readUInt32LE(21);
    return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
  }
  if (chunk === 'VP8X') return { width: buf.readUIntLE(24, 3) + 1, height: buf.readUIntLE(27, 3) + 1 };
  return null;
}

/**
 * @param {Buffer} buf the file's bytes (the first few kilobytes are enough for PNG and WebP)
 * @returns {{ width: number, height: number } | null} null for a format it does not know
 */
export function imageSize(buf) {
  if (buf.length >= 24 && buf.readUInt32BE(0) === 0x89504e47) return pngSize(buf);
  if (buf.length >= 4 && buf[0] === 0xff && buf[1] === 0xd8) return jpegSize(buf);
  if (buf.length >= 30 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return webpSize(buf);
  return null;
}
